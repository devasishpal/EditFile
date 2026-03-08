import { PDFDocument, degrees } from 'pdf-lib';
import { uploadFile, generateS3Key, downloadFile } from '../../config/s3.js';
import { updateJobStatus, completeJob, failJob } from '../../services/database.service.js';
import { logger } from '../../utils/logger.js';

const ALLOWED_ROTATIONS = new Set([0, 90, 180, 270]);
const YIELD_EVERY_PAGES = 20;

const normalizePlan = (rawPages, totalPages) => {
  if (!Array.isArray(rawPages) || rawPages.length === 0) {
    throw new Error('At least one page is required to organize the PDF.');
  }

  return rawPages.map((item, index) => {
    const sourceIndex = Number.parseInt(String(item?.sourceIndex), 10);
    const rotation = Number.parseInt(String(item?.rotation ?? 0), 10);

    if (!Number.isInteger(sourceIndex) || sourceIndex < 0 || sourceIndex >= totalPages) {
      throw new Error(`Invalid sourceIndex at pages[${index}].`);
    }

    if (!ALLOWED_ROTATIONS.has(rotation)) {
      throw new Error(`Invalid rotation at pages[${index}].`);
    }

    return {
      sourceIndex,
      rotation,
    };
  });
};

const yieldToEventLoop = async () =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

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

export const processOrganizePdf = async (jobData) => {
  const { jobId, fileUrl, pages: rawPages, originalName } = jobData;

  logger.info(`Starting organize PDF: ${jobId}`);

  try {
    await updateJobStatus(jobId, 'processing');

    const sourceBuffer = await downloadFile(fileUrl);
    const sourceDoc = await PDFDocument.load(sourceBuffer, {
      ignoreEncryption: false,
      updateMetadata: false,
    });

    const totalPages = sourceDoc.getPageCount();
    if (totalPages < 1) {
      throw new Error('PDF has no pages to organize.');
    }

    const plan = normalizePlan(rawPages, totalPages);
    const outputDoc = await PDFDocument.create();

    for (let index = 0; index < plan.length; index += 1) {
      const pageSpec = plan[index];
      const [copiedPage] = await outputDoc.copyPages(sourceDoc, [pageSpec.sourceIndex]);
      copiedPage.setRotation(degrees(pageSpec.rotation));
      outputDoc.addPage(copiedPage);

      if ((index + 1) % YIELD_EVERY_PAGES === 0) {
        await yieldToEventLoop();
      }
    }

    const outputBuffer = Buffer.from(await outputDoc.save());
    if (!outputBuffer || outputBuffer.length === 0) {
      throw new Error('Organized PDF generation failed.');
    }

    const outputFileName = `${sanitizeBaseName(originalName)}-organized.pdf`;
    const outputKey = generateS3Key(jobId, outputFileName, 'output');
    const outputUrl = await uploadFile(outputBuffer, outputKey, 'application/pdf');

    await completeJob(jobId, outputUrl, outputBuffer.length);
    await updateJobStatus(jobId, 'completed', {
      metadata: {
        outputFileName,
        originalPageCount: totalPages,
        outputPageCount: plan.length,
      },
    });

    logger.info(`Organize PDF completed: ${jobId}`);

    return {
      success: true,
      jobId,
      outputSize: outputBuffer.length,
      outputUrl,
      outputPageCount: plan.length,
    };
  } catch (error) {
    logger.error(`Organize PDF failed for job ${jobId}:`, error);
    await failJob(jobId, error.message);
    throw error;
  }
};

export default { processOrganizePdf };
