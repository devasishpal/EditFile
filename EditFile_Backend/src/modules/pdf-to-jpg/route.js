import express from 'express';
import multer from 'multer';
import { pdfToJpg } from './controller.js';
import { validateFileType, ALLOWED_PDF_TYPES } from '../../middleware/validation.middleware.js';

const router = express.Router();
const MAX_UPLOAD_SIZE_MB = Number.parseInt(process.env.MAX_FILE_SIZE_MB || '100', 10);
const MAX_UPLOAD_SIZE_BYTES =
  (Number.isFinite(MAX_UPLOAD_SIZE_MB) ? MAX_UPLOAD_SIZE_MB : 100) * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_SIZE_BYTES,
  },
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
