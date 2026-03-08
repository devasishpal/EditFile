import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { logger } from './logger.js';

const DEFAULT_TIMEOUT_MS = Number.parseInt(process.env.PDF_CLI_TIMEOUT_MS || '600000', 10);
const DETECT_TIMEOUT_MS = 10000;

const WINDOWS_PDFTK_DEFAULTS = [
  'C:\\Program Files (x86)\\PDFtk Server\\bin\\pdftk.exe',
  'C:\\Program Files\\PDFtk Server\\bin\\pdftk.exe',
];

const WINDOWS_GS_ROOTS = ['C:\\Program Files\\gs', 'C:\\Program Files (x86)\\gs'];

let ensureDependenciesPromise = null;
let ensureGhostscriptPromise = null;
let ensurePdftkPromise = null;

const normalizeCandidate = (value) => String(value || '').trim();

const toExecError = (command, args, code, stderr) => {
  const details = stderr?.trim() ? `: ${stderr.trim()}` : '';
  return new Error(`Command failed (${command} ${args.join(' ')}) with code ${code}${details}`);
};

export const runCliCommand = (
  command,
  args = [],
  {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    captureStdout = true,
    captureStderr = true,
  } = {}
) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ['ignore', captureStdout ? 'pipe' : 'ignore', captureStderr ? 'pipe' : 'ignore'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    if (captureStdout && child.stdout) {
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
    }

    if (captureStderr && child.stderr) {
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
    }

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on('close', (code) => {
      clearTimeout(timer);

      if (timedOut) {
        reject(new Error(`Command timed out after ${timeoutMs}ms: ${command}`));
        return;
      }

      if (code !== 0) {
        reject(toExecError(command, args, code, stderr));
        return;
      }

      resolve({
        stdout,
        stderr,
      });
    });
  });

const looksLikePath = (candidate) => {
  const text = normalizeCandidate(candidate);
  return text.includes(path.sep) || text.includes('/') || text.includes('\\');
};

const appendBinaryDirectoryToPath = (binaryPath) => {
  if (!binaryPath || !looksLikePath(binaryPath)) {
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

const isExistingFile = async (candidate) => {
  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
};

const getWindowsGhostscriptCandidates = async () => {
  const candidates = [];

  for (const root of WINDOWS_GS_ROOTS) {
    try {
      const entries = await fs.readdir(root, { withFileTypes: true });
      const dirs = entries
        .filter((entry) => entry.isDirectory() && entry.name.toLowerCase().startsWith('gs'))
        .map((entry) => entry.name)
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }));

      for (const dir of dirs) {
        candidates.push(path.join(root, dir, 'bin', 'gswin64c.exe'));
        candidates.push(path.join(root, dir, 'bin', 'gswin32c.exe'));
      }
    } catch {
      // Directory may not exist.
    }
  }

  return candidates;
};

const getWindowsPdftkCandidates = async () => {
  const candidates = [];
  for (const candidate of WINDOWS_PDFTK_DEFAULTS) {
    if (await isExistingFile(candidate)) {
      candidates.push(candidate);
    }
  }
  return candidates;
};

const findBinary = async (candidates, versionArgs) => {
  for (const rawCandidate of candidates) {
    const candidate = normalizeCandidate(rawCandidate);
    if (!candidate) {
      continue;
    }

    if (looksLikePath(candidate) && !(await isExistingFile(candidate))) {
      continue;
    }

    try {
      await runCliCommand(candidate, versionArgs, { timeoutMs: DETECT_TIMEOUT_MS });
      appendBinaryDirectoryToPath(candidate);
      return candidate;
    } catch {
      // Try next candidate
    }
  }

  return null;
};

