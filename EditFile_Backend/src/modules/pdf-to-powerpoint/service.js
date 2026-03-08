import { uploadFile, generateS3Key, downloadFile } from '../../config/s3.js';
import { updateJobStatus, completeJob, failJob } from '../../services/database.service.js';
import { logger } from '../../utils/logger.js';
import { convertWithLibreOffice } from '../../utils/libreoffice.js';
import {
  CONVERSION_FAILURE_MESSAGE,
  getContentTypeForFormat,
} from '../../utils/office-formats.js';
import { buildFileName } from '../../utils/file-name.js';

const ALLOWED_OUTPUT_FORMATS = new Set(['pptx', 'ppt']);

export const processPdfToPowerpoint = async (jobData) => {
  const { jobId, fileUrl, outputFormat, originalName = 'source.pdf' } = jobData;
  const normalizedFormat = String(outputFormat || 'pptx').toLowerCase();

  logger.info(`Starting PDF to PowerPoint: ${jobId}`);

  try {
    await updateJobStatus(jobId, 'processing');

    if (!ALLOWED_OUTPUT_FORMATS.has(normalizedFormat)) {
      throw new Error('Unsupported output format. Use pptx or ppt.');
    }

    const pdfBuffer = await downloadFile(fileUrl);
    const outputBuffer = await convertWithLibreOffice(
      pdfBuffer,
      originalName,
      normalizedFormat
    );

    if (!outputBuffer || outputBuffer.length === 0) {
      throw new Error('PDF to PowerPoint conversion produced an empty file.');
    }

    const outputFileName = buildFileName({
      originalName,
      extension: normalizedFormat,
      fallbackBase: 'document',
    });
    const outputKey = generateS3Key(jobId, outputFileName, 'output');
    const outputUrl = await uploadFile(
      outputBuffer,
      outputKey,
      getContentTypeForFormat(normalizedFormat)
    );

    await completeJob(jobId, outputUrl, outputBuffer.length);
    await updateJobStatus(jobId, 'completed', {
      metadata: {
        originalName,
        outputFormat: normalizedFormat,
        outputFileName,
      },
    });

    logger.info(`PDF to PowerPoint completed: ${jobId}`);

    return {
      success: true,
      jobId,
      outputFormat: normalizedFormat,
      outputSize: outputBuffer.length,
      outputUrl,
    };
  } catch (error) {
    logger.error(`PDF to PowerPoint failed for job ${jobId}:`, error);
    await failJob(jobId, CONVERSION_FAILURE_MESSAGE);
    throw new Error(CONVERSION_FAILURE_MESSAGE);
  }
};

export default { processPdfToPowerpoint };
