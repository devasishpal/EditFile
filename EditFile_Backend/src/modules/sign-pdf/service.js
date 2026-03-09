import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';

const MAX_PLACEMENTS = 200;
const VALID_RENDERERS = new Set(['image', 'text']);
const VALID_ALIGNMENTS = new Set(['left', 'center', 'right']);

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

  if (typeof value === 'object') {
    return value;
  }

  try {
    return JSON.parse(String(value));
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

const parseOptionalOpacity = (value) => {
  if (value === undefined || value === null || value === '') {
    return 1;
  }

  const parsed = Number.parseFloat(String(value));
  if (!Number.isFinite(parsed)) {
    throw createHttpError(400, 'opacity must be a number');
  }

  const normalized = parsed > 1 ? parsed / 100 : parsed;
  if (normalized <= 0 || normalized > 1) {
    throw createHttpError(400, 'opacity must be between 0.01 and 1');
  }

  return normalized;
};

const parseRotation = (value) => {
  if (value === undefined || value === null || value === '') {
    return 0;
  }

  const parsed = Number.parseFloat(String(value));
  if (!Number.isFinite(parsed)) {
    throw createHttpError(400, 'rotation must be a number');
  }

  return parsed;
};

const normalizeColor = (value) => {
  const raw = String(value || '#111111').trim();
  const match = raw.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!match) {
    throw createHttpError(400, 'fontColor must be a hex color like #111111');
  }

  const hex = match[1].length === 3
    ? match[1].split('').map((char) => `${char}${char}`).join('')
    : match[1];

  return rgb(
    Number.parseInt(hex.slice(0, 2), 16) / 255,
    Number.parseInt(hex.slice(2, 4), 16) / 255,
    Number.parseInt(hex.slice(4, 6), 16) / 255
  );
};

const parseImageDataUrl = (value) => {
  const raw = String(value || '').trim();
  const match = raw.match(/^data:(image\/png|image\/jpeg|image\/jpg);base64,([\s\S]+)$/i);

  if (!match) {
    throw createHttpError(400, 'signature image must be a PNG or JPG data URL');
  }

  const mimeType = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase();
  const buffer = Buffer.from(match[2], 'base64');

  if (!buffer.length) {
    throw createHttpError(400, 'signature image is empty');
  }

  return {
    mimeType,
    buffer,
  };
};

const resolveFontKey = (placement) => {
  const family = String(placement.fontFamily || 'sans').trim().toLowerCase();
  const style = String(placement.fontStyle || 'normal').trim().toLowerCase();

  if (family === 'serif') {
    return style === 'bold' ? StandardFonts.TimesRomanBold : StandardFonts.TimesRoman;
  }

  if (family === 'mono') {
    return style === 'bold' ? StandardFonts.CourierBold : StandardFonts.Courier;
  }

  if (style === 'bold') {
    return StandardFonts.HelveticaBold;
  }

  if (style === 'italic') {
    return StandardFonts.HelveticaOblique;
  }

  return StandardFonts.Helvetica;
};

