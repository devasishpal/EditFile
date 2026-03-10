import fs from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';
import puppeteer from 'puppeteer';
import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import { downloadFile, uploadFile, generateS3Key } from '../../config/s3.js';
import { updateJobStatus, completeJob, failJob } from '../../services/database.service.js';
import { logger } from '../../utils/logger.js';
import { createTempWorkspace, removePathSafe } from '../../utils/workspace.js';
import { buildFileName } from '../../utils/file-name.js';

const PUPPETEER_TIMEOUT_MS = Number.parseInt(process.env.PUPPETEER_TIMEOUT_MS || '300000', 10);
const HTML_TO_PDF_FAILURE_MESSAGE = 'HTML to PDF conversion failed. Please try again.';

const PAGE_SIZE_MAP = {
  a4: 'A4',
  letter: 'Letter',
  legal: 'Legal',
};

const MARGIN_PRESETS = {
  none: '0px',
  small: '10px',
  medium: '20px',
  large: '30px',
};

const BLOCKED_RESOURCE_TYPES = new Set([
  'script',
  'xhr',
  'fetch',
  'websocket',
  'eventsource',
]);

const ALLOWED_SCHEMES = new Set(['http:', 'https:', 'data:', 'file:', 'about:', 'blob:']);

const { window } = new JSDOM('');
const purify = createDOMPurify(window);

const CHROME_PATHS_BY_PLATFORM = {
  win32: [
    'C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe',
    'C:\\\\Program Files (x86)\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe',
    'C:\\\\Program Files\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe',
    'C:\\\\Program Files (x86)\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe',
    'C:\\\\Program Files\\\\Chromium\\\\Application\\\\chrome.exe',
  ],
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ],
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
    '/usr/bin/microsoft-edge',
  ],
};

const fileExists = async (filePath) => {
  if (!filePath) {
    return false;
  }

  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const resolveExecutablePath = async () => {
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (await fileExists(envPath)) {
    return envPath;
  }

  try {
    const bundledPath = puppeteer.executablePath();
    if (await fileExists(bundledPath)) {
      return bundledPath;
    }
  } catch {
    // Ignore bundled path errors
  }

  const candidates = CHROME_PATHS_BY_PLATFORM[process.platform] || [];
  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  return null;
};

const cleanupWorkspace = async (workspacePath) => {
  if (!workspacePath) {
    return;
  }

  try {
    await removePathSafe(workspacePath);
  } catch (error) {
    logger.warn(`Failed to clean HTML to PDF workspace ${workspacePath}: ${error.message}`);
  }
};

const escapeHtml = (value = '') =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const normalizePageSize = (value) => {
  const normalized = String(value || 'A4').trim().toLowerCase();
  return PAGE_SIZE_MAP[normalized] || 'A4';
};

const normalizeOrientation = (value) => {
  const normalized = String(value || 'portrait').trim().toLowerCase();
  return normalized === 'landscape';
};

const normalizeMargin = (value) => {
  if (value === undefined || value === null) {
    return MARGIN_PRESETS.medium;
  }

  const raw = String(value).trim().toLowerCase();
  if (MARGIN_PRESETS[raw]) {
    return MARGIN_PRESETS[raw];
  }

  if (/^\d+(\.\d+)?%$/.test(raw)) {
    return raw;
  }

  if (/^\d+(\.\d+)?(px|cm|mm|in)$/.test(raw)) {
    return raw;
  }

  if (/^\d+(\.\d+)?$/.test(raw)) {
    return `${raw}px`;
  }

  return MARGIN_PRESETS.medium;
};

const normalizeScale = (value) => {
  if (value === undefined || value === null || value === '') {
    return 1;
  }

  const raw = String(value).trim();
  if (raw.endsWith('%')) {
    const percent = Number.parseFloat(raw.replace('%', ''));
    if (Number.isFinite(percent)) {
      return Math.min(2, Math.max(0.1, percent / 100));
    }
  }

  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) {
    return 1;
  }

  return Math.min(2, Math.max(0.1, parsed));
};

const normalizeBoolean = (value) => {
  if (value === true) {
    return true;
  }

  const normalized = String(value || '').trim().toLowerCase();
  return ['true', '1', 'yes', 'y', 'on'].includes(normalized);
};

const normalizeHeaderFooter = (value) => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const buildHeaderTemplate = (text) => {
  if (!text) {
    return '<span></span>';
  }

  return `
    <div style="font-size:9px; width:100%; padding:0 12px; text-align:center;">
      ${escapeHtml(text)}
    </div>
  `;
};

const buildFooterTemplate = (text) => {
  if (!text) {
    return '<span></span>';
  }

  return `
    <div style="font-size:9px; width:100%; padding:0 12px; text-align:center;">
      ${escapeHtml(text)}
    </div>
  `;
};

