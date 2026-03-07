import { PDFDocument } from 'pdf-lib';
import { uploadFile, generateS3Key, downloadFile } from '../../config/s3.js';
import { updateJobStatus, completeJob, failJob } from '../../services/database.service.js';
import { logger } from '../../utils/logger.js';

export const processWordToPdf = async (jobData) => {
  const { jobId, fileUrl } = jobData;
  
  logger.info(`Starting Word to PDF: ${jobId}`);
  
  try {
    await updateJobStatus(jobId, 'processing');
    
    // Download Word document
    const docBuffer = await downloadFile(fileUrl);
    
    // In production, use LibreOffice or similar to convert DOCX to PDF
    // For now, create a placeholder PDF
    
    const pdf = await PDFDocument.create();
    const page = pdf.addPage();
    
    // Add placeholder text
    // Note: In production, you'd extract content from the Word doc
    
    const pdfBytes = await pdf.save();
    const pdfBuffer = Buffer.from(pdfBytes);
    
    // Upload
    const outputKey = generateS3Key(jobId, 'converted.pdf', 'output');
    const outputUrl = await uploadFile(pdfBuffer, outputKey, 'application/pdf');
    
    // Complete job
    await completeJob(jobId, outputUrl, pdfBuffer.length);
    
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
