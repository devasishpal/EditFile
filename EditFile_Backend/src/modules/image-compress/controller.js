import { v4 as uuidv4 } from 'uuid';
import { createJob } from '../../services/database.service.js';
import { uploadFile, generateS3Key } from '../../config/s3.js';
import { addJob } from '../../queue/queue.js';
import { logger } from '../../utils/logger.js';
import { asyncHandler } from '../../middleware/error.middleware.js';

const parseQuality = (value) => {
  if (value === undefined || value === null || value === '') {
    return 80;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1 || parsed > 100) {
    return null;
  }

  return Math.min(90, Math.max(10, parsed));
};

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

export const compressImage = asyncHandler(async (req, res) => {
  const startTime = Date.now();
  
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'No files uploaded',
    });
  }

  const quality = parseQuality(req.body.quality);
  const targetSizeKB = parsePositiveInt(req.body.targetSizeKB ?? req.body.targetSize);
  const files = req.files;

  if (quality === null) {
    return res.status(400).json({
      success: false,
      error: 'Quality must be a numeric value between 1 and 100',
    });
  }

  if (targetSizeKB !== null) {
    for (const file of files) {
      if (targetSizeKB * 1024 >= file.size) {
        return res.status(400).json({
          success: false,
          error: `Target size must be smaller than original size for ${file.originalname}`,
        });
      }
    }
  }
  
  logger.info(
    `Image compress request: files: ${files.length}, quality: ${quality}, targetKB: ${targetSizeKB ?? 'n/a'}`
  );

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
      toolType: 'image-compress',
      originalFileUrl: fileUrls[0].url,
      originalSize: totalSize,
      metadata: {
        fileCount: files.length,
        quality,
        targetSizeKB,
        fileNames: files.map((f) => f.originalname),
        originalName: files[0]?.originalname || 'compressed.jpg',
      },
      ipAddress: req.ip,
    });

    await addJob('imageCompress', {
      jobId: job.id,
      fileUrls,
      quality,
      targetSizeKB,
    });

    const duration = Date.now() - startTime;
    logger.info(`Image compress job created: ${job.id} in ${duration}ms`);

    res.status(202).json({
      success: true,
      message: 'Image compression job queued successfully',
      jobId: job.id,
      status: 'pending',
      fileCount: files.length,
      quality,
      targetSizeKB,
    });

  } catch (error) {
    logger.error(`Image compress failed:`, error);
    throw error;
  }
});

export default { compressImage };
