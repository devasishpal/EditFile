import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { uploadFile, generateS3Key, downloadFile } from '../../config/s3.js';
import { updateJobStatus, completeJob, failJob } from '../../services/database.service.js';
import { logger } from '../../utils/logger.js';
import { createTempWorkspace as createManagedTempWorkspace, removePathSafe } from '../../utils/workspace.js';
import { resolveConcurrency } from '../../utils/concurrency.js';
import { buildFileName } from '../../utils/file-name.js';

const GHOSTSCRIPT_BINARIES = ['gswin64c.exe', 'gswin32c.exe', 'gswin64c', 'gswin32c', 'gs'];
const GHOSTSCRIPT_TIMEOUT_MS = Number.parseInt(process.env.GHOSTSCRIPT_TIMEOUT_MS || '600000', 10);
const GHOSTSCRIPT_DETECT_TIMEOUT_MS = 10000;
const TARGET_PROFILE_SEARCH_ATTEMPTS = 7;
const TARGET_MAX_PROFILE_TRIES = 4;
const TARGET_ACCEPTABLE_MIN_RATIO = 0.98;
const TARGET_ACCEPTABLE_MAX_RATIO = 1.03;
const DEFAULT_IMAGE_RESOLUTION_DPI = Number.parseInt(
  process.env.PDF_COMPRESS_DEFAULT_DPI || '110',
  10
);
const MIN_IMAGE_RESOLUTION_DPI = 72;
const MAX_IMAGE_RESOLUTION_DPI = 300;
const DEFAULT_PDF_PROFILE = '/screen';
const DEFAULT_DOWNSAMPLE = true;
const GHOSTSCRIPT_THREADS = resolveConcurrency('GHOSTSCRIPT_THREADS', {
  reserve: 1,
  min: 1,
  max: 8,
});

const FAST_GHOSTSCRIPT_BASE_ARGS = [
  '-sDEVICE=pdfwrite',
  '-dCompatibilityLevel=1.4',
  '-dNOPAUSE',
  '-dQUIET',
  '-dBATCH',
  '-dDetectDuplicateImages=true',
  '-dCompressFonts=true',
  '-dSubsetFonts=true',
  '-dColorConversionStrategy=/sRGB',
  '-dColorImageDownsampleType=/Bicubic',
  '-dGrayImageDownsampleType=/Bicubic',
  '-dMonoImageDownsampleType=/Subsample',
  `-dNumRenderingThreads=${GHOSTSCRIPT_THREADS}`,
];

// Ordered from most aggressive to least aggressive.
const TARGET_PROFILE_CONFIGS = [
  { profile: '/screen', minDpi: 72, maxDpi: 150, downsample: true },
  { profile: '/ebook', minDpi: 90, maxDpi: 220, downsample: true },
  { profile: '/printer', minDpi: 120, maxDpi: 300, downsample: true },
  { profile: '/prepress', minDpi: 150, maxDpi: 300, downsample: true },
];

let cachedGhostscriptBinary;
let ghostscriptChecked = false;

const getWindowsGhostscriptCandidates = async () => {
  const installRoots = ['C:\\Program Files\\gs', 'C:\\Program Files (x86)\\gs'];
  const candidates = [];

  for (const root of installRoots) {
    try {
      const entries = await fs.readdir(root, { withFileTypes: true });
      const versionDirs = entries
        .filter((entry) => entry.isDirectory() && entry.name.toLowerCase().startsWith('gs'))
        .map((entry) => entry.name)
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }));

      for (const dirName of versionDirs) {
        candidates.push(path.join(root, dirName, 'bin', 'gswin64c.exe'));
        candidates.push(path.join(root, dirName, 'bin', 'gswin32c.exe'));
      }
    } catch {
      // Directory may not exist on this machine.
    }
  }

  return candidates;
};

const getGhostscriptCandidates = async () => {
  const candidates = [];

  if (process.env.GHOSTSCRIPT_PATH) {
    candidates.push(process.env.GHOSTSCRIPT_PATH);
  }

  if (process.platform === 'win32') {
    candidates.push(...await getWindowsGhostscriptCandidates());
  }

  candidates.push(...GHOSTSCRIPT_BINARIES);
  return [...new Set(candidates)];
};

