import { PDFDocument } from 'pdf-lib';
import { v4 as uuidv4 } from 'uuid';
import { createJob } from '../../services/database.service.js';
import { uploadFile, generateS3Key } from '../../config/s3.js';
import { addJob } from '../../queue/queue.js';
import { logger } from '../../utils/logger.js';
import { asyncHandler } from '../../middleware/error.middleware.js';

const ALLOWED_ROTATIONS = new Set([0, 90, 180, 270]);

const createValidationError = (message) => {
  const error = new Error(message);
  error.status = 400;
  return error;
};

const parseOrganizePlan = (value) => {
  if (value === undefined || value === null || value === '') {
    throw createValidationError('pages payload is required.');
  }

  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw createValidationError('pages must be valid JSON.');
    }
  }

  if (!Array.isArray(parsed)) {
    throw createValidationError('pages must be an array.');
  }

  if (parsed.length === 0) {
    throw createValidationError('At least one page must remain in the output.');
  }

  const normalized = parsed.map((item, index) => {
    const sourceIndex = Number.parseInt(String(item?.sourceIndex), 10);
    const rotation = Number.parseInt(String(item?.rotation ?? 0), 10);

    if (!Number.isInteger(sourceIndex) || sourceIndex < 0) {
      throw createValidationError(`pages[${index}].sourceIndex must be a non-negative integer.`);
    }

    if (!ALLOWED_ROTATIONS.has(rotation)) {
      throw createValidationError(
        `pages[${index}].rotation must be one of: 0, 90, 180, 270.`
      );
    }

    return {
      sourceIndex,
      rotation,
    };
  });

  return normalized;
};

const loadPdfPageCount = async (buffer) => {
  try {
    const pdfDoc = await PDFDocument.load(buffer, {
      ignoreEncryption: false,
      updateMetadata: false,
    });
    return pdfDoc.getPageCount();
  } catch (error) {
    throw createValidationError(
      `Unable to open PDF. The file may be invalid or password protected. ${error.message || ''}`.trim()
    );
  }
};

export const inspectPdf = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'No file uploaded',
    });
  }

  const pageCount = await loadPdfPageCount(req.file.buffer);
  if (pageCount < 1) {
    throw createValidationError('PDF has no pages to organize.');
  }

  return res.json({
    success: true,
    pageCount,
  });
});

export const organizePdf = asyncHandler(async (req, res) => {
  const startTime = Date.now();

  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'No file uploaded',
    });
  }

  const plan = parseOrganizePlan(req.body?.pages);
  const pageCount = await loadPdfPageCount(req.file.buffer);

  plan.forEach((entry, index) => {
    if (entry.sourceIndex >= pageCount) {
      throw createValidationError(
        `pages[${index}].sourceIndex (${entry.sourceIndex}) exceeds document page range.`
      );
    }
  });

  const file = req.file;
  const requestId = uuidv4();

  logger.info(`Organize PDF request: ${requestId}`);

  try {
    const s3Key = generateS3Key(requestId, file.originalname, 'input');
    const fileUrl = await uploadFile(file.buffer, s3Key, file.mimetype);

    const job = await createJob({
      toolType: 'organize-pdf',
      originalFileUrl: fileUrl,
      originalSize: file.size,
      metadata: {
        originalName: file.originalname,
        pageCount,
        outputPageCount: plan.length,
      },
      ipAddress: req.ip,
    });

    await addJob('organizePdf', {
      jobId: job.id,
      fileUrl,
      originalName: file.originalname,
      pages: plan,
    });

    const duration = Date.now() - startTime;
    logger.info(`Organize PDF job created: ${job.id} in ${duration}ms`);

    return res.status(202).json({
      success: true,
      message: 'Organize PDF job queued successfully',
      jobId: job.id,
      status: 'pending',
    });
  } catch (error) {
    logger.error(`Organize PDF failed for request ${requestId}:`, error);
    throw error;
  }
});

export default { inspectPdf, organizePdf };
