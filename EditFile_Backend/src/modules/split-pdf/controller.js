import { v4 as uuidv4 } from 'uuid';
import { createJob } from '../../services/database.service.js';
import { uploadFile, generateS3Key } from '../../config/s3.js';
import { addJob } from '../../queue/queue.js';
import { logger } from '../../utils/logger.js';
import { asyncHandler } from '../../middleware/error.middleware.js';

const isPdfBuffer = (buffer) => {
  if (!buffer || buffer.length < 5) {
    return false;
  }
  return buffer.subarray(0, 5).toString('utf8') === '%PDF-';
};

const normalizeSplitMethod = (value) => {
  const method = String(value || 'range').trim().toLowerCase();
  if (method === 'range' || method === 'every' || method === 'extract') {
    return method;
  }
  return 'range';
};

export const splitPdf = asyncHandler(async (req, res) => {
  const startTime = Date.now();
  
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'No file uploaded',
    });
  }

  if (!isPdfBuffer(req.file.buffer)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid PDF file',
    });
  }

  const splitMethod = normalizeSplitMethod(req.body?.splitMethod);
  const pageRange = typeof req.body?.pageRange === 'string' ? req.body.pageRange.trim() : '';
  const file = req.file;
  const jobId = uuidv4();
  
  logger.info(
    `Split PDF request: ${jobId}, method: ${splitMethod}, range: ${pageRange || 'n/a'}`
  );

  try {
    const s3Key = generateS3Key(jobId, file.originalname, 'input');
    const fileUrl = await uploadFile(file.buffer, s3Key, file.mimetype);

    const job = await createJob({
      toolType: 'split-pdf',
      originalFileUrl: fileUrl,
      originalSize: file.size,
      metadata: {
        splitMethod,
        pageRange,
        originalName: file.originalname,
      },
      ipAddress: req.ip,
    });

    await addJob('splitPdf', {
      jobId: job.id,
      fileUrl,
      splitMethod,
      pageRange,
      originalName: file.originalname,
    });

    const duration = Date.now() - startTime;
    logger.info(`Split PDF job created: ${job.id} in ${duration}ms`);

    res.status(202).json({
      success: true,
      message: 'PDF split job queued successfully',
      jobId: job.id,
      status: 'pending',
      splitMethod,
      pageRange,
    });

  } catch (error) {
    logger.error(`Split PDF failed for job ${jobId}:`, error);
    throw error;
  }
});

export default { splitPdf };
