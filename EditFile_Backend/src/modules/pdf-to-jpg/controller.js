import { v4 as uuidv4 } from 'uuid';
import { createJob } from '../../services/database.service.js';
import { uploadFile, generateS3Key } from '../../config/s3.js';
import { addJob } from '../../queue/queue.js';
import { logger } from '../../utils/logger.js';
import { asyncHandler } from '../../middleware/error.middleware.js';

export const pdfToJpg = asyncHandler(async (req, res) => {
  const startTime = Date.now();
  
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'No file uploaded',
    });
  }

  const quality = parseInt(req.body.quality) || 90;
  const dpi = parseInt(req.body.dpi) || 150;
  const file = req.file;
  const jobId = uuidv4();
  
  logger.info(`PDF to JPG request: ${jobId}`);

  try {
    const s3Key = generateS3Key(jobId, file.originalname, 'input');
    const fileUrl = await uploadFile(file.buffer, s3Key, file.mimetype);

    const job = await createJob({
      toolType: 'pdf-to-jpg',
      originalFileUrl: fileUrl,
      originalSize: file.size,
      metadata: {
        quality,
        dpi,
        originalName: file.originalname,
      },
      ipAddress: req.ip,
    });

    await addJob('pdfToJpg', {
      jobId: job.id,
      fileUrl,
      quality,
      dpi,
      originalName: file.originalname,
    });

    const duration = Date.now() - startTime;
    logger.info(`PDF to JPG job created: ${job.id} in ${duration}ms`);

    res.status(202).json({
      success: true,
      message: 'PDF to JPG conversion job queued successfully',
      jobId: job.id,
      status: 'pending',
      quality,
      dpi,
    });

  } catch (error) {
    logger.error(`PDF to JPG failed for job ${jobId}:`, error);
    throw error;
  }
});

export default { pdfToJpg };