const detectPdfCliDependencies = async () => {
  const pdftkCandidates = [];
  const ghostscriptCandidates = [];

  if (process.env.PDFTK_PATH) {
    pdftkCandidates.push(process.env.PDFTK_PATH);
  }

  if (process.env.GHOSTSCRIPT_PATH) {
    ghostscriptCandidates.push(process.env.GHOSTSCRIPT_PATH);
  }

  if (process.platform === 'win32') {
    pdftkCandidates.push(...(await getWindowsPdftkCandidates()));
    ghostscriptCandidates.push(...(await getWindowsGhostscriptCandidates()));
  }

  pdftkCandidates.push('pdftk', 'pdftk.exe');
  ghostscriptCandidates.push('gs', 'gs.exe', 'gswin64c.exe', 'gswin32c.exe');

  const [pdftkPath, ghostscriptPath] = await Promise.all([
    findBinary(pdftkCandidates, ['--version']),
    findBinary(ghostscriptCandidates, ['--version']),
  ]);

  return {
    pdftkPath,
    ghostscriptPath,
  };
};

const detectGhostscriptDependency = async () => {
  const ghostscriptCandidates = [];

  if (process.env.GHOSTSCRIPT_PATH) {
    ghostscriptCandidates.push(process.env.GHOSTSCRIPT_PATH);
  }

  if (process.platform === 'win32') {
    ghostscriptCandidates.push(...(await getWindowsGhostscriptCandidates()));
  }

  ghostscriptCandidates.push('gs', 'gs.exe', 'gswin64c.exe', 'gswin32c.exe');

  const ghostscriptPath = await findBinary(ghostscriptCandidates, ['--version']);
  return { ghostscriptPath };
};

const detectPdftkDependency = async () => {
  const pdftkCandidates = [];

  if (process.env.PDFTK_PATH) {
    pdftkCandidates.push(process.env.PDFTK_PATH);
  }

  if (process.platform === 'win32') {
    pdftkCandidates.push(...(await getWindowsPdftkCandidates()));
  }

  pdftkCandidates.push('pdftk', 'pdftk.exe');

  const pdftkPath = await findBinary(pdftkCandidates, ['--version']);
  return { pdftkPath };
};

const installOnDebianFamily = async (missingPackages) => {
  const installArgs = ['install', ...missingPackages, '-y'];

  try {
    await runCliCommand('sudo', ['-n', 'apt', 'update'], { timeoutMs: 10 * 60 * 1000 });
    await runCliCommand('sudo', ['-n', 'apt', ...installArgs], {
      timeoutMs: 10 * 60 * 1000,
    });
    return;
  } catch (error) {
    logger.warn(`sudo apt install failed, trying apt directly: ${error.message}`);
  }

  await runCliCommand('apt', ['update'], { timeoutMs: 10 * 60 * 1000 });
  await runCliCommand('apt', installArgs, { timeoutMs: 10 * 60 * 1000 });
};

const installPdftkOnWindows = async () => {
  await runCliCommand('winget', [
    'install',
    '--id',
    'PDFLabs.PDFtk.Server',
    '-e',
    '--accept-package-agreements',
    '--accept-source-agreements',
  ]);
};

const installGhostscriptOnWindows = async () => {
  const wingetAttempts = [
    ['install', '--name', 'Ghostscript', '--accept-package-agreements', '--accept-source-agreements'],
    ['install', '--id', 'ArtifexSoftware.Ghostscript', '-e', '--accept-package-agreements', '--accept-source-agreements'],
  ];

  for (const args of wingetAttempts) {
    try {
      await runCliCommand('winget', args);
      return true;
    } catch {
      // Continue with next attempt.
    }
  }

  const installScript = [
    "$ErrorActionPreference='Stop'",
    "$release=Invoke-RestMethod -Uri 'https://api.github.com/repos/ArtifexSoftware/ghostpdl-downloads/releases/latest'",
    "$asset=$release.assets | Where-Object { $_.name -match '^gs\\d+w64\\.exe$' } | Select-Object -First 1",
    "if(-not $asset){ throw 'Ghostscript installer asset not found.' }",
    "$installer=Join-Path $env:TEMP $asset.name",
    "Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $installer",
    "Start-Process -FilePath $installer -ArgumentList '/S' -Wait -NoNewWindow",
  ].join(';');

  try {
    await runCliCommand('powershell', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      installScript,
    ], { timeoutMs: 20 * 60 * 1000 });
    return true;
  } catch (error) {
    logger.warn(`Ghostscript installer fallback failed: ${error.message}`);
    return false;
  }
};

