import { downloadFile } from '../../config/s3.js';
import { updateJobStatus, completeJob, failJob } from '../../services/database.service.js';
import { logger } from '../../utils/logger.js';
import {
  getBaseName,
  getFormatFromFile,
  getMimeTypeForFormat,
  normalizeFormat,
  getExtensionForFormat,
  transformImageBuffer,
  uploadProcessedFiles,
} from '../../utils/imagemagick.js';
import { mapWithConcurrency, resolveConcurrency } from '../../utils/concurrency.js';

const IMAGE_TASK_CONCURRENCY = resolveConcurrency('IMAGE_TASK_CONCURRENCY', {
  reserve: 1,
  min: 1,
  max: 8,
});

const convertBuffer = async ({ imageBuffer, originalName, mimeType, targetFormat }) => {
  const inputFormat = getFormatFromFile(originalName, mimeType, 'jpg');
  const outputFormat = normalizeFormat(targetFormat, 'jpg');
  const operations = [];
  if (outputFormat === 'jpg') {
    operations.push('-background', 'white', '-alpha', 'remove', '-alpha', 'off', '-quality', '88');
  } else if (outputFormat === 'webp') {
    operations.push('-quality', '88');
  }

  const convertedBuffer = await transformImageBuffer({
    inputBuffer: imageBuffer,
    inputFormat,
    outputFormat,
    operations,
  });

  return {
    fileName: `${getBaseName(originalName, 'image')}.${getExtensionForFormat(outputFormat, 'jpg')}`,
    contentType: getMimeTypeForFormat(outputFormat),
    buffer: convertedBuffer,
    size: convertedBuffer.length,
    format: outputFormat,
  };
};

export const processImageConvert = async (jobData) => {
  const { jobId, fileUrls, targetFormat } = jobData;
  const normalizedTargetFormat = normalizeFormat(targetFormat, 'jpg');

  logger.info(
    `Starting ImageMagick image conversion: ${jobId}, files: ${fileUrls.length}, format: ${normalizedTargetFormat}`
  );

  try {
    await updateJobStatus(jobId, 'processing');

    const results = await mapWithConcurrency(
      fileUrls,
      IMAGE_TASK_CONCURRENCY,
      async (fileData) => {
        const imageBuffer = await downloadFile(fileData.url);
        const converted = await convertBuffer({
          imageBuffer,
          originalName: fileData.name,
          mimeType: fileData.mimetype,
          targetFormat: normalizedTargetFormat,
        });

        return {
          fileData,
          converted,
          originalSize: imageBuffer.length,
        };
      }
    );

    const processedFiles = results.map(({ converted }) => ({
      fileName: converted.fileName,
      contentType: converted.contentType,
      buffer: converted.buffer,
    }));

    const details = results.map(({ fileData, converted }) => ({
      name: fileData.name,
      convertedName: converted.fileName,
      originalSize: fileData.size,
      convertedSize: converted.size,
    }));

    const totalOriginalSize = results.reduce((sum, item) => sum + item.originalSize, 0);
    const totalConvertedSize = results.reduce((sum, item) => sum + item.converted.size, 0);

    const { outputUrl, outputBuffer, outputFileName, outputContentType } = await uploadProcessedFiles({
      jobId,
      files: processedFiles,
      fallbackBaseName: `${getBaseName(fileUrls[0]?.name, 'image')}_output`,
    });

    await completeJob(jobId, outputUrl, outputBuffer.length);
    await updateJobStatus(jobId, 'completed', {
      metadata: {
        targetFormat: normalizedTargetFormat,
        outputFileName,
        outputType: outputContentType,
        fileCount: processedFiles.length,
        files: details,
      },
    });

    logger.info(`Image conversion completed: ${jobId}, files: ${processedFiles.length}`);

    return {
      success: true,
      jobId,
      fileCount: processedFiles.length,
      originalSize: totalOriginalSize,
      convertedSize: totalConvertedSize,
      targetFormat: normalizedTargetFormat,
      outputFileName,
      outputType: outputContentType,
      files: details,
      outputUrl,
    };
  } catch (error) {
    logger.error(`Image conversion failed for job ${jobId}:`, error);
    await failJob(jobId, error.message);
    throw error;
  }
};

export default { processImageConvert };
