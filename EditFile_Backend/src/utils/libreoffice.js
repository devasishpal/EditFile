import fs from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';
import { logger } from './logger.js';
import { runCliCommand } from './pdf-cli.js';
import { createTempWorkspace, removePathSafe } from './workspace.js';

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
      // Try next candidate.
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
    candidates.push(...WINDOWS_SOFFICE_DEFAULTS, 'soffice.exe', 'libreoffice.exe');
  } else {
    candidates.push('soffice', 'libreoffice', '/usr/bin/soffice', '/usr/bin/libreoffice');
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
    await runCliCommand('sudo', ['-n', 'apt', 'install', '-y', 'libreoffice'], {
      timeoutMs: 15 * 60 * 1000,
      captureStdout: false,
    });
    return;
  } catch (error) {
    logger.warn(`sudo apt install libreoffice failed, trying apt directly: ${error.message}`);
  }

  await runCliCommand('apt', ['update'], {
    timeoutMs: 10 * 60 * 1000,
    captureStdout: false,
  });
  await runCliCommand('apt', ['install', '-y', 'libreoffice'], {
    timeoutMs: 15 * 60 * 1000,
    captureStdout: false,
  });
};

const installLibreOfficeOnWindows = async () => {
  await runCliCommand(
    'winget',
    [
      'install',
      '--id',
      'TheDocumentFoundation.LibreOffice',
      '-e',
      '--accept-package-agreements',
      '--accept-source-agreements',
    ],
    {
      timeoutMs: 20 * 60 * 1000,
      captureStdout: false,
    }
  );
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

const sanitizeFileName = (fileName = 'source') => {
  const raw = path.basename(String(fileName || 'source').trim() || 'source');
  const sanitized = raw.replace(/[^a-zA-Z0-9._ -]/g, '_').replace(/\s+/g, ' ');
  return sanitized || 'source';
};

const getExpectedOutputPath = (outputDir, inputName, targetFormat) => {
  const baseName = path.parse(inputName).name;
  return path.join(outputDir, `${baseName}.${targetFormat}`);
};

const resolveOutputPath = async (outputDir, inputName, targetFormat) => {
  const expectedOutputPath = getExpectedOutputPath(outputDir, inputName, targetFormat);

  if (await isExistingFile(expectedOutputPath)) {
    return expectedOutputPath;
  }

  const entries = await fs.readdir(outputDir, { withFileTypes: true });
  const extension = `.${targetFormat}`.toLowerCase();
  const matching = entries.filter(
    (entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === extension
  );

  if (matching.length === 0) {
    throw new Error(`LibreOffice did not generate a .${targetFormat} output file.`);
  }

  const expectedBaseName = path.parse(inputName).name.toLowerCase();
  const exactNameMatch = matching.find(
    (entry) => path.parse(entry.name).name.toLowerCase() === expectedBaseName
  );

  if (exactNameMatch) {
    return path.join(outputDir, exactNameMatch.name);
  }

  if (matching.length === 1) {
    return path.join(outputDir, matching[0].name);
  }

  const withStats = await Promise.all(
    matching.map(async (entry) => {
      const absolutePath = path.join(outputDir, entry.name);
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

const buildConvertToArgument = (targetFormat, filter) => {
  if (!filter) {
    return targetFormat;
  }

  return `${targetFormat}:${filter}`;
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

  const safeInputName = sanitizeFileName(inputFileName);
  const normalizedInputName = path.extname(safeInputName) ? safeInputName : `${safeInputName}.bin`;
  const normalizedTargetFormat = String(targetFormat || '').trim().replace(/^\./, '').toLowerCase();

  if (!normalizedTargetFormat) {
    throw new Error('Target format is required');
  }

  const workspacePath = await createTempWorkspace('editfile-libreoffice-');
  const uploadsDir = path.join(workspacePath, 'uploads');
  const outputDir = path.join(workspacePath, 'output');
  const profileDir = path.join(workspacePath, 'profile');

  try {
    await Promise.all([
      fs.mkdir(uploadsDir, { recursive: true }),
      fs.mkdir(outputDir, { recursive: true }),
      fs.mkdir(profileDir, { recursive: true }),
    ]);

    const inputPath = path.join(uploadsDir, normalizedInputName);
    await fs.writeFile(inputPath, inputBuffer);

    const convertToArg = buildConvertToArgument(normalizedTargetFormat, options.filter);
    const sofficeBinary = process.env.LIBRE_OFFICE_EXE || 'soffice';

    await runCliCommand(
      sofficeBinary,
      [
        `-env:UserInstallation=${pathToFileURL(profileDir).href}`,
        '--headless',
        '--nologo',
        '--nodefault',
        '--nofirststartwizard',
        '--nolockcheck',
        '--norestore',
        '--invisible',
        '--convert-to',
        convertToArg,
        '--outdir',
        outputDir,
        inputPath,
      ],
      {
        timeoutMs: options.timeoutMs || DEFAULT_CONVERT_TIMEOUT_MS,
        captureStdout: false,
      }
    );

    const outputPath = await resolveOutputPath(
      outputDir,
      normalizedInputName,
      normalizedTargetFormat
    );
    const outputBuffer = await fs.readFile(outputPath);

    if (!outputBuffer?.length) {
      throw new Error('LibreOffice conversion produced an empty output file.');
    }

    return outputBuffer;
  } finally {
    await removePathSafe(workspacePath);
  }
};

export default {
  ensureLibreOfficeDependency,
  convertWithLibreOffice,
};
