import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const MAX_REPORT_PAGES = 150;
const VALID_DIFFERENCE_TYPES = new Set(['text', 'layout', 'image']);

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
    .slice(0, 50);

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

const clipText = (value, maxLength = 120) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) {
    return '';
  }
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
};

const wrapText = (font, text, size, maxWidth) => {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
      current = word;
      continue;
    }

    lines.push(candidate);
    current = '';
  }

  if (current) {
    lines.push(current);
  }

  return lines;
};

const parseImageDataUrl = (value, fieldName) => {
  const raw = String(value || '').trim();
  const match = raw.match(/^data:(image\/png|image\/jpeg|image\/jpg);base64,([\s\S]+)$/i);

  if (!match) {
    throw createHttpError(400, `${fieldName} must be a PNG or JPG data URL`);
  }

  return {
    mimeType: match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase(),
    buffer: Buffer.from(match[2], 'base64'),
  };
};

const parseSummary = (value) => {
  const parsed = parseJsonPayload(value, 'summary');

  const totalPages = Number.parseInt(String(parsed?.totalPages ?? 0), 10);
  const pagesWithDifferences = Number.parseInt(String(parsed?.pagesWithDifferences ?? 0), 10);
  const textChanges = Number.parseInt(String(parsed?.textChanges ?? 0), 10);
  const layoutChanges = Number.parseInt(String(parsed?.layoutChanges ?? 0), 10);
  const imageChanges = Number.parseInt(String(parsed?.imageChanges ?? 0), 10);
  const pageReportsRaw = Array.isArray(parsed?.pageReports) ? parsed.pageReports : [];

  if (!Number.isInteger(totalPages) || totalPages < 1) {
    throw createHttpError(400, 'summary.totalPages must be a positive integer');
  }

  if (pageReportsRaw.length > MAX_REPORT_PAGES) {
    throw createHttpError(400, `A maximum of ${MAX_REPORT_PAGES} page reports is supported`);
  }

  const pageReports = pageReportsRaw.map((item, index) => {
    const pageIndex = Number.parseInt(String(item?.pageIndex), 10);
    if (!Number.isInteger(pageIndex) || pageIndex < 0) {
      throw createHttpError(400, `summary.pageReports[${index}].pageIndex must be valid`);
    }

    const differenceTypes = Array.isArray(item?.differenceTypes)
      ? item.differenceTypes
          .map((type) => String(type || '').trim().toLowerCase())
          .filter((type) => VALID_DIFFERENCE_TYPES.has(type))
      : [];

    return {
      pageIndex,
      differenceTypes,
      addedCount: Number.parseInt(String(item?.addedCount ?? 0), 10) || 0,
      removedCount: Number.parseInt(String(item?.removedCount ?? 0), 10) || 0,
      changedCount: Number.parseInt(String(item?.changedCount ?? 0), 10) || 0,
      visualChangeRatio: Number.parseFloat(String(item?.visualChangeRatio ?? 0)) || 0,
      addedSamples: Array.isArray(item?.addedSamples)
        ? item.addedSamples.map((sample) => clipText(sample, 90)).filter(Boolean).slice(0, 4)
        : [],
      removedSamples: Array.isArray(item?.removedSamples)
        ? item.removedSamples.map((sample) => clipText(sample, 90)).filter(Boolean).slice(0, 4)
        : [],
      originalPreview: parseImageDataUrl(
        item?.originalPreviewDataUrl,
        `summary.pageReports[${index}].originalPreviewDataUrl`
      ),
      modifiedPreview: parseImageDataUrl(
        item?.modifiedPreviewDataUrl,
        `summary.pageReports[${index}].modifiedPreviewDataUrl`
      ),
    };
  });

  return {
    totalPages,
    pagesWithDifferences: Number.isInteger(pagesWithDifferences) && pagesWithDifferences >= 0
      ? pagesWithDifferences
      : pageReports.length,
    textChanges: Number.isInteger(textChanges) && textChanges >= 0 ? textChanges : 0,
    layoutChanges: Number.isInteger(layoutChanges) && layoutChanges >= 0 ? layoutChanges : 0,
    imageChanges: Number.isInteger(imageChanges) && imageChanges >= 0 ? imageChanges : 0,
    pageReports,
  };
};

