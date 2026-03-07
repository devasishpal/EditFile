import fs from 'fs/promises';
import path from 'path';
import readline from 'readline';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { logger } from '../../utils/logger.js';
import { resolveConcurrency } from '../../utils/concurrency.js';

const PYTHON_PROBE_TIMEOUT_MS = Number.parseInt(
  process.env.REMOVE_BG_PYTHON_PROBE_TIMEOUT_MS || '10000',
  10
);
const DEPENDENCY_CHECK_TIMEOUT_MS = Number.parseInt(
  process.env.REMOVE_BG_DEPENDENCY_CHECK_TIMEOUT_MS || '15000',
  10
);
const WORKER_READY_TIMEOUT_MS = Number.parseInt(
  process.env.REMOVE_BG_WORKER_READY_TIMEOUT_MS || '45000',
  10
);
const TASK_TIMEOUT_MS = Number.parseInt(process.env.REMOVE_BG_TIMEOUT_MS || '30000', 10);
const PROCESS_OUTPUT_CAPTURE_LIMIT = 64 * 1024;

const DEPENDENCY_INSTALL_COMMAND = 'pip install rembg pillow onnxruntime';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKER_SCRIPT_PATH = path.resolve(__dirname, '../../workers/rembg_worker.py');

const appendProcessOutput = (current, chunk) => {
  const nextValue = `${current}${String(chunk)}`;
  if (nextValue.length <= PROCESS_OUTPUT_CAPTURE_LIMIT) {
    return nextValue;
  }
  return nextValue.slice(-PROCESS_OUTPUT_CAPTURE_LIMIT);
};

const runProcess = (command, args, { timeoutMs } = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });

    const maxDurationMs = timeoutMs ?? PYTHON_PROBE_TIMEOUT_MS;
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;

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
    }, maxDurationMs);

    child.stdout.on('data', (chunk) => {
      stdout = appendProcessOutput(stdout, chunk);
    });

    child.stderr.on('data', (chunk) => {
      stderr = appendProcessOutput(stderr, chunk);
    });

    child.on('error', (error) => {
      finalize(() => reject(error));
    });

    child.on('close', (code, signal) => {
      finalize(() => {
        if (timedOut) {
          reject(new Error(`Command timed out after ${maxDurationMs}ms`));
          return;
        }

        if (code === 0) {
          resolve({ stdout, stderr });
          return;
        }

        reject(
          new Error(
            stderr.trim() || stdout.trim() || `Command failed with code ${code}${signal ? ` (${signal})` : ''}`
          )
        );
      });
    });
  });

const getPythonCandidates = () => {
  const candidates = [];

  if (process.env.PYTHON_EXECUTABLE) {
    candidates.push({ command: process.env.PYTHON_EXECUTABLE, prefixArgs: [] });
  }

  candidates.push({ command: 'python', prefixArgs: [] });
  candidates.push({ command: 'python3', prefixArgs: [] });

  if (process.platform === 'win32') {
    candidates.push({ command: 'py', prefixArgs: ['-3'] });
  }

  return candidates;
};

const resolvePythonRunner = async () => {
  for (const candidate of getPythonCandidates()) {
    try {
      await runProcess(candidate.command, [...candidate.prefixArgs, '--version'], {
        timeoutMs: PYTHON_PROBE_TIMEOUT_MS,
      });
      return candidate;
    } catch {
      // Try next candidate.
    }
  }

  return null;
};

const ensurePythonDependencies = async (pythonRunner) => {
  await runProcess(
    pythonRunner.command,
    [...pythonRunner.prefixArgs, '-c', 'import rembg, PIL, onnxruntime'],
    { timeoutMs: DEPENDENCY_CHECK_TIMEOUT_MS }
  );
};

