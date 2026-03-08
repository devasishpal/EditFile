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

const buildThumbnailGeometry = (width, height) => {
  if (!width) {
    return `x${height}`;
  }
  if (!height) {
    return `${width}x`;
  }
  return `${width}x${height}`;
};

const thumbnailBuffer = async ({ imageBuffer, originalName, mimeType, width, height }) => {
  const format = getFormatFromFile(originalName, mimeType, 'jpg');
  const extension = getExtensionForFormat(format, 'jpg');
  const outputBuffer = await transformImageBuffer({
    inputBuffer: imageBuffer,
    inputFormat: format,
    outputFormat: format,
    operations: ['-thumbnail', buildThumbnailGeometry(width, height)],
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

export const processImageThumbnail = async (jobData) => {
  const { jobId, fileUrls, width, height } = jobData;

  logger.info(
    `Starting ImageMagick thumbnail generation: ${jobId}, files: ${fileUrls.length}, size: ${width}x${height}`
  );

  try {
    await updateJobStatus(jobId, 'processing');

    const results = await mapWithConcurrency(
      fileUrls,
      IMAGE_TASK_CONCURRENCY,
      async (fileData) => {
        const imageBuffer = await downloadFile(fileData.url);
        const thumb = await thumbnailBuffer({
          imageBuffer,
          originalName: fileData.name,
          mimeType: fileData.mimetype,
          width,
          height,
        });

        return {
          fileData,
          thumb,
          originalSize: imageBuffer.length,
        };
      }
    );

    const processedFiles = results.map(({ thumb }) => ({
      fileName: thumb.fileName,
      contentType: thumb.contentType,
      buffer: thumb.buffer,
    }));

    const details = results.map(({ fileData, thumb }) => ({
      name: fileData.name,
      originalSize: fileData.size,
      thumbnailSize: thumb.size,
    }));

    const totalOriginalSize = results.reduce((sum, item) => sum + item.originalSize, 0);
    const totalThumbnailSize = results.reduce((sum, item) => sum + item.thumb.size, 0);

    const { outputUrl, outputBuffer, outputFileName, outputContentType } = await uploadProcessedFiles({
      jobId,
      files: processedFiles,
      fallbackBaseName: `${getBaseName(fileUrls[0]?.name, 'image')}_output`,
    });

    await completeJob(jobId, outputUrl, outputBuffer.length);
    await updateJobStatus(jobId, 'completed', {
      metadata: {
        width,
        height,
        outputFileName,
        outputType: outputContentType,
        fileCount: processedFiles.length,
        files: details,
      },
    });

    logger.info(`Thumbnail generation completed: ${jobId}, files: ${processedFiles.length}`);

    return {
      success: true,
      jobId,
      fileCount: processedFiles.length,
      originalSize: totalOriginalSize,
      thumbnailSize: totalThumbnailSize,
      outputFileName,
      outputType: outputContentType,
      files: details,
      outputUrl,
    };
  } catch (error) {
    logger.error(`Thumbnail generation failed for job ${jobId}:`, error);
    await failJob(jobId, error.message);
    throw error;
  }
};

export default { processImageThumbnail };
