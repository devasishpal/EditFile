import express from 'express';
import multer from 'multer';
import { htmlToPdf } from './controller.js';

const router = express.Router();
const MAX_UPLOAD_SIZE_BYTES = 20 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_SIZE_BYTES,
    files: 1,
  },
});

const uploadMiddleware = (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (!err) {
      return next();
    }

    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        message: 'File is too large. Maximum size is 20MB.',
      });
    }

    return res.status(400).json({
      success: false,
      message: err.message || 'Upload failed.',
    });
  });
};

/**
 * POST /api/html-to-pdf
 * Convert HTML file or HTML content to PDF
 */
router.post('/', uploadMiddleware, htmlToPdf);

export default router;
