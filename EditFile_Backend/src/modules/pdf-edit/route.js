import path from 'path';
import express from 'express';
import multer from 'multer';
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import { asyncHandler } from '../../middleware/error.middleware.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024,
  },
});

const PAGE_NUMBER_POSITIONS = new Set(['bottom-center', 'bottom-right', 'top-right']);
const WATERMARK_TYPES = new Set(['text', 'image']);

const createHttpError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const isPdfBuffer = (buffer) =>
  Boolean(buffer) && buffer.length >= 5 && buffer.subarray(0, 5).toString('utf8') === '%PDF-';

const isPdfFile = (file) =>
  Boolean(file) &&
  (file.mimetype === 'application/pdf' || String(file.originalname || '').toLowerCase().endsWith('.pdf'));

const sanitizeBaseName = (value, fallback = 'document') => {
  const raw = String(value || fallback).trim();
  const withoutExtension = raw.replace(/\.[^/.]+$/, '');
  const sanitized = withoutExtension
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '-')
    .replace(/_+/g, '_')
    .replace(/-+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 80);

  return sanitized || fallback;
};

const parseRotation = (value) => {
  const rotation = Number.parseInt(String(value ?? ''), 10);
  if (![90, 180, 270].includes(rotation)) {
    throw createHttpError(400, 'rotation must be one of: 90, 180, 270');
  }
  return rotation;
};

const splitPageTokens = (value) =>
  String(value || '')
    .split(/[\n\r,;]+/)
    .map((token) => token.trim())
    .filter(Boolean);

const parseTokenToPages = (token, totalPages) => {
  const compact = String(token || '').replace(/\s+/g, '');
  if (!compact) {
    throw createHttpError(400, 'Invalid empty page token');
  }

  if (compact.includes('-')) {
    const [rawStart, rawEnd, ...rest] = compact.split('-');
    if (rest.length > 0 || !rawStart || !rawEnd) {
      throw createHttpError(400, `Invalid page range token "${token}"`);
    }

    const start = Number.parseInt(rawStart, 10);
    const end = Number.parseInt(rawEnd, 10);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < 1) {
      throw createHttpError(400, `Invalid page range token "${token}"`);
    }

    const normalizedStart = Math.min(start, end);
    const normalizedEnd = Math.max(start, end);
    if (normalizedEnd > totalPages) {
      throw createHttpError(400, `Page range "${token}" exceeds total pages (${totalPages})`);
    }

    const pages = [];
    for (let page = normalizedStart; page <= normalizedEnd; page += 1) {
      pages.push(page);
    }
    return pages;
  }

  const page = Number.parseInt(compact, 10);
  if (!Number.isInteger(page) || page < 1 || page > totalPages) {
    throw createHttpError(400, `Invalid page "${token}" for document with ${totalPages} pages`);
  }
  return [page];
};

const parseSelectedPages = (value, totalPages, { allowEmpty = false } = {}) => {
  const tokens = splitPageTokens(value);

  if (tokens.length === 0) {
    if (!allowEmpty) {
      throw createHttpError(400, 'pages is required');
    }

    return new Set(Array.from({ length: totalPages }, (_, index) => index + 1));
  }

  const selected = new Set();
  tokens.forEach((token) => {
    parseTokenToPages(token, totalPages).forEach((pageNumber) => {
      selected.add(pageNumber);
    });
  });

  if (selected.size === 0) {
    throw createHttpError(400, 'No valid pages selected');
  }

  return selected;
};

const normalizePageNumberPosition = (value) => {
  const position = String(value || 'bottom-center').trim().toLowerCase();
  if (!PAGE_NUMBER_POSITIONS.has(position)) {
    throw createHttpError(400, 'position must be one of: bottom-center, bottom-right, top-right');
  }
  return position;
};

const parsePositiveInteger = (value, fieldName, fallback) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw createHttpError(400, `${fieldName} must be a positive integer`);
  }

  return parsed;
};

const parseOpacity = (value, fallback = 0.25) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number.parseFloat(String(value));
  if (!Number.isFinite(parsed)) {
    throw createHttpError(400, 'opacity must be a number');
  }

  const normalized = parsed > 1 ? parsed / 100 : parsed;
  if (normalized <= 0 || normalized > 1) {
    throw createHttpError(400, 'opacity must be between 0.01 and 1 or between 1 and 100');
  }

  return normalized;
};

const parseScale = (value, fallback = 1) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number.parseFloat(String(value));
  if (!Number.isFinite(parsed)) {
    throw createHttpError(400, 'scale must be a number');
  }

  const normalized = parsed > 1 ? parsed / 100 : parsed;
  if (normalized <= 0 || normalized > 1) {
    throw createHttpError(400, 'scale must be between 0.01 and 1 or between 1 and 100');
  }

  return normalized;
};

