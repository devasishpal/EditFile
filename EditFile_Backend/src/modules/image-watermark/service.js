import fs from 'fs/promises';
import path from 'path';
import { downloadFile } from '../../config/s3.js';
import { updateJobStatus, completeJob, failJob } from '../../services/database.service.js';
import { logger } from '../../utils/logger.js';
import {
  clampInteger,
  clampNumber,
  createTempWorkspace,
  getBaseName,
  getExtensionForFormat,
  getFormatFromFile,
  getMimeTypeForFormat,
  removePathSafe,
  resolveGravity,
  runMagick,
  uploadProcessedFiles,
} from '../../utils/imagemagick.js';
import { mapWithConcurrency, resolveConcurrency } from '../../utils/concurrency.js';

const IMAGE_TASK_CONCURRENCY = resolveConcurrency('IMAGE_TASK_CONCURRENCY', {
  reserve: 1,
  min: 1,
  max: 8,
});

const normalizeHexColor = (value) => {
  const raw = String(value || '').trim();
  const shortHex = /^#([0-9a-f]{3})$/i;
  const longHex = /^#([0-9a-f]{6})$/i;

  if (longHex.test(raw)) {
    return raw.toLowerCase();
  }

  if (shortHex.test(raw)) {
    const [, body] = shortHex.exec(raw) || [];
    return `#${body[0]}${body[0]}${body[1]}${body[1]}${body[2]}${body[2]}`.toLowerCase();
  }

  return '#ffffff';
};

const hexToRgba = (hexColor, opacity) => {
  const hex = normalizeHexColor(hexColor).replace('#', '');
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  return `rgba(${red},${green},${blue},${opacity})`;
};

const toGeometryOffset = (offsetX, offsetY) => {
  const x = Number.isFinite(offsetX) ? offsetX : 0;
  const y = Number.isFinite(offsetY) ? offsetY : 0;
  return `${x >= 0 ? '+' : '-'}${Math.abs(x)}${y >= 0 ? '+' : '-'}${Math.abs(y)}`;
};

const applyWatermarkBuffer = async ({
  imageBuffer,
  originalName,
  mimeType,
  watermark,
  watermarkImageBuffer,
}) => {
  const workspace = await createTempWorkspace('editfile-image-watermark-');
  const format = getFormatFromFile(originalName, mimeType, 'jpg');
  const extension = getExtensionForFormat(format, 'jpg');
  const inputPath = path.join(workspace, `input.${extension}`);
  const outputPath = path.join(workspace, `output.${extension}`);
  const gravity = resolveGravity(watermark.position, 'southeast');
  const offsetGeometry = toGeometryOffset(watermark.offsetX, watermark.offsetY);

  try {
    await fs.writeFile(inputPath, imageBuffer);

    if (watermark.type === 'image') {
      const watermarkFormat = getFormatFromFile(
        watermark.fileName,
        watermark.fileMimeType,
        'png'
      );
      const watermarkPath = path.join(
        workspace,
        `watermark.${getExtensionForFormat(watermarkFormat, 'png')}`
      );
      await fs.writeFile(watermarkPath, watermarkImageBuffer);

      await runMagick([
        inputPath,
        '-auto-orient',
        '(',
        watermarkPath,
        '-auto-orient',
        '-resize',
        `${watermark.scale}%`,
        '-alpha',
        'set',
        '-channel',
        'A',
        '-evaluate',
        'multiply',
        String(watermark.opacity),
        '+channel',
        ')',
        '-gravity',
        gravity,
        '-geometry',
        offsetGeometry,
        '-composite',
        outputPath,
      ]);
    } else {
      const fillColor = hexToRgba(watermark.color, watermark.opacity);
      await runMagick([
        inputPath,
        '-auto-orient',
        '-gravity',
        gravity,
        '-fill',
        fillColor,
        '-pointsize',
        String(watermark.fontSize),
        '-annotate',
        offsetGeometry,
        watermark.text,
        outputPath,
      ]);
    }

    const outputBuffer = await fs.readFile(outputPath);
    return {
      fileName: `${getBaseName(originalName, 'image')}.${extension}`,
      contentType: getMimeTypeForFormat(format),
      buffer: outputBuffer,
      size: outputBuffer.length,
    };
  } finally {
    await removePathSafe(workspace);
  }
};

