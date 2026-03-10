import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { createJob } from '../../services/database.service.js';
import { uploadFile, generateS3Key } from '../../config/s3.js';
import { addJob } from '../../queue/queue.js';
import { logger } from '../../utils/logger.js';
import { asyncHandler } from '../../middleware/error.middleware.js';

const MAX_UPLOAD_SIZE_BYTES = 20 * 1024 * 1024;
const HTML_EXTENSIONS = new Set(['.html', '.htm']);

const isHtmlFile = (file) => {
  if (!file) {
    return false;
  }

  const mimeType = String(file.mimetype || '').toLowerCase();
  const extension = path.extname(String(file.originalname || '')).toLowerCase();

  if (HTML_EXTENSIONS.has(extension)) {
    return true;
  }

  return mimeType.includes('html');
};

const extractOptions = (body = {}) => ({
  pageSize: body.pageSize,
  orientation: body.orientation,
  margin: body.margin,
  scale: body.scale,
  background: body.background,
  header: body.header,
  footer: body.footer,
});

export const htmlToPdf = asyncHandler(async (req, res) => {
  const startTime = Date.now();
  const requestId = uuidv4();

  const file = req.file;
  const htmlContent = typeof req.body?.htmlContent === 'string' ? req.body.htmlContent : '';
  const options = extractOptions(req.body || {});

  if (!file && !htmlContent.trim()) {
    return res.status(400).json({
      success: false,
      message: 'No HTML file or content provided.',
    });
  }

  let buffer;
  let originalName;
  let contentType;
  let originalSize;

  if (file) {
    if (!isHtmlFile(file)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file type. Please upload an HTML file.',
      });
    }

    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      return res.status(413).json({
        success: false,
        message: 'File is too large. Maximum size is 20MB.',
      });
    }

    buffer = file.buffer;
    originalName = file.originalname || 'document.html';
    contentType =
      file.mimetype && file.mimetype.toLowerCase().includes('html')
        ? file.mimetype
        : 'text/html';
    originalSize = file.size;
  } else {
    const trimmedContent = htmlContent.trim();
    const sizeBytes = Buffer.byteLength(trimmedContent, 'utf8');

    if (sizeBytes > MAX_UPLOAD_SIZE_BYTES) {
      return res.status(413).json({
        success: false,
        message: 'File is too large. Maximum size is 20MB.',
      });
    }

    buffer = Buffer.from(trimmedContent, 'utf8');
    originalName = 'pasted-content.html';
    contentType = 'text/html';
    originalSize = sizeBytes;
  }

  logger.info(`HTML to PDF request: ${requestId}, file: ${originalName}, size: ${originalSize}`);

  const inputKey = generateS3Key(requestId, originalName, 'input');
  const fileUrl = await uploadFile(buffer, inputKey, contentType);

  const job = await createJob({
    toolType: 'html-to-pdf',
    originalFileUrl: fileUrl,
    originalSize,
    metadata: {
      originalName,
    },
    ipAddress: req.ip,
  });

  await addJob('htmlToPdf', {
    jobId: job.id,
    fileUrl,
    originalName,
    options,
  });

  const duration = Date.now() - startTime;
  logger.info(`HTML to PDF job created: ${job.id} in ${duration}ms`);

  return res.status(202).json({
    success: true,
    message: 'HTML to PDF conversion job queued successfully',
    jobId: job.id,
    status: 'pending',
  });
});

export default { htmlToPdf };
