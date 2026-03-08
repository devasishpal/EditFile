import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { asyncHandler } from '../../middleware/error.middleware.js';
import { logger } from '../../utils/logger.js';
import {
  UPLOADS_DIR,
  TEMP_DIR,
  OUTPUTS_DIR,
  ensureWorkspaceDirectories,
} from '../../utils/workspace.js';
import { RembgWorkerPool } from '../remove-background/rembg-worker-pool.js';

const router = express.Router();

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const REMBG_TIMEOUT_MS = Number.parseInt(process.env.REMOVE_BG_TIMEOUT_MS || '30000', 10);
const MAX_INPUT_WIDTH_BEFORE_RESIZE = 3000;
const RESIZE_TARGET_WIDTH = 2000;
const DEFAULT_PASSPORT_WIDTH = 413;
const DEFAULT_PASSPORT_HEIGHT = 531;
const MAX_OUTPUT_DIMENSION = 5000;
const ALPHA_THRESHOLD = 8;

const DEPENDENCY_INSTALL_COMMAND = 'python -m pip install rembg pillow onnxruntime';

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);

const EXTENSION_BY_MIME = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
};

const rembgPool = new RembgWorkerPool({
  taskTimeoutMs: REMBG_TIMEOUT_MS,
});

let runtimeReadyPromise = null;

const createHttpError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const parseRequestedOutputSize = (rawWidth, rawHeight) => {
  const widthValue = String(rawWidth ?? '').trim();
  const heightValue = String(rawHeight ?? '').trim();

  if (!widthValue && !heightValue) {
    return {
      width: DEFAULT_PASSPORT_WIDTH,
      height: DEFAULT_PASSPORT_HEIGHT,
    };
  }

  if (!widthValue || !heightValue) {
    throw createHttpError(400, 'Both width and height are required when setting custom output size');
  }

  const width = Number.parseInt(widthValue, 10);
  const height = Number.parseInt(heightValue, 10);

  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > MAX_OUTPUT_DIMENSION ||
    height > MAX_OUTPUT_DIMENSION
  ) {
    throw createHttpError(
      400,
      `width and height must be integers between 1 and ${MAX_OUTPUT_DIMENSION}`
    );
  }

  return { width, height };
};

const createTempFilePath = (suffix) =>
  path.join(TEMP_DIR, `${Date.now()}-${randomUUID()}-${suffix}`);

const createOutputFilePath = (suffix) =>
  path.join(OUTPUTS_DIR, `${Date.now()}-${randomUUID()}-${suffix}`);

const safeUnlink = async (targetPath) => {
  if (!targetPath) {
    return;
  }

  try {
    await fs.unlink(targetPath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      logger.warn(`Failed to delete temp file: ${targetPath}`);
    }
  }
};

const fileExists = async (targetPath) => {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
};

const sanitizeBaseName = (value, fallback = 'image') => {
  const raw = String(value || fallback).trim();
  const withoutExtension = raw.replace(/\.[^/.]+$/, '');
  const sanitized = withoutExtension
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '-')
    .replace(/_+/g, '_')
    .replace(/-+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 80);

  return sanitized || fallback;
};

const getOutputName = (originalName) => {
  return `${sanitizeBaseName(originalName, 'image')}.png`;
};

const resolveFileExtension = (file) => {
  const mimeType = String(file?.mimetype || '').toLowerCase();
  if (EXTENSION_BY_MIME[mimeType]) {
    return EXTENSION_BY_MIME[mimeType];
  }

  const extension = path.extname(file?.originalname || '').replace(/^\./, '').toLowerCase();
  if (extension === 'png') {
    return 'png';
  }

  if (extension === 'jpg' || extension === 'jpeg') {
    return 'jpg';
  }

  if (extension === 'webp') {
    return 'webp';
  }

  return 'png';
};

