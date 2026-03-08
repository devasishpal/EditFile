import express from 'express';
import multer from 'multer';
import { wordToPdf } from './controller.js';
import {
  validateFileType,
  ALLOWED_DOC_TYPES,
  ALLOWED_DOC_EXTENSIONS,
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
 * POST /api/word-to-pdf
 * Convert Word document to PDF
 */
router.post(
  '/',
  upload.single('file'),
  validateFileType(ALLOWED_DOC_TYPES, ALLOWED_DOC_EXTENSIONS),
  wordToPdf
);

export default router;
