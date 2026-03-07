import express from 'express';
import multer from 'multer';
import { addWatermark } from './controller.js';
import {
  validateFileType,
  validateWatermarkOptions,
  ALLOWED_IMAGE_TYPES,
} from '../../middleware/validation.middleware.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
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

