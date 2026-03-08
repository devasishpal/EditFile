import { downloadFile } from '../../config/s3.js';
import { updateJobStatus, completeJob, failJob } from '../../services/database.service.js';
import { logger } from '../../utils/logger.js';
import {
  getBaseName,
  getFormatFromFile,
  getMimeTypeForFormat,
  getExtensionForFormat,
  transformImageBuffer,
  uploadProcessedFiles,
} from '../../utils/imagemagick.js';
import { mapWithConcurrency, resolveConcurrency } from '../../utils/concurrency.js';

const rotateBuffer = async ({ imageBuffer, originalName, mimeType, angle }) => {
  const format = getFormatFromFile(originalName, mimeType, 'jpg');
  const extension = getExtensionForFormat(format, 'jpg');
  const outputBuffer = await transformImageBuffer({
    inputBuffer: imageBuffer,
    inputFormat: format,
    outputFormat: format,
    operations: ['-rotate', String(angle)],
  });

  return {
    fileName: `${getBaseName(originalName, 'image')}.${extension}`,
    contentType: getMimeTypeForFormat(format),
    buffer: outputBuffer,
    size: outputBuffer.length,
  };
};

const IMAGE_TASK_CONCURRENCY = resolveConcurrency('IMAGE_TASK_CONCURRENCY', {
  reserve: 1,
  min: 1,
  max: 8,
});

export const processImageRotate = async (jobData) => {
  const { jobId, fileUrls, angle } = jobData;

  logger.info(
    `Starting ImageMagick image rotate: ${jobId}, files: ${fileUrls.length}, angle: ${angle}`
  );

  try {
    await updateJobStatus(jobId, 'processing');

    const results = await mapWithConcurrency(
      fileUrls,
      IMAGE_TASK_CONCURRENCY,
      async (fileData) => {
        const imageBuffer = await downloadFile(fileData.url);
        const rotated = await rotateBuffer({
          imageBuffer,
          originalName: fileData.name,
          mimeType: fileData.mimetype,
          angle,
        });

        return {
          fileData,
          rotated,
          originalSize: imageBuffer.length,
        };
      }
    );

    const processedFiles = results.map(({ rotated }) => ({
      fileName: rotated.fileName,
      contentType: rotated.contentType,
      buffer: rotated.buffer,
    }));

    const details = results.map(({ fileData, rotated }) => ({
      name: fileData.name,
      originalSize: fileData.size,
      rotatedSize: rotated.size,
      angle,
    }));

    const totalOriginalSize = results.reduce((sum, item) => sum + item.originalSize, 0);
    const totalRotatedSize = results.reduce((sum, item) => sum + item.rotated.size, 0);

    const { outputUrl, outputBuffer, outputFileName, outputContentType } = await uploadProcessedFiles({
      jobId,
      files: processedFiles,
      fallbackBaseName: `${getBaseName(fileUrls[0]?.name, 'image')}_output`,
    });

    await completeJob(jobId, outputUrl, outputBuffer.length);
    await updateJobStatus(jobId, 'completed', {
      metadata: {
        angle,
        outputFileName,
        outputType: outputContentType,
        fileCount: processedFiles.length,
        files: details,
      },
    });

    logger.info(`Image rotate completed: ${jobId}, files: ${processedFiles.length}`);

    return {
      success: true,
      jobId,
      fileCount: processedFiles.length,
      originalSize: totalOriginalSize,
      rotatedSize: totalRotatedSize,
      outputFileName,
      outputType: outputContentType,
      files: details,
      outputUrl,
    };
  } catch (error) {
    logger.error(`Image rotate failed for job ${jobId}:`, error);
    await failJob(jobId, error.message);
    throw error;
  }
};

export default { processImageRotate };
