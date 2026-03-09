import express from 'express';
import multer from 'multer';
import {
  validateFileType,
  ALLOWED_PDF_TYPES,
  ALLOWED_PDF_EXTENSIONS,
} from '../../middleware/validation.middleware.js';
import { signPdf } from './controller.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024,
  },
});

router.post(
  '/',
  upload.single('file'),
  validateFileType(ALLOWED_PDF_TYPES, ALLOWED_PDF_EXTENSIONS),
  signPdf
);

export default router;
