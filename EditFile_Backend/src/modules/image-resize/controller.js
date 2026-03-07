import { v4 as uuidv4 } from 'uuid';
import { createJob } from '../../services/database.service.js';
import { uploadFile, generateS3Key } from '../../config/s3.js';
import { addJob } from '../../queue/queue.js';
import { logger } from '../../utils/logger.js';
import { asyncHandler } from '../../middleware/error.middleware.js';

export const resizeImage = asyncHandler(async (req, res) => {
  const startTime = Date.now();
  
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'No files uploaded',
    });
  }

  const width = parseInt(req.body.width) || null;
  const height = parseInt(req.body.height) || null;
  const maintainAspectRatio = req.body.maintainAspectRatio !== 'false';
  const files = req.files;
  
  if (!width && !height) {
    return res.status(400).json({
      success: false,
      error: 'Width or height is required',
    });
  }
  
  logger.info(`Image resize request: files: ${files.length}, ${width}x${height}`);

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
      toolType: 'image-resize',
      originalFileUrl: fileUrls[0].url,
      originalSize: totalSize,
      metadata: {
        fileCount: files.length,
        width,
        height,
        maintainAspectRatio,
        fileNames: files.map(f => f.originalname),
      },
      ipAddress: req.ip,
    });

    await addJob('imageResize', {
      jobId: job.id,
      fileUrls,
      width,
      height,
      maintainAspectRatio,
    });

    const duration = Date.now() - startTime;
    logger.info(`Image resize job created: ${job.id} in ${duration}ms`);

    res.status(202).json({
      success: true,
      message: 'Image resize job queued successfully',
      jobId: job.id,
      status: 'pending',
      fileCount: files.length,
      width,
      height,
    });

  } catch (error) {
    logger.error(`Image resize failed:`, error);
    throw error;
  }
});

export default { resizeImage };
