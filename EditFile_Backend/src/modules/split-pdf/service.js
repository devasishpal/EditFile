import fs from 'fs/promises';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import { uploadFile, generateS3Key, downloadFile } from '../../config/s3.js';
import { updateJobStatus, completeJob, failJob } from '../../services/database.service.js';
import { logger } from '../../utils/logger.js';
import { createZipBuffer } from '../../utils/zip.js';
import { createTempWorkspace, removePathSafe } from '../../utils/workspace.js';
import {
  ensurePdfCliDependencies,
  ensureGhostscriptDependency,
  runCliCommand,
} from '../../utils/pdf-cli.js';

const SPLIT_TIMEOUT_MS = Number.parseInt(process.env.SPLIT_PDF_TIMEOUT_MS || '600000', 10);
const YIELD_EVERY_OUTPUTS = 10;

const normalizeSplitMethod = (value) => {
  const method = String(value || 'range').trim().toLowerCase();
  return ['range', 'every', 'extract'].includes(method) ? method : 'range';
};

const yieldToEventLoop = async () =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

const isPdfBuffer = (buffer) => {
  if (!buffer || buffer.length < 5) {
    return false;
  }
  return buffer.subarray(0, 5).toString('utf8') === '%PDF-';
};

const getBaseName = (filename) => {
  const raw = String(filename || 'document.pdf').trim();
  const withoutExtension = raw.replace(/\.[^/.]+$/, '');
  const sanitized = withoutExtension
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '-')
    .replace(/_+/g, '_')
    .replace(/-+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 80);
  return sanitized || 'document';
};

const splitTokens = (pageSpec) =>
  String(pageSpec || '')
    .split(/[\n\r,;]+/)
    .map((token) => token.trim())
    .filter(Boolean);

const parseTokenToPages = (token, totalPages) => {
  const compact = String(token || '').replace(/\s+/g, '');
  if (!compact) {
    throw new Error('Invalid empty page token');
  }

  if (compact.includes('-')) {
    const [rawStart, rawEnd, ...rest] = compact.split('-');
    if (rest.length > 0 || !rawStart || !rawEnd) {
      throw new Error(`Invalid page range token "${token}"`);
    }

    const start = Number.parseInt(rawStart, 10);
    const end = Number.parseInt(rawEnd, 10);

    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < 1) {
      throw new Error(`Invalid page range token "${token}"`);
    }

    const normalizedStart = Math.min(start, end);
    const normalizedEnd = Math.max(start, end);

    if (normalizedStart > totalPages || normalizedEnd > totalPages) {
      throw new Error(`Page range "${token}" exceeds total pages (${totalPages})`);
    }

    const pages = [];
    for (let page = normalizedStart; page <= normalizedEnd; page++) {
      pages.push(page);
    }
    return pages;
  }

  const page = Number.parseInt(compact, 10);
  if (!Number.isInteger(page) || page < 1 || page > totalPages) {
    throw new Error(`Invalid page "${token}" for document with ${totalPages} pages`);
  }

  return [page];
};

const toRangeSpec = (pages) => {
  if (!Array.isArray(pages) || pages.length === 0) {
    throw new Error('No pages specified');
  }

  if (pages.length === 1) {
    return String(pages[0]);
  }

  return `${pages[0]}-${pages[pages.length - 1]}`;
};

const buildRangeGroups = (pageRange, totalPages) => {
  const tokens = splitTokens(pageRange);
  if (tokens.length === 0) {
    throw new Error('At least one page range is required');
  }

  return tokens.map((token) => {
    const pages = parseTokenToPages(token, totalPages);
    return {
      label: token.replace(/\s+/g, ''),
      pages,
      pageSpec: toRangeSpec(pages),
    };
  });
};

const buildExtractSelection = (pageRange, totalPages) => {
  const tokens = splitTokens(pageRange);
  if (tokens.length === 0) {
    throw new Error('At least one page is required for extract mode');
  }

  const segments = tokens.map((token) => {
    const pages = parseTokenToPages(token, totalPages);
    return {
      label: token.replace(/\s+/g, ''),
      startPage: pages[0],
      endPage: pages[pages.length - 1],
      pageCount: pages.length,
    };
  });

  if (segments.length === 0) {
    throw new Error('No valid pages selected');
  }

  const totalSelectedPages = segments.reduce((total, segment) => total + segment.pageCount, 0);

  return {
    segments,
    totalSelectedPages,
  };
};

