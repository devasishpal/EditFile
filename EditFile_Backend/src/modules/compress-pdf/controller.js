import { v4 as uuidv4 } from 'uuid';
import { createJob } from '../../services/database.service.js';
import { uploadFile, generateS3Key } from '../../config/s3.js';
import { addJob } from '../../queue/queue.js';
import { logger } from '../../utils/logger.js';
import { asyncHandler } from '../../middleware/error.middleware.js';

const parsePositiveInt = (value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
};

/**
 * Compress PDF controller
 * Handles file upload and queues compression job
 */
export const compressPdf = asyncHandler(async (req, res) => {
  const startTime = Date.now();

  // Keep compression level for backward compatibility
  const compressionLevel = Number.parseInt(req.body.compressionLevel, 10) || 80;
  if (compressionLevel < 1 || compressionLevel > 100) {
    return res.status(400).json({
      success: false,
      error: 'Compression level must be between 1 and 100',
    });
  }

  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'No file uploaded',
    });
  }

  const file = req.file;
  const targetSizeKB = parsePositiveInt(req.body.targetSizeKB ?? req.body.targetSize);

  const jobId = uuidv4();

  logger.info(
    `Compress PDF request: ${jobId}, file: ${file.originalname}, size: ${file.size}, targetKB: ${targetSizeKB ?? 'n/a'}`
  );

  try {
    // Generate S3 key for input file
    const s3Key = generateS3Key(jobId, file.originalname, 'input');
    
    // Upload file to S3
    const fileUrl = await uploadFile(file.buffer, s3Key, file.mimetype);
    
    // Create job in database
    const job = await createJob({
      toolType: 'compress-pdf',
      originalFileUrl: fileUrl,
      originalSize: file.size,
      metadata: {
        compressionLevel,
        targetSizeKB,
        originalName: file.originalname,
        mimeType: file.mimetype,
      },
      ipAddress: req.ip,
    });

    // Add job to queue
    await addJob('compressPdf', {
      jobId: job.id,
      fileUrl,
      compressionLevel,
      targetSizeKB,
      originalName: file.originalname,
    });

    const duration = Date.now() - startTime;
    logger.info(`Compress PDF job created: ${job.id} in ${duration}ms`);

    // Return response
    res.status(202).json({
      success: true,
      message: 'PDF compression job queued successfully',
      jobId: job.id,
      status: 'pending',
      originalSize: file.size,
      compressionLevel,
      targetSizeKB,
    });

  } catch (error) {
    logger.error(`Compress PDF failed for job ${jobId}:`, error);
    throw error;
  }
});

export default { compressPdf };