const normalizeWatermarkType = (value) => {
  const normalized = String(value || 'text').trim().toLowerCase();
  if (!WATERMARK_TYPES.has(normalized)) {
    throw createHttpError(400, 'watermarkType must be "text" or "image"');
  }
  return normalized;
};

const normalizeWatermarkPlacement = (value) => {
  const normalized = String(value || 'center').trim().toLowerCase();
  return normalized === 'diagonal' ? 'diagonal' : 'center';
};

const normalizePdfFromSingleUpload = (req) => {
  const file = req.file;
  if (!file) {
    throw createHttpError(400, 'No file uploaded');
  }

  if (!isPdfFile(file) || !isPdfBuffer(file.buffer)) {
    throw createHttpError(400, 'Uploaded file must be a valid PDF');
  }

  return file;
};

const getFieldFile = (req, fieldName) => {
  if (!req.files || Array.isArray(req.files)) {
    return null;
  }

  const entry = req.files[fieldName];
  if (!Array.isArray(entry) || entry.length === 0) {
    return null;
  }

  return entry[0];
};

const normalizePdfFromFieldUpload = (req) => {
  const file = getFieldFile(req, 'file');
  if (!file) {
    throw createHttpError(400, 'No file uploaded');
  }

  if (!isPdfFile(file) || !isPdfBuffer(file.buffer)) {
    throw createHttpError(400, 'Uploaded file must be a valid PDF');
  }

  return file;
};

const loadPdf = async (buffer) => {
  try {
    return await PDFDocument.load(buffer, {
      updateMetadata: false,
    });
  } catch (error) {
    throw createHttpError(
      400,
      `Unable to open PDF. The file may be invalid or password protected. ${error.message || ''}`.trim()
    );
  }
};

const sendPdf = (res, buffer, outputName) => {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${outputName}"`);
  res.setHeader('X-Processed-File-Name', outputName);
  res.send(buffer);
};

router.post(
  '/rotate-pdf',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const file = normalizePdfFromSingleUpload(req);
    const pdfDoc = await loadPdf(file.buffer);
    const pages = pdfDoc.getPages();
    const totalPages = pages.length;

    if (totalPages < 1) {
      throw createHttpError(400, 'PDF has no pages to rotate');
    }

    const rotation = parseRotation(req.body?.rotation ?? req.body?.angle);
    const selectedPages = parseSelectedPages(req.body?.pages ?? req.body?.pageRange, totalPages, {
      allowEmpty: true,
    });

    selectedPages.forEach((pageNumber) => {
      const page = pages[pageNumber - 1];
      const currentRotation = page.getRotation()?.angle || 0;
      const nextRotation = ((currentRotation + rotation) % 360 + 360) % 360;
      page.setRotation(degrees(nextRotation));
    });

    const outputBuffer = Buffer.from(await pdfDoc.save());
    const outputName = `${sanitizeBaseName(file.originalname)}-rotated.pdf`;
    sendPdf(res, outputBuffer, outputName);
  })
);

router.post(
  '/delete-pages',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const file = normalizePdfFromSingleUpload(req);
    const pdfDoc = await loadPdf(file.buffer);
    const totalPages = pdfDoc.getPageCount();

    if (totalPages < 1) {
      throw createHttpError(400, 'PDF has no pages');
    }

    const selectedPages = parseSelectedPages(req.body?.pages ?? req.body?.pageRange, totalPages);
    if (selectedPages.size >= totalPages) {
      throw createHttpError(400, 'Cannot delete all pages from the PDF');
    }

    const pagesDescending = Array.from(selectedPages).sort((a, b) => b - a);
    pagesDescending.forEach((pageNumber) => {
      pdfDoc.removePage(pageNumber - 1);
    });

    const outputBuffer = Buffer.from(await pdfDoc.save());
    const outputName = `${sanitizeBaseName(file.originalname)}-pages-deleted.pdf`;
    sendPdf(res, outputBuffer, outputName);
  })
);

