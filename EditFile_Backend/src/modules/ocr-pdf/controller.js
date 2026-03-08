import { randomUUID } from 'crypto';
import { createJob } from '../../services/database.service.js';
import { uploadFile, generateS3Key, deleteFile } from '../../config/s3.js';
import { addJob } from '../../queue/queue.js';
import { logger } from '../../utils/logger.js';
import { asyncHandler } from '../../middleware/error.middleware.js';

const ALLOWED_OUTPUT_FORMATS = new Set(['text', 'searchable-pdf', 'word']);
const ALLOWED_LANGUAGE_PATTERN = /^[A-Za-z0-9_]{2,20}$/;

const getOutputExtension = (outputFormat) => {
  switch (outputFormat) {
    case 'searchable-pdf':
      return 'pdf';
    case 'word':
      return 'docx';
    case 'text':
    default:
      return 'txt';
  }
};

const getSafeOutputFileName = (originalName, outputFormat) => {
  const extension = getOutputExtension(outputFormat);
  const baseName = String(originalName || 'document')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\.[^.]+$/, '')
    .trim() || 'document';
  return `${baseName}.${extension}`;
};

export const ocrPdf = asyncHandler(async (req, res) => {
  const startTime = Date.now();
  
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'No file uploaded',
    });
  }

  const language = String(req.body.language || 'eng').trim();
  const outputFormat = String(req.body.outputFormat || 'text').trim().toLowerCase();

  if (!ALLOWED_LANGUAGE_PATTERN.test(language)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid OCR language code',
    });
  }

  if (!ALLOWED_OUTPUT_FORMATS.has(outputFormat)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid output format. Use text, searchable-pdf, or word.',
    });
  }
  
  const file = req.file;
  const outputFileName = getSafeOutputFileName(file.originalname, outputFormat);
  const requestId = randomUUID();
  let fileUrl = null;
  
  logger.info(
    `OCR PDF request ${requestId}: file=${file.originalname}, language=${language}, format=${outputFormat}`
  );

  try {
    const s3Key = generateS3Key(requestId, file.originalname, 'input');
    fileUrl = await uploadFile(file.buffer, s3Key, file.mimetype);

    const job = await createJob({
      toolType: 'ocr-pdf',
      originalFileUrl: fileUrl,
      originalSize: file.size,
      metadata: {
        language,
        outputFormat,
        originalName: file.originalname,
        outputFileName,
      },
      ipAddress: req.ip,
    });

    await addJob('ocrPdf', {
      jobId: job.id,
      fileUrl,
      language,
      outputFormat,
      originalName: file.originalname,
      outputFileName,
    });

    const duration = Date.now() - startTime;
    logger.info(`OCR PDF job created: ${job.id} in ${duration}ms`);

    res.status(202).json({
      success: true,
      message: 'OCR job queued successfully',
      jobId: job.id,
      status: 'pending',
      language,
      outputFormat,
      outputFileName,
    });

  } catch (error) {
    logger.error(`OCR PDF queueing failed:`, error);

    if (fileUrl) {
      await deleteFile(fileUrl);
    }

    throw error;
  }
});

export default { ocrPdf };
