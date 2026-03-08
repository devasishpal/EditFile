import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
import express from 'express';
import multer from 'multer';
import { asyncHandler } from '../../middleware/error.middleware.js';
import { logger } from '../../utils/logger.js';
import {
  UPLOADS_DIR as WORKSPACE_UPLOADS_DIR,
  OUTPUTS_DIR as WORKSPACE_OUTPUTS_DIR,
  ensureWorkspaceDirectories,
} from '../../utils/workspace.js';

const router = express.Router();

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
const MAGICK_TIMEOUT_MS = Number.parseInt(process.env.IMAGEMAGICK_TIMEOUT_MS || '60000', 10);
const MAGICK_PROBE_TIMEOUT_MS = Number.parseInt(
  process.env.IMAGEMAGICK_PROBE_TIMEOUT_MS || '4000',
  10
);
const MAGICK_MAX_BUFFER = Number.parseInt(
  process.env.IMAGEMAGICK_MAX_BUFFER || `${10 * 1024 * 1024}`,
  10
);

const UPLOADS_DIR = WORKSPACE_UPLOADS_DIR;
const PROCESSED_DIR = WORKSPACE_OUTPUTS_DIR;

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

const EXTENSION_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const MIME_BY_EXTENSION = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

const WATERMARK_GRAVITY = {
  center: 'center',
  top: 'north',
  bottom: 'south',
  left: 'west',
  right: 'east',
  north: 'north',
  south: 'south',
  west: 'west',
  east: 'east',
  'top-left': 'northwest',
  'top-center': 'north',
  'top-right': 'northeast',
  'center-left': 'west',
  'center-right': 'east',
  'bottom-left': 'southwest',
  'bottom-center': 'south',
  'bottom-right': 'southeast',
  northwest: 'northwest',
  northeast: 'northeast',
  southwest: 'southwest',
  southeast: 'southeast',
};

const TARGET_FORMATS = new Set(['jpg', 'png', 'webp']);
const WINDOWS_MAGICK_EXE = 'magick.exe';

let resolvedMagickBinaryPromise = null;

const ensureDirectories = async () => {
  await ensureWorkspaceDirectories();
};

const createHttpError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const normalizeFormat = (value, fallback = 'jpg') => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^\./, '');

  if (normalized === 'jpeg') {
    return 'jpg';
  }

  if (TARGET_FORMATS.has(normalized)) {
    return normalized;
  }

  return fallback;
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

const parsePositiveInteger = (value, fieldName, { min = 0, max = 20000 } = {}) => {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw createHttpError(400, `${fieldName} must be an integer between ${min} and ${max}`);
  }
  return parsed;
};

const parseOptionalPositiveInteger = (value, fieldName, { min = 1, max = 20000 } = {}) => {
  if (value === undefined || value === null || String(value).trim() === '') {
    return null;
  }

  return parsePositiveInteger(value, fieldName, { min, max });
};

const parseFiniteNumber = (value, fieldName, { min = -3600, max = 3600 } = {}) => {
  const parsed = Number.parseFloat(String(value));
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw createHttpError(400, `${fieldName} must be a number between ${min} and ${max}`);
  }
  return parsed;
};

const normalizeHexColor = (value) => {
  const raw = String(value || '').trim();
  const shortHex = /^#([0-9a-f]{3})$/i;
  const longHex = /^#([0-9a-f]{6})$/i;

  if (longHex.test(raw)) {
    return raw.toLowerCase();
  }

  if (shortHex.test(raw)) {
    const [, body] = shortHex.exec(raw) || [];
    return `#${body[0]}${body[0]}${body[1]}${body[1]}${body[2]}${body[2]}`.toLowerCase();
  }

  return '#ffffff';
};

const hexToRgba = (hexColor, opacity) => {
  const hex = normalizeHexColor(hexColor).replace('#', '');
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  return `rgba(${red},${green},${blue},${opacity})`;
};

const parseOpacity = (value, fallback = 0.35) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number.parseFloat(String(value));
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const normalized = parsed > 1 ? parsed / 100 : parsed;
  return Math.min(1, Math.max(0.05, normalized));
};

