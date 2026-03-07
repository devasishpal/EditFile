import express from 'express';
import multer from 'multer';
import { resizeImage } from './controller.js';
import { validateImageDimensions } from '../../middleware/validation.middleware.js';
import { validateFileType, ALLOWED_IMAGE_TYPES } from '../../middleware/validation.middleware.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
});

/**
 * POST /api/image-resize
 * Resize image files
 */
router.post(
  '/',
  upload.array('files'),
  validateFileType(ALLOWED_IMAGE_TYPES),
  validateImageDimensions,
  resizeImage
);

export default router;