const drawWrappedBlock = (page, font, text, options) => {
  const {
    x,
    y,
    size = 11,
    lineHeight = 14,
    maxWidth = 200,
    color = rgb(0.2, 0.2, 0.2),
  } = options;

  const lines = wrapText(font, text, size, maxWidth);
  lines.forEach((line, index) => {
    page.drawText(line, {
      x,
      y: y - index * lineHeight,
      size,
      font,
      color,
    });
  });

  return lines.length * lineHeight;
};

const drawSummaryPage = async (pdfDoc, summary, originalName, modifiedName) => {
  const page = pdfDoc.addPage([595, 842]);
  const titleFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const bodyFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  page.drawText('PDF Comparison Report', {
    x: 40,
    y: 790,
    size: 24,
    font: titleFont,
    color: rgb(0.11, 0.12, 0.16),
  });

  page.drawText(`Original: ${clipText(originalName, 70)}`, {
    x: 40,
    y: 756,
    size: 11,
    font: bodyFont,
    color: rgb(0.28, 0.3, 0.36),
  });

  page.drawText(`Modified: ${clipText(modifiedName, 70)}`, {
    x: 40,
    y: 738,
    size: 11,
    font: bodyFont,
    color: rgb(0.28, 0.3, 0.36),
  });

  const metrics = [
    { label: 'Pages Compared', value: String(summary.totalPages) },
    { label: 'Pages With Differences', value: String(summary.pagesWithDifferences) },
    { label: 'Text Differences', value: String(summary.textChanges) },
    { label: 'Layout Differences', value: String(summary.layoutChanges) },
    { label: 'Image Differences', value: String(summary.imageChanges) },
  ];

  metrics.forEach((metric, index) => {
    const y = 680 - index * 44;
    page.drawRectangle({
      x: 40,
      y: y - 10,
      width: 240,
      height: 32,
      color: rgb(0.96, 0.96, 0.98),
      borderColor: rgb(0.85, 0.86, 0.9),
      borderWidth: 1,
    });
    page.drawText(metric.label, {
      x: 52,
      y: y + 2,
      size: 11,
      font: bodyFont,
      color: rgb(0.3, 0.32, 0.38),
    });
    page.drawText(metric.value, {
      x: 220,
      y: y + 2,
      size: 12,
      font: titleFont,
      color: rgb(0.15, 0.16, 0.2),
    });
  });

  page.drawText('Pages flagged', {
    x: 320,
    y: 690,
    size: 14,
    font: titleFont,
    color: rgb(0.11, 0.12, 0.16),
  });

  const flaggedPages = summary.pageReports.length > 0
    ? summary.pageReports.map((item) => item.pageIndex + 1).join(', ')
    : 'No page-level differences were captured in the report payload.';

  drawWrappedBlock(page, bodyFont, flaggedPages, {
    x: 320,
    y: 668,
    size: 11,
    lineHeight: 15,
    maxWidth: 230,
  });

  page.drawText('Legend', {
    x: 320,
    y: 590,
    size: 14,
    font: titleFont,
    color: rgb(0.11, 0.12, 0.16),
  });

  const legendItems = [
    'Red highlight: removed content',
    'Green highlight: added content',
    'Amber outline: visual/layout change region',
  ];

  legendItems.forEach((item, index) => {
    page.drawText(item, {
      x: 320,
      y: 566 - index * 18,
      size: 11,
      font: bodyFont,
      color: rgb(0.3, 0.32, 0.38),
    });
  });
};

const scaleToFit = (width, height, maxWidth, maxHeight) => {
  const widthScale = maxWidth / width;
  const heightScale = maxHeight / height;
  const scale = Math.min(widthScale, heightScale);

  return {
    width: width * scale,
    height: height * scale,
  };
};

