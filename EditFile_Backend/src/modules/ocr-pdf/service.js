import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { PDFDocument } from 'pdf-lib';
import Tesseract from 'tesseract.js';
import { uploadFile, generateS3Key, downloadFile, deleteFile } from '../../config/s3.js';
import { updateJobStatus, failJob } from '../../services/database.service.js';
import { logger } from '../../utils/logger.js';
import { createTempWorkspace, STORAGE_DIR } from '../../utils/workspace.js';
import { mapWithConcurrency, resolveConcurrency } from '../../utils/concurrency.js';

const OCR_DPI = Number.parseInt(process.env.OCR_DPI || '220', 10);
const OCR_COMMAND_TIMEOUT_MS = Number.parseInt(process.env.OCR_COMMAND_TIMEOUT_MS || '180000', 10);
const OCR_PAGE_TIMEOUT_MS = Number.parseInt(process.env.OCR_PAGE_TIMEOUT_MS || '120000', 10);
const OCR_INSTALL_TIMEOUT_MS = Number.parseInt(process.env.OCR_INSTALL_TIMEOUT_MS || '600000', 10);
const OCR_PSM = String(process.env.OCR_PSM || '3');
const OCR_PAGE_CONCURRENCY = resolveConcurrency('OCR_PAGE_CONCURRENCY', {
  reserve: 1,
  min: 1,
  max: 6,
});
const isAutoInstallOcrToolsEnabled = () => ['1', 'true', 'yes', 'on'].includes(
  String(process.env.OCR_AUTO_INSTALL || 'true').toLowerCase()
);

const getTesseractJsCachePath = () =>
  process.env.TESSERACT_JS_CACHE_PATH
  || path.join(STORAGE_DIR, 'tesseract-cache');

let cachedTesseractEngine;
let cachedRasterizer;
let runtimeDetected = false;

const TESSERACT_LANG_PATTERN = /^[A-Za-z0-9_]+$/;

const getFileBaseName = (name = 'file.pdf') =>
  name.replace(/[\\/:*?"<>|]+/g, '-').replace(/\.[^.]+$/, '').trim() || 'file';

const isPdfBuffer = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 5) {
    return false;
  }
  return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
};

const runProcess = (command, args, { timeoutMs = OCR_COMMAND_TIMEOUT_MS, cwd } = {}) => {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      cwd,
      env: process.env,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      clearTimeout(timeoutHandle);
      reject(error);
    });

    child.on('close', (code) => {
      clearTimeout(timeoutHandle);

      if (timedOut) {
        reject(new Error(`Command timed out (${command}) after ${timeoutMs}ms`));
        return;
      }

      if (code !== 0) {
        reject(new Error(`Command failed (${command}) with code ${code}: ${stderr.trim()}`));
        return;
      }

      resolve({ stdout, stderr });
    });
  });
};

const detectBinary = async (candidates, versionArgs) => {
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    try {
      await runProcess(candidate, versionArgs, { timeoutMs: 12000 });
      return candidate;
    } catch {
      // Try next candidate.
    }
  }

  return null;
};

const getTesseractCandidates = () => {
  const candidates = [
    process.env.TESSERACT_PATH,
    'tesseract',
    'tesseract.exe',
  ];

  if (process.platform === 'win32') {
    candidates.push(
      'C:\\Program Files\\Tesseract-OCR\\tesseract.exe',
      'C:\\Program Files (x86)\\Tesseract-OCR\\tesseract.exe'
    );

    if (process.env.LOCALAPPDATA) {
      candidates.push(path.join(process.env.LOCALAPPDATA, 'Tesseract-OCR', 'tesseract.exe'));
    }
  }

  return [...new Set(candidates)];
};

const getPdfToPpmCandidates = () => {
  const candidates = [
    process.env.PDFTOPPM_PATH,
    'pdftoppm',
    'pdftoppm.exe',
  ];

  if (process.platform === 'win32') {
    candidates.push(
      'C:\\Program Files\\poppler\\Library\\bin\\pdftoppm.exe',
      'C:\\Program Files\\poppler\\bin\\pdftoppm.exe',
      'C:\\Program Files (x86)\\poppler\\Library\\bin\\pdftoppm.exe',
      'C:\\Program Files (x86)\\poppler\\bin\\pdftoppm.exe'
    );
  }

  return [...new Set(candidates)];
};