const ensureRuntimeReady = async () => {
  if (runtimeReadyPromise) {
    return runtimeReadyPromise;
  }

  runtimeReadyPromise = (async () => {
    await ensureWorkspaceDirectories();

    try {
      await rembgPool.init();
    } catch (error) {
      const message = String(error?.message || '');
      const lowerMessage = message.toLowerCase();
      if (lowerMessage.includes('python')) {
        throw createHttpError(
          500,
          `Python 3 not found in PATH. Install Python and run: ${DEPENDENCY_INSTALL_COMMAND}`
        );
      }

      const isMissingDependencyError =
        lowerMessage.includes("no module named 'onnxruntime'") ||
        lowerMessage.includes("no module named 'rembg'") ||
        lowerMessage.includes("no module named 'pil'");

      if (isMissingDependencyError) {
        throw createHttpError(
          500,
          `Missing Python dependencies. Install with: ${DEPENDENCY_INSTALL_COMMAND}`
        );
      }

      throw createHttpError(500, message || 'Failed to initialize background removal runtime');
    }

    return rembgPool;
  })().catch((error) => {
    runtimeReadyPromise = null;
    throw error;
  });

  return runtimeReadyPromise;
};

const normalizeInputForProcessing = async (inputPath, mimeType) => {
  let metadata;

  try {
    metadata = await sharp(inputPath).metadata();
  } catch {
    throw createHttpError(400, 'Uploaded file is not a valid image');
  }

  const width = Number(metadata?.width || 0);
  const extensionFromFile = path.extname(inputPath).replace(/^\./, '').toLowerCase();
  const extension = extensionFromFile || EXTENSION_BY_MIME[mimeType] || 'png';
  const outputExtension = extension === 'jpeg' ? 'jpg' : extension;
  const normalizedPath = createTempFilePath(`normalized.${outputExtension}`);

  const image = sharp(inputPath).rotate();
  if (width > MAX_INPUT_WIDTH_BEFORE_RESIZE) {
    image.resize({
      width: RESIZE_TARGET_WIDTH,
      withoutEnlargement: true,
    });
  }

  if (outputExtension === 'jpg') {
    await image.jpeg({ quality: 95, mozjpeg: true }).toFile(normalizedPath);
  } else if (outputExtension === 'webp') {
    await image.webp({ quality: 95 }).toFile(normalizedPath);
  } else {
    await image.png({ compressionLevel: 9 }).toFile(normalizedPath);
  }

  return {
    processingInputPath: normalizedPath,
    normalizedPath,
    sourceWidth: width || null,
    resized: width > MAX_INPUT_WIDTH_BEFORE_RESIZE,
  };
};

const runRemoveBackground = async (runtime, inputPath, outputPath) => {
  try {
    await runtime.processImage({
      inputPath,
      outputPath,
      timeoutMs: REMBG_TIMEOUT_MS,
    });
  } catch (error) {
    const details = String(error?.message || '').trim();
    if (details.toLowerCase().includes('timed out')) {
      throw createHttpError(
        504,
        `Background removal timed out after ${Math.ceil(REMBG_TIMEOUT_MS / 1000)} seconds`
      );
    }

    throw createHttpError(422, `rembg processing failure: ${details || 'command failed'}`);
  }

  const outputGenerated = await fileExists(outputPath);
  if (!outputGenerated) {
    throw createHttpError(422, 'rembg processing failure: output image was not generated');
  }
};

const getSubjectBounds = async (inputBuffer) => {
  const {
    data,
    info: { width, height },
  } = await sharp(inputBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  if (!width || !height) {
    throw createHttpError(422, 'Unable to read image dimensions');
  }

  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;

  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * width * 4;
    for (let x = 0; x < width; x += 1) {
      const alpha = data[rowOffset + x * 4 + 3];
      if (alpha <= ALPHA_THRESHOLD) {
        continue;
      }

      if (x < left) {
        left = x;
      }
      if (x > right) {
        right = x;
      }
      if (y < top) {
        top = y;
      }
      if (y > bottom) {
        bottom = y;
      }
    }
  }

  if (right < left || bottom < top) {
    return {
      left: 0,
      top: 0,
      width,
      height,
    };
  }

  return {
    left,
    top,
    width: right - left + 1,
    height: bottom - top + 1,
  };
};

