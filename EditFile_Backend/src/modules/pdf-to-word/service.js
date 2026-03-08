import { uploadFile, generateS3Key, downloadFile } from '../../config/s3.js';
import { updateJobStatus, completeJob, failJob } from '../../services/database.service.js';
import { logger } from '../../utils/logger.js';
import { convertWithLibreOffice } from '../../utils/libreoffice.js';

const ALLOWED_OUTPUT_FORMATS = new Set(['docx', 'doc', 'rtf']);

const getContentTypeForFormat = (format) => {
  if (format === 'doc') {
    return 'application/msword';
  }

  if (format === 'rtf') {
    return 'application/rtf';
  }

  return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
};

export const processPdfToWord = async (jobData) => {
  const { jobId, fileUrl, outputFormat } = jobData;
  const normalizedFormat = String(outputFormat || 'docx').toLowerCase();

  logger.info(`Starting PDF to Word: ${jobId}`);

  try {
    await updateJobStatus(jobId, 'processing');

    if (!ALLOWED_OUTPUT_FORMATS.has(normalizedFormat)) {
      throw new Error('Unsupported output format. Use docx, doc, or rtf.');
    }

    const pdfBuffer = await downloadFile(fileUrl);
    const outputBuffer = await convertWithLibreOffice(
      pdfBuffer,
      'source.pdf',
      normalizedFormat
    );

    if (!outputBuffer || outputBuffer.length === 0) {
      throw new Error('PDF to Word conversion produced an empty file.');
    }

    const outputFileName = `converted.${normalizedFormat}`;
    const outputKey = generateS3Key(jobId, outputFileName, 'output');
    const outputUrl = await uploadFile(
      outputBuffer,
      outputKey,
      getContentTypeForFormat(normalizedFormat)
    );

    await completeJob(jobId, outputUrl, outputBuffer.length);
    await updateJobStatus(jobId, 'completed', {
      metadata: {
        outputFormat: normalizedFormat,
        outputFileName,
      },
    });
    
    logger.info(`PDF to Word completed: ${jobId}`);
    
    return {
      success: true,
      jobId,
      outputFormat: normalizedFormat,
      outputSize: outputBuffer.length,
      outputUrl,
    };
    
  } catch (error) {
    logger.error(`PDF to Word failed for job ${jobId}:`, error);
    await failJob(jobId, error.message);
    throw error;
  }
};

export default { processPdfToWord };
