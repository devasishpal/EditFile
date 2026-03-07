import { v4 as uuidv4 } from 'uuid';
import { createJob } from '../../services/database.service.js';
import { uploadFile, generateS3Key } from '../../config/s3.js';
import { addJob } from '../../queue/queue.js';
import { logger } from '../../utils/logger.js';
import { asyncHandler } from '../../middleware/error.middleware.js';

export const protectPdf = asyncHandler(async (req, res) => {
  const startTime = Date.now();
  
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'No file uploaded',
    });
  }

  const { password } = req.body;
  const permissions = {
    printing: req.body.printing !== 'false',
    copying: req.body.copying === 'true',
    modifying: req.body.modifying === 'true',
  };
  
  const file = req.file;
  const jobId = uuidv4();
  
  logger.info(`Protect PDF request: ${jobId}`);

  try {
    const s3Key = generateS3Key(jobId, file.originalname, 'input');
    const fileUrl = await uploadFile(file.buffer, s3Key, file.mimetype);

    const job = await createJob({
      toolType: 'protect-pdf',
      originalFileUrl: fileUrl,
      originalSize: file.size,
      metadata: {
        originalName: file.originalname,
        permissions,
      },
      ipAddress: req.ip,
    });

    await addJob('protectPdf', {
      jobId: job.id,
      fileUrl,
      password,
      permissions,
    });

    const duration = Date.now() - startTime;
    logger.info(`Protect PDF job created: ${job.id} in ${duration}ms`);

    res.status(202).json({
      success: true,
      message: 'PDF protection job queued successfully',
      jobId: job.id,
      status: 'pending',
    });

  } catch (error) {
    logger.error(`Protect PDF failed for job ${jobId}:`, error);
    throw error;
  }
});

export default { protectPdf };
