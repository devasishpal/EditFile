import fs from 'fs/promises';
import path from 'path';
import { promisify } from 'util';
import libreoffice from 'libreoffice-convert';
import { logger } from './logger.js';
import { runCliCommand } from './pdf-cli.js';

const convertWithOptionsAsync = promisify(libreoffice.convertWithOptions);
const DETECT_TIMEOUT_MS = 10000;
const DEFAULT_CONVERT_TIMEOUT_MS = Number.parseInt(
  process.env.LIBREOFFICE_TIMEOUT_MS || '600000',
  10
);

const WINDOWS_SOFFICE_DEFAULTS = [
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
];

let ensureLibreOfficePromise = null;

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
      // Continue with next candidate.
    }
  }

  return null;
};

const detectLibreOfficeBinary = async () => {
  const candidates = [];

  if (process.env.LIBRE_OFFICE_EXE) {
    candidates.push(process.env.LIBRE_OFFICE_EXE);
  }

  if (process.env.LIBREOFFICE_PATH) {
    candidates.push(process.env.LIBREOFFICE_PATH);
  }

  if (process.platform === 'win32') {
    candidates.push(...WINDOWS_SOFFICE_DEFAULTS);
    candidates.push('soffice.exe', 'libreoffice.exe');
  } else {
    candidates.push('soffice', 'libreoffice', '/usr/bin/soffice', '/usr/bin/libreoffice');
  }

  const binaryPath = await findBinary(candidates);
  return { binaryPath };
};

const installOnDebianFamily = async () => {
  const installArgs = ['install', 'libreoffice', '-y'];

  try {
    await runCliCommand('sudo', ['-n', 'apt', 'update'], { timeoutMs: 10 * 60 * 1000 });
    await runCliCommand('sudo', ['-n', 'apt', ...installArgs], {
      timeoutMs: 15 * 60 * 1000,
    });
    return;
  } catch (error) {
    logger.warn(`sudo apt install libreoffice failed, trying apt directly: ${error.message}`);
  }

  await runCliCommand('apt', ['update'], { timeoutMs: 10 * 60 * 1000 });
  await runCliCommand('apt', installArgs, { timeoutMs: 15 * 60 * 1000 });
};

const installLibreOfficeOnWindows = async () => {
  await runCliCommand('winget', [
    'install',
    '--id',
    'TheDocumentFoundation.LibreOffice',
    '-e',
    '--accept-package-agreements',
    '--accept-source-agreements',
  ], {
    timeoutMs: 20 * 60 * 1000,
  });
};

const installLibreOfficeIfNeeded = async () => {
  if (process.platform === 'linux') {
    await installOnDebianFamily();
    return;
  }

  if (process.platform === 'win32') {
    await installLibreOfficeOnWindows();
    return;
  }

  logger.warn(
    `Automatic LibreOffice installation is not configured for platform "${process.platform}".`
  );
};

export const ensureLibreOfficeDependency = async () => {
  if (!ensureLibreOfficePromise) {
    ensureLibreOfficePromise = (async () => {
      let detected = await detectLibreOfficeBinary();

      if (!detected.binaryPath) {
        await installLibreOfficeIfNeeded();
        detected = await detectLibreOfficeBinary();
      }

      if (!detected.binaryPath) {
        throw new Error(
          'LibreOffice is required for this conversion but was not found. Install LibreOffice and retry.'
        );
      }

      process.env.LIBRE_OFFICE_EXE = detected.binaryPath;
      logger.info(`LibreOffice dependency ready: ${detected.binaryPath}`);
      return detected;
    })().catch((error) => {
      ensureLibreOfficePromise = null;
      throw error;
    });
  }

  return ensureLibreOfficePromise;
};

export const convertWithLibreOffice = async (
  inputBuffer,
  inputFileName,
  targetFormat,
  options = {}
) => {
  await ensureLibreOfficeDependency();

  const safeInputName = String(inputFileName || 'source').trim() || 'source';
  const normalizedTargetFormat = String(targetFormat || '').trim().replace(/^\./, '');

  if (!normalizedTargetFormat) {
    throw new Error('Target format is required');
  }

  const outputBuffer = await convertWithOptionsAsync(
    inputBuffer,
    normalizedTargetFormat,
    options.filter || undefined,
    {
      fileName: safeInputName,
      sofficeBinaryPaths: process.env.LIBRE_OFFICE_EXE
        ? [process.env.LIBRE_OFFICE_EXE]
        : undefined,
      execOptions: {
        timeout: options.timeoutMs || DEFAULT_CONVERT_TIMEOUT_MS,
        maxBuffer: options.maxBuffer || 10 * 1024 * 1024,
      },
      sofficeAdditionalArgs: ['--nologo', '--nodefault', '--nolockcheck'],
      asyncOptions: {
        times: 5,
        interval: 250,
      },
    }
  );

  return outputBuffer;
};

export default {
  ensureLibreOfficeDependency,
  convertWithLibreOffice,
};
