import fs from 'fs/promises';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import { downloadFile } from '../../config/s3.js';
import { updateJobStatus, completeJob, failJob } from '../../services/database.service.js';
import { logger } from '../../utils/logger.js';
import {
  clampInteger,
  getBaseName,
  uploadProcessedFiles,
} from '../../utils/imagemagick.js';
import { createTempWorkspace, removePathSafe } from '../../utils/workspace.js';
import { ensureGhostscriptDependency, runCliCommand } from '../../utils/pdf-cli.js';

const PDF_TO_JPG_TIMEOUT_MS = Number.parseInt(process.env.PDF_TO_JPG_TIMEOUT_MS || '600000', 10);
const QUALITY_DEFAULT = 90;
const QUALITY_MIN = 1;
const QUALITY_MAX = 100;
const DPI_DEFAULT = 150;
const DPI_MIN = 72;
const DPI_MAX = 600;

const isPdfBuffer = (buffer) => {
  if (!buffer || buffer.length < 5) {
    return false;
  }

  return buffer.subarray(0, 5).toString('utf8') === '%PDF-';
};

const getPdfPageCount = async (pdfBuffer) => {
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer, {
      ignoreEncryption: false,
      updateMetadata: false,
    });
    const pageCount = pdfDoc.getPageCount();
    if (!Number.isInteger(pageCount) || pageCount < 1) {
      throw new Error('The source PDF has no pages');
    }
    return pageCount;
  } catch (error) {
    throw new Error(`Unable to read PDF page count. ${error?.message || 'Invalid PDF file.'}`);
  }
};

export const processPdfToJpg = async (jobData) => {
  const {
    jobId,
    fileUrl,
    quality,
    dpi,
    originalName = 'document.pdf',
  } = jobData;
  const normalizedQuality = clampInteger(quality, QUALITY_MIN, QUALITY_MAX, QUALITY_DEFAULT);
  const normalizedDpi = clampInteger(dpi, DPI_MIN, DPI_MAX, DPI_DEFAULT);
  let tempDir = null;
  
  logger.info(
    `Starting PDF to JPG: ${jobId}, quality: ${normalizedQuality}, dpi: ${normalizedDpi}`
  );
  
  try {
    await updateJobStatus(jobId, 'processing');
    
    const pdfBuffer = await downloadFile(fileUrl);

    if (!isPdfBuffer(pdfBuffer)) {
      throw new Error('Uploaded file is not a valid PDF document.');
    }

    const pageCount = await getPdfPageCount(pdfBuffer);
    const { ghostscriptPath } = await ensureGhostscriptDependency();

    if (!ghostscriptPath) {
      throw new Error('Ghostscript is not available to convert PDF pages.');
    }

    tempDir = await createTempWorkspace('editfile-pdf-to-jpg-');
    const inputPath = path.join(tempDir, 'input.pdf');
    const outputPattern = path.join(tempDir, 'page-%04d.jpg');
    await fs.writeFile(inputPath, pdfBuffer);

    await runCliCommand(
      ghostscriptPath,
      [
        '-sDEVICE=jpeg',
        '-dSAFER',
        '-dBATCH',
        '-dNOPAUSE',
        '-dNOPROMPT',
        '-dTextAlphaBits=4',
        '-dGraphicsAlphaBits=4',
        '-dUseCropBox',
        `-dJPEGQ=${normalizedQuality}`,
        `-r${normalizedDpi}`,
        `-sOutputFile=${outputPattern}`,
        inputPath,
      ],
      {
        timeoutMs: PDF_TO_JPG_TIMEOUT_MS,
        captureStdout: false,
      }
    );

    const generatedEntries = await fs.readdir(tempDir, { withFileTypes: true });
    const generatedImageNames = generatedEntries
      .filter((entry) => entry.isFile() && /^page-\d{4}\.jpg$/i.test(entry.name))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    if (generatedImageNames.length === 0) {
      throw new Error('PDF conversion produced no JPG output files.');
    }

    if (generatedImageNames.length !== pageCount) {
      logger.warn(
        `PDF to JPG page mismatch for job ${jobId}: expected ${pageCount}, got ${generatedImageNames.length}`
      );
    }

    const safeBaseName = getBaseName(originalName, 'document');
    const pageLabelWidth = Math.max(String(generatedImageNames.length).length, 2);
    const processedFiles = [];

    for (let index = 0; index < generatedImageNames.length; index++) {
      const imageName = generatedImageNames[index];
      const imagePath = path.join(tempDir, imageName);
      const imageBuffer = await fs.readFile(imagePath);

      if (!imageBuffer || imageBuffer.length === 0) {
        throw new Error(`Generated image for page ${index + 1} is empty.`);
      }

      const outputName =
        generatedImageNames.length === 1
          ? `${safeBaseName}.jpg`
          : `${safeBaseName}-page-${String(index + 1).padStart(pageLabelWidth, '0')}.jpg`;

      processedFiles.push({
        fileName: outputName,
        contentType: 'image/jpeg',
        buffer: imageBuffer,
      });
    }

    const { outputUrl, outputBuffer, outputFileName, outputContentType } = await uploadProcessedFiles({
      jobId,
      files: processedFiles,
      fallbackBaseName: `${safeBaseName}-pages`,
    });

    await completeJob(jobId, outputUrl, outputBuffer.length);
    await updateJobStatus(jobId, 'completed', {
      metadata: {
        originalName,
        quality: normalizedQuality,
        dpi: normalizedDpi,
        pageCount: processedFiles.length,
        outputType: outputContentType,
        outputFileName,
        files: processedFiles.map((file, index) => ({
          page: index + 1,
          fileName: file.fileName,
        })),
      },
    });

    logger.info(
      `PDF to JPG completed: ${jobId}, pages: ${processedFiles.length}, output: ${outputContentType}`
    );
    
    return {
      success: true,
      jobId,
      pageCount: processedFiles.length,
      outputType: outputContentType,
      outputFileName,
      outputSize: outputBuffer.length,
      outputUrl,
    };
    
  } catch (error) {
    logger.error(`PDF to JPG failed for job ${jobId}:`, error);
    await failJob(jobId, error.message);
    throw error;
  } finally {
    if (tempDir) {
      await removePathSafe(tempDir);
    }
  }
};

export default { processPdfToJpg };
