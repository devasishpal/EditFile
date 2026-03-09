import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { createTempWorkspace, removePathSafe } from '../../utils/workspace.js';
import { ensureGhostscriptDependency, runCliCommand } from '../../utils/pdf-cli.js';

const MAX_REDACTIONS = 500;
const VALID_REDACTION_TYPES = new Set(['black', 'white', 'blur']);
const RENDER_DPI = Number.parseInt(process.env.REDACT_PDF_DPI || '150', 10);

const createHttpError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const isPdfBuffer = (buffer) =>
  Boolean(buffer) && buffer.length >= 5 && buffer.subarray(0, 5).toString('utf8') === '%PDF-';

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

const parseJsonPayload = (value, fieldName) => {
  if (value === undefined || value === null || value === '') {
    throw createHttpError(400, `${fieldName} is required`);
  }

  try {
    return typeof value === 'object' ? value : JSON.parse(String(value));
  } catch {
    throw createHttpError(400, `${fieldName} must be valid JSON`);
  }
};

const parseNormalizedNumber = (value, fieldName, { min = 0, max = 1, allowZero = true } = {}) => {
  const parsed = Number.parseFloat(String(value));
  const validMin = allowZero ? parsed >= min : parsed > min;

  if (!Number.isFinite(parsed) || !validMin || parsed > max) {
    throw createHttpError(400, `${fieldName} must be a number between ${min} and ${max}`);
  }

  return parsed;
};

