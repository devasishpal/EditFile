import { PDFDocument } from 'pdf-lib';
import { uploadFile, generateS3Key, downloadFile } from '../../config/s3.js';
import { updateJobStatus, completeJob, failJob } from '../../services/database.service.js';
import { logger } from '../../utils/logger.js';

export const processUnlockPdf = async (jobData) => {
  const { jobId, fileUrl, password } = jobData;
  
  logger.info(`Starting PDF unlock: ${jobId}`);
  
  try {
    await updateJobStatus(jobId, 'processing');
    
    // Download PDF
    const pdfBuffer = await downloadFile(fileUrl);
    
    // Try to load with password
    let pdf;
    try {
      pdf = await PDFDocument.load(pdfBuffer, {
        password,
      });
    } catch (error) {
      throw new Error('Invalid password or PDF is not encrypted');
    }
    
    // Save without password
    const unlockedBytes = await pdf.save({
      password: undefined, // Remove password
    });
    
    const unlockedBuffer = Buffer.from(unlockedBytes);
    
    // Upload
    const outputKey = generateS3Key(jobId, 'unlocked.pdf', 'output');
    const outputUrl = await uploadFile(unlockedBuffer, outputKey, 'application/pdf');
    
    // Complete job
    await completeJob(jobId, outputUrl, unlockedBuffer.length);
    
    logger.info(`PDF unlock completed: ${jobId}`);
    
    return {
      success: true,
      jobId,
      outputSize: unlockedBuffer.length,
      outputUrl,
    };
    
  } catch (error) {
    logger.error(`PDF unlock failed for job ${jobId}:`, error);
    await failJob(jobId, error.message);
    throw error;
  }
};

export default { processUnlockPdf };
