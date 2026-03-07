import express from 'express';
import multer from 'multer';
import { ocrPdf } from './controller.js';
import { validateOcrLanguage } from '../../middleware/validation.middleware.js';
import { validateFileType, ALLOWED_PDF_TYPES } from '../../middleware/validation.middleware.js';

const router = express.Router();

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
