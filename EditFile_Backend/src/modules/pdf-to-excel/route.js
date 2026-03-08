import express from 'express';
import multer from 'multer';
import { pdfToExcel } from './controller.js';
import {
  validateFileType,
  ALLOWED_PDF_TYPES,
  ALLOWED_PDF_EXTENSIONS,
} from '../../middleware/validation.middleware.js';

const router = express.Router();
const MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_SIZE_BYTES,
  },
});

/**
 * POST /api/pdf-to-excel
 * Convert PDF document to Excel
 */
router.post(
  '/',
  upload.single('file'),
  validateFileType(ALLOWED_PDF_TYPES, ALLOWED_PDF_EXTENSIONS),
  pdfToExcel
);

export default router;
