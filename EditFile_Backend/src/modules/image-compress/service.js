import sharp from 'sharp';
import { downloadFile } from '../../config/s3.js';
import { updateJobStatus, completeJob, failJob } from '../../services/database.service.js';
import { logger } from '../../utils/logger.js';
import {
  clampInteger,
  getBaseName,
  getExtensionForFormat,
  getFormatFromFile,
  getMimeTypeForFormat,
  transformImageBuffer,
  uploadProcessedFiles,
} from '../../utils/imagemagick.js';
import { mapWithConcurrency, resolveConcurrency } from '../../utils/concurrency.js';

const MIN_QUALITY = 10;
const MAX_QUALITY = 90;
let shouldUseSharpFallback = false;
let hasLoggedSharpFallback = false;
const IMAGE_TASK_CONCURRENCY = resolveConcurrency('IMAGE_TASK_CONCURRENCY', {
  reserve: 1,
  min: 1,
  max: 8,
});

const pickBestTargetCandidate = (currentBest, candidate, targetBytes) => {
  if (!currentBest) {
    return candidate;
  }

  const currentWithinTarget = currentBest.size <= targetBytes;
  const candidateWithinTarget = candidate.size <= targetBytes;

  if (candidateWithinTarget && !currentWithinTarget) {
    return candidate;
  }

  if (!candidateWithinTarget && currentWithinTarget) {
    return currentBest;
  }

  if (candidateWithinTarget && currentWithinTarget) {
    return candidate.size > currentBest.size ? candidate : currentBest;
  }

  return candidate.size < currentBest.size ? candidate : currentBest;
};

const buildQualityAttempts = (quality) => {
  const normalized = clampInteger(quality, MIN_QUALITY, MAX_QUALITY, 80);
  const attempts = [normalized];

  for (let q = normalized - 5; q >= MIN_QUALITY; q -= 5) {
    attempts.push(q);
  }

  if (!attempts.includes(MIN_QUALITY)) {
    attempts.push(MIN_QUALITY);
  }

  return attempts;
};

const buildCompressOperations = ({ format, quality, targetSizeKB }) => {
  const operations = [];

  if (format === 'jpg') {
    operations.push('-sampling-factor', '4:2:0', '-interlace', 'Plane');
    if (targetSizeKB) {
      operations.push('-define', `jpeg:extent=${targetSizeKB}KB`);
    }
  }

  if (format === 'png') {
    operations.push('-define', 'png:compression-level=9', '-define', 'png:compression-filter=5');
  }

  operations.push('-quality', String(quality));
  return operations;
};

const isMagickUnavailableError = (error) => {
  const message = String(error?.message || '').toLowerCase();

  return (
    message.includes('imagemagick is not available') ||
    (message.includes('spawn') && message.includes('magick') && message.includes('enoent'))
  );
};

const compressWithSharp = async ({ imageBuffer, format, quality }) => {
  const source = sharp(imageBuffer, {
    animated: false,
    failOn: 'error',
  }).rotate();

  if (format === 'png') {
    return source
      .png({
        quality,
        compressionLevel: 9,
        effort: 10,
        adaptiveFiltering: true,
        palette: quality < 90,
      })
      .toBuffer();
  }

  return source
    .jpeg({
      quality,
      progressive: true,
      mozjpeg: true,
      chromaSubsampling: '4:2:0',
    })
    .toBuffer();
};

const compressBufferWithSharp = async ({
  imageBuffer,
  originalName,
  mimeType,
  preferredQuality,
  targetSizeKB,
}) => {
  const inputFormat = getFormatFromFile(originalName, mimeType, 'jpg');
  const format = inputFormat === 'png' ? 'png' : 'jpg';
  const extension = getExtensionForFormat(format, 'jpg');
  const targetBytes = targetSizeKB ? targetSizeKB * 1024 : null;
  const qualityAttempts = targetBytes
    ? buildQualityAttempts(preferredQuality)
    : [clampInteger(preferredQuality, MIN_QUALITY, MAX_QUALITY, 80)];

  let bestCandidate = null;

  for (const quality of qualityAttempts) {
    const candidateBuffer = await compressWithSharp({
      imageBuffer,
      format,
      quality,
    });

    const candidate = {
      quality,
      buffer: candidateBuffer,
      size: candidateBuffer.length,
    };

    if (!targetBytes) {
      bestCandidate = candidate;
      break;
    }

    bestCandidate = pickBestTargetCandidate(bestCandidate, candidate, targetBytes);
    if (candidate.size <= targetBytes) {
      break;
    }
  }

  if (!bestCandidate) {
    throw new Error('Failed to create compressed image output');
  }

  return {
    quality: bestCandidate.quality,
    fileName: `${getBaseName(originalName, 'image')}-compressed.${extension}`,
    contentType: getMimeTypeForFormat(format),
    buffer: bestCandidate.buffer,
    size: bestCandidate.size,
  };
};

