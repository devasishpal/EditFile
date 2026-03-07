import { v4 as uuidv4 } from 'uuid';
import { createJob } from '../../services/database.service.js';
import { uploadFile, generateS3Key } from '../../config/s3.js';
import { addJob } from '../../queue/queue.js';
import { logger } from '../../utils/logger.js';
import { asyncHandler } from '../../middleware/error.middleware.js';

export const wordToPdf = asyncHandler(async (req, res) => {
  const startTime = Date.now();
  
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'No file uploaded',
    });
  }

  const file = req.file;
  const jobId = uuidv4();
  
  logger.info(`Word to PDF request: ${jobId}`);

  try {
    const s3Key = generateS3Key(jobId, file.originalname, 'input');
    const fileUrl = await uploadFile(file.buffer, s3Key, file.mimetype);

    const job = await createJob({
      toolType: 'word-to-pdf',
      originalFileUrl: fileUrl,
      originalSize: file.size,
      metadata: {
        originalName: file.originalname,
      },
      ipAddress: req.ip,
    });

    await addJob('wordToPdf', {
      jobId: job.id,
      fileUrl,
    });

    const duration = Date.now() - startTime;
    logger.info(`Word to PDF job created: ${job.id} in ${duration}ms`);

    res.status(202).json({
      success: true,
      message: 'Word to PDF conversion job queued successfully',
      jobId: job.id,
      status: 'pending',
    });

  } catch (error) {
    logger.error(`Word to PDF failed for job ${jobId}:`, error);
    throw error;
  }
});

export default { wordToPdf };
