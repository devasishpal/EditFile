import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { createZipBuffer } from './zip.js';
import { generateS3Key, uploadFile } from '../config/s3.js';
import {
  TEMP_DIR,
  createTempWorkspace as createManagedTempWorkspace,
  removePathSafe as removeManagedPathSafe,
  ensureWorkspaceDirectories,
} from './workspace.js';

const MAGICK_BINARY = process.env.IMAGEMAGICK_BINARY || process.env.IMAGEMAGICK_PATH || 'magick';
const MAGICK_TIMEOUT_MS = Number.parseInt(process.env.IMAGEMAGICK_TIMEOUT_MS || '45000', 10);
const MAGICK_MAX_BUFFER = Number.parseInt(
  process.env.IMAGEMAGICK_MAX_BUFFER || `${16 * 1024 * 1024}`,
  10
);

const THREAD_LIMIT = process.env.IMAGEMAGICK_THREAD_LIMIT || '2';
const MEMORY_LIMIT = process.env.IMAGEMAGICK_MEMORY_LIMIT || '256MiB';
const MAP_LIMIT = process.env.IMAGEMAGICK_MAP_LIMIT || '512MiB';
const DISK_LIMIT = process.env.IMAGEMAGICK_DISK_LIMIT || '1GiB';
const AREA_LIMIT = process.env.IMAGEMAGICK_AREA_LIMIT || '128MP';

const FORMAT_ALIASES = {
  jpg: 'jpg',
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
  gif: 'gif',
  bmp: 'bmp',
  tiff: 'tiff',
  tif: 'tiff',
  avif: 'avif',
};

const MIME_TO_FORMAT = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/tiff': 'tiff',
  'image/avif': 'avif',
};

const FORMAT_TO_MIME = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  tiff: 'image/tiff',
  avif: 'image/avif',
};

const GRAVITY_BY_POSITION = {
  center: 'center',
  top: 'north',
  bottom: 'south',
  left: 'west',
  right: 'east',
  north: 'north',
  south: 'south',
  west: 'west',
  east: 'east',
  'top-left': 'northwest',
  'top-right': 'northeast',
  'bottom-left': 'southwest',
  'bottom-right': 'southeast',
  northwest: 'northwest',
  northeast: 'northeast',
  southwest: 'southwest',
  southeast: 'southeast',
};

let magickVersionPromise;

const sanitizeBaseName = (value, fallback = 'image') => {
  const raw = String(value || fallback).trim();
  const withoutExtension = raw.replace(/\.[^/.]+$/, '');
  const sanitized = withoutExtension
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '-')
    .replace(/_+/g, '_')
    .replace(/-+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 80);

  return sanitized || fallback;
};

const sanitizeFileName = (value, fallback = 'file.bin') => {
  const raw = String(value || '').trim();
  if (!raw) {
    return fallback;
  }

  const extension = path.extname(raw).replace(/^\./, '');
  const baseName = sanitizeBaseName(raw, 'file');
  return extension ? `${baseName}.${extension}` : `${baseName}.bin`;
};

const appendOutput = (chunks, currentLength, chunk) => {
  chunks.push(chunk);
  return currentLength + chunk.length;
};

const buildOptimizedArgs = (args, optimizeOutput) => {
  const isMetadataCommand =
    args[0] === 'identify' ||
    args[0] === '-version' ||
    args[0] === '--version' ||
    args.includes('info:');

  if (!optimizeOutput || isMetadataCommand || args.includes('-strip') || args.length < 2) {
    return [...args];
  }

  const finalArgs = [...args];
  finalArgs.splice(finalArgs.length - 1, 0, '-strip');
  return finalArgs;
};

