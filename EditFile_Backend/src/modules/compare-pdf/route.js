import express from 'express';
import multer from 'multer';
import { comparePdf } from './controller.js';
import {
  validateFileType,
  ALLOWED_PDF_TYPES,
  ALLOWED_PDF_EXTENSIONS,
} from '../../middleware/validation.middleware.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024,
  },
});

router.post(
  '/',
  upload.fields([
    { name: 'originalFile', maxCount: 1 },
    { name: 'modifiedFile', maxCount: 1 },
  ]),
  validateFileType(ALLOWED_PDF_TYPES, ALLOWED_PDF_EXTENSIONS),
  comparePdf
);

export default router;