const parsePlacements = (value) => {
  const parsed = parseJsonPayload(value, 'placements');

  if (!Array.isArray(parsed)) {
    throw createHttpError(400, 'placements must be an array');
  }

  if (parsed.length === 0) {
    throw createHttpError(400, 'At least one placement is required');
  }

  if (parsed.length > MAX_PLACEMENTS) {
    throw createHttpError(400, `A maximum of ${MAX_PLACEMENTS} placements is supported`);
  }

  return parsed.map((item, index) => {
    const renderer = String(item?.renderer || '').trim().toLowerCase();
    if (!VALID_RENDERERS.has(renderer)) {
      throw createHttpError(400, `placements[${index}].renderer must be "image" or "text"`);
    }

    const pageIndex = Number.parseInt(String(item?.pageIndex), 10);
    if (!Number.isInteger(pageIndex) || pageIndex < 0) {
      throw createHttpError(400, `placements[${index}].pageIndex must be a non-negative integer`);
    }

    const placement = {
      renderer,
      pageIndex,
      x: parseNormalizedNumber(item?.x, `placements[${index}].x`),
      y: parseNormalizedNumber(item?.y, `placements[${index}].y`),
      width: parseNormalizedNumber(item?.width, `placements[${index}].width`, {
        min: 0.01,
        max: 1,
        allowZero: false,
      }),
      height: parseNormalizedNumber(item?.height, `placements[${index}].height`, {
        min: 0.01,
        max: 1,
        allowZero: false,
      }),
      rotation: parseRotation(item?.rotation),
      opacity: parseOptionalOpacity(item?.opacity),
      align: VALID_ALIGNMENTS.has(String(item?.align || '').trim().toLowerCase())
        ? String(item.align).trim().toLowerCase()
        : 'left',
      fontFamily: String(item?.fontFamily || 'sans').trim().toLowerCase(),
      fontStyle: String(item?.fontStyle || 'normal').trim().toLowerCase(),
      fontColor: normalizeColor(item?.fontColor),
      text: '',
      assetDataUrl: '',
    };

    if (placement.x + placement.width > 1.001 || placement.y + placement.height > 1.001) {
      throw createHttpError(400, `placements[${index}] exceeds page bounds`);
    }

    if (renderer === 'image') {
      placement.assetDataUrl = String(item?.assetDataUrl || '').trim();
      if (!placement.assetDataUrl) {
        throw createHttpError(400, `placements[${index}].assetDataUrl is required for image items`);
      }
    } else {
      placement.text = String(item?.text || '').trim();
      if (!placement.text) {
        throw createHttpError(400, `placements[${index}].text is required for text items`);
      }
    }

    return placement;
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

const fitTextToBox = (font, text, boxWidth, boxHeight) => {
  let fontSize = Math.max(8, boxHeight * 0.7);

  while (fontSize > 6 && font.widthOfTextAtSize(text, fontSize) > boxWidth) {
    fontSize -= 0.5;
  }

  return fontSize;
};

export const signPdfBuffer = async ({ pdfBuffer, originalName, placements: rawPlacements }) => {
  if (!isPdfBuffer(pdfBuffer)) {
    throw createHttpError(400, 'Uploaded file must be a valid PDF');
  }

  const placements = parsePlacements(rawPlacements);
  const pdfDoc = await loadPdf(pdfBuffer);
  const pages = pdfDoc.getPages();
  const imageCache = new Map();
  const fontCache = new Map();

  if (pages.length < 1) {
    throw createHttpError(400, 'PDF has no pages to sign');
  }

  for (const placement of placements) {
    if (placement.pageIndex >= pages.length) {
      throw createHttpError(
        400,
        `Placement page index ${placement.pageIndex} exceeds document page count`
      );
    }

    const page = pages[placement.pageIndex];
    const { width: pageWidth, height: pageHeight } = page.getSize();
    const drawWidth = placement.width * pageWidth;
    const drawHeight = placement.height * pageHeight;
    const drawX = placement.x * pageWidth;
    const drawY = pageHeight - ((placement.y + placement.height) * pageHeight);
    const rotation = degrees(placement.rotation);

    if (placement.renderer === 'image') {
      let embeddedImage = imageCache.get(placement.assetDataUrl);
      if (!embeddedImage) {
        const asset = parseImageDataUrl(placement.assetDataUrl);
        embeddedImage = asset.mimeType === 'image/png'
          ? await pdfDoc.embedPng(asset.buffer)
          : await pdfDoc.embedJpg(asset.buffer);
        imageCache.set(placement.assetDataUrl, embeddedImage);
      }

      page.drawImage(embeddedImage, {
        x: drawX,
        y: drawY,
        width: drawWidth,
        height: drawHeight,
        rotate: rotation,
        opacity: placement.opacity,
      });
      continue;
    }

    const fontKey = resolveFontKey(placement);
    let font = fontCache.get(fontKey);
    if (!font) {
      font = await pdfDoc.embedFont(fontKey);
      fontCache.set(fontKey, font);
    }

    const fontSize = fitTextToBox(font, placement.text, drawWidth, drawHeight);
    const textWidth = font.widthOfTextAtSize(placement.text, fontSize);
    const textHeight = font.heightAtSize(fontSize);
    let textX = drawX;

    if (placement.align === 'center') {
      textX = drawX + Math.max(0, (drawWidth - textWidth) / 2);
    } else if (placement.align === 'right') {
      textX = drawX + Math.max(0, drawWidth - textWidth);
    }

    const textY = drawY + Math.max(0, (drawHeight - textHeight) / 2);

    page.drawText(placement.text, {
      x: textX,
      y: textY,
      size: fontSize,
      font,
      color: placement.fontColor,
      opacity: placement.opacity,
      rotate: rotation,
    });
  }

  const outputBuffer = Buffer.from(await pdfDoc.save());
  const outputName = `${sanitizeBaseName(originalName)}_signed.pdf`;

  return {
    outputBuffer,
    outputName,
  };
};

export default {
  signPdfBuffer,
};
