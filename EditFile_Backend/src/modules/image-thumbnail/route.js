import express from 'express';
import multer from 'multer';
import { generateThumbnail } from './controller.js';
import {
  validateFileType,
  validateThumbnailDimensions,
  ALLOWED_IMAGE_TYPES,
} from '../../middleware/validation.middleware.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
});

/**
 * POST /api/image-thumbnail
 * Generate image thumbnails
 */
router.post(
  '/',
  upload.array('files'),
  validateFileType(ALLOWED_IMAGE_TYPES),
  validateThumbnailDimensions,
  generateThumbnail
);

export default router;