const buildEveryGroups = (pageRange, totalPages) => {
  const raw = String(pageRange || '').trim();
  const chunkSize = raw ? Number.parseInt(raw, 10) : 1;

  if (!Number.isInteger(chunkSize) || chunkSize < 1) {
    throw new Error('For splitMethod=every, pageRange must be a positive integer or empty');
  }

  const groups = [];
  for (let start = 1; start <= totalPages; start += chunkSize) {
    const end = Math.min(start + chunkSize - 1, totalPages);
    const pages = [];
    for (let page = start; page <= end; page++) {
      pages.push(page);
    }

    groups.push({
      label: `${start}-${end}`,
      pages,
      pageSpec: `${start}-${end}`,
    });
  }

  return { groups, chunkSize };
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

const runPdftkExtract = async (pdftkPath, inputPath, pageSpec, outputPath) => {
  if (!pageSpec) {
    throw new Error('Missing page specification for split output.');
  }

  const pageArgs = Array.isArray(pageSpec)
    ? pageSpec.map((item) => String(item).trim()).filter(Boolean)
    : String(pageSpec)
        .split(/\s+/)
        .map((item) => item.trim())
        .filter(Boolean);

  if (pageArgs.length === 0) {
    throw new Error('Missing page specification for split output.');
  }

  await runCliCommand(pdftkPath, [inputPath, 'cat', ...pageArgs, 'output', outputPath], {
    timeoutMs: SPLIT_TIMEOUT_MS,
  });
};

const runGhostscriptExtract = async (ghostscriptPath, inputPath, outputPath, firstPage, lastPage) => {
  await runCliCommand(
    ghostscriptPath,
    [
      '-sDEVICE=pdfwrite',
      '-dNOPAUSE',
      '-dBATCH',
      '-dSAFER',
      `-dFirstPage=${firstPage}`,
      `-dLastPage=${lastPage}`,
      `-sOutputFile=${outputPath}`,
      inputPath,
    ],
    {
      timeoutMs: SPLIT_TIMEOUT_MS,
    }
  );
};

const runGhostscriptMerge = async (ghostscriptPath, inputPaths, outputPath) => {
  if (!Array.isArray(inputPaths) || inputPaths.length === 0) {
    throw new Error('No extracted files available for merge.');
  }

  await runCliCommand(
    ghostscriptPath,
    [
      '-sDEVICE=pdfwrite',
      '-dNOPAUSE',
      '-dBATCH',
      '-dSAFER',
      `-sOutputFile=${outputPath}`,
      ...inputPaths,
    ],
    {
      timeoutMs: SPLIT_TIMEOUT_MS,
    }
  );
};

export const processSplitPdf = async (jobData) => {
  const {
    jobId,
    fileUrl,
    pageRange = '',
    splitMethod: rawSplitMethod,
    originalName = 'split.pdf',
  } = jobData;
  const splitMethod = normalizeSplitMethod(rawSplitMethod);

  logger.info(
    `Starting PDF split: ${jobId}, method: ${splitMethod}, range: ${pageRange || 'n/a'}`
  );

  let tempDir = null;

  try {
    await updateJobStatus(jobId, 'processing');

    tempDir = await createTempWorkspace('editfile-split-');
    const inputPath = path.join(tempDir, 'input.pdf');
    const sourceBuffer = await downloadFile(fileUrl);

    if (!isPdfBuffer(sourceBuffer)) {
      throw new Error('Uploaded file is not a valid PDF document.');
    }

    await fs.writeFile(inputPath, sourceBuffer);

    const totalPages = await getPdfPageCount(sourceBuffer);
    if (totalPages < 1) {
      throw new Error('The source PDF has no pages');
    }

    let pdftkPath = null;
    let ghostscriptPath = null;

    if (splitMethod === 'extract') {
      const ghostscriptDependency = await ensureGhostscriptDependency();
      ghostscriptPath = ghostscriptDependency.ghostscriptPath;
      if (!ghostscriptPath) {
        throw new Error('Ghostscript is not available to extract PDF pages.');
      }
    } else {
      const dependencies = await ensurePdfCliDependencies();
      pdftkPath = dependencies.pdftkPath;
      if (!pdftkPath) {
        throw new Error('PDFtk is not available to split PDF files.');
      }
    }

    const baseName = getBaseName(originalName);
    const splitOutputs = [];
    let chunkSize = null;

    if (splitMethod === 'extract') {
      const extractSelection = buildExtractSelection(pageRange, totalPages);
      for (let i = 0; i < extractSelection.segments.length; i++) {
        const segment = extractSelection.segments[i];
        const rangeLabel =
          segment.startPage === segment.endPage
            ? `page-${segment.startPage}`
            : `pages-${segment.startPage}-${segment.endPage}`;
        const outputFileName = `${baseName}-${rangeLabel}.pdf`;
        const outputPath = path.join(tempDir, `extract-${String(i + 1).padStart(4, '0')}.pdf`);

        await runGhostscriptExtract(
          ghostscriptPath,
          inputPath,
          outputPath,
          segment.startPage,
          segment.endPage
        );

        const outputBuffer = await fs.readFile(outputPath);
        splitOutputs.push({
          fileName: outputFileName,
          buffer: outputBuffer,
          pageCount: segment.pageCount,
          fromPage: segment.startPage,
          toPage: segment.endPage,
          sourceToken: segment.label,
        });

        if ((i + 1) % YIELD_EVERY_OUTPUTS === 0) {
          await yieldToEventLoop();
        }
      }
    } else if (splitMethod === 'every') {
      const everyResult = buildEveryGroups(pageRange, totalPages);
      chunkSize = everyResult.chunkSize;

      for (let i = 0; i < everyResult.groups.length; i++) {
        const group = everyResult.groups[i];
        const startPage = group.pages[0];
        const endPage = group.pages[group.pages.length - 1];

        const outputFileName =
          group.pages.length === 1
            ? `${baseName}-page-${startPage}.pdf`
            : `${baseName}-pages-${startPage}-${endPage}.pdf`;
        const outputPath = path.join(tempDir, outputFileName);

        await runPdftkExtract(pdftkPath, inputPath, group.pageSpec, outputPath);
        const outputBuffer = await fs.readFile(outputPath);

        splitOutputs.push({
          fileName: outputFileName,
          buffer: outputBuffer,
          pageCount: group.pages.length,
          fromPage: startPage,
          toPage: endPage,
        });

        if ((i + 1) % YIELD_EVERY_OUTPUTS === 0) {
          await yieldToEventLoop();
        }
      }
    } else {
      const groups = buildRangeGroups(pageRange, totalPages);

      for (let i = 0; i < groups.length; i++) {
        const group = groups[i];
        const startPage = group.pages[0];
        const endPage = group.pages[group.pages.length - 1];

        const outputFileName =
          group.pages.length === 1
            ? `${baseName}-page-${startPage}.pdf`
            : `${baseName}-pages-${startPage}-${endPage}.pdf`;
        const outputPath = path.join(tempDir, outputFileName);

        await runPdftkExtract(pdftkPath, inputPath, group.pageSpec, outputPath);
        const outputBuffer = await fs.readFile(outputPath);

        splitOutputs.push({
          fileName: outputFileName,
          buffer: outputBuffer,
          pageCount: group.pages.length,
          fromPage: startPage,
          toPage: endPage,
          sourceToken: group.label,
        });

        if ((i + 1) % YIELD_EVERY_OUTPUTS === 0) {
          await yieldToEventLoop();
        }
      }
    }

    if (splitOutputs.length === 0) {
      throw new Error('No output PDF was generated');
    }

    const outputBuffer = createZipBuffer(
      splitOutputs.map((item) => ({
        name: item.fileName,
        data: item.buffer,
      }))
    );
    const outputFileName = `${baseName}-split.zip`;
    const outputContentType = 'application/zip';

    const outputKey = generateS3Key(jobId, outputFileName, 'outputs');
    const outputUrl = await uploadFile(outputBuffer, outputKey, outputContentType);

    await completeJob(jobId, outputUrl, outputBuffer.length);
    await updateJobStatus(jobId, 'completed', {
      metadata: {
        splitMethod,
        pageRange,
        totalPages,
        outputType: outputContentType,
        outputFileName,
        chunkSize,
        files: splitOutputs.map((item) => ({
          fileName: item.fileName,
          pageCount: item.pageCount,
          fromPage: item.fromPage,
          toPage: item.toPage,
          sourceToken: item.sourceToken || null,
        })),
      },
    });

    logger.info(
      `PDF split completed: ${jobId}, outputs: ${splitOutputs.length}, type: ${outputContentType}`
    );

    return {
      success: true,
      jobId,
      splitMethod,
      totalPages,
      outputFiles: splitOutputs.length,
      outputType: outputContentType,
      outputFileName,
      outputSize: outputBuffer.length,
      outputUrl,
    };
  } catch (error) {
    logger.error(`PDF split failed for job ${jobId}:`, error);
    await failJob(jobId, error.message);
    throw error;
  } finally {
    if (tempDir) {
      await removePathSafe(tempDir);
    }
  }
};

export default { processSplitPdf };