const parseIntegerWithClamp = (value, { min, max, fallback }) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
};

const resolveGravity = (position, fallback = 'southeast') => {
  const normalized = String(position || '').trim().toLowerCase();
  return WATERMARK_GRAVITY[normalized] || fallback;
};

const toGeometryOffset = (offsetX, offsetY) => {
  const x = Number.isFinite(offsetX) ? offsetX : 0;
  const y = Number.isFinite(offsetY) ? offsetY : 0;
  return `${x >= 0 ? '+' : '-'}${Math.abs(x)}${y >= 0 ? '+' : '-'}${Math.abs(y)}`;
};

const resolveFileExtension = (file) => {
  if (file?.mimetype && EXTENSION_BY_MIME[file.mimetype]) {
    return EXTENSION_BY_MIME[file.mimetype];
  }

  const extension = path.extname(file?.originalname || '').replace(/^\./, '').toLowerCase();
  if (['jpg', 'jpeg', 'png', 'webp'].includes(extension)) {
    return extension === 'jpeg' ? 'jpg' : extension;
  }

  return 'png';
};

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

const scheduleCleanup = (res, filePaths) => {
  let cleaned = false;

  const cleanup = async () => {
    if (cleaned) {
      return;
    }

    cleaned = true;
    await Promise.all(filePaths.map((filePath) => safeUnlink(filePath)));
  };

  res.on('finish', () => {
    void cleanup();
  });

  res.on('close', () => {
    void cleanup();
  });
};

const runProcess = (command, args, { timeoutMs, captureStdout = true } = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ['ignore', captureStdout ? 'pipe' : 'ignore', 'pipe'],
      env: process.env,
    });

    const stdoutChunks = [];
    const stderrChunks = [];
    let stdoutLength = 0;
    let stderrLength = 0;
    let timedOut = false;
    let settled = false;

    const finalize = (callback) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutHandle);
      callback();
    };

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      child.kill();
      setTimeout(() => {
        if (!settled) {
          child.kill('SIGKILL');
        }
      }, 1000);
    }, timeoutMs ?? MAGICK_TIMEOUT_MS);

    if (captureStdout && child.stdout) {
      child.stdout.on('data', (chunk) => {
        stdoutLength += chunk.length;
        if (stdoutLength > MAGICK_MAX_BUFFER) {
          child.kill('SIGKILL');
          finalize(() => reject(new Error('Process stdout exceeded configured buffer')));
          return;
        }
        stdoutChunks.push(chunk);
      });
    }

    if (child.stderr) {
      child.stderr.on('data', (chunk) => {
        stderrLength += chunk.length;
        if (stderrLength > MAGICK_MAX_BUFFER) {
          child.kill('SIGKILL');
          finalize(() => reject(new Error('Process stderr exceeded configured buffer')));
          return;
        }
        stderrChunks.push(chunk);
      });
    }

    child.on('error', (error) => {
      finalize(() => reject(error));
    });

    child.on('close', (code) => {
      finalize(() => {
        if (timedOut) {
          reject(new Error(`Process timed out after ${timeoutMs ?? MAGICK_TIMEOUT_MS}ms`));
          return;
        }

        const stdout = Buffer.concat(stdoutChunks).toString('utf8');
        const stderr = Buffer.concat(stderrChunks).toString('utf8');
        if (code !== 0) {
          reject(new Error(stderr.trim() || `Process exited with code ${code}`));
          return;
        }

        resolve({ stdout, stderr });
      });
    });
  });

