import express from 'express';
import multer from 'multer';
import { compressImage } from './controller.js';
import { validateTargetSizeKB } from '../../middleware/validation.middleware.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
});

const validateImageMimeTypes = (req, res, next) => {
  const files = Array.isArray(req.files) ? req.files : [];

  if (files.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'No file uploaded',
    });
  }

  for (const file of files) {
    const mimeType = String(file?.mimetype || '').toLowerCase();
    if (!mimeType.startsWith('image/')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid file type',
        details: 'Only image files are allowed',
      });
    }
  }

  next();
};

/**
 * POST /api/image-compress
 * Compress image files
 */
router.post(
  '/',
  upload.array('files'),
  validateImageMimeTypes,
  validateTargetSizeKB,
  compressImage
);

export default router;
