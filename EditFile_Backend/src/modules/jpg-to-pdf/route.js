import express from 'express';
import multer from 'multer';
import { jpgToPdf } from './controller.js';
import { validateFileType, ALLOWED_IMAGE_TYPES } from '../../middleware/validation.middleware.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
});

/**
 * POST /api/jpg-to-pdf
 * Convert JPG images to PDF
 */
router.post(
  '/',
  upload.array('files'),
  validateFileType(ALLOWED_IMAGE_TYPES),
  jpgToPdf
);

export default router;
