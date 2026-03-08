import express from 'express';
import multer from 'multer';
import { excelToPdf } from './controller.js';
import {
  validateFileType,
  ALLOWED_EXCEL_TYPES,
  ALLOWED_EXCEL_EXTENSIONS,
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
 * POST /api/excel-to-pdf
 * Convert Excel spreadsheet to PDF
 */
router.post(
  '/',
  upload.single('file'),
  validateFileType(ALLOWED_EXCEL_TYPES, ALLOWED_EXCEL_EXTENSIONS),
  excelToPdf
);

export default router;