class RembgWorker {
  constructor({ id, command, prefixArgs, workerScriptPath }) {
    this.id = id;
    this.command = command;
    this.prefixArgs = prefixArgs;
    this.workerScriptPath = workerScriptPath;
    this.proc = null;
    this.stdoutReader = null;
    this.stderr = '';
    this.ready = false;
    this.readyPromise = null;
    this.readyResolver = null;
    this.readyRejecter = null;
    this.currentTask = null;
  }

  async start() {
    await fs.access(this.workerScriptPath);

    this.ready = false;
    this.stderr = '';
    this.readyPromise = new Promise((resolve, reject) => {
      this.readyResolver = resolve;
      this.readyRejecter = reject;
    });

    this.proc = spawn(
      this.command,
      [...this.prefixArgs, this.workerScriptPath],
      {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          PYTHONUNBUFFERED: '1',
        },
      }
    );

    this.stdoutReader = readline.createInterface({
      input: this.proc.stdout,
      crlfDelay: Infinity,
    });

    this.stdoutReader.on('line', (line) => {
      this.handleWorkerMessage(line);
    });

    this.proc.stderr.on('data', (chunk) => {
      this.stderr = appendProcessOutput(this.stderr, chunk);
    });

    this.proc.on('error', (error) => {
      this.rejectReady(error);
      this.rejectCurrentTask(new Error(`rembg worker process error: ${error.message}`));
    });

    this.proc.on('exit', (code, signal) => {
      const reason =
        this.stderr.trim() || `rembg worker exited with code ${code}${signal ? ` (${signal})` : ''}`;
      this.rejectReady(new Error(reason));
      this.rejectCurrentTask(new Error(reason));
      this.ready = false;
      this.proc = null;
    });

    const readyTimeout = setTimeout(() => {
      this.rejectReady(new Error(`rembg worker did not become ready in ${WORKER_READY_TIMEOUT_MS}ms`));
      this.stop().catch(() => undefined);
    }, WORKER_READY_TIMEOUT_MS);

    try {
      await this.readyPromise;
    } finally {
      clearTimeout(readyTimeout);
    }
  }

  handleWorkerMessage(rawLine) {
    let payload;
    try {
      payload = JSON.parse(rawLine);
    } catch {
      return;
    }

    if (payload?.type === 'ready') {
      this.ready = true;
      if (this.readyResolver) {
        this.readyResolver();
        this.readyResolver = null;
        this.readyRejecter = null;
      }
      logger.info(`remove-background worker ready: #${this.id} (model=${payload.model || 'default'})`);
      return;
    }

    if (payload?.type === 'init_error') {
      this.rejectReady(new Error(payload.error || 'Failed to initialize rembg worker'));
      return;
    }

    if (!this.currentTask) {
      return;
    }

    if (payload?.id !== this.currentTask.id) {
      return;
    }

    const task = this.currentTask;
    this.currentTask = null;
    clearTimeout(task.timeoutHandle);

    if (payload.ok) {
      task.resolve();
      return;
    }

    task.reject(new Error(payload.error || 'rembg worker failed to process the image'));
  }

  rejectReady(error) {
    if (this.readyRejecter) {
      this.readyRejecter(error);
      this.readyResolver = null;
      this.readyRejecter = null;
    }
  }

  rejectCurrentTask(error) {
    if (!this.currentTask) {
      return;
    }

    const task = this.currentTask;
    this.currentTask = null;
    clearTimeout(task.timeoutHandle);
    task.reject(error);
  }

  async processTask({ inputPath, outputPath, timeoutMs = TASK_TIMEOUT_MS }) {
    if (!this.proc || !this.ready) {
      await this.start();
    }

    if (!this.proc || !this.proc.stdin || this.proc.killed) {
      throw new Error('rembg worker is not available');
    }

    const id = randomUUID();

    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.rejectCurrentTask(new Error(`Background removal timed out after ${Math.ceil(timeoutMs / 1000)} seconds`));
        this.stop().catch(() => undefined);
      }, timeoutMs);

      this.currentTask = {
        id,
        resolve,
        reject,
        timeoutHandle,
      };

      const payload = JSON.stringify({
        id,
        action: 'process',
        inputPath,
        outputPath,
      });

      try {
        this.proc.stdin.write(`${payload}\n`);
      } catch (error) {
        clearTimeout(timeoutHandle);
        this.currentTask = null;
        reject(new Error(`Failed to communicate with rembg worker: ${error.message}`));
      }
    });
  }

  async stop() {
    if (!this.proc) {
      return;
    }

    const proc = this.proc;
    this.proc = null;
    this.ready = false;

    this.rejectCurrentTask(new Error('rembg worker stopped before task completion'));

    if (this.stdoutReader) {
      this.stdoutReader.close();
      this.stdoutReader = null;
    }

    try {
      proc.kill();
    } catch {
      // Ignore.
    }
  }
}