const installMissingDependencies = async ({ needsPdftk, needsGhostscript }) => {
  if (!needsPdftk && !needsGhostscript) {
    return;
  }

  if (process.platform === 'linux') {
    const packages = [];
    if (needsGhostscript) {
      packages.push('ghostscript');
    }
    if (needsPdftk) {
      packages.push('pdftk');
    }

    if (packages.length > 0) {
      logger.warn(`Installing missing PDF CLI dependencies via apt: ${packages.join(', ')}`);
      await installOnDebianFamily(packages);
    }
    return;
  }

  if (process.platform === 'win32') {
    if (needsPdftk) {
      logger.warn('Installing missing dependency: PDFtk');
      await installPdftkOnWindows();
    }

    if (needsGhostscript) {
      logger.warn('Installing missing dependency: Ghostscript');
      await installGhostscriptOnWindows();
    }
    return;
  }

  logger.warn(
    `Automatic PDF CLI installation is not configured for platform "${process.platform}".`
  );
};

const ensurePdfCliDependenciesInternal = async () => {
  let detected = await detectPdfCliDependencies();

  if (!detected.pdftkPath || !detected.ghostscriptPath) {
    await installMissingDependencies({
      needsPdftk: !detected.pdftkPath,
      needsGhostscript: !detected.ghostscriptPath,
    });
    detected = await detectPdfCliDependencies();
  }

  if (!detected.pdftkPath) {
    throw new Error(
      'PDFtk is required for Split/Merge PDF but is not available. Install pdftk and ensure it is accessible.'
    );
  }

  if (!detected.ghostscriptPath) {
    logger.warn(
      'Ghostscript is not available. Merge/Split will run with PDFtk; Ghostscript fallback is disabled.'
    );
  }

  logger.info(
    `PDF CLI dependencies ready. pdftk: ${detected.pdftkPath}; ghostscript: ${
      detected.ghostscriptPath || 'not found'
    }`
  );

  return detected;
};

export const ensurePdfCliDependencies = async () => {
  if (!ensureDependenciesPromise) {
    ensureDependenciesPromise = ensurePdfCliDependenciesInternal().catch((error) => {
      ensureDependenciesPromise = null;
      throw error;
    });
  }

  return ensureDependenciesPromise;
};

export const ensureGhostscriptDependency = async () => {
  if (!ensureGhostscriptPromise) {
    ensureGhostscriptPromise = (async () => {
      let detected = await detectGhostscriptDependency();

      if (!detected.ghostscriptPath) {
        await installMissingDependencies({
          needsPdftk: false,
          needsGhostscript: true,
        });
        detected = await detectGhostscriptDependency();
      }

      if (!detected.ghostscriptPath) {
        throw new Error(
          'Ghostscript is required for page extraction but was not found. Install Ghostscript and ensure it is accessible.'
        );
      }

      logger.info(`Ghostscript dependency ready: ${detected.ghostscriptPath}`);
      return detected;
    })().catch((error) => {
      ensureGhostscriptPromise = null;
      throw error;
    });
  }

  return ensureGhostscriptPromise;
};

export const ensurePdftkDependency = async () => {
  if (!ensurePdftkPromise) {
    ensurePdftkPromise = (async () => {
      let detected = await detectPdftkDependency();

      if (!detected.pdftkPath) {
        await installMissingDependencies({
          needsPdftk: true,
          needsGhostscript: false,
        });
        detected = await detectPdftkDependency();
      }

      if (!detected.pdftkPath) {
        throw new Error(
          'PDFtk is required for this operation but was not found. Install PDFtk and ensure it is accessible.'
        );
      }

      logger.info(`PDFtk dependency ready: ${detected.pdftkPath}`);
      return detected;
    })().catch((error) => {
      ensurePdftkPromise = null;
      throw error;
    });
  }

  return ensurePdftkPromise;
};
