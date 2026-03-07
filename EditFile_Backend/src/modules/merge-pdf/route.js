import express from 'express';
import multer from 'multer';
import { mergePdf } from './controller.js';
import { validateFileType, ALLOWED_PDF_TYPES } from '../../middleware/validation.middleware.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
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