const canRunMagick = async (binary) => {
  try {
    await runProcess(binary, ['-version'], {
      timeoutMs: MAGICK_PROBE_TIMEOUT_MS,
    });
    return true;
  } catch {
    return false;
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

const getWindowsAutoCandidates = async () => {
  const baseDirs = [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean);
  const candidates = [];

  for (const baseDir of baseDirs) {
    try {
      const entries = await fs.readdir(baseDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || !/^ImageMagick/i.test(entry.name)) {
          continue;
        }

        const candidate = path.join(baseDir, entry.name, WINDOWS_MAGICK_EXE);
        if (await fileExists(candidate)) {
          candidates.push(candidate);
        }
      }
    } catch {
      // Skip unreadable location
    }
  }

  return candidates;
};

const getMagickCandidates = async () => {
  const candidates = [];
  const configuredBinary = process.env.IMAGEMAGICK_BINARY || process.env.IMAGEMAGICK_PATH;

  if (configuredBinary) {
    candidates.push(configuredBinary);
  }

  candidates.push('magick');

  if (process.platform === 'win32') {
    const windowsCandidates = await getWindowsAutoCandidates();
    candidates.push(...windowsCandidates);
  } else {
    candidates.push('convert');
  }

  const seen = new Set();
  return candidates.filter((candidate) => {
    const key = String(candidate).toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const resolveMagickBinary = async () => {
  if (resolvedMagickBinaryPromise) {
    return resolvedMagickBinaryPromise;
  }

  resolvedMagickBinaryPromise = (async () => {
    const candidates = await getMagickCandidates();

    for (const candidate of candidates) {
      if (await canRunMagick(candidate)) {
        logger.info(`ImageMagick binary configured: ${candidate}`);
        return candidate;
      }
    }

    throw createHttpError(
      500,
      'ImageMagick is not available. Install ImageMagick or set IMAGEMAGICK_BINARY.'
    );
  })().catch((error) => {
    resolvedMagickBinaryPromise = null;
    throw error;
  });

  return resolvedMagickBinaryPromise;
};

const runMagickCommand = async (args) => {
  const binary = await resolveMagickBinary();
  const optimizedArgs = args.includes('-strip')
    ? [...args]
    : [...args.slice(0, -1), '-strip', args[args.length - 1]];

  try {
    await runProcess(binary, optimizedArgs, {
      timeoutMs: MAGICK_TIMEOUT_MS,
      captureStdout: false,
    });
  } catch (error) {
    const details = error?.message || 'command failed';
    throw createHttpError(422, `ImageMagick command failed: ${details}`);
  }
};

const sendProcessedFile = (res, outputPath, { downloadName, contentType, cleanupPaths }) => {
  scheduleCleanup(res, cleanupPaths);

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
  res.setHeader('X-Processed-File-Name', downloadName);

  res.sendFile(outputPath, (error) => {
    if (error) {
      logger.error('Failed to send processed file:', error);
    }
  });
};

const withUpload = (uploadHandler) => (req, res, next) => {
  uploadHandler(req, res, (error) => {
    if (!error) {
      return next();
    }

    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        error: 'File too large',
        details: 'Maximum file size is 20MB',
      });
    }

    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        error: 'Invalid file field',
      });
    }

    if (error.status) {
      return next(error);
    }

    return next(createHttpError(400, error.message || 'File upload failed'));
  });
};

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      await ensureDirectories();
      cb(null, UPLOADS_DIR);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const extension = resolveFileExtension(file);
    cb(null, `${Date.now()}-${randomUUID()}.${extension}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
  },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(createHttpError(400, 'Invalid file type. Allowed: JPG, JPEG, PNG, WEBP'));
    }
    cb(null, true);
  },
});

const uploadSingleImage = withUpload(upload.single('file'));
const uploadMultipleImages = withUpload(upload.array('files'));
const uploadCropFields = withUpload(
  upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'image', maxCount: 1 },
  ])
);
const uploadWatermarkFields = withUpload(
  upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'files', maxCount: 1 },
    { name: 'watermark', maxCount: 1 },
    { name: 'watermarkImage', maxCount: 1 },
  ])
);

const getNamedFile = (files, fieldName) => {
  if (!files || Array.isArray(files)) {
    return null;
  }

  const fieldFiles = files[fieldName];
  if (!Array.isArray(fieldFiles) || !fieldFiles[0]) {
    return null;
  }

  return fieldFiles[0];
};

const getUploadedImageFile = (req) =>
  req.file ||
  getNamedFile(req.files, 'file') ||
  getNamedFile(req.files, 'image');

const getImageDimensions = async (inputPath) => {
  const binary = await resolveMagickBinary();

  try {
    const { stdout } = await runProcess(
      binary,
      [inputPath, '-auto-orient', '-format', '%w %h', 'info:'],
      { timeoutMs: MAGICK_TIMEOUT_MS }
    );

    const [rawWidth, rawHeight] = stdout.trim().split(/\s+/);
    const width = Number.parseInt(rawWidth, 10);
    const height = Number.parseInt(rawHeight, 10);

    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
      throw new Error('Invalid image dimensions');
    }

    return { width, height };
  } catch (error) {
    const details = error?.message || 'command failed';
    throw createHttpError(422, `Unable to read image dimensions: ${details}`);
  }
};

const cropHandler = asyncHandler(async (req, res) => {
  const sourceFile = getUploadedImageFile(req);

  if (!sourceFile) {
    throw createHttpError(400, 'No file uploaded');
  }

  const x = parsePositiveInteger(req.body.x, 'x', { min: 0, max: 20000 });
  const y = parsePositiveInteger(req.body.y, 'y', { min: 0, max: 20000 });
  const width = parsePositiveInteger(req.body.width, 'width', { min: 1, max: 20000 });
  const height = parsePositiveInteger(req.body.height, 'height', { min: 1, max: 20000 });
  const extension = resolveFileExtension(sourceFile);
  const baseName = sanitizeBaseName(sourceFile.originalname, 'image');
  const outputName = `${baseName}.${extension}`;
  let outputPath = '';

  try {
    const sourceDimensions = await getImageDimensions(sourceFile.path);
    if (x + width > sourceDimensions.width || y + height > sourceDimensions.height) {
      throw createHttpError(
        400,
        `Crop area exceeds image boundaries (${sourceDimensions.width}x${sourceDimensions.height})`
      );
    }

    outputPath = path.join(PROCESSED_DIR, `${Date.now()}-${randomUUID()}-crop.${extension}`);

    await runMagickCommand([
      sourceFile.path,
      '-auto-orient',
      '-crop',
      `${width}x${height}+${x}+${y}`,
      '+repage',
      outputPath,
    ]);
  } catch (error) {
    await Promise.all([safeUnlink(sourceFile.path), safeUnlink(outputPath)]);
    throw error;
  }

  sendProcessedFile(res, outputPath, {
    downloadName: outputName,
    contentType: MIME_BY_EXTENSION[extension] || sourceFile.mimetype,
    cleanupPaths: [sourceFile.path, outputPath],
  });
});

const rotateHandler = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw createHttpError(400, 'No file uploaded');
  }

  const angle = parseFiniteNumber(req.body.angle, 'angle', { min: -3600, max: 3600 });
  const extension = resolveFileExtension(req.file);
  const baseName = sanitizeBaseName(req.file.originalname, 'image');
  const outputName = `${baseName}.${extension}`;
  const outputPath = path.join(PROCESSED_DIR, `${Date.now()}-${randomUUID()}-rotate.${extension}`);
  const qualityArgs = extension === 'jpg' || extension === 'webp' ? ['-quality', '100'] : [];

  try {
    await runMagickCommand([
      req.file.path,
      '-auto-orient',
      '-rotate',
      String(angle),
      ...qualityArgs,
      outputPath,
    ]);
  } catch (error) {
    await Promise.all([safeUnlink(req.file.path), safeUnlink(outputPath)]);
    throw error;
  }

  sendProcessedFile(res, outputPath, {
    downloadName: outputName,
    contentType: MIME_BY_EXTENSION[extension] || req.file.mimetype,
    cleanupPaths: [req.file.path, outputPath],
  });
});

const convertHandler = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw createHttpError(400, 'No file uploaded');
  }

  const requestedFormat = String(req.body.format || req.body.targetFormat || '')
    .trim()
    .toLowerCase();
  const targetFormat = normalizeFormat(requestedFormat || 'jpg', 'jpg');

  if (!TARGET_FORMATS.has(targetFormat)) {
    throw createHttpError(400, 'targetFormat must be one of: jpg, png, webp');
  }

  const baseName = sanitizeBaseName(req.file.originalname, 'image');
  const outputName = `${baseName}.${targetFormat}`;
  const outputPath = path.join(
    PROCESSED_DIR,
    `${Date.now()}-${randomUUID()}-convert.${targetFormat}`
  );

  const args = [req.file.path, '-auto-orient'];
  if (targetFormat === 'jpg') {
    args.push('-background', 'white', '-alpha', 'remove', '-alpha', 'off', '-quality', '90');
  } else if (targetFormat === 'webp') {
    args.push('-quality', '90');
  }
  args.push(outputPath);

  try {
    await runMagickCommand(args);
  } catch (error) {
    await Promise.all([safeUnlink(req.file.path), safeUnlink(outputPath)]);
    throw error;
  }

  sendProcessedFile(res, outputPath, {
    downloadName: outputName,
    contentType: MIME_BY_EXTENSION[targetFormat] || 'application/octet-stream',
    cleanupPaths: [req.file.path, outputPath],
  });
});

const resizeHandler = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw createHttpError(400, 'No file uploaded');
  }

  const width = parseOptionalPositiveInteger(req.body.width, 'width');
  const height = parseOptionalPositiveInteger(req.body.height, 'height');
  if (!width && !height) {
    throw createHttpError(400, 'Width or height is required');
  }

  const maintainAspectRatio = String(req.body.maintainAspectRatio ?? 'true').toLowerCase() !== 'false';

  let geometry = '';
  if (width && height) {
    geometry = maintainAspectRatio ? `${width}x${height}` : `${width}x${height}!`;
  } else if (width) {
    geometry = `${width}x`;
  } else {
    geometry = `x${height}`;
  }

  const extension = resolveFileExtension(req.file);
  const baseName = sanitizeBaseName(req.file.originalname, 'image');
  const outputName = `${baseName}.${extension}`;
  const outputPath = path.join(PROCESSED_DIR, `${Date.now()}-${randomUUID()}-resize.${extension}`);

  try {
    await runMagickCommand([
      req.file.path,
      '-auto-orient',
      '-resize',
      geometry,
      outputPath,
    ]);
  } catch (error) {
    await Promise.all([safeUnlink(req.file.path), safeUnlink(outputPath)]);
    throw error;
  }

  sendProcessedFile(res, outputPath, {
    downloadName: outputName,
    contentType: MIME_BY_EXTENSION[extension] || req.file.mimetype,
    cleanupPaths: [req.file.path, outputPath],
  });
});

const watermarkHandler = asyncHandler(async (req, res) => {
  const sourceFile = getNamedFile(req.files, 'file') || getNamedFile(req.files, 'files');
  if (!sourceFile) {
    throw createHttpError(400, 'No file uploaded');
  }

  const watermarkFile = getNamedFile(req.files, 'watermark') || getNamedFile(req.files, 'watermarkImage');
  const requestedType = String(req.body.type || req.body.watermarkType || '')
    .trim()
    .toLowerCase();
  const type = requestedType === 'image' || (!requestedType && watermarkFile) ? 'image' : 'text';
  const text = String(req.body.text || req.body.watermarkText || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140);

  if (type === 'text' && !text) {
    throw createHttpError(400, 'Watermark text is required');
  }

  if (type === 'image' && !watermarkFile) {
    throw createHttpError(400, 'Watermark image is required');
  }

  const opacity = parseOpacity(req.body.opacity, 0.35);
  const fontSize = parseIntegerWithClamp(req.body.fontSize, { min: 8, max: 400, fallback: 36 });
  const scale = parseIntegerWithClamp(req.body.scale, { min: 1, max: 100, fallback: 25 });
  const offsetX = parseIntegerWithClamp(req.body.offsetX, { min: -5000, max: 5000, fallback: 20 });
  const offsetY = parseIntegerWithClamp(req.body.offsetY, { min: -5000, max: 5000, fallback: 20 });
  const color = normalizeHexColor(req.body.color);
  const gravity = resolveGravity(req.body.position, 'southeast');
  const offsetGeometry = toGeometryOffset(offsetX, offsetY);

  const extension = resolveFileExtension(sourceFile);
  const baseName = sanitizeBaseName(sourceFile.originalname, 'image');
  const outputName = `${baseName}.${extension}`;
  const outputPath = path.join(
    PROCESSED_DIR,
    `${Date.now()}-${randomUUID()}-watermark.${extension}`
  );

  const cleanupPaths = [sourceFile.path, outputPath];

  try {
    if (type === 'image' && watermarkFile) {
      cleanupPaths.push(watermarkFile.path);

      await runMagickCommand([
        sourceFile.path,
        '-auto-orient',
        '(',
        watermarkFile.path,
        '-auto-orient',
        '-resize',
        `${scale}%`,
        '-alpha',
        'set',
        '-channel',
        'A',
        '-evaluate',
        'multiply',
        String(opacity),
        '+channel',
        ')',
        '-gravity',
        gravity,
        '-geometry',
        offsetGeometry,
        '-composite',
        outputPath,
      ]);
    } else {
      const fillColor = hexToRgba(color, opacity);
      await runMagickCommand([
        sourceFile.path,
        '-auto-orient',
        '-gravity',
        gravity,
        '-fill',
        fillColor,
        '-pointsize',
        String(fontSize),
        '-annotate',
        offsetGeometry,
        text,
        outputPath,
      ]);
    }
  } catch (error) {
    await Promise.all(cleanupPaths.map((cleanupPath) => safeUnlink(cleanupPath)));
    throw error;
  }

  sendProcessedFile(res, outputPath, {
    downloadName: outputName,
    contentType: MIME_BY_EXTENSION[extension] || sourceFile.mimetype,
    cleanupPaths,
  });
});

for (const routePath of ['/crop', '/crop-image', '/image-tools/crop']) {
  router.post(routePath, uploadCropFields, cropHandler);
}

for (const routePath of ['/rotate', '/image-tools/rotate']) {
  router.post(routePath, uploadSingleImage, rotateHandler);
}

for (const routePath of ['/convert', '/image-tools/convert']) {
  router.post(routePath, uploadSingleImage, convertHandler);
}

for (const routePath of ['/resize', '/image-tools/resize']) {
  router.post(routePath, uploadSingleImage, resizeHandler);
}

for (const routePath of ['/watermark', '/image-tools/watermark']) {
  router.post(routePath, uploadWatermarkFields, watermarkHandler);
}

router.post(
  '/image-to-pdf',
  uploadMultipleImages,
  asyncHandler(async (req, res) => {
    const files = req.files || [];
    if (files.length === 0) {
      throw createHttpError(400, 'No files uploaded');
    }

    const outputPath = path.join(PROCESSED_DIR, `${Date.now()}-${randomUUID()}-images.pdf`);
    const primaryBaseName = sanitizeBaseName(files[0]?.originalname, 'images');
    const outputName =
      files.length === 1
        ? `${primaryBaseName}.pdf`
        : `${primaryBaseName}_output.pdf`;
    const inputPaths = files.map((file) => file.path);

    try {
      await runMagickCommand([...inputPaths, outputPath]);
    } catch (error) {
      await Promise.all([...inputPaths.map((inputPath) => safeUnlink(inputPath)), safeUnlink(outputPath)]);
      throw error;
    }

    sendProcessedFile(res, outputPath, {
      downloadName: outputName,
      contentType: 'application/pdf',
      cleanupPaths: [...inputPaths, outputPath],
    });
  })
);

router.post(
  '/remove-bg',
  uploadSingleImage,
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw createHttpError(400, 'No file uploaded');
    }

    const fuzz = req.body.fuzz === undefined
      ? 20
      : parseFiniteNumber(req.body.fuzz, 'fuzz', { min: 0, max: 100 });

    const outputName = `${sanitizeBaseName(req.file.originalname, 'image')}.png`;
    const outputPath = path.join(PROCESSED_DIR, `${Date.now()}-${randomUUID()}-remove-bg.png`);

    try {
      await runMagickCommand([
        req.file.path,
        '-alpha',
        'set',
        '-fuzz',
        `${fuzz}%`,
        '-transparent',
        'white',
        outputPath,
      ]);
    } catch (error) {
      await Promise.all([safeUnlink(req.file.path), safeUnlink(outputPath)]);
      throw error;
    }

    sendProcessedFile(res, outputPath, {
      downloadName: outputName,
      contentType: 'image/png',
      cleanupPaths: [req.file.path, outputPath],
    });
  })
);

export default router;
