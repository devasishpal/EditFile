import express from 'express';
import multer from 'multer';
import { pdfToWord } from './controller.js';
import { validateFileType, ALLOWED_PDF_TYPES } from '../../middleware/validation.middleware.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
});

/**
 * POST /api/pdf-to-word
 * Convert PDF to Word document
 */
router.post(
  '/',
  upload.single('file'),
  validateFileType(ALLOWED_PDF_TYPES),
  pdfToWord
);

export default router;