const getImageMagickCandidates = () => {
  const candidates = [
    process.env.IMAGEMAGICK_PATH,
    'magick',
    'magick.exe',
  ];

  return [...new Set(candidates)];
};

const tryInstallWithCommands = async (commands) => {
  for (const command of commands) {
    try {
      logger.warn(`Attempting auto-install: ${command.bin} ${command.args.join(' ')}`);
      await runProcess(command.bin, command.args, { timeoutMs: OCR_INSTALL_TIMEOUT_MS });
      return true;
    } catch (error) {
      logger.warn(`Auto-install attempt failed (${command.bin}): ${error.message}`);
    }
  }

  return false;
};

const runInstallSequence = async (commands) => {
  for (const command of commands) {
    logger.warn(`Attempting auto-install step: ${command.bin} ${command.args.join(' ')}`);
    await runProcess(command.bin, command.args, { timeoutMs: OCR_INSTALL_TIMEOUT_MS });
  }
};

const tryAutoInstallTesseract = async () => {
  if (!isAutoInstallOcrToolsEnabled()) {
    return false;
  }

  if (process.platform === 'win32') {
    return tryInstallWithCommands([
      {
        bin: 'winget',
        args: [
          'install',
          '--id',
          'UB-Mannheim.TesseractOCR',
          '-e',
          '--accept-package-agreements',
          '--accept-source-agreements',
          '--silent',
        ],
      },
      {
        bin: 'choco',
        args: ['install', 'tesseract', '-y'],
      },
    ]);
  }

  if (process.platform === 'linux') {
    try {
      await runInstallSequence([
        {
          bin: 'apt-get',
          args: ['update'],
        },
        {
          bin: 'apt-get',
          args: ['install', '-y', 'tesseract-ocr'],
        },
      ]);
      return true;
    } catch (error) {
      logger.warn(`Auto-install sequence failed for tesseract: ${error.message}`);
      return false;
    }
  }

  return false;
};

const tryAutoInstallPoppler = async () => {
  if (!isAutoInstallOcrToolsEnabled()) {
    return false;
  }

  if (process.platform === 'win32') {
    return tryInstallWithCommands([
      {
        bin: 'winget',
        args: [
          'install',
          '--id',
          'oschwartz10612.poppler',
          '-e',
          '--accept-package-agreements',
          '--accept-source-agreements',
          '--silent',
        ],
      },
      {
        bin: 'choco',
        args: ['install', 'poppler', '-y'],
      },
    ]);
  }

  if (process.platform === 'linux') {
    try {
      await runInstallSequence([
        {
          bin: 'apt-get',
          args: ['update'],
        },
        {
          bin: 'apt-get',
          args: ['install', '-y', 'poppler-utils'],
        },
      ]);
      return true;
    } catch (error) {
      logger.warn(`Auto-install sequence failed for poppler-utils: ${error.message}`);
      return false;
    }
  }

  return false;
};

