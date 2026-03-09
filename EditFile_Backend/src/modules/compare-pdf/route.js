import express from 'express';
import multer from 'multer';
import { comparePdf } from './controller.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024,
  },
});

router.post(
  '/',
  upload.fields([
    { name: 'originalFile', maxCount: 1 },
    { name: 'modifiedFile', maxCount: 1 },
  ]),
  comparePdf
);

export default router;