const runMagickProcess = (
  args,
  {
    timeoutMs = MAGICK_TIMEOUT_MS,
    captureStdout = true,
    captureStderr = true,
    stdinBuffer = null,
    optimizeOutput = true,
  } = {}
) =>
  new Promise((resolve, reject) => {
    const commandArgs = [
      '-limit',
      'thread',
      THREAD_LIMIT,
      '-limit',
      'memory',
      MEMORY_LIMIT,
      '-limit',
      'map',
      MAP_LIMIT,
      '-limit',
      'disk',
      DISK_LIMIT,
      '-limit',
      'area',
      AREA_LIMIT,
      '-define',
      `registry:temporary-path=${TEMP_DIR}`,
      ...buildOptimizedArgs(args, optimizeOutput),
    ];

    const child = spawn(MAGICK_BINARY, commandArgs, {
      windowsHide: true,
      stdio: ['pipe', captureStdout ? 'pipe' : 'ignore', captureStderr ? 'pipe' : 'ignore'],
      env: process.env,
    });

    const stdoutChunks = [];
    const stderrChunks = [];
    let stdoutLength = 0;
    let stderrLength = 0;
    let timedOut = false;
    let settled = false;

    const finalize = (callback) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutHandle);
      callback();
    };

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      child.kill();
      setTimeout(() => {
        if (!settled) {
          child.kill('SIGKILL');
        }
      }, 1000);
    }, timeoutMs);

    if (captureStdout && child.stdout) {
      child.stdout.on('data', (chunk) => {
        stdoutLength = appendOutput(stdoutChunks, stdoutLength, chunk);
        if (stdoutLength > MAGICK_MAX_BUFFER) {
          child.kill('SIGKILL');
          finalize(() => reject(new Error('ImageMagick stdout exceeded buffer limit')));
        }
      });
    }

    if (captureStderr && child.stderr) {
      child.stderr.on('data', (chunk) => {
        stderrLength = appendOutput(stderrChunks, stderrLength, chunk);
        if (stderrLength > MAGICK_MAX_BUFFER) {
          child.kill('SIGKILL');
          finalize(() => reject(new Error('ImageMagick stderr exceeded buffer limit')));
        }
      });
    }

    child.on('error', (error) => {
      finalize(() => reject(error));
    });

    child.on('close', (code) => {
      finalize(() => {
        if (timedOut) {
          reject(new Error(`ImageMagick command timed out after ${timeoutMs}ms`));
          return;
        }

        const stdoutBuffer = Buffer.concat(stdoutChunks);
        const stderrBuffer = Buffer.concat(stderrChunks);
        const stderrText = stderrBuffer.toString('utf8').trim();

        if (code !== 0) {
          reject(new Error(`ImageMagick command failed: ${stderrText || `exit code ${code}`}`));
          return;
        }

        resolve({
          stdout: stdoutBuffer.toString('utf8'),
          stderr: stderrBuffer.toString('utf8'),
          stdoutBuffer,
          stderrBuffer,
        });
      });
    });

    if (stdinBuffer) {
      child.stdin.write(stdinBuffer);
    }
    child.stdin.end();
  });

export const normalizeFormat = (value, fallback = 'jpg') => {
  const candidate = String(value || '').trim().toLowerCase().replace(/^\./, '');
  const normalized = FORMAT_ALIASES[candidate];
  if (normalized) {
    return normalized;
  }
  return FORMAT_ALIASES[fallback] || 'jpg';
};

export const getFormatFromFile = (fileName, mimeType, fallback = 'jpg') => {
  const extension = path.extname(String(fileName || ''))
    .replace(/^\./, '')
    .trim()
    .toLowerCase();

  if (extension) {
    return normalizeFormat(extension, fallback);
  }

  if (mimeType && MIME_TO_FORMAT[mimeType]) {
    return MIME_TO_FORMAT[mimeType];
  }

  return normalizeFormat(fallback, 'jpg');
};

export const getMimeTypeForFormat = (format, fallback = 'image/jpeg') => {
  const normalized = normalizeFormat(format, 'jpg');
  return FORMAT_TO_MIME[normalized] || fallback;
};

export const getExtensionForFormat = (format, fallback = 'jpg') =>
  normalizeFormat(format, fallback);

export const getBaseName = (value, fallback = 'image') => sanitizeBaseName(value, fallback);

