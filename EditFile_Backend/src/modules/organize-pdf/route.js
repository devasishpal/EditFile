import express from 'express';
import multer from 'multer';
import { inspectPdf, organizePdf } from './controller.js';
import { validateFileType, ALLOWED_PDF_TYPES } from '../../middleware/validation.middleware.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024,
  },
});

/**
 * POST /api/organize-pdf/inspect
 * Return PDF page metadata for organize UI.
 */
router.post(
  '/inspect',
  upload.single('file'),
  validateFileType(ALLOWED_PDF_TYPES),
  inspectPdf
);

/**
 * POST /api/organize-pdf
 * Apply page order/deletion/rotation and export organized PDF.
 */
router.post(
  '/',
  upload.single('file'),
  validateFileType(ALLOWED_PDF_TYPES),
  organizePdf
);

export default router;
