import { v4 as uuidv4 } from 'uuid';
import { createJob } from '../../services/database.service.js';
import { uploadFile, generateS3Key } from '../../config/s3.js';
import { addJob } from '../../queue/queue.js';
import { logger } from '../../utils/logger.js';
import { asyncHandler } from '../../middleware/error.middleware.js';

const parseDimension = (value, fallback) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1 || parsed > 5000) {
    return null;
  }

  return parsed;
};

export const generateThumbnail = asyncHandler(async (req, res) => {
  const startTime = Date.now();

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'No files uploaded',
    });
  }

  const width = parseDimension(req.body.width, 200);
  const height = parseDimension(req.body.height, 200);

  if (width === null || height === null) {
    return res.status(400).json({
      success: false,
      error: 'Thumbnail width and height must be between 1 and 5000',
    });
  }

  const files = req.files;
  logger.info(`Thumbnail request: files: ${files.length}, size: ${width}x${height}`);

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
      toolType: 'image-thumbnail',
      originalFileUrl: fileUrls[0].url,
      originalSize: totalSize,
      metadata: {
        fileCount: files.length,
        width,
        height,
        fileNames: files.map((f) => f.originalname),
        originalName: files[0]?.originalname || 'thumbnail',
      },
      ipAddress: req.ip,
    });

    await addJob('imageThumbnail', {
      jobId: job.id,
      fileUrls,
      width,
      height,
    });

    const duration = Date.now() - startTime;
    logger.info(`Thumbnail job created: ${job.id} in ${duration}ms`);

    res.status(202).json({
      success: true,
      message: 'Thumbnail job queued successfully',
      jobId: job.id,
      status: 'pending',
      fileCount: files.length,
      width,
      height,
    });
  } catch (error) {
    logger.error('Thumbnail generation failed:', error);
    throw error;
  }
});

export default { generateThumbnail };

