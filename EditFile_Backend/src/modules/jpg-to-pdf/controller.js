import { v4 as uuidv4 } from 'uuid';
import { createJob } from '../../services/database.service.js';
import { uploadFile, generateS3Key } from '../../config/s3.js';
import { addJob } from '../../queue/queue.js';
import { logger } from '../../utils/logger.js';
import { asyncHandler } from '../../middleware/error.middleware.js';

export const jpgToPdf = asyncHandler(async (req, res) => {
  const startTime = Date.now();
  
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'No files uploaded',
    });
  }

  const pageSize = req.body.pageSize || 'a4';
  const orientation = req.body.orientation || 'portrait';
  const margin = parseInt(req.body.margin) || 0;
  const files = req.files;
  
  logger.info(`JPG to PDF request: files: ${files.length}`);

  try {
    const fileUrls = [];
    let totalSize = 0;
    
    for (const file of files) {
      const s3Key = generateS3Key(uuidv4(), file.originalname, 'input');
      const fileUrl = await uploadFile(file.buffer, s3Key, file.mimetype);
      fileUrls.push({
        url: fileUrl,
        name: file.originalname,
        size: file.size,
      });
      totalSize += file.size;
    }

    const job = await createJob({
      toolType: 'jpg-to-pdf',
      originalFileUrl: fileUrls[0].url,
      originalSize: totalSize,
      metadata: {
        fileCount: files.length,
        pageSize,
        orientation,
        margin,
        fileNames: files.map(f => f.originalname),
      },
      ipAddress: req.ip,
    });

    await addJob('jpgToPdf', {
      jobId: job.id,
      fileUrls,
      pageSize,
      orientation,
      margin,
    });

    const duration = Date.now() - startTime;
    logger.info(`JPG to PDF job created: ${job.id} in ${duration}ms`);

    res.status(202).json({
      success: true,
      message: 'JPG to PDF conversion job queued successfully',
      jobId: job.id,
      status: 'pending',
      fileCount: files.length,
    });

  } catch (error) {
    logger.error(`JPG to PDF failed:`, error);
    throw error;
  }
});

export default { jpgToPdf };
