import { uploadFile, generateS3Key, downloadFile } from '../../config/s3.js';
import { updateJobStatus, completeJob, failJob } from '../../services/database.service.js';
import { logger } from '../../utils/logger.js';
import { convertWithLibreOffice } from '../../utils/libreoffice.js';
import {
  CONVERSION_FAILURE_MESSAGE,
  getContentTypeForFormat,
} from '../../utils/office-formats.js';
import { buildFileName } from '../../utils/file-name.js';

export const processExcelToPdf = async (jobData) => {
  const { jobId, fileUrl, originalName = 'spreadsheet.xlsx' } = jobData;

  logger.info(`Starting Excel to PDF: ${jobId}`);

  try {
    await updateJobStatus(jobId, 'processing');

    const excelBuffer = await downloadFile(fileUrl);
    const pdfBuffer = await convertWithLibreOffice(excelBuffer, originalName, 'pdf');

    if (!pdfBuffer || pdfBuffer.length === 0) {
      throw new Error('Excel to PDF conversion produced an empty file.');
    }

    const outputFileName = buildFileName({
      originalName,
      extension: 'pdf',
      fallbackBase: 'spreadsheet',
    });
    const outputKey = generateS3Key(jobId, outputFileName, 'output');
    const outputUrl = await uploadFile(
      pdfBuffer,
      outputKey,
      getContentTypeForFormat('pdf')
    );

    await completeJob(jobId, outputUrl, pdfBuffer.length);
    await updateJobStatus(jobId, 'completed', {
      metadata: {
        originalName,
        outputFileName,
      },
    });

    logger.info(`Excel to PDF completed: ${jobId}`);

    return {
      success: true,
      jobId,
      outputSize: pdfBuffer.length,
      outputUrl,
    };
  } catch (error) {
    logger.error(`Excel to PDF failed for job ${jobId}:`, error);
    await failJob(jobId, CONVERSION_FAILURE_MESSAGE);
    throw new Error(CONVERSION_FAILURE_MESSAGE);
  }
};

export default { processExcelToPdf };