router.post(
  '/add-page-numbers',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const file = normalizePdfFromSingleUpload(req);
    const pdfDoc = await loadPdf(file.buffer);
    const pages = pdfDoc.getPages();
    const totalPages = pages.length;

    if (totalPages < 1) {
      throw createHttpError(400, 'PDF has no pages');
    }

    const position = normalizePageNumberPosition(req.body?.position);
    const startNumber = parsePositiveInteger(req.body?.startNumber, 'startNumber', 1);
    const fontSize = parsePositiveInteger(req.body?.fontSize, 'fontSize', 12);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    pages.forEach((page, index) => {
      const label = String(startNumber + index);
      const textWidth = font.widthOfTextAtSize(label, fontSize);
      const textHeight = font.heightAtSize(fontSize);
      const { width, height } = page.getSize();
      const margin = 24;

      let x = margin;
      let y = margin;

      if (position === 'bottom-center') {
        x = (width - textWidth) / 2;
        y = margin;
      } else if (position === 'bottom-right') {
        x = width - textWidth - margin;
        y = margin;
      } else if (position === 'top-right') {
        x = width - textWidth - margin;
        y = height - textHeight - margin;
      }

      page.drawText(label, {
        x: Math.max(0, x),
        y: Math.max(0, y),
        size: fontSize,
        font,
        color: rgb(0.15, 0.15, 0.15),
        opacity: 0.9,
      });
    });

    const outputBuffer = Buffer.from(await pdfDoc.save());
    const outputName = `${sanitizeBaseName(file.originalname)}-numbered.pdf`;
    sendPdf(res, outputBuffer, outputName);
  })
);

router.post(
  '/add-watermark',
  upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'watermarkImage', maxCount: 1 },
  ]),
  asyncHandler(async (req, res) => {
    const sourceFile = normalizePdfFromFieldUpload(req);
    const pdfDoc = await loadPdf(sourceFile.buffer);
    const pages = pdfDoc.getPages();

    if (pages.length < 1) {
      throw createHttpError(400, 'PDF has no pages');
    }

    const watermarkType = normalizeWatermarkType(req.body?.watermarkType ?? req.body?.type);
    const placement = normalizeWatermarkPlacement(req.body?.placement ?? req.body?.position);
    const opacity = parseOpacity(req.body?.opacity, 0.25);

    if (watermarkType === 'text') {
      const watermarkText = String(req.body?.text ?? req.body?.watermarkText ?? '').trim();
      if (!watermarkText) {
        throw createHttpError(400, 'Watermark text is required for text watermark');
      }

      const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const preferredSize = parsePositiveInteger(req.body?.fontSize, 'fontSize', 48);

      pages.forEach((page) => {
        const { width, height } = page.getSize();
        const fontSize = Math.min(preferredSize, Math.max(20, Math.floor(Math.min(width, height) * 0.18)));
        const textWidth = font.widthOfTextAtSize(watermarkText, fontSize);
        const textHeight = font.heightAtSize(fontSize);
        const x = (width - textWidth) / 2;
        const y = (height - textHeight) / 2;

        page.drawText(watermarkText, {
          x,
          y,
          size: fontSize,
          font,
          color: rgb(0.5, 0.5, 0.5),
          opacity,
          rotate: placement === 'diagonal' ? degrees(45) : degrees(0),
        });
      });
    } else {
      const watermarkImageFile = getFieldFile(req, 'watermarkImage');
      if (!watermarkImageFile) {
        throw createHttpError(400, 'watermarkImage file is required for image watermark');
      }

      const mime = String(watermarkImageFile.mimetype || '').toLowerCase();
      const extension = path.extname(watermarkImageFile.originalname || '').toLowerCase();
      const isPng = mime === 'image/png' || extension === '.png';
      const isJpg = mime === 'image/jpeg' || mime === 'image/jpg' || extension === '.jpg' || extension === '.jpeg';

      if (!isPng && !isJpg) {
        throw createHttpError(400, 'watermarkImage must be PNG or JPG');
      }

      const embeddedImage = isPng
        ? await pdfDoc.embedPng(watermarkImageFile.buffer)
        : await pdfDoc.embedJpg(watermarkImageFile.buffer);
      const scale = parseScale(req.body?.scale, 1);

      pages.forEach((page) => {
        const { width, height } = page.getSize();
        const maxWidth = width * 0.55 * scale;
        const maxHeight = height * 0.55 * scale;
        const widthScale = maxWidth / embeddedImage.width;
        const heightScale = maxHeight / embeddedImage.height;
        const drawScale = Math.min(widthScale, heightScale);
        const drawWidth = embeddedImage.width * drawScale;
        const drawHeight = embeddedImage.height * drawScale;
        const x = (width - drawWidth) / 2;
        const y = (height - drawHeight) / 2;

        page.drawImage(embeddedImage, {
          x,
          y,
          width: drawWidth,
          height: drawHeight,
          opacity,
          rotate: placement === 'diagonal' ? degrees(45) : degrees(0),
        });
      });
    }

    const outputBuffer = Buffer.from(await pdfDoc.save());
    const outputName = `${sanitizeBaseName(sourceFile.originalname)}-watermarked.pdf`;
    sendPdf(res, outputBuffer, outputName);
  })
);

export default router;
