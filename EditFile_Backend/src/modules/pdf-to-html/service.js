import fs from 'fs/promises';
import path from 'path';
import { downloadFile, uploadFile, generateS3Key } from '../../config/s3.js';
import { updateJobStatus, completeJob, failJob } from '../../services/database.service.js';
import { logger } from '../../utils/logger.js';
import { runCliCommand } from '../../utils/pdf-cli.js';
import { ensurePdf2HtmlDependency, getPdf2HtmlTimeout } from '../../utils/pdf2html.js';
import { createTempWorkspace, removePathSafe } from '../../utils/workspace.js';
import { buildFileName } from '../../utils/file-name.js';

const PDF_SIGNATURE = '%PDF-';

const isPdfBuffer = (buffer) =>
  Boolean(buffer?.length >= PDF_SIGNATURE.length)
  && buffer.subarray(0, PDF_SIGNATURE.length).toString('utf8') === PDF_SIGNATURE;

const resolveHtmlOutputPath = async (workspacePath, fallbackFileName) => {
  const primaryPath = path.join(workspacePath, fallbackFileName);
  try {
    await fs.access(primaryPath);
    return primaryPath;
  } catch {
    // Continue to scan for an HTML file.
  }

  const entries = await fs.readdir(workspacePath, { withFileTypes: true });
  const htmlFiles = entries
    .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === '.html')
    .map((entry) => entry.name);

  if (htmlFiles.length === 0) {
    throw new Error('pdf2htmlEX did not generate an HTML output file.');
  }

  if (htmlFiles.length === 1) {
    return path.join(workspacePath, htmlFiles[0]);
  }

  const withStats = await Promise.all(
    htmlFiles.map(async (name) => {
      const absolutePath = path.join(workspacePath, name);
      const stats = await fs.stat(absolutePath);
      return {
        absolutePath,
        mtimeMs: stats.mtimeMs,
      };
    })
  );

  withStats.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return withStats[0].absolutePath;
};

export const processPdfToHtml = async (jobData) => {
  const { jobId, fileUrl, originalName = 'document.pdf' } = jobData;
  let tempDir = null;

  logger.info(`Starting PDF to HTML conversion: ${jobId}`);

  try {
    await updateJobStatus(jobId, 'processing');

    const { binaryPath } = await ensurePdf2HtmlDependency();
    const pdfBuffer = await downloadFile(fileUrl);

    if (!isPdfBuffer(pdfBuffer)) {
      throw new Error('Uploaded file is not a valid PDF document.');
    }

    tempDir = await createTempWorkspace('editfile-pdf-to-html-');
    const inputPath = path.join(tempDir, 'input.pdf');
    const outputFileName = 'output.html';

    await fs.writeFile(inputPath, pdfBuffer);

    const args = [
      '--embed-css',
      '1',
      '--embed-font',
      '1',
      '--embed-image',
      '1',
      '--embed-javascript',
      '1',
      '--embed-outline',
      '1',
      '--split-pages',
      '0',
      '--dest-dir',
      tempDir,
      inputPath,
      outputFileName,
    ];

    await runCliCommand(binaryPath || 'pdf2htmlEX', args, {
      timeoutMs: getPdf2HtmlTimeout(),
      captureStdout: false,
    });

    const outputPath = await resolveHtmlOutputPath(tempDir, outputFileName);
    const outputBuffer = await fs.readFile(outputPath);

    if (!outputBuffer?.length) {
      throw new Error('PDF to HTML conversion produced an empty output file.');
    }

    const finalFileName = buildFileName({
      originalName,
      extension: 'html',
      fallbackBase: 'document',
    });
    const outputKey = generateS3Key(jobId, finalFileName, 'output');
    const outputUrl = await uploadFile(
      outputBuffer,
      outputKey,
      'text/html; charset=utf-8'
    );

    await completeJob(jobId, outputUrl, outputBuffer.length);
    await updateJobStatus(jobId, 'completed', {
      metadata: {
        originalName,
        outputFileName: finalFileName,
        conversionEngine: 'pdf2htmlEX',
      },
    });

    logger.info(`PDF to HTML completed: ${jobId}`);

    return {
      success: true,
      jobId,
      outputUrl,
      outputSize: outputBuffer.length,
      outputFileName: finalFileName,
    };
  } catch (error) {
    logger.error(`PDF to HTML failed for job ${jobId}:`, error);
    await failJob(jobId, error.message || 'Conversion failed');
    throw error;
  } finally {
    if (tempDir) {
      await removePathSafe(tempDir);
    }
  }
};

export default { processPdfToHtml };
