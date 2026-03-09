import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { uploadFile, generateS3Key, downloadFile } from '../../config/s3.js';
import { updateJobStatus, completeJob, failJob } from '../../services/database.service.js';
import { logger } from '../../utils/logger.js';
import { convertWithLibreOffice } from '../../utils/libreoffice.js';
import {
  CONVERSION_FAILURE_MESSAGE,
  getContentTypeForFormat,
} from '../../utils/office-formats.js';
import { buildFileName } from '../../utils/file-name.js';
import { resolvePythonRunner, runPythonCommand } from '../../utils/python-runner.js';
import { createTempWorkspace, removePathSafe } from '../../utils/workspace.js';

const ALLOWED_OUTPUT_FORMATS = new Set(['xlsx', 'xls']);
const CAMELOT_TIMEOUT_MS = Number.parseInt(
  process.env.PDF_TO_EXCEL_TIMEOUT_MS || '600000',
  10
);
const CAMELOT_DEPENDENCY_TIMEOUT_MS = Number.parseInt(
  process.env.PDF_TO_EXCEL_DEPENDENCY_TIMEOUT_MS || '30000',
  10
);
const CAMELOT_INSTALL_TIMEOUT_MS = Number.parseInt(
  process.env.PDF_TO_EXCEL_INSTALL_TIMEOUT_MS || '900000',
  10
);
const CAMELOT_INSTALL_ARGS = ['-m', 'pip', 'install', 'camelot-py[cv]', 'openpyxl', 'pandas'];
const CAMELOT_INSTALL_COMMAND = 'python -m pip install camelot-py[cv] openpyxl pandas';
const CAMELOT_REQUIRED_MODULES = ['camelot', 'openpyxl', 'pandas'];
const CAMELOT_DEPENDENCY_CHECK_SCRIPT = [
  'import importlib.util, json, sys',
  `required = ${JSON.stringify(CAMELOT_REQUIRED_MODULES)}`,
  'missing = [name for name in required if importlib.util.find_spec(name) is None]',
  'print(json.dumps({"missing": missing}))',
  'sys.exit(1 if missing else 0)',
].join('; ');
const NO_TABLES_MESSAGE =
  'No tables detected in this PDF. If this is a scanned or image-based PDF, try OCR first.';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CAMELOT_SCRIPT_PATH = path.resolve(__dirname, '../../workers/pdf_to_excel_camelot.py');

let ensureCamelotReadyPromise = null;

const getErrorMessage = (error) =>
  error instanceof Error ? error.message : String(error);

const isAutoInstallCamelotEnabled = () => ['1', 'true', 'yes', 'on'].includes(
  String(process.env.PDF_TO_EXCEL_AUTO_INSTALL || 'true').toLowerCase()
);

const parseJsonPayload = (raw) => {
  const lines = String(raw || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(lines[index]);
    } catch {
      // Keep scanning backwards.
    }
  }

  return null;
};

const getMissingDependencyMessage = (result) => {
  const payload = parseJsonPayload(result?.stdout) || parseJsonPayload(result?.stderr);
  const missing = Array.isArray(payload?.missing)
    ? payload.missing.filter((value) => typeof value === 'string' && value.trim())
    : [];

  if (missing.length > 0) {
    return `Missing Python packages: ${missing.join(', ')}. Install them with "${CAMELOT_INSTALL_COMMAND}".`;
  }

  const details = result?.stderr?.trim() || result?.stdout?.trim();
  if (details) {
    return `Camelot Python dependencies are missing. Install them with "${CAMELOT_INSTALL_COMMAND}". ${details}`.trim();
  }

  return `Camelot Python dependencies are missing. Install them with "${CAMELOT_INSTALL_COMMAND}".`;
};

const ensureCamelotDependencies = async () => {
  if (!ensureCamelotReadyPromise) {
    ensureCamelotReadyPromise = (async () => {
      await fs.access(CAMELOT_SCRIPT_PATH);

      const pythonRunner = await resolvePythonRunner();
      const dependencyCheck = await runPythonCommand(
        pythonRunner,
        ['-c', CAMELOT_DEPENDENCY_CHECK_SCRIPT],
        {
          timeoutMs: CAMELOT_DEPENDENCY_TIMEOUT_MS,
          rejectOnNonZero: false,
        }
      );

      if (dependencyCheck.code !== 0) {
        if (!isAutoInstallCamelotEnabled()) {
          throw new Error(getMissingDependencyMessage(dependencyCheck));
        }

        logger.warn('PDF to Excel Python dependencies missing, attempting auto-install via pip');

        const pipCheck = await runPythonCommand(
          pythonRunner,
          ['-m', 'pip', '--version'],
          {
            timeoutMs: CAMELOT_DEPENDENCY_TIMEOUT_MS,
            rejectOnNonZero: false,
          }
        );

        if (pipCheck.code !== 0) {
          throw new Error(
            `Python pip is not available for automatic install. Install dependencies manually with "${CAMELOT_INSTALL_COMMAND}".`
          );
        }

        await runPythonCommand(
          pythonRunner,
          CAMELOT_INSTALL_ARGS,
          {
            timeoutMs: CAMELOT_INSTALL_TIMEOUT_MS,
            rejectOnNonZero: true,
          }
        );

        const recheck = await runPythonCommand(
          pythonRunner,
          ['-c', CAMELOT_DEPENDENCY_CHECK_SCRIPT],
          {
            timeoutMs: CAMELOT_DEPENDENCY_TIMEOUT_MS,
            rejectOnNonZero: false,
          }
        );

        if (recheck.code !== 0) {
          throw new Error(getMissingDependencyMessage(recheck));
        }
      }

      return pythonRunner;
    })().catch((error) => {
      ensureCamelotReadyPromise = null;
      throw error;
    });
  }

  return ensureCamelotReadyPromise;
};

