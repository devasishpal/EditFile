import { v4 as uuidv4 } from 'uuid';
import { createJob } from '../../services/database.service.js';
import { uploadFile, generateS3Key } from '../../config/s3.js';
import { addJob } from '../../queue/queue.js';
import { logger } from '../../utils/logger.js';
import { asyncHandler } from '../../middleware/error.middleware.js';

const parseCropInt = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return parsed;
};

export const cropImage = asyncHandler(async (req, res) => {
  const startTime = Date.now();

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'No files uploaded',
    });
  }

  const x = parseCropInt(req.body.x);
  const y = parseCropInt(req.body.y);
  const width = parseCropInt(req.body.width);
  const height = parseCropInt(req.body.height);

  if (
    x === null ||
    y === null ||
    width === null ||
    height === null ||
    x < 0 ||
    y < 0 ||
    width < 1 ||
    height < 1
  ) {
    return res.status(400).json({
      success: false,
      error: 'Crop values must include x,y,width,height with valid positive dimensions',
    });
  }

  const files = req.files;
  logger.info(
    `Image crop request: files: ${files.length}, crop: ${width}x${height}+${x}+${y}`
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
      toolType: 'image-crop',
      originalFileUrl: fileUrls[0].url,
      originalSize: totalSize,
      metadata: {
        fileCount: files.length,
        x,
        y,
        width,
        height,
        fileNames: files.map((f) => f.originalname),
        originalName: files[0]?.originalname || 'cropped-image',
      },
      ipAddress: req.ip,
    });

    await addJob('imageCrop', {
      jobId: job.id,
      fileUrls,
      x,
      y,
      width,
      height,
    });

    const duration = Date.now() - startTime;
    logger.info(`Image crop job created: ${job.id} in ${duration}ms`);

    res.status(202).json({
      success: true,
      message: 'Image crop job queued successfully',
      jobId: job.id,
      status: 'pending',
      fileCount: files.length,
      x,
      y,
      width,
      height,
    });
  } catch (error) {
    logger.error('Image crop failed:', error);
    throw error;
  }
});

export default { cropImage };

