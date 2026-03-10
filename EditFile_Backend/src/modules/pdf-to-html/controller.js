import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { createJob } from '../../services/database.service.js';
import { uploadFileFromPath, generateS3Key } from '../../config/s3.js';
import { addJob } from '../../queue/queue.js';
import { logger } from '../../utils/logger.js';
import { asyncHandler } from '../../middleware/error.middleware.js';

export const pdfToHtml = asyncHandler(async (req, res) => {
  const startedAt = Date.now();
  const requestId = uuidv4();
  const uploadedFilePath = req.file?.path;

  if (!req.file || !uploadedFilePath) {
    return res.status(400).json({
      success: false,
      error: 'No file uploaded',
    });
  }

  logger.info(
    `PDF to HTML request: ${requestId}, file: ${req.file.originalname}, size: ${req.file.size}`
  );

  try {
    const s3Key = generateS3Key(requestId, req.file.originalname, 'input');
    const fileUrl = await uploadFileFromPath(
      uploadedFilePath,
      s3Key,
      req.file.mimetype
    );

    const job = await createJob({
      toolType: 'pdf-to-html',
      originalFileUrl: fileUrl,
      originalSize: req.file.size,
      metadata: {
        originalName: req.file.originalname,
      },
      ipAddress: req.ip,
    });

    await addJob('pdfToHtml', {
      jobId: job.id,
      fileUrl,
      originalName: req.file.originalname,
    });

    const duration = Date.now() - startedAt;
    logger.info(`PDF to HTML job created: ${job.id} in ${duration}ms`);

    return res.status(202).json({
      success: true,
      message: 'PDF to HTML conversion job queued successfully',
      jobId: job.id,
      status: 'pending',
    });
  } catch (error) {
    logger.error(`PDF to HTML failed for request ${requestId}:`, error);
    throw error;
  } finally {
    await fs.unlink(uploadedFilePath).catch(() => undefined);
  }
});

export default { pdfToHtml };
