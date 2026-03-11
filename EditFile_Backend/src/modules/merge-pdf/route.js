import express from 'express';
import multer from 'multer';
import { mergePdf } from './controller.js';
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
 * POST /api/merge-pdf
 * Merge multiple PDF files
 */
router.post(
  '/',
  upload.array('files'),
  validateFileType(ALLOWED_PDF_TYPES),
  mergePdf
);

export default router;
