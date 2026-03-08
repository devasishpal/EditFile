import { PDFDocument, PageSizes } from 'pdf-lib';
import sharp from 'sharp';
import { uploadFile, generateS3Key, downloadFile } from '../../config/s3.js';
import { updateJobStatus, completeJob, failJob } from '../../services/database.service.js';
import { logger } from '../../utils/logger.js';
import { buildFileName } from '../../utils/file-name.js';

const getPageSize = (size, orientation) => {
  const sizes = {
    a4: PageSizes.A4,
    letter: PageSizes.Letter,
    legal: PageSizes.Legal,
  };
  
  let pageSize = sizes[size] || PageSizes.A4;
  
  if (orientation === 'landscape') {
    pageSize = [pageSize[1], pageSize[0]];
  }
  
  return pageSize;
};

export const processJpgToPdf = async (jobData) => {
  const { jobId, fileUrls, pageSize, orientation, margin } = jobData;
  
  logger.info(`Starting JPG to PDF: ${jobId}, files: ${fileUrls.length}`);
  
  try {
    await updateJobStatus(jobId, 'processing');
    
    // Create PDF
    const pdf = await PDFDocument.create();
    const size = getPageSize(pageSize, orientation);
    
    for (const fileData of fileUrls) {
      logger.info(`Processing image: ${fileData.name}`);
      
      // Download image
      const imageBuffer = await downloadFile(fileData.url);
      
      // Get image metadata
      const metadata = await sharp(imageBuffer).metadata();
      
      // Embed image in PDF
      let image;
      if (metadata.format === 'png') {
        image = await pdf.embedPng(imageBuffer);
      } else {
        // Convert to JPEG for other formats
        const jpegBuffer = await sharp(imageBuffer).jpeg().toBuffer();
        image = await pdf.embedJpg(jpegBuffer);
      }
      
      // Add page with image
      const page = pdf.addPage(size);
      const { width: pageWidth, height: pageHeight } = page.getSize();
      
      // Calculate image dimensions to fit page with margin
      const marginPoints = margin * 2.83465; // Convert mm to points
      const availableWidth = pageWidth - (marginPoints * 2);
      const availableHeight = pageHeight - (marginPoints * 2);
      
      const imageAspect = image.width / image.height;
      const availableAspect = availableWidth / availableHeight;
      
      let drawWidth, drawHeight;
      if (imageAspect > availableAspect) {
        drawWidth = availableWidth;
        drawHeight = availableWidth / imageAspect;
      } else {
        drawHeight = availableHeight;
        drawWidth = availableHeight * imageAspect;
      }
      
      // Center image on page
      const x = (pageWidth - drawWidth) / 2;
      const y = (pageHeight - drawHeight) / 2;
      
      page.drawImage(image, {
        x,
        y,
        width: drawWidth,
        height: drawHeight,
      });
    }
    
    // Save PDF
    const pdfBytes = await pdf.save();
    const pdfBuffer = Buffer.from(pdfBytes);
    
    // Upload
    const outputFileName = buildFileName({
      originalName: fileUrls[0]?.name || 'images',
      extension: 'pdf',
      fallbackBase: 'images',
      useOutputSuffix: fileUrls.length > 1,
    });
    const outputKey = generateS3Key(jobId, outputFileName, 'output');
    const outputUrl = await uploadFile(pdfBuffer, outputKey, 'application/pdf');
    
    // Complete job
    await completeJob(jobId, outputUrl, pdfBuffer.length);
    await updateJobStatus(jobId, 'completed', {
      metadata: {
        outputFileName,
        fileCount: fileUrls.length,
      },
    });
    
    logger.info(`JPG to PDF completed: ${jobId}, pages: ${fileUrls.length}`);
    
    return {
      success: true,
      jobId,
      pageCount: fileUrls.length,
      outputSize: pdfBuffer.length,
      outputUrl,
    };
    
  } catch (error) {
    logger.error(`JPG to PDF failed for job ${jobId}:`, error);
    await failJob(jobId, error.message);
    throw error;
  }
};

export default { processJpgToPdf };
