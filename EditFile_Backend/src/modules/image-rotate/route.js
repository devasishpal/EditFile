import express from 'express';
import multer from 'multer';
import { rotateImage } from './controller.js';
import {
  validateFileType,
  validateRotateAngle,
  ALLOWED_IMAGE_TYPES,
} from '../../middleware/validation.middleware.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
});

/**
 * POST /api/image-rotate
 * Rotate image files by 90, 180 or 270 degrees
 */
router.post(
  '/',
  upload.array('files'),
  validateFileType(ALLOWED_IMAGE_TYPES),
  validateRotateAngle,
  rotateImage
);

export default router;

