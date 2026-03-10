import fs from 'fs/promises';
import path from 'path';
import { logger } from './logger.js';
import { runCliCommand } from './pdf-cli.js';

const DETECT_TIMEOUT_MS = 10000;

const DEFAULT_PDF2HTMLEX_TIMEOUT_MS = Number.parseInt(
  process.env.PDF_TO_HTML_TIMEOUT_MS || '900000',
  10
);

const WINDOWS_PDF2HTMLEX_DEFAULTS = [
  'C:\\Program Files\\pdf2htmlEX\\pdf2htmlEX.exe',
  'C:\\Program Files (x86)\\pdf2htmlEX\\pdf2htmlEX.exe',
];

let ensurePdf2HtmlPromise = null;

const normalizeCandidate = (value) => String(value || '').trim();

const isExistingFile = async (candidate) => {
  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
};

const appendBinaryDirectoryToPath = (binaryPath) => {
  if (!binaryPath) {
    return;
  }

  const dir = path.dirname(binaryPath);
  const delimiter = path.delimiter;
  const currentPath = process.env.PATH || '';
  const hasDir = currentPath
    .split(delimiter)
    .some((entry) => entry.trim().toLowerCase() === dir.trim().toLowerCase());

  if (!hasDir) {
    process.env.PATH = `${dir}${delimiter}${currentPath}`;
  }
};

const findBinary = async (candidates, versionArgs = ['--version']) => {
  for (const rawCandidate of candidates) {
    const candidate = normalizeCandidate(rawCandidate);
    if (!candidate) {
      continue;
    }

    const looksLikePath =
      candidate.includes(path.sep) || candidate.includes('/') || candidate.includes('\\');

    if (looksLikePath && !(await isExistingFile(candidate))) {
      continue;
    }

    try {
      await runCliCommand(candidate, versionArgs, { timeoutMs: DETECT_TIMEOUT_MS });
      appendBinaryDirectoryToPath(candidate);
      return candidate;
    } catch {
      // Try next candidate.
    }
  }

  return null;
};

const detectPdf2HtmlBinary = async () => {
  const candidates = [];

  if (process.env.PDF2HTMLEX_PATH) {
    candidates.push(process.env.PDF2HTMLEX_PATH);
  }

  if (process.platform === 'win32') {
    candidates.push(...WINDOWS_PDF2HTMLEX_DEFAULTS, 'pdf2htmlEX.exe');
  } else {
    candidates.push('pdf2htmlEX', '/usr/bin/pdf2htmlEX', '/usr/local/bin/pdf2htmlEX');
  }

  const binaryPath = await findBinary(candidates);
  return { binaryPath };
};

const installOnDebianFamily = async () => {
  try {
    await runCliCommand('sudo', ['-n', 'apt', 'update'], {
      timeoutMs: 10 * 60 * 1000,
      captureStdout: false,
    });
    await runCliCommand('sudo', ['-n', 'apt', 'install', '-y', 'pdf2htmlex'], {
      timeoutMs: 15 * 60 * 1000,
      captureStdout: false,
    });
    return;
  } catch (error) {
    logger.warn(`sudo apt install pdf2htmlex failed, trying apt directly: ${error.message}`);
  }

  await runCliCommand('apt', ['update'], {
    timeoutMs: 10 * 60 * 1000,
    captureStdout: false,
  });
  await runCliCommand('apt', ['install', '-y', 'pdf2htmlex'], {
    timeoutMs: 15 * 60 * 1000,
    captureStdout: false,
  });
};

const installPdf2HtmlIfNeeded = async () => {
  if (process.platform === 'linux') {
    await installOnDebianFamily();
    return;
  }

  logger.warn(
    `Automatic pdf2htmlEX installation is not configured for platform "${process.platform}".`
  );
};

export const ensurePdf2HtmlDependency = async () => {
  if (!ensurePdf2HtmlPromise) {
    ensurePdf2HtmlPromise = (async () => {
      let detected = await detectPdf2HtmlBinary();

      if (!detected.binaryPath) {
        await installPdf2HtmlIfNeeded();
        detected = await detectPdf2HtmlBinary();
      }

      if (!detected.binaryPath) {
        throw new Error(
          'pdf2htmlEX is required for PDF to HTML conversion but was not found. Install pdf2htmlEX and retry.'
        );
      }

      process.env.PDF2HTMLEX_PATH = detected.binaryPath;
      logger.info(`pdf2htmlEX dependency ready: ${detected.binaryPath}`);
      return detected;
    })().catch((error) => {
      ensurePdf2HtmlPromise = null;
      throw error;
    });
  }

  return ensurePdf2HtmlPromise;
};

export const getPdf2HtmlTimeout = () => DEFAULT_PDF2HTMLEX_TIMEOUT_MS;

export default {
  ensurePdf2HtmlDependency,
  getPdf2HtmlTimeout,
};