const normalizeInputBuffer = (inputBuffer) => {
  if (!inputBuffer) {
    return null;
  }

  if (Buffer.isBuffer(inputBuffer)) {
    return inputBuffer;
  }

  return Buffer.from(inputBuffer);
};

const convertPdfToExcelBuffer = async (pdfBuffer, originalName, outputFormat) => {
  const pythonRunner = await ensureCamelotDependencies();
  const workspacePath = await createTempWorkspace('editfile-pdf-to-excel-');

  try {
    const inputPath = path.join(workspacePath, 'input.pdf');
    const outputXlsxPath = path.join(workspacePath, 'output.xlsx');

    await fs.writeFile(inputPath, pdfBuffer);

    const execution = await runPythonCommand(
      pythonRunner,
      [CAMELOT_SCRIPT_PATH, inputPath, outputXlsxPath],
      {
        timeoutMs: CAMELOT_TIMEOUT_MS,
        rejectOnNonZero: false,
      }
    );

    const payload = parseJsonPayload(execution.stdout) || parseJsonPayload(execution.stderr);

    if (execution.code !== 0) {
      const message =
        payload?.code === 'NO_TABLES'
          ? NO_TABLES_MESSAGE
          : payload?.message || execution.stderr.trim() || execution.stdout.trim();

      throw new Error(message || CONVERSION_FAILURE_MESSAGE);
    }

    const xlsxBuffer = await fs.readFile(outputXlsxPath);
    if (!xlsxBuffer?.length) {
      throw new Error('PDF to Excel conversion produced an empty file.');
    }

    if (outputFormat === 'xlsx') {
      return {
        buffer: xlsxBuffer,
        tableCount: payload?.validTableCount || payload?.tableCount || null,
        flavor: payload?.flavor || null,
      };
    }

    const xlsBuffer = await convertWithLibreOffice(
      xlsxBuffer,
      buildFileName({
        originalName,
        extension: 'xlsx',
        fallbackBase: 'document',
      }),
      'xls'
    );

    if (!xlsBuffer?.length) {
      throw new Error('PDF to Excel conversion produced an empty XLS file.');
    }

    return {
      buffer: xlsBuffer,
      tableCount: payload?.validTableCount || payload?.tableCount || null,
      flavor: payload?.flavor || null,
    };
  } finally {
    await removePathSafe(workspacePath);
  }
};

export const processPdfToExcel = async (jobData) => {
  const {
    jobId,
    fileUrl,
    inputBuffer,
    outputFormat,
    originalName = 'source.pdf',
  } = jobData;
  const normalizedFormat = String(outputFormat || 'xlsx').toLowerCase();

  logger.info(`Starting PDF to Excel: ${jobId}`);

  try {
    await updateJobStatus(jobId, 'processing');

    if (!ALLOWED_OUTPUT_FORMATS.has(normalizedFormat)) {
      throw new Error('Unsupported output format. Use xlsx or xls.');
    }

    const pdfBuffer =
      normalizeInputBuffer(inputBuffer) || (fileUrl ? await downloadFile(fileUrl) : null);

    if (!pdfBuffer?.length) {
      throw new Error('Input PDF data was not provided.');
    }

    const conversionResult = await convertPdfToExcelBuffer(
      pdfBuffer,
      originalName,
      normalizedFormat
    );
    const outputBuffer = conversionResult.buffer;

    if (!outputBuffer || outputBuffer.length === 0) {
      throw new Error('PDF to Excel conversion produced an empty file.');
    }

    const outputFileName = buildFileName({
      originalName,
      extension: normalizedFormat,
      fallbackBase: 'document',
    });
    const outputKey = generateS3Key(jobId, outputFileName, 'output');
    const outputUrl = await uploadFile(
      outputBuffer,
      outputKey,
      getContentTypeForFormat(normalizedFormat)
    );

    await completeJob(jobId, outputUrl, outputBuffer.length);
    await updateJobStatus(jobId, 'completed', {
      metadata: {
        originalName,
        outputFormat: normalizedFormat,
        outputFileName,
        tableCount: conversionResult.tableCount,
        camelotFlavor: conversionResult.flavor,
      },
    });

    logger.info(`PDF to Excel completed: ${jobId}`);

    return {
      success: true,
      jobId,
      outputFormat: normalizedFormat,
      outputSize: outputBuffer.length,
      outputUrl,
    };
  } catch (error) {
    const rawMessage = getErrorMessage(error) || CONVERSION_FAILURE_MESSAGE;
    const safeMessage = rawMessage.includes('No tables detected in this PDF')
      ? NO_TABLES_MESSAGE
      : rawMessage;
    logger.error(`PDF to Excel failed for job ${jobId}:`, error);
    await failJob(jobId, safeMessage);
    throw new Error(safeMessage);
  }
};

export default { processPdfToExcel };
