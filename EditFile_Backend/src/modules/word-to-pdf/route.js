import express from 'express';
import multer from 'multer';
import { wordToPdf } from './controller.js';
import { validateFileType, ALLOWED_DOC_TYPES } from '../../middleware/validation.middleware.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
});

/**
 * POST /api/word-to-pdf
 * Convert Word document to PDF
 */
router.post(
  '/',
  upload.single('file'),
  validateFileType(ALLOWED_DOC_TYPES),
  wordToPdf
);

export default router;