const detectRuntime = async () => {
  if (runtimeDetected && cachedTesseractEngine && cachedRasterizer) {
    return {
      tesseractEngine: cachedTesseractEngine,
      rasterizer: cachedRasterizer,
    };
  }

  runtimeDetected = true;

  let tesseractBinary = await detectBinary(getTesseractCandidates(), ['--version']);
  if (!tesseractBinary) {
    logger.warn('Tesseract not detected, attempting auto-install');
    const installed = await tryAutoInstallTesseract();
    if (installed) {
      tesseractBinary = await detectBinary(getTesseractCandidates(), ['--version']);
    }
  }

  const tesseractEngine = tesseractBinary
    ? {
      type: 'native',
      binary: tesseractBinary,
    }
    : {
      type: 'js',
    };

  if (!tesseractBinary) {
    logger.warn(
      'Native Tesseract binary is unavailable. Falling back to tesseract.js OCR engine.'
    );
  }

  let pdftoppmBinary = await detectBinary(getPdfToPpmCandidates(), ['-v']);
  if (!pdftoppmBinary) {
    logger.warn('pdftoppm not detected, attempting auto-install');
    const installed = await tryAutoInstallPoppler();
    if (installed) {
      pdftoppmBinary = await detectBinary(getPdfToPpmCandidates(), ['-v']);
    }
  }

  let rasterizer = null;
  if (pdftoppmBinary) {
    rasterizer = {
      type: 'pdftoppm',
      binary: pdftoppmBinary,
    };
  } else {
    const magickBinary = await detectBinary(getImageMagickCandidates(), ['-version']);
    if (magickBinary) {
      rasterizer = {
        type: 'magick',
        binary: magickBinary,
      };
    }
  }

  if (!rasterizer) {
    throw new Error(
      'No PDF rasterizer found. Install Poppler (pdftoppm) or ImageMagick, or configure PDFTOPPM_PATH.'
    );
  }

  cachedTesseractEngine = tesseractEngine;
  cachedRasterizer = rasterizer;

  const tesseractDescriptor = cachedTesseractEngine.type === 'native'
    ? cachedTesseractEngine.binary
    : 'tesseract.js';

  logger.info(
    `OCR runtime ready: tesseract=${tesseractDescriptor}, rasterizer=${cachedRasterizer.type}:${cachedRasterizer.binary}`
  );

  return {
    tesseractEngine: cachedTesseractEngine,
    rasterizer: cachedRasterizer,
  };
};

const getPageNumber = (fileName) => {
  const match = fileName.match(/-(\d+)\.png$/i);
  if (!match) {
    return Number.MAX_SAFE_INTEGER;
  }

  return Number.parseInt(match[1], 10);
};

const listPageImages = async (imagesDir) => {
  const entries = await fs.readdir(imagesDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.png'))
    .map((entry) => path.join(imagesDir, entry.name))
    .sort((a, b) => getPageNumber(path.basename(a)) - getPageNumber(path.basename(b)));
};

const rasterizePdfToImages = async ({ inputPdfPath, imagesDir, rasterizer }) => {
  const outputPrefix = path.join(imagesDir, 'page');

  if (rasterizer.type === 'pdftoppm') {
    await runProcess(rasterizer.binary, ['-png', '-r', String(OCR_DPI), inputPdfPath, outputPrefix]);
    return listPageImages(imagesDir);
  }

  await runProcess(rasterizer.binary, [
    '-density',
    String(OCR_DPI),
    inputPdfPath,
    '-alpha',
    'remove',
    '-alpha',
    'off',
    `${outputPrefix}-%06d.png`,
  ]);

  return listPageImages(imagesDir);
};

const toPageCombinedText = (pageTexts) =>
  pageTexts
    .map((text, index) => `--- Page ${index + 1} ---\n${text.trim()}\n`)
    .join('\n')
    .trim();

const xmlEscape = (value = '') =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

let crcTable;
const getCrcTable = () => {
  if (crcTable) {
    return crcTable;
  }

  crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[n] = c >>> 0;
  }

  return crcTable;
};

const crc32 = (buffer) => {
  const table = getCrcTable();
  let crc = 0xffffffff;

  for (let i = 0; i < buffer.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buffer[i]) & 0xff];
  }

  return (crc ^ 0xffffffff) >>> 0;
};

const toDosDateTime = (date = new Date()) => {
  const year = Math.max(1980, date.getFullYear());
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);

  const dosTime = (hours << 11) | (minutes << 5) | seconds;
  const dosDate = ((year - 1980) << 9) | (month << 5) | day;

  return { dosTime, dosDate };
};

const buildZip = (entries) => {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const { dosTime, dosDate } = toDosDateTime();

  for (const entry of entries) {
    const name = Buffer.from(entry.name.replace(/\\/g, '/'));
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    const checksum = crc32(data);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, name, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, name);
    offset += localHeader.length + name.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(entries.length, 8);
  endRecord.writeUInt16LE(entries.length, 10);
  endRecord.writeUInt32LE(centralDirectory.length, 12);
  endRecord.writeUInt32LE(offset, 16);
  endRecord.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, endRecord]);
};

