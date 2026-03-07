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

const cropBuffer = async ({ imageBuffer, originalName, mimeType, x, y, width, height }) => {
  const format = getFormatFromFile(originalName, mimeType, 'jpg');
  const extension = getExtensionForFormat(format, 'jpg');
  const outputBuffer = await transformImageBuffer({
    inputBuffer: imageBuffer,
    inputFormat: format,
    outputFormat: format,
    operations: ['-crop', `${width}x${height}+${x}+${y}`, '+repage'],
  });

  return {
    fileName: `${getBaseName(originalName, 'image')}-cropped.${extension}`,
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

export const processImageCrop = async (jobData) => {
  const { jobId, fileUrls, x, y, width, height } = jobData;

  logger.info(
    `Starting ImageMagick image crop: ${jobId}, files: ${fileUrls.length}, crop: ${width}x${height}+${x}+${y}`
  );

  try {
    await updateJobStatus(jobId, 'processing');

    const results = await mapWithConcurrency(
      fileUrls,
      IMAGE_TASK_CONCURRENCY,
      async (fileData) => {
        const imageBuffer = await downloadFile(fileData.url);
        const cropped = await cropBuffer({
          imageBuffer,
          originalName: fileData.name,
          mimeType: fileData.mimetype,
          x,
          y,
          width,
          height,
        });

        return {
          fileData,
          cropped,
          originalSize: imageBuffer.length,
        };
      }
    );

    const processedFiles = results.map(({ cropped }) => ({
      fileName: cropped.fileName,
      contentType: cropped.contentType,
      buffer: cropped.buffer,
    }));

    const details = results.map(({ fileData, cropped }) => ({
      name: fileData.name,
      originalSize: fileData.size,
      croppedSize: cropped.size,
    }));

    const totalOriginalSize = results.reduce((sum, item) => sum + item.originalSize, 0);
    const totalCroppedSize = results.reduce((sum, item) => sum + item.cropped.size, 0);

    const { outputUrl, outputBuffer, outputFileName, outputContentType } = await uploadProcessedFiles({
      jobId,
      files: processedFiles,
      fallbackBaseName: `${getBaseName(fileUrls[0]?.name, 'image')}-cropped`,
    });

    await completeJob(jobId, outputUrl, outputBuffer.length);
    await updateJobStatus(jobId, 'completed', {
      metadata: {
        x,
        y,
        width,
        height,
        outputFileName,
        outputType: outputContentType,
        fileCount: processedFiles.length,
        files: details,
      },
    });

    logger.info(`Image crop completed: ${jobId}, files: ${processedFiles.length}`);

    return {
      success: true,
      jobId,
      fileCount: processedFiles.length,
      originalSize: totalOriginalSize,
      croppedSize: totalCroppedSize,
      outputFileName,
      outputType: outputContentType,
      files: details,
      outputUrl,
    };
  } catch (error) {
    logger.error(`Image crop failed for job ${jobId}:`, error);
    await failJob(jobId, error.message);
    throw error;
  }
};

export default { processImageCrop };
