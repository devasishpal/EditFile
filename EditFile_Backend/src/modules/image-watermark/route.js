import express from 'express';
import multer from 'multer';
import { addWatermark } from './controller.js';
import {
  validateFileType,
  validateWatermarkOptions,
  ALLOWED_IMAGE_TYPES,
} from '../../middleware/validation.middleware.js';

const router = express.Router();
const MAX_IMAGE_SIZE_MB = Number.parseInt(
  process.env.MAX_IMAGE_SIZE_MB || process.env.MAX_FILE_SIZE_MB || '50',
  10
);
const MAX_IMAGE_SIZE_BYTES =
  (Number.isFinite(MAX_IMAGE_SIZE_MB) ? MAX_IMAGE_SIZE_MB : 50) * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMAGE_SIZE_BYTES,
  },
});

/**
 * POST /api/image-watermark
 * Add text or image watermark
 */
router.post(
  '/',
  upload.fields([
    { name: 'files'},
    { name: 'watermark'},
    { name: 'watermarkImage'},
  ]),
  validateFileType(ALLOWED_IMAGE_TYPES),
  validateWatermarkOptions,
  addWatermark
);

export default router;