const buildDocxBuffer = (text) => {
  const lines = text.split(/\r?\n/);
  const body = lines
    .map((line) => {
      if (!line.trim()) {
        return '<w:p/>';
      }
      return `<w:p><w:r><w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r></w:p>`;
    })
    .join('');

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${body}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>
      <w:cols w:space="708"/>
      <w:docGrid w:linePitch="360"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  return buildZip([
    { name: '[Content_Types].xml', data: Buffer.from(contentTypesXml, 'utf-8') },
    { name: '_rels/.rels', data: Buffer.from(relsXml, 'utf-8') },
    { name: 'word/document.xml', data: Buffer.from(documentXml, 'utf-8') },
  ]);
};

const mergePdfBuffers = async (pdfPaths) => {
  if (pdfPaths.length === 1) {
    return fs.readFile(pdfPaths[0]);
  }

  const merged = await PDFDocument.create();

  for (const pdfPath of pdfPaths) {
    const pagePdf = await PDFDocument.load(await fs.readFile(pdfPath), {
      updateMetadata: false,
    });
    const indices = pagePdf.getPageIndices();
    const pages = await merged.copyPages(pagePdf, indices);
    pages.forEach((page) => merged.addPage(page));
  }

  return Buffer.from(await merged.save());
};

const getOutputFormatConfig = (outputFormat) => {
  switch (outputFormat) {
    case 'searchable-pdf':
      return {
        extension: 'pdf',
        contentType: 'application/pdf',
        tesseractConfig: 'pdf',
      };
    case 'word':
      return {
        extension: 'docx',
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        tesseractConfig: 'txt',
      };
    case 'text':
    default:
      return {
        extension: 'txt',
        contentType: 'text/plain',
        tesseractConfig: 'txt',
      };
  }
};

const createTesseractJsWorker = async (language) => {
  const worker = await Tesseract.createWorker(language, undefined, {
    cachePath: getTesseractJsCachePath(),
  });

  await worker.setParameters({
    tessedit_pageseg_mode: OCR_PSM,
  });

  return worker;
};

const processPagesWithNativeTesseract = async ({
  runtime,
  pageImages,
  ocrDir,
  jobId,
  language,
  outputFormat,
  originalName,
  safeOutputName,
  formatConfig,
}) => {
  if (runtime.tesseractEngine.type !== 'native') {
    throw new Error('Native Tesseract engine is unavailable.');
  }

  let processedPages = 0;

  return mapWithConcurrency(
    pageImages,
    OCR_PAGE_CONCURRENCY,
    async (imagePath, pageIndex) => {
      const pageNumber = pageIndex + 1;
      const outputBase = path.join(ocrDir, `page-${String(pageNumber).padStart(4, '0')}`);

      logger.info(
        `OCR page ${pageNumber}/${pageImages.length} for job ${jobId} (engine=native, parallel=${OCR_PAGE_CONCURRENCY})`
      );

      const tesseractArgs = [
        imagePath,
        outputBase,
        '-l',
        language,
        '--oem',
        '1',
        '--psm',
        OCR_PSM,
      ];

      if (process.env.TESSDATA_PREFIX) {
        tesseractArgs.push('--tessdata-dir', process.env.TESSDATA_PREFIX);
      }

      tesseractArgs.push(formatConfig.tesseractConfig);

      await runProcess(runtime.tesseractEngine.binary, tesseractArgs, {
        timeoutMs: OCR_PAGE_TIMEOUT_MS,
      });

      processedPages += 1;
      await updateJobStatus(
        jobId,
        'processing',
        {
          metadata: getProcessingMetadata({
            language,
            outputFormat,
            originalName,
            outputFileName: safeOutputName,
            totalPages: pageImages.length,
            processedPages,
          }),
        }
      );

      if (formatConfig.tesseractConfig === 'txt') {
        const textPath = `${outputBase}.txt`;
        const pageText = await fs.readFile(textPath, 'utf-8');
        return {
          text: pageText,
          pdfPath: null,
        };
      }

      return {
        text: null,
        pdfPath: `${outputBase}.pdf`,
      };
    }
  );
};