const composePassportPhoto = async (transparentImagePath, outputSize) => {
  const transparentBuffer = await fs.readFile(transparentImagePath);
  const bounds = await getSubjectBounds(transparentBuffer);

  const subjectBuffer = await sharp(transparentBuffer)
    .extract({
      left: bounds.left,
      top: bounds.top,
      width: bounds.width,
      height: bounds.height,
    })
    .png()
    .toBuffer();

  const scale = Math.min(outputSize.width / bounds.width, outputSize.height / bounds.height);
  const resizedWidth = Math.max(1, Math.round(bounds.width * scale));
  const resizedHeight = Math.max(1, Math.round(bounds.height * scale));

  const resizedSubject = await sharp(subjectBuffer)
    .resize({
      width: resizedWidth,
      height: resizedHeight,
      fit: 'fill',
    })
    .png()
    .toBuffer();

  const left = Math.max(0, Math.floor((outputSize.width - resizedWidth) / 2));
  // Anchor the subject to the bottom edge so no extra band appears under shoulders.
  const top = Math.max(0, outputSize.height - resizedHeight);

  return sharp({
    create: {
      width: outputSize.width,
      height: outputSize.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: resizedSubject,
        left,
        top,
      },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();
};

const sendProcessedBuffer = (res, fileBuffer, downloadName) => {
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
  res.setHeader('X-Processed-File-Name', downloadName);
  res.send(fileBuffer);
};

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      await ensureWorkspaceDirectories();
      cb(null, UPLOADS_DIR);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${randomUUID()}.${resolveFileExtension(file)}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
  },
  fileFilter: (req, file, cb) => {
    const mimeType = String(file?.mimetype || '').toLowerCase();
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return cb(createHttpError(400, 'Invalid file format. Supported formats: PNG, JPG, JPEG, WEBP'));
    }

    cb(null, true);
  },
});

const uploadSingleImage = (req, res, next) => {
  upload.single('file')(req, res, (error) => {
    if (!error) {
      return next();
    }

    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        error: 'File size limit exceeded',
        details: 'Maximum file size is 10MB',
      });
    }

    const status = error.status || 400;
    return res.status(status).json({
      success: false,
      error: error.message || 'File upload failed',
    });
  });
};

router.post(
  '/',
  uploadSingleImage,
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw createHttpError(400, 'No file uploaded');
    }

    const outputSize = parseRequestedOutputSize(req.body?.width, req.body?.height);

    logger.info('passport-photo: upload received', {
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      outputWidth: outputSize.width,
      outputHeight: outputSize.height,
    });

    const startedAtMs = Date.now();
    const cleanupPaths = [req.file.path];

    try {
      const runtime = await ensureRuntimeReady();
      const { processingInputPath, normalizedPath, sourceWidth, resized } =
        await normalizeInputForProcessing(req.file.path, req.file.mimetype);
      cleanupPaths.push(normalizedPath);

      const transparentOutputPath = createOutputFilePath('passport-transparent.png');
      cleanupPaths.push(transparentOutputPath);

      logger.info('passport-photo: processing started', {
        fileName: req.file.originalname,
        sourceWidth,
        resized,
        outputWidth: outputSize.width,
        outputHeight: outputSize.height,
      });

      await runRemoveBackground(runtime, processingInputPath, transparentOutputPath);
      const passportBuffer = await composePassportPhoto(transparentOutputPath, outputSize);

      logger.info('passport-photo: processing finished', {
        fileName: req.file.originalname,
        durationMs: Date.now() - startedAtMs,
        outputSizeBytes: passportBuffer.length,
      });

      sendProcessedBuffer(res, passportBuffer, getOutputName(req.file.originalname));
    } catch (error) {
      logger.error('passport-photo: processing error', {
        fileName: req.file?.originalname,
        message: error.message,
      });
      throw error;
    } finally {
      await Promise.all(cleanupPaths.map((filePath) => safeUnlink(filePath)));
    }
  })
);

const stopWorkerPool = () => {
  rembgPool.stop().catch((error) => {
    logger.warn(`Failed to stop passport-photo worker pool: ${error.message}`);
  });
};

process.on('SIGTERM', stopWorkerPool);
process.on('SIGINT', stopWorkerPool);

export default router;