const buildPdfOptions = (options = {}) => {
  const pageSize = normalizePageSize(options.pageSize || options.page_size || options.size);
  const landscape = normalizeOrientation(options.orientation || options.pageOrientation);
  const marginValue = normalizeMargin(options.margin);
  const scale = normalizeScale(options.scale);
  const printBackground = normalizeBoolean(options.background || options.printBackground);
  const headerText = normalizeHeaderFooter(options.header || options.headerText);
  const footerText = normalizeHeaderFooter(options.footer || options.footerText);

  return {
    format: pageSize,
    landscape,
    printBackground,
    scale,
    margin: {
      top: marginValue,
      right: marginValue,
      bottom: marginValue,
      left: marginValue,
    },
    displayHeaderFooter: Boolean(headerText || footerText),
    headerTemplate: buildHeaderTemplate(headerText),
    footerTemplate: buildFooterTemplate(footerText),
  };
};

const sanitizeHtml = (htmlContent = '') => {
  const dirty = String(htmlContent || '');
  return purify.sanitize(dirty, {
    FORBID_TAGS: ['script', 'noscript', 'iframe', 'object', 'embed'],
  });
};

const shouldBlockRequest = (request, mainDocumentUrl) => {
  const resourceType = request.resourceType();
  const url = request.url();

  if (BLOCKED_RESOURCE_TYPES.has(resourceType)) {
    return true;
  }

  if (url.startsWith('file://') && url !== mainDocumentUrl) {
    return true;
  }

  try {
    const parsedUrl = new URL(url);
    if (!ALLOWED_SCHEMES.has(parsedUrl.protocol)) {
      return true;
    }
  } catch (error) {
    return true;
  }

  return false;
};

const convertHtmlToPdf = async (htmlContent, options = {}) => {
  let browser;
  let workspacePath;

  try {
    const sanitizedHtml = sanitizeHtml(htmlContent);
    workspacePath = await createTempWorkspace('html-to-pdf-');
    const htmlPath = path.join(workspacePath, 'input.html');
    await fs.writeFile(htmlPath, sanitizedHtml, 'utf8');

    const htmlUrl = pathToFileURL(htmlPath).toString();

    const executablePath = await resolveExecutablePath();
    if (!executablePath) {
      logger.warn(
        'Puppeteer executable not found. Install Chrome/Chromium or set PUPPETEER_EXECUTABLE_PATH.'
      );
    }

    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      timeout: PUPPETEER_TIMEOUT_MS,
      ...(executablePath ? { executablePath } : {}),
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(PUPPETEER_TIMEOUT_MS);

    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);

    page.on('request', (request) => {
      if (shouldBlockRequest(request, htmlUrl)) {
        request.abort().catch(() => undefined);
        return;
      }

      request.continue().catch(() => undefined);
    });

    await page.goto(htmlUrl, { waitUntil: ['load', 'networkidle0'] });

    try {
      await page.emulateMediaType('screen');
    } catch {
      // Ignore media emulation failures
    }

    try {
      await page.evaluateHandle('document.fonts.ready');
    } catch {
      // Ignore font readiness errors
    }

    const pdfOptions = buildPdfOptions(options);
    const pdfBuffer = await page.pdf(pdfOptions);

    return pdfBuffer;
  } catch (error) {
    logger.error(`HTML to PDF conversion failed: ${error.message}`);
    throw new Error(HTML_TO_PDF_FAILURE_MESSAGE);
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }
    await cleanupWorkspace(workspacePath);
  }
};

export const processHtmlToPdf = async (jobData) => {
  const { jobId, fileUrl, originalName = 'document.html', options } = jobData;
  logger.info(`Starting HTML to PDF: ${jobId}`);

  try {
    await updateJobStatus(jobId, 'processing');

    const htmlBuffer = await downloadFile(fileUrl);
    const htmlContent = htmlBuffer.toString('utf8');

    const pdfBuffer = await convertHtmlToPdf(htmlContent, options || {});

    if (!pdfBuffer || pdfBuffer.length === 0) {
      throw new Error('HTML to PDF conversion produced an empty file.');
    }

    const outputFileName = buildFileName({
      originalName,
      extension: 'pdf',
      fallbackBase: 'converted',
    });
    const outputKey = generateS3Key(jobId, outputFileName, 'output');
    const outputUrl = await uploadFile(pdfBuffer, outputKey, 'application/pdf');

    await completeJob(jobId, outputUrl, pdfBuffer.length);
    await updateJobStatus(jobId, 'completed', {
      metadata: {
        outputFileName,
        originalName,
      },
    });

    logger.info(`HTML to PDF completed: ${jobId}`);

    return {
      success: true,
      jobId,
      outputSize: pdfBuffer.length,
      outputUrl,
    };
  } catch (error) {
    logger.error(`HTML to PDF failed for job ${jobId}:`, error);
    await failJob(jobId, HTML_TO_PDF_FAILURE_MESSAGE);
    throw error;
  }
};

export default { processHtmlToPdf };
