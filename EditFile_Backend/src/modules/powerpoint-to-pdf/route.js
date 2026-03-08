import express from 'express';
import multer from 'multer';
import { powerpointToPdf } from './controller.js';
import {
  validateFileType,
  ALLOWED_POWERPOINT_TYPES,
  ALLOWED_POWERPOINT_EXTENSIONS,
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
 * POST /api/powerpoint-to-pdf
 * Convert PowerPoint presentation to PDF
 */
router.post(
  '/',
  upload.single('file'),
  validateFileType(ALLOWED_POWERPOINT_TYPES, ALLOWED_POWERPOINT_EXTENSIONS),
  powerpointToPdf
);

export default router;
