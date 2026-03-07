import express from 'express';
import multer from 'multer';
import { pdfToJpg } from './controller.js';
import { validateFileType, ALLOWED_PDF_TYPES } from '../../middleware/validation.middleware.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
});

/**
 * POST /api/pdf-to-jpg
 * Convert PDF pages to JPG images
 */
router.post(
  '/',
  upload.single('file'),
  validateFileType(ALLOWED_PDF_TYPES),
  pdfToJpg
);

export default router;
