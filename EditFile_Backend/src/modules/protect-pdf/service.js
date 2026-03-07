import { PDFDocument } from 'pdf-lib';
import { uploadFile, generateS3Key, downloadFile } from '../../config/s3.js';
import { updateJobStatus, completeJob, failJob } from '../../services/database.service.js';
import { logger } from '../../utils/logger.js';

export const processProtectPdf = async (jobData) => {
  const { jobId, fileUrl, password, permissions } = jobData;
  
  logger.info(`Starting PDF protection: ${jobId}`);
  
  try {
    await updateJobStatus(jobId, 'processing');
    
    // Download and load PDF
    const pdfBuffer = await downloadFile(fileUrl);
    const pdf = await PDFDocument.load(pdfBuffer);
    
    // Set permissions
    const permissionFlags = {
      printing: permissions.printing ? 'highResolution' : 'none',
      copying: permissions.copying,
      modifying: permissions.modifying,
    };
    
    // Encrypt PDF with password
    const protectedBytes = await pdf.save({
      password,
      permissions: permissionFlags,
    });
    
    const protectedBuffer = Buffer.from(protectedBytes);
    
    // Upload
    const outputKey = generateS3Key(jobId, 'protected.pdf', 'output');
    const outputUrl = await uploadFile(protectedBuffer, outputKey, 'application/pdf');
    
    // Complete job
    await completeJob(jobId, outputUrl, protectedBuffer.length);
    
    logger.info(`PDF protection completed: ${jobId}`);
    
    return {
      success: true,
      jobId,
      outputSize: protectedBuffer.length,
      outputUrl,
    };
    
  } catch (error) {
    logger.error(`PDF protection failed for job ${jobId}:`, error);
    await failJob(jobId, error.message);
    throw error;
  }
};

export default { processProtectPdf };
