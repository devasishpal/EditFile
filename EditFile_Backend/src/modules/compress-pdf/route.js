import express from 'express';
import multer from 'multer';
import { compressPdf } from './controller.js';
import { validateCompressionLevel, validateTargetSizeKB } from '../../middleware/validation.middleware.js';
import { validateFileType, ALLOWED_PDF_TYPES } from '../../middleware/validation.middleware.js';

const router = express.Router();
const MAX_UPLOAD_SIZE_MB = Number.parseInt(process.env.MAX_FILE_SIZE_MB || '100', 10);
const MAX_UPLOAD_SIZE_BYTES =
  (Number.isFinite(MAX_UPLOAD_SIZE_MB) ? MAX_UPLOAD_SIZE_MB : 100) * 1024 * 1024;

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_SIZE_BYTES,
  },
});

/**
 * POST /api/compress-pdf
 * Upload and compress a PDF file
 * 
 * Request:
 * - file: PDF file (multipart/form-data)
 * - compressionLevel: number (1-100, optional, default: 80)
 * - targetSizeKB: number (optional)
 * 
 * Response:
 * - jobId: UUID
 * - status: string
 * - message: string
 */
router.post(
  '/',
  upload.single('file'),
  validateFileType(ALLOWED_PDF_TYPES),
  validateCompressionLevel,
  validateTargetSizeKB,
  compressPdf
);

export default router;