const compressBuffer = async ({
  imageBuffer,
  originalName,
  mimeType,
  preferredQuality,
  targetSizeKB,
}) => {
  if (shouldUseSharpFallback) {
    return compressBufferWithSharp({
      imageBuffer,
      originalName,
      mimeType,
      preferredQuality,
      targetSizeKB,
    });
  }

  const format = getFormatFromFile(originalName, mimeType, 'jpg');
  const extension = getExtensionForFormat(format, 'jpg');
  const targetBytes = targetSizeKB ? targetSizeKB * 1024 : null;

  try {
    let bestCandidate = null;
    const qualityAttempts = targetBytes
      ? buildQualityAttempts(preferredQuality)
      : [clampInteger(preferredQuality, MIN_QUALITY, MAX_QUALITY, 80)];

    for (const quality of qualityAttempts) {
      const candidateBuffer = await transformImageBuffer({
        inputBuffer: imageBuffer,
        inputFormat: format,
        outputFormat: format,
        operations: buildCompressOperations({
          format,
          quality,
          targetSizeKB: format === 'jpg' ? targetSizeKB : null,
        }),
      });

      const candidate = {
        quality,
        buffer: candidateBuffer,
        size: candidateBuffer.length,
      };

      if (!targetBytes) {
        bestCandidate = candidate;
        break;
      }

      bestCandidate = pickBestTargetCandidate(bestCandidate, candidate, targetBytes);
      if (candidate.size <= targetBytes) {
        break;
      }
    }

    if (!bestCandidate) {
      throw new Error('Failed to create compressed image output');
    }

    return {
      quality: bestCandidate.quality,
      fileName: `${getBaseName(originalName, 'image')}-compressed.${extension}`,
      contentType: getMimeTypeForFormat(format),
      buffer: bestCandidate.buffer,
      size: bestCandidate.size,
    };
  } catch (error) {
    if (isMagickUnavailableError(error)) {
      shouldUseSharpFallback = true;

      if (!hasLoggedSharpFallback) {
        logger.warn(
          `ImageMagick is unavailable for image-compress, using sharp fallback: ${error.message}`
        );
        hasLoggedSharpFallback = true;
      }

      return compressBufferWithSharp({
        imageBuffer,
        originalName,
        mimeType,
        preferredQuality,
        targetSizeKB,
      });
    }

    throw error;
  } finally {
    // No temp workspace is created for ImageMagick compression path.
  }
};

export const processImageCompress = async (jobData) => {
  const { jobId, fileUrls, quality, targetSizeKB } = jobData;
  const normalizedQuality = clampInteger(quality, MIN_QUALITY, MAX_QUALITY, 80);
  const normalizedTargetSizeKB = clampInteger(targetSizeKB, 1, 102400, null);

  logger.info(
    `Starting image compression: ${jobId}, files: ${fileUrls.length}, quality: ${normalizedQuality}, targetKB: ${normalizedTargetSizeKB ?? 'n/a'}`
  );

  try {
    await updateJobStatus(jobId, 'processing');

    const results = await mapWithConcurrency(
      fileUrls,
      IMAGE_TASK_CONCURRENCY,
      async (fileData) => {
        const imageBuffer = await downloadFile(fileData.url);
        const compressed = await compressBuffer({
          imageBuffer,
          originalName: fileData.name,
          mimeType: fileData.mimetype,
          preferredQuality: normalizedQuality,
          targetSizeKB: normalizedTargetSizeKB,
        });

        return {
          compressed,
          originalSize: imageBuffer.length,
        };
      }
    );

    const processedFiles = results.map(({ compressed }) => ({
      fileName: compressed.fileName,
      contentType: compressed.contentType,
      buffer: compressed.buffer,
    }));

    const totalOriginalSize = results.reduce((sum, item) => sum + item.originalSize, 0);
    const totalCompressedSize = results.reduce((sum, item) => sum + item.compressed.size, 0);

    const { outputUrl, outputBuffer, outputFileName, outputContentType } = await uploadProcessedFiles({
      jobId,
      files: processedFiles,
      fallbackBaseName: `${getBaseName(fileUrls[0]?.name, 'image')}-compressed`,
    });

    await completeJob(jobId, outputUrl, outputBuffer.length);
    await updateJobStatus(jobId, 'completed', {
      metadata: {
        quality: normalizedQuality,
        targetSizeKB: normalizedTargetSizeKB,
        outputFileName,
        outputType: outputContentType,
        fileCount: processedFiles.length,
      },
    });

    const reductionPercent =
      totalOriginalSize > 0
        ? ((totalOriginalSize - totalCompressedSize) / totalOriginalSize) * 100
        : 0;

    logger.info(
      `Image compression completed: ${jobId}, reduction: ${reductionPercent.toFixed(2)}%`
    );

    return {
      success: true,
      jobId,
      fileCount: processedFiles.length,
      originalSize: totalOriginalSize,
      compressedSize: totalCompressedSize,
      reductionPercent: reductionPercent.toFixed(2),
      outputFileName,
      outputType: outputContentType,
      outputUrl,
    };
  } catch (error) {
    logger.error(`Image compression failed for job ${jobId}:`, error);
    await failJob(jobId, error.message);
    throw error;
  }
};

export default { processImageCompress };
