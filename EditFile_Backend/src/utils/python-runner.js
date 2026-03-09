import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';

const DETECT_TIMEOUT_MS = Number.parseInt(
  process.env.PYTHON_PROBE_TIMEOUT_MS || '10000',
  10
);
const DEFAULT_TIMEOUT_MS = Number.parseInt(
  process.env.PYTHON_COMMAND_TIMEOUT_MS || '600000',
  10
);

let resolvedPythonRunnerPromise = null;

const normalizeCandidate = (value) => String(value || '').trim();

const looksLikePath = (candidate) => {
  const value = normalizeCandidate(candidate);
  return value.includes(path.sep) || value.includes('/') || value.includes('\\');
};

const isExistingFile = async (candidate) => {
  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
};

const appendBinaryDirectoryToPath = (binaryPath) => {
  if (!binaryPath || !looksLikePath(binaryPath)) {
    return;
  }

  const directory = path.dirname(binaryPath);
  const delimiter = path.delimiter;
  const currentPath = process.env.PATH || '';
  const hasDirectory = currentPath
    .split(delimiter)
    .some((entry) => entry.trim().toLowerCase() === directory.trim().toLowerCase());

  if (!hasDirectory) {
    process.env.PATH = `${directory}${delimiter}${currentPath}`;
  }
};

const runRawCommand = (
  command,
  args = [],
  {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    env = {},
    captureStdout = true,
    captureStderr = true,
    rejectOnNonZero = false,
  } = {}
) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ['ignore', captureStdout ? 'pipe' : 'ignore', captureStderr ? 'pipe' : 'ignore'],
      env: {
        ...process.env,
        ...env,
      },
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
      setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          // Ignore.
        }
      }, 1000);
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

    child.on('close', (code, signal) => {
      clearTimeout(timer);

      if (timedOut) {
        reject(new Error(`Command timed out after ${timeoutMs}ms: ${command}`));
        return;
      }

      const result = {
        command,
        args,
        code: code ?? 1,
        signal: signal || null,
        stdout,
        stderr,
      };

      if (rejectOnNonZero && result.code !== 0) {
        const details = stderr.trim() || stdout.trim() || `exit code ${result.code}`;
        reject(new Error(`Command failed (${command} ${args.join(' ')}): ${details}`));
        return;
      }

      resolve(result);
    });
  });

const getPythonCandidates = () => {
  const candidates = [];

  for (const envName of [
    'PDF_TO_EXCEL_PYTHON_EXECUTABLE',
    'PYTHON_EXECUTABLE',
    'PYTHON_BIN',
  ]) {
    if (process.env[envName]) {
      candidates.push({ command: process.env[envName], prefixArgs: [] });
    }
  }

  candidates.push({ command: 'python', prefixArgs: [] });
  candidates.push({ command: 'python3', prefixArgs: [] });

  if (process.platform === 'win32') {
    candidates.push({ command: 'py', prefixArgs: ['-3'] });
  }

  return candidates;
};

const findPythonRunner = async () => {
  for (const candidate of getPythonCandidates()) {
    const command = normalizeCandidate(candidate.command);
    if (!command) {
      continue;
    }

    if (looksLikePath(command) && !(await isExistingFile(command))) {
      continue;
    }

    try {
      const result = await runRawCommand(
        command,
        [...candidate.prefixArgs, '--version'],
        {
          timeoutMs: DETECT_TIMEOUT_MS,
          rejectOnNonZero: false,
        }
      );

      if (result.code === 0) {
        appendBinaryDirectoryToPath(command);
        return {
          command,
          prefixArgs: candidate.prefixArgs,
        };
      }
    } catch {
      // Try the next candidate.
    }
  }

  return null;
};

export const resolvePythonRunner = async ({ forceRefresh = false } = {}) => {
  if (forceRefresh) {
    resolvedPythonRunnerPromise = null;
  }

  if (!resolvedPythonRunnerPromise) {
    resolvedPythonRunnerPromise = findPythonRunner().then((runner) => {
      if (!runner) {
        throw new Error('Python 3 was not found in PATH.');
      }

      return runner;
    }).catch((error) => {
      resolvedPythonRunnerPromise = null;
      throw error;
    });
  }

  return resolvedPythonRunnerPromise;
};

export const runPythonCommand = async (
  pythonRunner,
  args = [],
  options = {}
) => runRawCommand(
  pythonRunner.command,
  [...pythonRunner.prefixArgs, ...args],
  {
    ...options,
    env: {
      PYTHONUNBUFFERED: '1',
      ...(options.env || {}),
    },
  }
);

export default {
  resolvePythonRunner,
  runPythonCommand,
};
