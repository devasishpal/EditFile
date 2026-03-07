import { v4 as uuidv4 } from 'uuid';
import { createJob } from '../../services/database.service.js';
import { uploadFile, generateS3Key } from '../../config/s3.js';
import { addJob } from '../../queue/queue.js';
import { logger } from '../../utils/logger.js';
import { asyncHandler } from '../../middleware/error.middleware.js';

const VALID_ANGLES = new Set([90, 180, 270]);

export const rotateImage = asyncHandler(async (req, res) => {
  const startTime = Date.now();

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'No files uploaded',
    });
  }

  const angle = Number.parseInt(req.body.angle, 10);
  if (!VALID_ANGLES.has(angle)) {
    return res.status(400).json({
      success: false,
      error: 'Angle must be 90, 180, or 270',
    });
  }

  const files = req.files;
  logger.info(`Image rotate request: files: ${files.length}, angle: ${angle}`);

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
        mimetype: file.mimetype,
      });
      totalSize += file.size;
    }

    const job = await createJob({
      toolType: 'image-rotate',
      originalFileUrl: fileUrls[0].url,
      originalSize: totalSize,
      metadata: {
        fileCount: files.length,
        angle,
        fileNames: files.map((f) => f.originalname),
        originalName: files[0]?.originalname || 'rotated-image',
      },
      ipAddress: req.ip,
    });

    await addJob('imageRotate', {
      jobId: job.id,
      fileUrls,
      angle,
    });

    const duration = Date.now() - startTime;
    logger.info(`Image rotate job created: ${job.id} in ${duration}ms`);

    res.status(202).json({
      success: true,
      message: 'Image rotate job queued successfully',
      jobId: job.id,
      status: 'pending',
      fileCount: files.length,
      angle,
    });
  } catch (error) {
    logger.error('Image rotate failed:', error);
    throw error;
  }
});

export default { rotateImage };