export class RembgWorkerPool {
  constructor({ workerCount, taskTimeoutMs } = {}) {
    this.workerCount = Math.max(
      1,
      workerCount ||
        resolveConcurrency('REMOVE_BG_WORKERS', {
          reserve: 1,
          min: 1,
          max: 4,
        })
    );
    this.taskTimeoutMs = taskTimeoutMs || TASK_TIMEOUT_MS;
    this.initialized = false;
    this.initializingPromise = null;
    this.pythonRunner = null;
    this.workers = [];
    this.pending = [];
  }

  async init() {
    if (this.initialized) {
      return;
    }

    if (this.initializingPromise) {
      await this.initializingPromise;
      return;
    }

    this.initializingPromise = (async () => {
      const pythonRunner = await resolvePythonRunner();
      if (!pythonRunner) {
        throw new Error(`Python 3 not found in PATH. Install Python and run: ${DEPENDENCY_INSTALL_COMMAND}`);
      }

      await ensurePythonDependencies(pythonRunner);
      this.pythonRunner = pythonRunner;

      this.workers = Array.from({ length: this.workerCount }, (_, index) => ({
        runner: new RembgWorker({
          id: index + 1,
          command: pythonRunner.command,
          prefixArgs: pythonRunner.prefixArgs,
          workerScriptPath: WORKER_SCRIPT_PATH,
        }),
        busy: false,
      }));

      await Promise.all(this.workers.map((worker) => worker.runner.start()));
      this.initialized = true;

      logger.info(`remove-background worker pool initialized (workers=${this.workerCount})`);
    })().catch((error) => {
      this.initializingPromise = null;
      throw error;
    });

    try {
      await this.initializingPromise;
    } finally {
      this.initializingPromise = null;
    }
  }

  async processImage({ inputPath, outputPath, timeoutMs }) {
    await this.init();

    return new Promise((resolve, reject) => {
      this.pending.push({
        inputPath,
        outputPath,
        timeoutMs: timeoutMs || this.taskTimeoutMs,
        resolve,
        reject,
      });

      this.dispatch();
    });
  }

  dispatch() {
    if (!this.pending.length) {
      return;
    }

    const availableWorker = this.workers.find((worker) => !worker.busy);
    if (!availableWorker) {
      return;
    }

    const nextTask = this.pending.shift();
    availableWorker.busy = true;

    availableWorker.runner
      .processTask({
        inputPath: nextTask.inputPath,
        outputPath: nextTask.outputPath,
        timeoutMs: nextTask.timeoutMs,
      })
      .then(nextTask.resolve)
      .catch(async (error) => {
        nextTask.reject(error);
        await availableWorker.runner.stop().catch(() => undefined);
        try {
          await availableWorker.runner.start();
        } catch (restartError) {
          logger.error(`Failed to restart remove-background worker: ${restartError.message}`);
        }
      })
      .finally(() => {
        availableWorker.busy = false;
        this.dispatch();
      });

    if (this.pending.length > 0) {
      this.dispatch();
    }
  }

  async stop() {
    await Promise.all(this.workers.map((worker) => worker.runner.stop()));
    this.workers = [];
    this.initialized = false;
  }
}

export default RembgWorkerPool;
