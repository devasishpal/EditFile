import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { downloadFile } from '../../config/s3.js';
import { updateJobStatus, completeJob, failJob } from '../../services/database.service.js';
import { logger } from '../../utils/logger.js';
import {
  clampInteger,
  createTempWorkspace,
  getBaseName,
  getExtensionForFormat,
  getFormatFromFile,
  getMimeTypeForFormat,
  removePathSafe,
  runMagick,
  uploadProcessedFiles,
} from '../../utils/imagemagick.js';
import { mapWithConcurrency, resolveConcurrency } from '../../utils/concurrency.js';

let shouldUseSharpFallback = false;
let hasLoggedSharpFallback = false;
const IMAGE_TASK_CONCURRENCY = resolveConcurrency('IMAGE_TASK_CONCURRENCY', {
  reserve: 1,
  min: 1,
  max: 8,
});

const isMagickUnavailableError = (error) => {
  const message = String(error?.message || '').toLowerCase();

  return (
    message.includes('imagemagick is not available') ||
    (message.includes('spawn') && message.includes('magick') && message.includes('enoent'))
  );
};

const readDimensions = async (imagePath) => {
  const { stdout } = await runMagick(['identify', '-format', '%wx%h', imagePath]);
  const [widthPart, heightPart] = String(stdout || '')
    .trim()
    .split('x');

  const width = Number.parseInt(widthPart, 10);
  const height = Number.parseInt(heightPart, 10);
  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    return null;
  }

  return { width, height };
};

const readDimensionsFromMetadata = (metadata) => {
  if (!metadata || !Number.isInteger(metadata.width) || !Number.isInteger(metadata.height)) {
    return null;
  }

  return {
    width: metadata.width,
    height: metadata.height,
  };
};

const buildResizeGeometry = ({ width, height, maintainAspectRatio }) => {
  if (!width && !height) {
    throw new Error('Width or height is required');
  }

  if (!width) {
    return `x${height}`;
  }

  if (!height) {
    return `${width}x`;
  }

  return maintainAspectRatio ? `${width}x${height}` : `${width}x${height}!`;
};

const getSharpResizeOptions = ({ width, height, maintainAspectRatio }) => {
  const hasWidth = Number.isInteger(width) && width > 0;
  const hasHeight = Number.isInteger(height) && height > 0;

  if (!hasWidth && !hasHeight) {
    throw new Error('Width or height is required');
  }

  if (hasWidth && hasHeight) {
    return {
      width,
      height,
      fit: maintainAspectRatio ? 'inside' : 'fill',
    };
  }

  return hasWidth ? { width } : { height };
};

const getSharpOutputFormat = (format) => {
  if (format === 'bmp') {
    return 'png';
  }

  return format;
};

const applySharpOutputFormat = (pipeline, format) => {
  switch (format) {
    case 'jpg':
      return pipeline.jpeg({
        progressive: true,
        mozjpeg: true,
      });
    case 'png':
      return pipeline.png({
        compressionLevel: 9,
        adaptiveFiltering: true,
      });
    case 'webp':
      return pipeline.webp({ effort: 6 });
    case 'gif':
      return pipeline.gif();
    case 'tiff':
      return pipeline.tiff({ compression: 'lzw' });
    case 'avif':
      return pipeline.avif({ effort: 4 });
    default:
      return pipeline.jpeg({
        progressive: true,
        mozjpeg: true,
      });
  }
};

const resizeBufferWithSharp = async ({
  imageBuffer,
  originalName,
  mimeType,
  width,
  height,
  maintainAspectRatio,
}) => {
  const inputFormat = getFormatFromFile(originalName, mimeType, 'jpg');
  const outputFormat = getSharpOutputFormat(inputFormat);
  const extension = getExtensionForFormat(outputFormat, 'jpg');

  const originalMetadataPromise = sharp(imageBuffer, {
    animated: false,
    failOn: 'none',
  }).metadata();

  let pipeline = sharp(imageBuffer, {
    animated: false,
    failOn: 'error',
  }).rotate();

  pipeline = pipeline.resize(
    getSharpResizeOptions({
      width,
      height,
      maintainAspectRatio,
    })
  );

  pipeline = applySharpOutputFormat(pipeline, outputFormat);

  const resizedBuffer = await pipeline.toBuffer();

  const [originalMetadata, resizedMetadata] = await Promise.all([
    originalMetadataPromise,
    sharp(resizedBuffer, {
      animated: false,
      failOn: 'none',
    }).metadata(),
  ]);

  return {
    fileName: `${getBaseName(originalName, 'image')}-resized.${extension}`,
    contentType: getMimeTypeForFormat(outputFormat),
    buffer: resizedBuffer,
    size: resizedBuffer.length,
    originalDimensions: readDimensionsFromMetadata(originalMetadata),
    resizedDimensions: readDimensionsFromMetadata(resizedMetadata),
  };
};

