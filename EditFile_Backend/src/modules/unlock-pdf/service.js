import fs from 'fs/promises';
import path from 'path';
import { uploadFile, generateS3Key, downloadFile } from '../../config/s3.js';
import { updateJobStatus, completeJob, failJob } from '../../services/database.service.js';
import { logger } from '../../utils/logger.js';
import { ensurePdftkDependency, runCliCommand } from '../../utils/pdf-cli.js';
import { createTempWorkspace, removePathSafe } from '../../utils/workspace.js';
import { buildFileName } from '../../utils/file-name.js';

const UNLOCK_TIMEOUT_MS = Number.parseInt(
  process.env.UNLOCK_PDF_TIMEOUT_MS || '600000',
  10
);

export const processUnlockPdf = async (jobData) => {
  const { jobId, fileUrl, password, originalName = 'document.pdf' } = jobData;
  let tempDir = null;

  logger.info(`Starting PDF unlock: ${jobId}`);

  try {
    await updateJobStatus(jobId, 'processing');

    if (!password || typeof password !== 'string') {
      throw new Error('Password is required to unlock the PDF.');
    }

    const { pdftkPath } = await ensurePdftkDependency();
    if (!pdftkPath) {
      throw new Error('PDFtk is not available to unlock PDF files.');
    }

    tempDir = await createTempWorkspace('editfile-unlock-');
    const inputPath = path.join(tempDir, 'input.pdf');
    const outputPath = path.join(tempDir, 'unlocked.pdf');

    const pdfBuffer = await downloadFile(fileUrl);
    await fs.writeFile(inputPath, pdfBuffer);

    await runCliCommand(
      pdftkPath,
      [inputPath, 'input_pw', password, 'output', outputPath],
      { timeoutMs: UNLOCK_TIMEOUT_MS }
    );

    const unlockedBuffer = await fs.readFile(outputPath);
    if (!unlockedBuffer || unlockedBuffer.length === 0) {
      throw new Error('Unlocked PDF generation failed.');
    }

    const outputFileName = buildFileName({
      originalName,
      extension: 'pdf',
      fallbackBase: 'document',
    });
    const outputKey = generateS3Key(jobId, outputFileName, 'output');
    const outputUrl = await uploadFile(unlockedBuffer, outputKey, 'application/pdf');

    await completeJob(jobId, outputUrl, unlockedBuffer.length);
    await updateJobStatus(jobId, 'completed', {
      metadata: {
        outputFileName,
      },
    });
    
    logger.info(`PDF unlock completed: ${jobId}`);
    
    return {
      success: true,
      jobId,
      outputSize: unlockedBuffer.length,
      outputUrl,
    };
    
  } catch (error) {
    logger.error(`PDF unlock failed for job ${jobId}:`, error);
    const normalizedMessage = String(error?.message || '');
    const wrongPassword = normalizedMessage.toLowerCase().includes('owner password')
      || normalizedMessage.toLowerCase().includes('incorrect password')
      || normalizedMessage.toLowerCase().includes('invalid password')
      || normalizedMessage.toLowerCase().includes('encryption dictionary');
    await failJob(
      jobId,
      wrongPassword ? 'Invalid password or unsupported encrypted PDF.' : normalizedMessage
    );
    throw error;
  } finally {
    if (tempDir) {
      await removePathSafe(tempDir);
    }
  }
};

export default { processUnlockPdf };
