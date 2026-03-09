import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { createJob } from '../../services/database.service.js';
import { uploadFileFromPath, generateS3Key } from '../../config/s3.js';
import { addJob } from '../../queue/queue.js';
import { logger } from '../../utils/logger.js';
import { asyncHandler } from '../../middleware/error.middleware.js';

const PDFA_VERSION_MAP = {
  '1': 'pdfa-1',
  '2': 'pdfa-2',
  '3': 'pdfa-3',
  'pdfa-1': 'pdfa-1',
  'pdfa-2': 'pdfa-2',
  'pdfa-3': 'pdfa-3',
};

const PDF_SIGNATURE = '%PDF-';

const normalizePdfaVersion = (value) => {
  const normalized = String(value || 'pdfa-2').trim().toLowerCase();
  return PDFA_VERSION_MAP[normalized] || null;
};

const hasPdfSignature = async (filePath) => {
  const handle = await fs.open(filePath, 'r');

  try {
    const header = Buffer.alloc(PDF_SIGNATURE.length);
    await handle.read(header, 0, header.length, 0);
    return header.toString('utf8') === PDF_SIGNATURE;
  } finally {
    await handle.close();
  }
};

export const pdfToPdfa = asyncHandler(async (req, res) => {
  const startedAt = Date.now();
  const requestId = uuidv4();
  const uploadedFilePath = req.file?.path;

  if (!req.file || !uploadedFilePath) {
    return res.status(400).json({
      success: false,
      error: 'No file uploaded',
    });
  }

  const pdfaVersion = normalizePdfaVersion(req.body.pdfaVersion);
  if (!pdfaVersion) {
    await fs.unlink(uploadedFilePath).catch(() => undefined);
    return res.status(400).json({
      success: false,
      error: 'Invalid PDF/A version. Use PDF/A-1, PDF/A-2, or PDF/A-3.',
    });
  }

  const isPdf = await hasPdfSignature(uploadedFilePath).catch(() => false);
  if (!isPdf) {
    await fs.unlink(uploadedFilePath).catch(() => undefined);
    return res.status(400).json({
      success: false,
      error: 'Uploaded file is not a valid PDF document.',
    });
  }

  logger.info(
    `PDF to PDF/A request: ${requestId}, file: ${req.file.originalname}, size: ${req.file.size}, version: ${pdfaVersion}`
  );

  try {
    const s3Key = generateS3Key(requestId, req.file.originalname, 'input');
    const fileUrl = await uploadFileFromPath(uploadedFilePath, s3Key, req.file.mimetype);

    const job = await createJob({
      toolType: 'pdf-to-pdfa',
      originalFileUrl: fileUrl,
      originalSize: req.file.size,
      metadata: {
        originalName: req.file.originalname,
        pdfaVersion,
      },
      ipAddress: req.ip,
    });

    await addJob('pdfToPdfA', {
      jobId: job.id,
      fileUrl,
      originalName: req.file.originalname,
      pdfaVersion,
    });

    const duration = Date.now() - startedAt;
    logger.info(`PDF to PDF/A job created: ${job.id} in ${duration}ms`);

    return res.status(202).json({
      success: true,
      message: 'PDF to PDF/A conversion job queued successfully',
      jobId: job.id,
      status: 'pending',
      pdfaVersion,
    });
  } catch (error) {
    logger.error(`PDF to PDF/A failed for request ${requestId}:`, error);
    throw error;
  } finally {
    await fs.unlink(uploadedFilePath).catch(() => undefined);
  }
});

export default { pdfToPdfa };
