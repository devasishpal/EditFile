import { v4 as uuidv4 } from 'uuid';
import { createJob } from '../../services/database.service.js';
import { uploadFile, generateS3Key } from '../../config/s3.js';
import { addJob } from '../../queue/queue.js';
import { logger } from '../../utils/logger.js';
import { asyncHandler } from '../../middleware/error.middleware.js';

const clampNumber = (value, min, max, fallback) => {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
};

const clampInteger = (value, min, max, fallback) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
};

const getImageFilesFromFields = (files) => {
  if (!files) {
    return [];
  }
  if (Array.isArray(files)) {
    return files;
  }
  return Array.isArray(files.files) ? files.files : [];
};

const getWatermarkFileFromFields = (files) => {
  if (!files || Array.isArray(files)) {
    return null;
  }

  if (Array.isArray(files.watermark) && files.watermark[0]) {
    return files.watermark[0];
  }

  if (Array.isArray(files.watermarkImage) && files.watermarkImage[0]) {
    return files.watermarkImage[0];
  }

  return null;
};

export const addWatermark = asyncHandler(async (req, res) => {
  const startTime = Date.now();
  const imageFiles = getImageFilesFromFields(req.files);

  if (imageFiles.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'No files uploaded',
    });
  }

  const watermarkFile = getWatermarkFileFromFields(req.files);
  const requestedType = String(req.body.type || req.body.watermarkType || '')
    .trim()
    .toLowerCase();
  const type = requestedType === 'text' || requestedType === 'image'
    ? requestedType
    : watermarkFile
      ? 'image'
      : 'text';

  const text = String(req.body.text || req.body.watermarkText || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (type === 'text' && !text) {
    return res.status(400).json({
      success: false,
      error: 'Watermark text is required when type is text',
    });
  }

  if (type === 'image' && !watermarkFile) {
    return res.status(400).json({
      success: false,
      error: 'Watermark image file is required when type is image',
    });
  }

  const watermarkOptions = {
    type,
    text,
    position: String(req.body.position || 'bottom-right')
      .trim()
      .toLowerCase(),
    opacity: clampNumber(req.body.opacity, 0.05, 1, 0.35),
    color: String(req.body.color || '#ffffff').trim(),
    fontSize: clampInteger(req.body.fontSize, 8, 400, 36),
    offsetX: clampInteger(req.body.offsetX, -5000, 5000, 20),
    offsetY: clampInteger(req.body.offsetY, -5000, 5000, 20),
    scale: clampInteger(req.body.scale, 1, 100, 25),
  };

  logger.info(
    `Image watermark request: files: ${imageFiles.length}, type: ${watermarkOptions.type}, position: ${watermarkOptions.position}`
  );

  try {
    const fileUrls = [];
    let totalSize = 0;

    for (const file of imageFiles) {
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

    if (watermarkFile) {
      const watermarkKey = generateS3Key(uuidv4(), watermarkFile.originalname, 'input');
      const watermarkUrl = await uploadFile(
        watermarkFile.buffer,
        watermarkKey,
        watermarkFile.mimetype
      );
      watermarkOptions.fileUrl = watermarkUrl;
      watermarkOptions.fileName = watermarkFile.originalname;
      watermarkOptions.fileMimeType = watermarkFile.mimetype;
    }

    const job = await createJob({
      toolType: 'image-watermark',
      originalFileUrl: fileUrls[0].url,
      originalSize: totalSize,
      metadata: {
        fileCount: imageFiles.length,
        watermarkOptions,
        fileNames: imageFiles.map((f) => f.originalname),
        originalName: imageFiles[0]?.originalname || 'watermarked-image',
      },
      ipAddress: req.ip,
    });

    await addJob('imageWatermark', {
      jobId: job.id,
      fileUrls,
      watermark: watermarkOptions,
    });

    const duration = Date.now() - startTime;
    logger.info(`Image watermark job created: ${job.id} in ${duration}ms`);

    res.status(202).json({
      success: true,
      message: 'Image watermark job queued successfully',
      jobId: job.id,
      status: 'pending',
      fileCount: imageFiles.length,
      watermarkType: watermarkOptions.type,
      position: watermarkOptions.position,
    });
  } catch (error) {
    logger.error('Image watermark failed:', error);
    throw error;
  }
});

export default { addWatermark };