const processPagesWithTesseractJs = async ({
  pageImages,
  ocrDir,
  jobId,
  language,
  outputFormat,
  originalName,
  safeOutputName,
  formatConfig,
}) => {
  let worker;
  let processedPages = 0;
  const pageResults = [];

  try {
    worker = await createTesseractJsWorker(language);

    for (let pageIndex = 0; pageIndex < pageImages.length; pageIndex += 1) {
      const imagePath = pageImages[pageIndex];
      const pageNumber = pageIndex + 1;
      const outputBase = path.join(ocrDir, `page-${String(pageNumber).padStart(4, '0')}`);

      logger.info(
        `OCR page ${pageNumber}/${pageImages.length} for job ${jobId} (engine=tesseract.js)`
      );

      const outputOptions = formatConfig.tesseractConfig === 'pdf'
        ? { text: true, pdf: true }
        : { text: true };

      const result = await worker.recognize(imagePath, {}, outputOptions);
      const pageText = result?.data?.text || '';

      let pdfPath = null;
      if (formatConfig.tesseractConfig === 'pdf') {
        const pdfBytes = result?.data?.pdf;
        if (!pdfBytes || pdfBytes.length === 0) {
          throw new Error('tesseract.js failed to generate searchable PDF output.');
        }

        pdfPath = `${outputBase}.pdf`;
        await fs.writeFile(pdfPath, Buffer.from(pdfBytes));
      }

      processedPages += 1;
      await updateJobStatus(
        jobId,
        'processing',
        {
          metadata: getProcessingMetadata({
            language,
            outputFormat,
            originalName,
            outputFileName: safeOutputName,
            totalPages: pageImages.length,
            processedPages,
          }),
        }
      );

      pageResults.push({
        text: formatConfig.tesseractConfig === 'txt' ? pageText : null,
        pdfPath,
      });
    }

    return pageResults;
  } finally {
    if (worker) {
      await worker.terminate();
    }
  }
};

const getProcessingMetadata = ({
  language,
  outputFormat,
  originalName,
  outputFileName,
  totalPages,
  processedPages,
}) => ({
  language,
  outputFormat,
  originalName,
  outputFileName,
  totalPages,
  processedPages,
  progress: totalPages > 0 ? Math.round((processedPages / totalPages) * 100) : 0,
});

const normalizeOcrError = (error) => {
  const message = error?.message || 'OCR processing failed.';
  const lower = message.toLowerCase();

  if (lower.includes('failed loading language') || lower.includes('language') && lower.includes('not found')) {
    return 'OCR language data is not available on the server. Please choose a different language.';
  }

  if (lower.includes('no pdf rasterizer found') || lower.includes('pdftoppm')) {
    return 'OCR server setup is incomplete. PDF conversion dependency is missing.';
  }

  if (lower.includes('tesseract')) {
    return 'Tesseract OCR is not available on the server.';
  }

  if (lower.includes('encrypted')) {
    return 'Password-protected PDFs are not supported for OCR.';
  }

  return message;
};

const isNativeLanguageDataError = (error) => {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('failed loading language')
    || message.includes('could not initialize tesseract')
    || message.includes('error opening data file');
};