export const buildComparePdfReport = async ({
  originalBuffer,
  originalName,
  modifiedBuffer,
  modifiedName,
  summary: rawSummary,
}) => {
  if (!isPdfBuffer(originalBuffer) || !isPdfBuffer(modifiedBuffer)) {
    throw createHttpError(400, 'Both uploaded files must be valid PDF documents');
  }

  const summary = parseSummary(rawSummary);
  const pdfDoc = await PDFDocument.create();
  const bodyFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const titleFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  await drawSummaryPage(pdfDoc, summary, originalName, modifiedName);

  for (const pageReport of summary.pageReports) {
    const reportPage = pdfDoc.addPage([842, 595]);
    const originalImage = pageReport.originalPreview.mimeType === 'image/png'
      ? await pdfDoc.embedPng(pageReport.originalPreview.buffer)
      : await pdfDoc.embedJpg(pageReport.originalPreview.buffer);
    const modifiedImage = pageReport.modifiedPreview.mimeType === 'image/png'
      ? await pdfDoc.embedPng(pageReport.modifiedPreview.buffer)
      : await pdfDoc.embedJpg(pageReport.modifiedPreview.buffer);

    reportPage.drawText(`Page ${pageReport.pageIndex + 1}`, {
      x: 36,
      y: 556,
      size: 18,
      font: titleFont,
      color: rgb(0.11, 0.12, 0.16),
    });

    const typeLabel = pageReport.differenceTypes.length > 0
      ? pageReport.differenceTypes.join(', ')
      : 'visual';

    reportPage.drawText(`Differences: ${typeLabel}`, {
      x: 36,
      y: 536,
      size: 11,
      font: bodyFont,
      color: rgb(0.31, 0.33, 0.38),
    });

    reportPage.drawText('Original', {
      x: 36,
      y: 510,
      size: 12,
      font: titleFont,
      color: rgb(0.15, 0.16, 0.2),
    });

    reportPage.drawText('Modified', {
      x: 430,
      y: 510,
      size: 12,
      font: titleFont,
      color: rgb(0.15, 0.16, 0.2),
    });

    const leftImageSize = scaleToFit(originalImage.width, originalImage.height, 340, 390);
    const rightImageSize = scaleToFit(modifiedImage.width, modifiedImage.height, 340, 390);

    reportPage.drawImage(originalImage, {
      x: 36,
      y: 112,
      width: leftImageSize.width,
      height: leftImageSize.height,
    });

    reportPage.drawImage(modifiedImage, {
      x: 430,
      y: 112,
      width: rightImageSize.width,
      height: rightImageSize.height,
    });

    reportPage.drawRectangle({
      x: 36,
      y: 72,
      width: 360,
      height: 28,
      color: rgb(0.97, 0.97, 0.98),
      borderColor: rgb(0.87, 0.88, 0.91),
      borderWidth: 1,
    });

    reportPage.drawRectangle({
      x: 430,
      y: 72,
      width: 376,
      height: 28,
      color: rgb(0.97, 0.97, 0.98),
      borderColor: rgb(0.87, 0.88, 0.91),
      borderWidth: 1,
    });

    reportPage.drawText(
      `Added: ${pageReport.addedCount}  Removed: ${pageReport.removedCount}  Changed: ${pageReport.changedCount}`,
      {
        x: 46,
        y: 84,
        size: 10,
        font: bodyFont,
        color: rgb(0.31, 0.33, 0.38),
      }
    );

    reportPage.drawText(
      `Visual change: ${(pageReport.visualChangeRatio * 100).toFixed(1)}%`,
      {
        x: 440,
        y: 84,
        size: 10,
        font: bodyFont,
        color: rgb(0.31, 0.33, 0.38),
      }
    );

    if (pageReport.addedSamples.length > 0) {
      reportPage.drawText('Added samples', {
        x: 36,
        y: 46,
        size: 10,
        font: titleFont,
        color: rgb(0.12, 0.46, 0.22),
      });
      drawWrappedBlock(reportPage, bodyFont, pageReport.addedSamples.join(' | '), {
        x: 118,
        y: 46,
        size: 9,
        lineHeight: 11,
        maxWidth: 270,
        color: rgb(0.2, 0.22, 0.27),
      });
    }

    if (pageReport.removedSamples.length > 0) {
      reportPage.drawText('Removed samples', {
        x: 430,
        y: 46,
        size: 10,
        font: titleFont,
        color: rgb(0.72, 0.14, 0.14),
      });
      drawWrappedBlock(reportPage, bodyFont, pageReport.removedSamples.join(' | '), {
        x: 532,
        y: 46,
        size: 9,
        lineHeight: 11,
        maxWidth: 260,
        color: rgb(0.2, 0.22, 0.27),
      });
    }
  }

  const outputBuffer = Buffer.from(await pdfDoc.save());
  const outputName = `${sanitizeBaseName(originalName)}_vs_${sanitizeBaseName(modifiedName)}_comparison.pdf`;

  return {
    outputBuffer,
    outputName,
  };
};

export default {
  buildComparePdfReport,
};
