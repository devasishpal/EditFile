import fs from 'fs/promises';
import path from 'path';
import { uploadFile, generateS3Key, downloadFile } from '../../config/s3.js';
import { updateJobStatus, completeJob, failJob } from '../../services/database.service.js';
import { logger } from '../../utils/logger.js';
import { ensurePdfCliDependencies, runCliCommand } from '../../utils/pdf-cli.js';
import { createTempWorkspace, removePathSafe } from '../../utils/workspace.js';
import { buildFileName } from '../../utils/file-name.js';

const MERGE_TIMEOUT_MS = Number.parseInt(process.env.MERGE_PDF_TIMEOUT_MS || '600000', 10);

const isPdfBuffer = (buffer) => {
  if (!buffer || buffer.length < 5) {
    return false;
  }
  return buffer.subarray(0, 5).toString('utf8') === '%PDF-';
};

const readNumberOfPages = (text) => {
  const match = String(text || '').match(/NumberOfPages:\s*(\d+)/i);
  if (!match) {
    return null;
  }

  const value = Number.parseInt(match[1], 10);
  return Number.isInteger(value) && value > 0 ? value : null;
};

const getPdfPageCount = async (pdftkPath, inputPath) => {
  const dumpCommands = ['dump_data_utf8', 'dump_data'];
  let lastError = null;

  for (const dumpCommand of dumpCommands) {
    try {
      const { stdout } = await runCliCommand(pdftkPath, [inputPath, dumpCommand], {
        timeoutMs: MERGE_TIMEOUT_MS,
      });
      const pageCount = readNumberOfPages(stdout);
      if (pageCount) {
        return pageCount;
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`Unable to read page count using PDFtk. ${lastError?.message || ''}`.trim());
};

const runMergeWithPdftk = async (pdftkPath, inputPaths, outputPath) => {
  const args = [...inputPaths, 'cat', 'output', outputPath];
  await runCliCommand(pdftkPath, args, { timeoutMs: MERGE_TIMEOUT_MS });
};

const runMergeWithGhostscript = async (ghostscriptPath, inputPaths, outputPath) => {
  const args = [
    '-dBATCH',
    '-dNOPAUSE',
    '-q',
    '-sDEVICE=pdfwrite',
    `-sOutputFile=${outputPath}`,
    ...inputPaths,
  ];
  await runCliCommand(ghostscriptPath, args, { timeoutMs: MERGE_TIMEOUT_MS });
};

export const processMergePdf = async (jobData) => {
  const { jobId, fileUrls, originalNames } = jobData;

  logger.info(`Starting PDF merge: ${jobId}, files: ${fileUrls?.length || 0}`);

  if (!Array.isArray(fileUrls) || fileUrls.length < 2) {
    throw new Error('At least two PDF files are required to merge');
  }

  let tempDir = null;

  try {
    await updateJobStatus(jobId, 'processing');

    const { pdftkPath, ghostscriptPath } = await ensurePdfCliDependencies();

    tempDir = await createTempWorkspace('editfile-merge-');
    const inputPaths = [];
    const mergedFiles = [];
    let totalInputSize = 0;
    let totalPages = 0;

    for (let index = 0; index < fileUrls.length; index++) {
      const fileData = fileUrls[index];
      const fileName = String(fileData?.name || `file-${index + 1}.pdf`);
      const pdfBuffer = await downloadFile(fileData.url);

      if (!isPdfBuffer(pdfBuffer)) {
        throw new Error(`Only valid PDF files are allowed. "${fileName}" is not a valid PDF.`);
      }

      const inputPath = path.join(
        tempDir,
        `input-${String(index + 1).padStart(3, '0')}.pdf`
      );
      await fs.writeFile(inputPath, pdfBuffer);
      inputPaths.push(inputPath);
      totalInputSize += pdfBuffer.length;

      const pageCount = await getPdfPageCount(pdftkPath, inputPath);
      totalPages += pageCount;

      mergedFiles.push({
        name: fileName,
        size: fileData?.size || pdfBuffer.length,
        pageCount,
        order: index + 1,
      });
    }

    const outputPath = path.join(tempDir, 'merged.pdf');
    const mergeEngine = pdftkPath ? 'pdftk' : 'ghostscript';

    if (pdftkPath) {
      await runMergeWithPdftk(pdftkPath, inputPaths, outputPath);
    } else if (ghostscriptPath) {
      await runMergeWithGhostscript(ghostscriptPath, inputPaths, outputPath);
    } else {
      throw new Error('Neither PDFtk nor Ghostscript is available to merge PDFs.');
    }

    const mergedBuffer = await fs.readFile(outputPath);
    if (!mergedBuffer || mergedBuffer.length === 0) {
      throw new Error('Merged PDF generation failed.');
    }

    const primaryOriginalName =
      (Array.isArray(originalNames) && originalNames[0]) ||
      fileUrls[0]?.name ||
      'merged.pdf';
    const outputFileName = buildFileName({
      originalName: primaryOriginalName,
      extension: 'pdf',
      fallbackBase: 'merged',
      useOutputSuffix: true,
    });
    const outputKey = generateS3Key(jobId, outputFileName, 'outputs');
    const outputUrl = await uploadFile(mergedBuffer, outputKey, 'application/pdf');

    await completeJob(jobId, outputUrl, mergedBuffer.length);
    await updateJobStatus(jobId, 'completed', {
      metadata: {
        fileCount: fileUrls.length,
        totalPages,
        totalInputSize,
        outputFileName,
        mergeEngine,
        files: mergedFiles,
      },
    });

    logger.info(`PDF merge completed: ${jobId}, pages: ${totalPages}, engine: ${mergeEngine}`);

    return {
      success: true,
      jobId,
      fileCount: fileUrls.length,
      totalPages,
      totalInputSize,
      outputSize: mergedBuffer.length,
      outputUrl,
      mergeEngine,
    };
  } catch (error) {
    logger.error(`PDF merge failed for job ${jobId}:`, error);
    await failJob(jobId, error.message);
    throw error;
  } finally {
    if (tempDir) {
      await removePathSafe(tempDir);
    }
  }
};

export default { processMergePdf };
