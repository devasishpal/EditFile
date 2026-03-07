import express from 'express';
import multer from 'multer';
import { splitPdf } from './controller.js';
import { validatePageRange } from '../../middleware/validation.middleware.js';
import { validateFileType, ALLOWED_PDF_TYPES } from '../../middleware/validation.middleware.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
});

/**
 * POST /api/split-pdf
 * Split PDF by page range
 */
router.post(
  '/',
  upload.single('file'),
  validateFileType(ALLOWED_PDF_TYPES),
  validatePageRange,
  splitPdf
);

export default router;
