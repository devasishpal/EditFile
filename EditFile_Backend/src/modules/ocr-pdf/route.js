import express from 'express';
import multer from 'multer';
import { ocrPdf } from './controller.js';
import { validateOcrLanguage } from '../../middleware/validation.middleware.js';
import { validateFileType, ALLOWED_PDF_TYPES } from '../../middleware/validation.middleware.js';

const router = express.Router();
const MAX_UPLOAD_SIZE_MB = Number.parseInt(process.env.MAX_FILE_SIZE_MB || '100', 10);
const MAX_UPLOAD_SIZE_BYTES =
  (Number.isFinite(MAX_UPLOAD_SIZE_MB) ? MAX_UPLOAD_SIZE_MB : 100) * 1024 * 1024;

const validatePdfSignature = (req, res, next) => {
  if (!req.file?.buffer || req.file.buffer.length < 5) {
    return res.status(400).json({
      success: false,
      error: 'Uploaded file is not a valid PDF',
    });
  }

  const signature = req.file.buffer.subarray(0, 5).toString('ascii');
  if (signature !== '%PDF-') {
    return res.status(400).json({
      success: false,
      error: 'Invalid PDF file signature',
    });
  }

  return next();
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_SIZE_BYTES,
  },
});

/**
 * POST /api/ocr-pdf
 * Extract text from scanned PDF using OCR
 */
router.post(
  '/',
  upload.single('file'),
  validateFileType(ALLOWED_PDF_TYPES),
  validatePdfSignature,
  validateOcrLanguage,
  ocrPdf
);

export default router;