export const processImageWatermark = async (jobData) => {
  const { jobId, fileUrls, watermark: rawWatermark } = jobData;
  const watermark = {
    type: rawWatermark?.type === 'image' ? 'image' : 'text',
    text: String(rawWatermark?.text || '').trim(),
    position: String(rawWatermark?.position || 'bottom-right').toLowerCase(),
    opacity: clampNumber(rawWatermark?.opacity, 0.05, 1, 0.35),
    color: normalizeHexColor(rawWatermark?.color),
    fontSize: clampInteger(rawWatermark?.fontSize, 8, 400, 36),
    offsetX: clampInteger(rawWatermark?.offsetX, -5000, 5000, 20),
    offsetY: clampInteger(rawWatermark?.offsetY, -5000, 5000, 20),
    scale: clampInteger(rawWatermark?.scale, 1, 100, 25),
    fileUrl: rawWatermark?.fileUrl || null,
    fileName: rawWatermark?.fileName || null,
    fileMimeType: rawWatermark?.fileMimeType || null,
  };

  if (watermark.type === 'text' && !watermark.text) {
    throw new Error('Watermark text is required');
  }

  if (watermark.type === 'image' && !watermark.fileUrl) {
    throw new Error('Watermark image is required');
  }

  logger.info(
    `Starting ImageMagick watermark processing: ${jobId}, files: ${fileUrls.length}, type: ${watermark.type}`
  );

  try {
    await updateJobStatus(jobId, 'processing');

    const watermarkImageBuffer =
      watermark.type === 'image' ? await downloadFile(watermark.fileUrl) : null;
    const results = await mapWithConcurrency(
      fileUrls,
      IMAGE_TASK_CONCURRENCY,
      async (fileData) => {
        const imageBuffer = await downloadFile(fileData.url);
        const processed = await applyWatermarkBuffer({
          imageBuffer,
          originalName: fileData.name,
          mimeType: fileData.mimetype,
          watermark,
          watermarkImageBuffer,
        });

        return {
          fileData,
          processed,
          originalSize: imageBuffer.length,
        };
      }
    );

    const processedFiles = results.map(({ processed }) => ({
      fileName: processed.fileName,
      contentType: processed.contentType,
      buffer: processed.buffer,
    }));

    const details = results.map(({ fileData, processed }) => ({
      name: fileData.name,
      originalSize: fileData.size,
      watermarkedSize: processed.size,
    }));

    const totalOriginalSize = results.reduce((sum, item) => sum + item.originalSize, 0);
    const totalWatermarkedSize = results.reduce((sum, item) => sum + item.processed.size, 0);

    const { outputUrl, outputBuffer, outputFileName, outputContentType } = await uploadProcessedFiles({
      jobId,
      files: processedFiles,
      fallbackBaseName: `${getBaseName(fileUrls[0]?.name, 'image')}_output`,
    });

    await completeJob(jobId, outputUrl, outputBuffer.length);
    await updateJobStatus(jobId, 'completed', {
      metadata: {
        watermarkType: watermark.type,
        position: watermark.position,
        opacity: watermark.opacity,
        outputFileName,
        outputType: outputContentType,
        fileCount: processedFiles.length,
        files: details,
      },
    });

    logger.info(`Image watermark completed: ${jobId}, files: ${processedFiles.length}`);

    return {
      success: true,
      jobId,
      fileCount: processedFiles.length,
      originalSize: totalOriginalSize,
      watermarkedSize: totalWatermarkedSize,
      outputFileName,
      outputType: outputContentType,
      files: details,
      outputUrl,
    };
  } catch (error) {
    logger.error(`Image watermark failed for job ${jobId}:`, error);
    await failJob(jobId, error.message);
    throw error;
  }
};

export default { processImageWatermark };
