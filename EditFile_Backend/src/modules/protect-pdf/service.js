import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { uploadFile, generateS3Key, downloadFile } from '../../config/s3.js';
import { updateJobStatus, completeJob, failJob } from '../../services/database.service.js';
import { logger } from '../../utils/logger.js';
import { ensurePdftkDependency, runCliCommand } from '../../utils/pdf-cli.js';
import { createTempWorkspace, removePathSafe } from '../../utils/workspace.js';

const PROTECT_TIMEOUT_MS = Number.parseInt(
  process.env.PROTECT_PDF_TIMEOUT_MS || '600000',
  10
);

const toPdftkAllowFlags = (permissions = {}) => {
  const allowFlags = [];

  if (permissions.printing) {
    allowFlags.push('Printing');
  }

  if (permissions.copying) {
    allowFlags.push('CopyContents');
  }

  if (permissions.modifying) {
    allowFlags.push('ModifyContents', 'ModifyAnnotations', 'FillIn', 'Assembly');
  }

  return [...new Set(allowFlags)];
};

export const processProtectPdf = async (jobData) => {
  const { jobId, fileUrl, password, permissions } = jobData;
  let tempDir = null;

  logger.info(`Starting PDF protection: ${jobId}`);

  try {
    await updateJobStatus(jobId, 'processing');

    if (!password || typeof password !== 'string') {
      throw new Error('Password is required to protect the PDF.');
    }

    const { pdftkPath } = await ensurePdftkDependency();
    if (!pdftkPath) {
      throw new Error('PDFtk is not available to protect PDF files.');
    }

    tempDir = await createTempWorkspace('editfile-protect-');
    const inputPath = path.join(tempDir, 'input.pdf');
    const outputPath = path.join(tempDir, 'protected.pdf');

    const pdfBuffer = await downloadFile(fileUrl);
    await fs.writeFile(inputPath, pdfBuffer);

    const ownerPassword = crypto.randomBytes(24).toString('base64url');
    const allowFlags = toPdftkAllowFlags(permissions);
    const args = [
      inputPath,
      'output',
      outputPath,
      'user_pw',
      password,
      'owner_pw',
      ownerPassword,
    ];

    if (allowFlags.length > 0) {
      args.push('allow', ...allowFlags);
    }

    await runCliCommand(pdftkPath, args, { timeoutMs: PROTECT_TIMEOUT_MS });
    const protectedBuffer = await fs.readFile(outputPath);

    if (!protectedBuffer || protectedBuffer.length === 0) {
      throw new Error('Protected PDF generation failed.');
    }

    const outputFileName = 'protected.pdf';
    const outputKey = generateS3Key(jobId, 'protected.pdf', 'output');
    const outputUrl = await uploadFile(protectedBuffer, outputKey, 'application/pdf');

    await completeJob(jobId, outputUrl, protectedBuffer.length);
    await updateJobStatus(jobId, 'completed', {
      metadata: {
        outputFileName,
        permissions: {
          printing: Boolean(permissions?.printing),
          copying: Boolean(permissions?.copying),
          modifying: Boolean(permissions?.modifying),
        },
      },
    });
    
    logger.info(`PDF protection completed: ${jobId}`);
    
    return {
      success: true,
      jobId,
      outputSize: protectedBuffer.length,
      outputUrl,
    };
    
  } catch (error) {
    logger.error(`PDF protection failed for job ${jobId}:`, error);
    await failJob(jobId, error.message);
    throw error;
  } finally {
    if (tempDir) {
      await removePathSafe(tempDir);
    }
  }
};

export default { processProtectPdf };
