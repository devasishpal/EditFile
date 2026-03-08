import express from 'express';
import multer from 'multer';
import { protectPdf } from './controller.js';
import { validatePdfPassword } from '../../middleware/validation.middleware.js';
import { validateFileType, ALLOWED_PDF_TYPES } from '../../middleware/validation.middleware.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024,
  },
});

/**
 * POST /api/protect-pdf
 * Add password protection to PDF
 */
router.post(
  '/',
  upload.single('file'),
  validateFileType(ALLOWED_PDF_TYPES),
  validatePdfPassword,
  protectPdf
);

export default router;
