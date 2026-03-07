import express from 'express';
import multer from 'multer';
import { cropImage } from './controller.js';
import {
  validateFileType,
  validateCropDimensions,
  ALLOWED_IMAGE_TYPES,
} from '../../middleware/validation.middleware.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
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

