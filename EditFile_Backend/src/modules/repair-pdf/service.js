import fs from 'fs/promises';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import { uploadFile, generateS3Key, downloadFile } from '../../config/s3.js';
import { updateJobStatus, completeJob, failJob } from '../../services/database.service.js';
import { logger } from '../../utils/logger.js';
import { ensureGhostscriptDependency, runCliCommand } from '../../utils/pdf-cli.js';
import { createTempWorkspace, removePathSafe } from '../../utils/workspace.js';

const REPAIR_TIMEOUT_MS = Number.parseInt(process.env.REPAIR_PDF_TIMEOUT_MS || '600000', 10);

const isPdfBuffer = (buffer) => {
  if (!buffer || buffer.length < 5) {
    return false;
  }

  return buffer.subarray(0, 5).toString('utf8') === '%PDF-';
};

const detectLikelyCorruption = async (buffer) => {
  try {
    await PDFDocument.load(buffer, {
      ignoreEncryption: false,
      updateMetadata: false,
    });
    return false;
  } catch {
    return true;
  }
};

export const processRepairPdf = async (jobData) => {
  const { jobId, fileUrl } = jobData;
  let tempDir = null;

  logger.info(`Starting PDF repair: ${jobId}`);

  try {
    await updateJobStatus(jobId, 'processing');

    const { ghostscriptPath } = await ensureGhostscriptDependency();
    if (!ghostscriptPath) {
      throw new Error('Ghostscript is not available to repair PDFs.');
    }

    const sourceBuffer = await downloadFile(fileUrl);
    if (!isPdfBuffer(sourceBuffer)) {
      throw new Error('Uploaded file is not a valid PDF document.');
    }

    const detectedCorruption = await detectLikelyCorruption(sourceBuffer);

    tempDir = await createTempWorkspace('editfile-repair-');
    const inputPath = path.join(tempDir, 'input.pdf');
    const outputPath = path.join(tempDir, 'repaired.pdf');

    await fs.writeFile(inputPath, sourceBuffer);

    await runCliCommand(
      ghostscriptPath,
      [
        '-sDEVICE=pdfwrite',
        '-dNOPAUSE',
        '-dBATCH',
        '-dSAFER',
        '-dAutoRotatePages=/None',
        `-sOutputFile=${outputPath}`,
        inputPath,
      ],
      { timeoutMs: REPAIR_TIMEOUT_MS }
    );

    const repairedBuffer = await fs.readFile(outputPath);
    if (!isPdfBuffer(repairedBuffer)) {
      throw new Error('Unable to create a repaired PDF output.');
    }

    const outputFileName = 'repaired.pdf';
    const outputKey = generateS3Key(jobId, outputFileName, 'output');
    const outputUrl = await uploadFile(repairedBuffer, outputKey, 'application/pdf');

    await completeJob(jobId, outputUrl, repairedBuffer.length);
    await updateJobStatus(jobId, 'completed', {
      metadata: {
        outputFileName,
        repairEngine: 'ghostscript',
        detectedCorruption,
      },
    });

    logger.info(`PDF repair completed: ${jobId}`);

    return {
      success: true,
      jobId,
      outputSize: repairedBuffer.length,
      outputUrl,
      detectedCorruption,
    };
  } catch (error) {
    logger.error(`PDF repair failed for job ${jobId}:`, error);
    await failJob(jobId, error.message);
    throw error;
  } finally {
    if (tempDir) {
      await removePathSafe(tempDir);
    }
  }
};

export default { processRepairPdf };
