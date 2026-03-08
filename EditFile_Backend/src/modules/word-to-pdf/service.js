import { uploadFile, generateS3Key, downloadFile } from '../../config/s3.js';
import { updateJobStatus, completeJob, failJob } from '../../services/database.service.js';
import { logger } from '../../utils/logger.js';
import { convertWithLibreOffice } from '../../utils/libreoffice.js';

export const processWordToPdf = async (jobData) => {
  const { jobId, fileUrl, originalName = 'document.docx' } = jobData;
  
  logger.info(`Starting Word to PDF: ${jobId}`);
  
  try {
    await updateJobStatus(jobId, 'processing');
    
    const docBuffer = await downloadFile(fileUrl);
    const pdfBuffer = await convertWithLibreOffice(docBuffer, originalName, 'pdf');

    if (!pdfBuffer || pdfBuffer.length === 0) {
      throw new Error('Word to PDF conversion produced an empty file.');
    }

    const outputFileName = 'converted.pdf';
    const outputKey = generateS3Key(jobId, outputFileName, 'output');
    const outputUrl = await uploadFile(pdfBuffer, outputKey, 'application/pdf');
    
    await completeJob(jobId, outputUrl, pdfBuffer.length);
    await updateJobStatus(jobId, 'completed', {
      metadata: {
        outputFileName,
      },
    });
    
    logger.info(`Word to PDF completed: ${jobId}`);
    
    return {
      success: true,
      jobId,
      outputSize: pdfBuffer.length,
      outputUrl,
    };
    
  } catch (error) {
    logger.error(`Word to PDF failed for job ${jobId}:`, error);
    await failJob(jobId, error.message);
    throw error;
  }
};

export default { processWordToPdf };