const runProcess = (command, args, { timeoutMs = GHOSTSCRIPT_TIMEOUT_MS } = {}) => {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    let timedOut = false;

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

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

      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Command failed (${command}) with code ${code}: ${stderr.trim()}`));
    });
  });
};

const detectGhostscriptBinary = async () => {
  if (ghostscriptChecked) {
    return cachedGhostscriptBinary;
  }

  ghostscriptChecked = true;

  const candidates = await getGhostscriptCandidates();

  for (const binary of candidates) {
    try {
      await runProcess(binary, ['--version'], { timeoutMs: GHOSTSCRIPT_DETECT_TIMEOUT_MS });
      cachedGhostscriptBinary = binary;
      logger.info(`Ghostscript detected: ${binary}`);
      return cachedGhostscriptBinary;
    } catch {
      // Try next binary
    }
  }

  logger.warn('Ghostscript not detected. PDF compression cannot proceed.');
  cachedGhostscriptBinary = null;
  return cachedGhostscriptBinary;
};

const createCompressionWorkspace = async () => createManagedTempWorkspace('editfile-pdf-compress-');

const cleanupWorkspace = async (workspacePath) => {
  if (!workspacePath) {
    return;
  }

  try {
    await removePathSafe(workspacePath);
  } catch (error) {
    logger.warn(`Failed to clean PDF workspace ${workspacePath}: ${error.message}`);
  }
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const buildGhostscriptArgs = (
  inputPath,
  outputPath,
  {
    profile = DEFAULT_PDF_PROFILE,
    dpi = clamp(DEFAULT_IMAGE_RESOLUTION_DPI, MIN_IMAGE_RESOLUTION_DPI, MAX_IMAGE_RESOLUTION_DPI),
    downsample = DEFAULT_DOWNSAMPLE,
  } = {}
) => {
  const args = [
    ...FAST_GHOSTSCRIPT_BASE_ARGS,
    `-dPDFSETTINGS=${profile}`,
  ];

  if (downsample) {
    args.push(
      '-dDownsampleColorImages=true',
      `-dColorImageResolution=${dpi}`,
      '-dDownsampleGrayImages=true',
      `-dGrayImageResolution=${dpi}`,
      '-dDownsampleMonoImages=true',
      `-dMonoImageResolution=${dpi}`
    );
  } else {
    args.push(
      '-dDownsampleColorImages=false',
      '-dDownsampleGrayImages=false',
      '-dDownsampleMonoImages=false'
    );
  }

  args.push(`-sOutputFile=${outputPath}`, inputPath);
  return args;
};

const buildFastGhostscriptArgs = (
  inputPath,
  outputPath,
  dpi = clamp(DEFAULT_IMAGE_RESOLUTION_DPI, MIN_IMAGE_RESOLUTION_DPI, MAX_IMAGE_RESOLUTION_DPI),
  profile = DEFAULT_PDF_PROFILE
) => [
  ...buildGhostscriptArgs(inputPath, outputPath, {
    profile,
    dpi,
    downsample: true,
  }),
];

const resolveSinglePassPreset = (compressionLevel = 80) => {
  const level = clamp(compressionLevel, 1, 100);

  if (level <= 35) {
    return { profile: '/screen', dpi: 90 };
  }

  if (level <= 60) {
    return { profile: '/ebook', dpi: 110 };
  }

  if (level <= 80) {
    return { profile: '/printer', dpi: 140 };
  }

  return { profile: '/prepress', dpi: 180 };
};

const getTargetBytes = (targetSizeKB) => {
  const parsed = Number.parseInt(targetSizeKB, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed * 1024 : null;
};

const getInitialTargetProfileIndex = (originalSizeBytes, targetBytes) => {
  const ratio = clamp(targetBytes / Math.max(originalSizeBytes, 1), 0, 1);

  if (ratio >= 0.8) return 3;
  if (ratio >= 0.6) return 2;
  if (ratio >= 0.35) return 1;
  return 0;
};

const buildTargetProfileTryOrder = (originalSizeBytes, targetBytes) => {
  const initialIndex = getInitialTargetProfileIndex(originalSizeBytes, targetBytes);
  const offsets = [0, 1, -1, 2, -2, 3, -3];
  const order = [];

  for (const offset of offsets) {
    const index = initialIndex + offset;
    if (index < 0 || index >= TARGET_PROFILE_CONFIGS.length) {
      continue;
    }

    const config = TARGET_PROFILE_CONFIGS[index];
    if (!order.includes(config)) {
      order.push(config);
    }
  }

  return order.slice(0, TARGET_MAX_PROFILE_TRIES);
};

const isAcceptableTargetHit = (size, targetBytes) =>
  size >= Math.floor(targetBytes * TARGET_ACCEPTABLE_MIN_RATIO) &&
  size <= Math.ceil(targetBytes * TARGET_ACCEPTABLE_MAX_RATIO);

const pickCloserToTarget = (best, candidate, targetBytes) => {
  if (!best) {
    return candidate;
  }

  const bestDelta = Math.abs(best.size - targetBytes);
  const candidateDelta = Math.abs(candidate.size - targetBytes);

  if (candidateDelta < bestDelta) {
    return candidate;
  }

  if (candidateDelta > bestDelta) {
    return best;
  }

  if (candidate.size <= targetBytes && best.size > targetBytes) {
    return candidate;
  }

  if (best.size <= targetBytes && candidate.size > targetBytes) {
    return best;
  }

  return candidate.size > best.size ? candidate : best;
};

const runGhostscriptAttempt = async ({
  ghostscriptBinary,
  inputPath,
  workspace,
  attemptIndex,
  preset,
}) => {
  const outputPath = path.join(workspace, `compressed-${attemptIndex}.pdf`);
  const args = preset
    ? buildGhostscriptArgs(inputPath, outputPath, preset)
    : buildFastGhostscriptArgs(inputPath, outputPath);

  await runProcess(ghostscriptBinary, args, {
    timeoutMs: GHOSTSCRIPT_TIMEOUT_MS,
  });

  const buffer = await fs.readFile(outputPath);
  await fs.rm(outputPath, { force: true });

  if (!buffer?.length) {
    throw new Error('Ghostscript produced an empty output file.');
  }

  return {
    buffer,
    size: buffer.length,
    preset,
  };
};

const compressPdfBuffer = async (pdfBuffer, { compressionLevel = 80, targetSizeKB = null } = {}) => {
  const ghostscriptBinary = await detectGhostscriptBinary();
  if (!ghostscriptBinary) {
    throw new Error(
      'Ghostscript is not available. Install Ghostscript and ensure it is accessible in PATH.'
    );
  }

  const workspace = await createCompressionWorkspace();
  const inputPath = path.join(workspace, 'input.pdf');
  const targetBytes = getTargetBytes(targetSizeKB);
  const originalSize = pdfBuffer.length;

  try {
    await fs.writeFile(inputPath, pdfBuffer);

    if (targetBytes && originalSize <= targetBytes) {
      logger.info(
        `Original PDF already within target (original=${originalSize}, target=${targetBytes}). Returning original.`
      );
      return pdfBuffer;
    }

    // No target requested: use one fast pass for localhost speed.
    if (!targetBytes) {
      const singlePassPreset = resolveSinglePassPreset(compressionLevel);
      const singlePass = await runGhostscriptAttempt({
        ghostscriptBinary,
        inputPath,
        workspace,
        attemptIndex: 1,
        preset: {
          profile: singlePassPreset.profile,
          dpi: singlePassPreset.dpi,
          downsample: true,
        },
      });

      if (singlePass.size >= originalSize) {
        logger.info(
          `Ghostscript output was not smaller (original=${originalSize}, compressed=${singlePass.size}, level=${compressionLevel}). Returning original.`
        );
        return pdfBuffer;
      }

      return singlePass.buffer;
    }

    // Target requested: per-profile DPI binary search for closest-to-target result.
    const profileOrder = buildTargetProfileTryOrder(originalSize, targetBytes);
    let attemptCount = 1;
    let bestTargetMatch = null;
    let bestOverall = null;

    for (const profileConfig of profileOrder) {
      let low = clamp(profileConfig.minDpi, MIN_IMAGE_RESOLUTION_DPI, MAX_IMAGE_RESOLUTION_DPI);
      let high = clamp(profileConfig.maxDpi, MIN_IMAGE_RESOLUTION_DPI, MAX_IMAGE_RESOLUTION_DPI);
      let profileAttempts = 0;

      while (low <= high && profileAttempts < TARGET_PROFILE_SEARCH_ATTEMPTS) {
        profileAttempts += 1;
        const dpi = Math.floor((low + high) / 2);

        const attemptResult = await runGhostscriptAttempt({
          ghostscriptBinary,
          inputPath,
          workspace,
          attemptIndex: attemptCount,
          preset: {
            profile: profileConfig.profile,
            dpi,
            downsample: profileConfig.downsample,
          },
        });
        attemptCount += 1;

        bestTargetMatch = pickCloserToTarget(bestTargetMatch, attemptResult, targetBytes);
        if (!bestOverall || attemptResult.size < bestOverall.size) {
          bestOverall = attemptResult;
        }

        if (isAcceptableTargetHit(attemptResult.size, targetBytes)) {
          return attemptResult.buffer;
        }

        if (attemptResult.size > targetBytes) {
          high = dpi - 1;
        } else {
          low = dpi + 1;
        }
      }
    }

    if (bestTargetMatch && bestTargetMatch.size < originalSize) {
      return bestTargetMatch.buffer;
    }

    if (bestOverall && bestOverall.size < originalSize) {
      return bestOverall.buffer;
    }

    logger.info(
      `Ghostscript output was not smaller across target tuning attempts (original=${originalSize}, target=${targetBytes}, level=${compressionLevel}). Returning original.`
    );
    return pdfBuffer;
  } catch (error) {
    throw new Error(`Ghostscript compression failed: ${error.message}`);
  } finally {
    await cleanupWorkspace(workspace);
  }
};

/**
 * Process compress PDF job
 * @param {Object} jobData - Job data
 * @returns {Promise<Object>} - Job result
 */
export const processCompressPdf = async (jobData) => {
  const { jobId, fileUrl, compressionLevel, targetSizeKB, originalName } = jobData;

  logger.info(
    `Starting PDF compression: ${jobId}, level: ${compressionLevel}, targetKB: ${targetSizeKB ?? 'n/a'}`
  );
  
  try {
    // Update job status to processing
    await updateJobStatus(jobId, 'processing');
    
    // Download file from S3
    logger.info(`Downloading file for job ${jobId}`);
    const pdfBuffer = await downloadFile(fileUrl);
    const originalSize = pdfBuffer.length;
    
    // Compress PDF
    logger.info(`Compressing PDF for job ${jobId}`);
    const compressedBuffer = await compressPdfBuffer(pdfBuffer, {
      compressionLevel,
      targetSizeKB,
    });
    const compressedSize = compressedBuffer.length;
    
    // Upload compressed file to S3
    const outputFileName = buildFileName({
      originalName,
      extension: 'pdf',
      fallbackBase: 'document',
    });
    const outputKey = generateS3Key(jobId, outputFileName, 'outputs');
    const outputUrl = await uploadFile(
      compressedBuffer,
      outputKey,
      'application/pdf'
    );
    
    // Complete job
    await completeJob(jobId, outputUrl, compressedSize);
    
    // Calculate reduction
    const reductionPercent = ((originalSize - compressedSize) / originalSize * 100).toFixed(2);
    
    logger.info(`PDF compression completed: ${jobId}, reduction: ${reductionPercent}%`);
    
    return {
      success: true,
      jobId,
      originalSize,
      compressedSize,
      reductionPercent,
      outputUrl,
    };
    
  } catch (error) {
    logger.error(`PDF compression failed for job ${jobId}:`, error);
    await failJob(jobId, error.message);
    throw error;
  }
};

export default { processCompressPdf };