export const parseInteger = (value, fallback = null) => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return parsed;
};

export const clampInteger = (value, min, max, fallback = null) => {
  const parsed = parseInteger(value, fallback);
  if (parsed === null) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
};

export const clampNumber = (value, min, max, fallback = null) => {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
};

export const resolveGravity = (position, fallback = 'southeast') => {
  const normalized = String(position || '').trim().toLowerCase();
  return GRAVITY_BY_POSITION[normalized] || fallback;
};

export const ensureMagickAvailable = async () => {
  if (!magickVersionPromise) {
    magickVersionPromise = (async () => {
      await ensureWorkspaceDirectories();
      await runMagickProcess(['-version'], {
        timeoutMs: 5000,
        captureStdout: true,
        captureStderr: true,
        optimizeOutput: false,
      });
    })().catch((error) => {
      magickVersionPromise = null;
      throw new Error(`ImageMagick is not available: ${error.message}`);
    });
  }

  await magickVersionPromise;
};

export const runMagick = async (args, options = {}) => {
  await ensureMagickAvailable();

  try {
    return await runMagickProcess(args, options);
  } catch (error) {
    throw new Error(`ImageMagick command failed: ${error.message}`);
  }
};

export const transformImageBuffer = async ({
  inputBuffer,
  inputFormat,
  outputFormat,
  operations = [],
  timeoutMs,
  optimizeOutput = true,
}) => {
  if (!Buffer.isBuffer(inputBuffer) || inputBuffer.length === 0) {
    throw new Error('Input image buffer is empty');
  }

  const sourceFormat = normalizeFormat(inputFormat, 'png');
  const targetFormat = normalizeFormat(outputFormat, 'png');

  const { stdoutBuffer } = await runMagick(
    [`${sourceFormat}:-`, '-auto-orient', ...operations, `${targetFormat}:-`],
    {
      timeoutMs,
      stdinBuffer: inputBuffer,
      captureStdout: true,
      captureStderr: true,
      optimizeOutput,
    }
  );

  if (!stdoutBuffer || stdoutBuffer.length === 0) {
    throw new Error('ImageMagick produced an empty output buffer');
  }

  return stdoutBuffer;
};

export const createTempWorkspace = async (prefix = 'editfile-img-') =>
  createManagedTempWorkspace(prefix);

export const removePathSafe = async (targetPath) => removeManagedPathSafe(targetPath);

export const uploadProcessedFiles = async ({
  jobId,
  files,
  fallbackBaseName = 'file_output',
  outputPrefix = 'outputs',
}) => {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('No processed files to upload');
  }

  let outputBuffer;
  let outputFileName;
  let outputContentType;

  if (files.length === 1) {
    outputBuffer = files[0].buffer;
    outputFileName = sanitizeFileName(files[0].fileName, `${fallbackBaseName}.jpg`);
    outputContentType = files[0].contentType || 'application/octet-stream';
  } else {
    outputBuffer = createZipBuffer(
      files.map((file, index) => ({
        name: sanitizeFileName(file.fileName, `${fallbackBaseName}-${index + 1}.bin`),
        data: file.buffer,
      }))
    );
    outputFileName = `${sanitizeBaseName(fallbackBaseName, 'files_output')}.zip`;
    outputContentType = 'application/zip';
  }

  const outputKey = generateS3Key(jobId, outputFileName, outputPrefix);
  const outputUrl = await uploadFile(outputBuffer, outputKey, outputContentType);

  return {
    outputUrl,
    outputBuffer,
    outputFileName,
    outputContentType,
  };
};

export default {
  normalizeFormat,
  getFormatFromFile,
  getMimeTypeForFormat,
  getExtensionForFormat,
  getBaseName,
  parseInteger,
  clampInteger,
  clampNumber,
  resolveGravity,
  ensureMagickAvailable,
  runMagick,
  transformImageBuffer,
  createTempWorkspace,
  removePathSafe,
  uploadProcessedFiles,
};
