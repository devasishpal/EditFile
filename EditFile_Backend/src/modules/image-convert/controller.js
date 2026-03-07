import { v4 as uuidv4 } from 'uuid';
import { createJob } from '../../services/database.service.js';
import { uploadFile, generateS3Key } from '../../config/s3.js';
import { addJob } from '../../queue/queue.js';
import { logger } from '../../utils/logger.js';
import { asyncHandler } from '../../middleware/error.middleware.js';

const VALID_FORMATS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tiff', 'avif'];

export const convertImage = asyncHandler(async (req, res) => {
  const startTime = Date.now();
  
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'No files uploaded',
    });
  }

  const targetFormat = (req.body.format || req.body.targetFormat || '')
    .toString()
    .trim()
    .toLowerCase() || 'jpg';
  
  if (!VALID_FORMATS.includes(targetFormat)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid target format',
      validFormats: VALID_FORMATS,
    });
  }
  
  const files = req.files;
  logger.info(`Image convert request: files: ${files.length}, format: ${targetFormat}`);

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
      toolType: 'image-convert',
      originalFileUrl: fileUrls[0].url,
      originalSize: totalSize,
      metadata: {
        fileCount: files.length,
        targetFormat,
        fileNames: files.map(f => f.originalname),
      },
      ipAddress: req.ip,
    });

    await addJob('imageConvert', {
      jobId: job.id,
      fileUrls,
      targetFormat,
    });

    const duration = Date.now() - startTime;
    logger.info(`Image convert job created: ${job.id} in ${duration}ms`);

    res.status(202).json({
      success: true,
      message: 'Image conversion job queued successfully',
      jobId: job.id,
      status: 'pending',
      fileCount: files.length,
      targetFormat,
    });

  } catch (error) {
    logger.error(`Image convert failed:`, error);
    throw error;
  }
});

export default { convertImage };
