import { PDFDocument } from 'pdf-lib';
import { uploadFile, generateS3Key, downloadFile } from '../../config/s3.js';
import { updateJobStatus, completeJob, failJob } from '../../services/database.service.js';
import { logger } from '../../utils/logger.js';

export const processPdfToWord = async (jobData) => {
  const { jobId, fileUrl, outputFormat } = jobData;
  
  logger.info(`Starting PDF to Word: ${jobId}`);
  
  try {
    await updateJobStatus(jobId, 'processing');
    
    // Download PDF
    const pdfBuffer = await downloadFile(fileUrl);
    const pdf = await PDFDocument.load(pdfBuffer);
    
    // Extract text from all pages
    let textContent = '';
    const pages = pdf.getPages();
    
    for (let i = 0; i < pages.length; i++) {
      textContent += `\n--- Page ${i + 1} ---\n`;
      // Note: pdf-lib doesn't support text extraction
      // In production, use pdf-parse or similar library
      textContent += '[Text content would be extracted here]\n';
    }
    
    // For now, create a simple text file
    // In production, use a library like pdf2docx or LibreOffice
    const outputBuffer = Buffer.from(textContent, 'utf-8');
    
    // Upload
    const outputKey = generateS3Key(jobId, 'converted.docx', 'output');
    const outputUrl = await uploadFile(outputBuffer, outputKey, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    
    // Complete job
    await completeJob(jobId, outputUrl, outputBuffer.length);
    
    logger.info(`PDF to Word completed: ${jobId}`);
    
    return {
      success: true,
      jobId,
      pageCount: pages.length,
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
