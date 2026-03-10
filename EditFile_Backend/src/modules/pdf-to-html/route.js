import express from 'express';
import multer from 'multer';
import path from 'path';
import { randomUUID } from 'crypto';
import { pdfToHtml } from './controller.js';
import { STORAGE_DIR } from '../../utils/workspace.js';

const router = express.Router();
const MAX_UPLOAD_SIZE_BYTES = 100 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['application/pdf']);
const ALLOWED_EXTENSIONS = new Set(['.pdf']);

const sanitizeFileName = (fileName = 'upload.pdf') =>
  String(fileName || 'upload.pdf')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 120) || 'upload.pdf';

const isAllowedPdfUpload = (file) => {
  const mimeType = String(file?.mimetype || '').toLowerCase();
  const extension = path.extname(String(file?.originalname || '')).toLowerCase();
  return ALLOWED_MIME_TYPES.has(mimeType) || ALLOWED_EXTENSIONS.has(extension);
};

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, STORAGE_DIR);
    },
    filename: (req, file, cb) => {
      const safeName = sanitizeFileName(file.originalname || 'upload.pdf');
      cb(null, `${Date.now()}-${randomUUID()}-${safeName}`);
    },
  }),
  limits: {
    fileSize: MAX_UPLOAD_SIZE_BYTES,
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    if (isAllowedPdfUpload(file)) {
      cb(null, true);
      return;
    }

    const error = new Error('Only PDF files are allowed.');
    error.status = 400;
    cb(error);
  },
});

router.post('/', upload.single('file'), pdfToHtml);

export default router;