export const processOcrPdf = async (jobData) => {
  const {
    jobId,
    fileUrl,
    language = 'eng',
    outputFormat = 'text',
    originalName = 'document.pdf',
    outputFileName,
  } = jobData;

  logger.info(`Starting OCR: ${jobId}, language=${language}, format=${outputFormat}`);

  let tempDir;
  let outputUrl;

  try {
    if (!TESSERACT_LANG_PATTERN.test(language)) {
      throw new Error('Invalid OCR language code');
    }

    const formatConfig = getOutputFormatConfig(outputFormat);
    const safeOutputName = outputFileName || `${getFileBaseName(originalName)}.${formatConfig.extension}`;

    await updateJobStatus(
      jobId,
      'processing',
      {
        metadata: getProcessingMetadata({
          language,
          outputFormat,
          originalName,
          outputFileName: safeOutputName,
          totalPages: 0,
          processedPages: 0,
        }),
      }
    );

    const pdfBuffer = await downloadFile(fileUrl);
    if (!isPdfBuffer(pdfBuffer)) {
      throw new Error('Uploaded file is not a valid PDF.');
    }

    // Validate that we can parse the PDF before heavy OCR work.
    const pdf = await PDFDocument.load(pdfBuffer, {
      updateMetadata: false,
      ignoreEncryption: false,
    });

    const runtime = await detectRuntime();
    tempDir = await createTempWorkspace('editfile-ocr-');
    const inputPdfPath = path.join(tempDir, 'input.pdf');
    const imagesDir = path.join(tempDir, 'images');
    const ocrDir = path.join(tempDir, 'ocr');

    await fs.mkdir(imagesDir, { recursive: true });
    await fs.mkdir(ocrDir, { recursive: true });
    await fs.writeFile(inputPdfPath, pdfBuffer);

    const pageImages = await rasterizePdfToImages({
      inputPdfPath,
      imagesDir,
      rasterizer: runtime.rasterizer,
    });

    if (!pageImages.length) {
      throw new Error('No pages were produced while converting the PDF.');
    }

    let pageResults;
    if (runtime.tesseractEngine.type === 'native') {
      try {
        pageResults = await processPagesWithNativeTesseract({
          runtime,
          pageImages,
          ocrDir,
          jobId,
          language,
          outputFormat,
          originalName,
          safeOutputName,
          formatConfig,
        });
      } catch (nativeError) {
        if (!isNativeLanguageDataError(nativeError)) {
          throw nativeError;
        }

        logger.warn(
          `Native Tesseract failed for job ${jobId} due to missing language data. Falling back to tesseract.js.`
        );

        pageResults = await processPagesWithTesseractJs({
          pageImages,
          ocrDir,
          jobId,
          language,
          outputFormat,
          originalName,
          safeOutputName,
          formatConfig,
        });
      }
    } else {
      pageResults = await processPagesWithTesseractJs({
        pageImages,
        ocrDir,
        jobId,
        language,
        outputFormat,
        originalName,
        safeOutputName,
        formatConfig,
      });
    }

    const extractedPages = pageResults.map((result) => result.text).filter((text) => text !== null);
    const searchablePdfPages = pageResults
      .map((result) => result.pdfPath)
      .filter((pdfPath) => Boolean(pdfPath));

    let outputBuffer;
    if (outputFormat === 'searchable-pdf') {
      outputBuffer = await mergePdfBuffers(searchablePdfPages);
    } else if (outputFormat === 'word') {
      outputBuffer = buildDocxBuffer(toPageCombinedText(extractedPages));
    } else {
      outputBuffer = Buffer.from(toPageCombinedText(extractedPages), 'utf-8');
    }

    const outputKey = generateS3Key(jobId, safeOutputName, 'output');
    outputUrl = await uploadFile(outputBuffer, outputKey, formatConfig.contentType);

    await updateJobStatus(jobId, 'completed', {
      output_file_url: outputUrl,
      output_size: outputBuffer.length,
      metadata: getProcessingMetadata({
        language,
        outputFormat,
        originalName,
        outputFileName: safeOutputName,
        totalPages: pageImages.length,
        processedPages: pageImages.length,
      }),
    });

    logger.info(`OCR completed: ${jobId}, pages=${pageImages.length}, size=${outputBuffer.length}`);

    return {
      success: true,
      jobId,
      pageCount: pageImages.length,
      outputSize: outputBuffer.length,
      outputUrl,
      outputFileName: safeOutputName,
    };
  } catch (error) {
    const safeMessage = normalizeOcrError(error);
    logger.error(`OCR failed for job ${jobId}:`, error);
    await failJob(jobId, safeMessage);

    if (outputUrl) {
      await deleteFile(outputUrl);
    }

    throw new Error(safeMessage);
  } finally {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }

    if (fileUrl) {
      await deleteFile(fileUrl);
    }
  }
};

export default { processOcrPdf };
