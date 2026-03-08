import { v4 as uuidv4 } from 'uuid';
import { createJob } from '../../services/database.service.js';
import { uploadFile, generateS3Key } from '../../config/s3.js';
import { addJob } from '../../queue/queue.js';
import { logger } from '../../utils/logger.js';
import { asyncHandler } from '../../middleware/error.middleware.js';

export const pdfToWord = asyncHandler(async (req, res) => {
  const startTime = Date.now();
  const allowedFormats = new Set(['docx', 'doc', 'rtf']);
  
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'No file uploaded',
    });
  }

  const outputFormat = String(req.body.format || 'docx').toLowerCase();
  if (!allowedFormats.has(outputFormat)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid output format. Use docx, doc, or rtf.',
    });
  }
  const file = req.file;
  const jobId = uuidv4();
  
  logger.info(`PDF to Word request: ${jobId}`);

  try {
    const s3Key = generateS3Key(jobId, file.originalname, 'input');
    const fileUrl = await uploadFile(file.buffer, s3Key, file.mimetype);

    const job = await createJob({
      toolType: 'pdf-to-word',
      originalFileUrl: fileUrl,
      originalSize: file.size,
      metadata: {
        outputFormat,
        originalName: file.originalname,
      },
      ipAddress: req.ip,
    });

    await addJob('pdfToWord', {
      jobId: job.id,
      fileUrl,
      outputFormat,
      originalName: file.originalname,
    });

    const duration = Date.now() - startTime;
    logger.info(`PDF to Word job created: ${job.id} in ${duration}ms`);

    res.status(202).json({
      success: true,
      message: 'PDF to Word conversion job queued successfully',
      jobId: job.id,
      status: 'pending',
      outputFormat,
    });

  } catch (error) {
    logger.error(`PDF to Word failed for job ${jobId}:`, error);
    throw error;
  }
});

export default { pdfToWord };
