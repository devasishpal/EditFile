import express from 'express';
import multer from 'multer';
import { cropImage } from './controller.js';
import {
  validateFileType,
  validateCropDimensions,
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
 * POST /api/image-crop
 * Crop images using x, y, width and height
 */
router.post(
  '/',
  upload.array('files'),
  validateFileType(ALLOWED_IMAGE_TYPES),
  validateCropDimensions,
  cropImage
);

export default router;