const parseRedactions = (value) => {
  const parsed = parseJsonPayload(value, 'redactions');

  if (!Array.isArray(parsed)) {
    throw createHttpError(400, 'redactions must be an array');
  }

  if (parsed.length === 0) {
    throw createHttpError(400, 'At least one redaction is required');
  }

  if (parsed.length > MAX_REDACTIONS) {
    throw createHttpError(400, `A maximum of ${MAX_REDACTIONS} redactions is supported`);
  }

  return parsed.map((item, index) => {
    const pageIndex = Number.parseInt(String(item?.pageIndex), 10);
    if (!Number.isInteger(pageIndex) || pageIndex < 0) {
      throw createHttpError(400, `redactions[${index}].pageIndex must be a non-negative integer`);
    }

    const style = String(item?.style || '').trim().toLowerCase();
    if (!VALID_REDACTION_TYPES.has(style)) {
      throw createHttpError(400, `redactions[${index}].style must be black, white, or blur`);
    }

    const redaction = {
      pageIndex,
      style,
      x: parseNormalizedNumber(item?.x, `redactions[${index}].x`),
      y: parseNormalizedNumber(item?.y, `redactions[${index}].y`),
      width: parseNormalizedNumber(item?.width, `redactions[${index}].width`, {
        min: 0.001,
        max: 1,
        allowZero: false,
      }),
      height: parseNormalizedNumber(item?.height, `redactions[${index}].height`, {
        min: 0.001,
        max: 1,
        allowZero: false,
      }),
    };

    if (redaction.x + redaction.width > 1.001 || redaction.y + redaction.height > 1.001) {
      throw createHttpError(400, `redactions[${index}] exceeds page bounds`);
    }

    return redaction;
  });
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

const getRedactionRect = (redaction, pageWidth, pageHeight) => {
  const left = Math.max(0, Math.floor(redaction.x * pageWidth));
  const top = Math.max(0, Math.floor(redaction.y * pageHeight));
  const width = Math.max(1, Math.ceil(redaction.width * pageWidth));
  const height = Math.max(1, Math.ceil(redaction.height * pageHeight));

  return {
    left,
    top,
    width: Math.min(width, pageWidth - left),
    height: Math.min(height, pageHeight - top),
  };
};

const applySolidRedaction = async (pageBuffer, pageWidth, pageHeight, rect, fill) => {
  const overlay = Buffer.from(
    `<svg width="${pageWidth}" height="${pageHeight}" xmlns="http://www.w3.org/2000/svg"><rect x="${rect.left}" y="${rect.top}" width="${rect.width}" height="${rect.height}" fill="${fill}"/></svg>`
  );

  return sharp(pageBuffer)
    .composite([{ input: overlay, left: 0, top: 0 }])
    .png()
    .toBuffer();
};

const applyBlurRedaction = async (pageBuffer, rect) => {
  const blurredRegion = await sharp(pageBuffer)
    .extract(rect)
    .blur(18)
    .png()
    .toBuffer();

  return sharp(pageBuffer)
    .composite([{ input: blurredRegion, left: rect.left, top: rect.top }])
    .png()
    .toBuffer();
};

export const redactPdfBuffer = async ({ pdfBuffer, originalName, redactions: rawRedactions }) => {
  if (!isPdfBuffer(pdfBuffer)) {
    throw createHttpError(400, 'Uploaded file must be a valid PDF');
  }

  const redactions = parseRedactions(rawRedactions);
  const sourcePdf = await loadPdf(pdfBuffer);
  const sourcePages = sourcePdf.getPages();

  if (sourcePages.length < 1) {
    throw createHttpError(400, 'PDF has no pages to redact');
  }

  redactions.forEach((redaction, index) => {
    if (redaction.pageIndex >= sourcePages.length) {
      throw createHttpError(
        400,
        `redactions[${index}].pageIndex exceeds the document page count`
      );
    }
  });

  let tempDir = null;

  try {
    const { ghostscriptPath } = await ensureGhostscriptDependency();
    tempDir = await createTempWorkspace('editfile-redact-pdf-');

    const inputPath = path.join(tempDir, 'input.pdf');
    const outputPattern = path.join(tempDir, 'page-%04d.png');
    await fs.writeFile(inputPath, pdfBuffer);

    await runCliCommand(
      ghostscriptPath,
      [
        '-sDEVICE=png16m',
        '-dSAFER',
        '-dBATCH',
        '-dNOPAUSE',
        '-dNOPROMPT',
        '-dTextAlphaBits=4',
        '-dGraphicsAlphaBits=4',
        '-dUseCropBox',
        `-r${RENDER_DPI}`,
        `-sOutputFile=${outputPattern}`,
        inputPath,
      ],
      {
        timeoutMs: 10 * 60 * 1000,
        captureStdout: false,
      }
    );

    const generatedEntries = await fs.readdir(tempDir, { withFileTypes: true });
    const imageNames = generatedEntries
      .filter((entry) => entry.isFile() && /^page-\d{4}\.png$/i.test(entry.name))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    if (imageNames.length !== sourcePages.length) {
      throw createHttpError(
        500,
        `Expected ${sourcePages.length} rendered pages, but generated ${imageNames.length}`
      );
    }

    const outputPdf = await PDFDocument.create();

    for (let index = 0; index < imageNames.length; index += 1) {
      const pageRedactions = redactions.filter((item) => item.pageIndex === index);
      let pageBuffer = await fs.readFile(path.join(tempDir, imageNames[index]));

      if (pageRedactions.length > 0) {
        const metadata = await sharp(pageBuffer).metadata();
        const imageWidth = metadata.width || 0;
        const imageHeight = metadata.height || 0;

        if (!imageWidth || !imageHeight) {
          throw createHttpError(500, `Rendered page ${index + 1} is invalid`);
        }

        for (const redaction of pageRedactions) {
          const rect = getRedactionRect(redaction, imageWidth, imageHeight);

          if (redaction.style === 'blur') {
            pageBuffer = await applyBlurRedaction(pageBuffer, rect);
            continue;
          }

          pageBuffer = await applySolidRedaction(
            pageBuffer,
            imageWidth,
            imageHeight,
            rect,
            redaction.style === 'white' ? '#ffffff' : '#000000'
          );
        }
      }

      const embeddedImage = await outputPdf.embedPng(pageBuffer);
      const sourcePage = sourcePages[index];
      const { width, height } = sourcePage.getSize();
      const outputPage = outputPdf.addPage([width, height]);

      outputPage.drawImage(embeddedImage, {
        x: 0,
        y: 0,
        width,
        height,
      });
    }

    const outputBuffer = Buffer.from(await outputPdf.save());
    const outputName = `${sanitizeBaseName(originalName)}_redacted.pdf`;

    return {
      outputBuffer,
      outputName,
    };
  } finally {
    if (tempDir) {
      await removePathSafe(tempDir);
    }
  }
};

export default {
  redactPdfBuffer,
};
