import { uploadFile, generateS3Key, downloadFile } from '../../config/s3.js';
import { updateJobStatus, completeJob, failJob } from '../../services/database.service.js';
import { logger } from '../../utils/logger.js';
import { convertWithLibreOffice } from '../../utils/libreoffice.js';
import {
  CONVERSION_FAILURE_MESSAGE,
  getContentTypeForFormat,
} from '../../utils/office-formats.js';
import { buildFileName } from '../../utils/file-name.js';

const ALLOWED_OUTPUT_FORMATS = new Set(['xlsx', 'xls']);

const getErrorMessage = (error) =>
  error instanceof Error ? error.message : String(error);

const convertPdfToExcelBuffer = async (pdfBuffer, originalName, outputFormat) => {
  const attemptErrors = [];
  const attempt = async (label, action) => {
    try {
      const result = await action();
      if (result?.length) {
        return result;
      }

      attemptErrors.push(`${label}: empty output`);
      return null;
    } catch (error) {
      const message = getErrorMessage(error);
      attemptErrors.push(`${label}: ${message}`);
      logger.warn(`PDF to Excel attempt failed (${label}): ${message}`);
      return null;
    }
  };

  // Hybrid PDFs with embedded spreadsheet streams can work directly via Calc import.
  const directCalcBuffer = await attempt('direct-calc-stream', () =>
    convertWithLibreOffice(pdfBuffer, originalName, outputFormat, {
      inFilter: 'calc_pdf_addstream_import',
    })
  );
  if (directCalcBuffer?.length) {
    return directCalcBuffer;
  }

  // Reliable fallback for normal PDFs:
  // 1) import as Draw and export HTML
  // 2) import HTML in Calc and export XLSX/XLS
  const htmlBuffer = await attempt('pdf-to-html', () =>
    convertWithLibreOffice(pdfBuffer, originalName, 'html')
  );

  if (htmlBuffer?.length) {
    const htmlFileName = buildFileName({
      originalName,
      extension: 'html',
      fallbackBase: 'document',
    });

    const htmlToSpreadsheetBuffer = await attempt(`html-to-${outputFormat}`, () =>
      convertWithLibreOffice(htmlBuffer, htmlFileName, outputFormat, {
        inFilter: 'calc_HTML_WebQuery',
      })
    );

    if (htmlToSpreadsheetBuffer?.length) {
      return htmlToSpreadsheetBuffer;
    }
  }

  throw new Error(
    `PDF to Excel conversion failed after all attempts. ${attemptErrors.join(' | ')}`
  );
};

export const processPdfToExcel = async (jobData) => {
  const { jobId, fileUrl, outputFormat, originalName = 'source.pdf' } = jobData;
  const normalizedFormat = String(outputFormat || 'xlsx').toLowerCase();

  logger.info(`Starting PDF to Excel: ${jobId}`);

  try {
    await updateJobStatus(jobId, 'processing');

    if (!ALLOWED_OUTPUT_FORMATS.has(normalizedFormat)) {
      throw new Error('Unsupported output format. Use xlsx or xls.');
    }

    const pdfBuffer = await downloadFile(fileUrl);
    const outputBuffer = await convertPdfToExcelBuffer(
      pdfBuffer,
      originalName,
      normalizedFormat
    );

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
    const safeMessage = getErrorMessage(error) || CONVERSION_FAILURE_MESSAGE;
    logger.error(`PDF to Excel failed for job ${jobId}:`, error);
    await failJob(jobId, safeMessage);
    throw new Error(safeMessage);
  }
};

export default { processPdfToExcel };
