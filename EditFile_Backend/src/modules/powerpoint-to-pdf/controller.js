import { v4 as uuidv4 } from 'uuid';
import { createJob } from '../../services/database.service.js';
import { uploadFile, generateS3Key } from '../../config/s3.js';
import { addJob } from '../../queue/queue.js';
import { logger } from '../../utils/logger.js';
import { asyncHandler } from '../../middleware/error.middleware.js';

export const powerpointToPdf = asyncHandler(async (req, res) => {
  const startTime = Date.now();

  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'No file uploaded',
    });
  }

  const file = req.file;
  const requestId = uuidv4();

  logger.info(`PowerPoint to PDF request: ${requestId}`);

  try {
    const s3Key = generateS3Key(requestId, file.originalname, 'input');
    const fileUrl = await uploadFile(file.buffer, s3Key, file.mimetype);

    const job = await createJob({
      toolType: 'powerpoint-to-pdf',
      originalFileUrl: fileUrl,
      originalSize: file.size,
      metadata: {
        originalName: file.originalname,
      },
      ipAddress: req.ip,
    });

    await addJob('powerpointToPdf', {
      jobId: job.id,
      fileUrl,
      originalName: file.originalname,
    });

    const duration = Date.now() - startTime;
    logger.info(`PowerPoint to PDF job created: ${job.id} in ${duration}ms`);

    res.status(202).json({
      success: true,
      message: 'PowerPoint to PDF conversion job queued successfully',
      jobId: job.id,
      status: 'pending',
    });
  } catch (error) {
    logger.error(`PowerPoint to PDF failed for request ${requestId}:`, error);
    throw error;
  }
});

export default { powerpointToPdf };