const resizeBufferWithMagick = async ({
  imageBuffer,
  originalName,
  mimeType,
  width,
  height,
  maintainAspectRatio,
}) => {
  const workspace = await createTempWorkspace('editfile-image-resize-');
  const format = getFormatFromFile(originalName, mimeType, 'jpg');
  const extension = getExtensionForFormat(format, 'jpg');
  const inputPath = path.join(workspace, `input.${extension}`);
  const outputPath = path.join(workspace, `output.${extension}`);

  try {
    await fs.writeFile(inputPath, imageBuffer);

    await runMagick([
      inputPath,
      '-auto-orient',
      '-resize',
      buildResizeGeometry({ width, height, maintainAspectRatio }),
      outputPath,
    ]);

    const [originalDimensions, resizedDimensions, resizedBuffer] = await Promise.all([
      readDimensions(inputPath),
      readDimensions(outputPath),
      fs.readFile(outputPath),
    ]);

    return {
      fileName: `${getBaseName(originalName, 'image')}-resized.${extension}`,
      contentType: getMimeTypeForFormat(format),
      buffer: resizedBuffer,
      size: resizedBuffer.length,
      originalDimensions,
      resizedDimensions,
    };
  } finally {
    await removePathSafe(workspace);
  }
};

const resizeBuffer = async ({
  imageBuffer,
  originalName,
  mimeType,
  width,
  height,
  maintainAspectRatio,
}) => {
  if (shouldUseSharpFallback) {
    return resizeBufferWithSharp({
      imageBuffer,
      originalName,
      mimeType,
      width,
      height,
      maintainAspectRatio,
    });
  }

  try {
    return await resizeBufferWithMagick({
      imageBuffer,
      originalName,
      mimeType,
      width,
      height,
      maintainAspectRatio,
    });
  } catch (error) {
    if (isMagickUnavailableError(error)) {
      shouldUseSharpFallback = true;

      if (!hasLoggedSharpFallback) {
        logger.warn(
          `ImageMagick is unavailable for image-resize, using sharp fallback: ${error.message}`
        );
        hasLoggedSharpFallback = true;
      }

      return resizeBufferWithSharp({
        imageBuffer,
        originalName,
        mimeType,
        width,
        height,
        maintainAspectRatio,
      });
    }

    throw error;
  }
};

export const processImageResize = async (jobData) => {
  const { jobId, fileUrls, width, height, maintainAspectRatio } = jobData;
  const normalizedWidth = clampInteger(width, 1, 10000, null);
  const normalizedHeight = clampInteger(height, 1, 10000, null);

  logger.info(`Starting image resize: ${jobId}, files: ${fileUrls.length}`);

  try {
    await updateJobStatus(jobId, 'processing');

    const results = await mapWithConcurrency(
      fileUrls,
      IMAGE_TASK_CONCURRENCY,
      async (fileData) => {
        const imageBuffer = await downloadFile(fileData.url);
        const resized = await resizeBuffer({
          imageBuffer,
          originalName: fileData.name,
          mimeType: fileData.mimetype,
          width: normalizedWidth,
          height: normalizedHeight,
          maintainAspectRatio: maintainAspectRatio !== false,
        });

        return {
          fileData,
          resized,
          originalSize: imageBuffer.length,
        };
      }
    );

    const processedFiles = results.map(({ resized }) => ({
      fileName: resized.fileName,
      contentType: resized.contentType,
      buffer: resized.buffer,
    }));

    const details = results.map(({ fileData, resized }) => ({
      name: fileData.name,
      originalSize: fileData.size,
      resizedSize: resized.size,
      originalDimensions: resized.originalDimensions
        ? `${resized.originalDimensions.width}x${resized.originalDimensions.height}`
        : null,
      newDimensions: resized.resizedDimensions
        ? `${resized.resizedDimensions.width}x${resized.resizedDimensions.height}`
        : null,
    }));

    const totalOriginalSize = results.reduce((sum, item) => sum + item.originalSize, 0);
    const totalResizedSize = results.reduce((sum, item) => sum + item.resized.size, 0);

    const { outputUrl, outputBuffer, outputFileName, outputContentType } = await uploadProcessedFiles({
      jobId,
      files: processedFiles,
      fallbackBaseName: `${getBaseName(fileUrls[0]?.name, 'image')}-resized`,
    });

    await completeJob(jobId, outputUrl, outputBuffer.length);
    await updateJobStatus(jobId, 'completed', {
      metadata: {
        width: normalizedWidth,
        height: normalizedHeight,
        maintainAspectRatio: maintainAspectRatio !== false,
        outputFileName,
        outputType: outputContentType,
        fileCount: processedFiles.length,
        files: details,
      },
    });

    logger.info(`Image resize completed: ${jobId}, files: ${processedFiles.length}`);

    return {
      success: true,
      jobId,
      fileCount: processedFiles.length,
      originalSize: totalOriginalSize,
      resizedSize: totalResizedSize,
      outputFileName,
      outputType: outputContentType,
      files: details,
      outputUrl,
    };
  } catch (error) {
    logger.error(`Image resize failed for job ${jobId}:`, error);
    await failJob(jobId, error.message);
    throw error;
  }
};

export default { processImageResize };
