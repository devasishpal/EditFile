import { v4 as uuidv4 } from 'uuid';
import { createJob } from '../../services/database.service.js';
import { logger } from '../../utils/logger.js';
import { asyncHandler } from '../../middleware/error.middleware.js';
import { processPdfToExcel } from './service.js';

const ALLOWED_OUTPUT_FORMATS = new Set(['xlsx', 'xls']);

export const pdfToExcel = asyncHandler(async (req, res) => {
  const startTime = Date.now();

  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'No file uploaded',
    });
  }

  const outputFormat = String(req.body.format || 'xlsx').toLowerCase();
  if (!ALLOWED_OUTPUT_FORMATS.has(outputFormat)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid output format. Use xlsx or xls.',
    });
  }

  const file = req.file;
  const requestId = uuidv4();

  logger.info(`PDF to Excel request: ${requestId}`);

  try {
    const job = await createJob({
      toolType: 'pdf-to-excel',
      originalSize: file.size,
      metadata: {
        outputFormat,
        originalName: file.originalname,
      },
      ipAddress: req.ip,
    });

    setImmediate(() => {
      processPdfToExcel({
        jobId: job.id,
        inputBuffer: file.buffer,
        outputFormat,
        originalName: file.originalname,
      }).catch((error) => {
        logger.error(`PDF to Excel background processing failed for job ${job.id}:`, error);
      });
    });

    const duration = Date.now() - startTime;
    logger.info(`PDF to Excel job created: ${job.id} in ${duration}ms`);

    res.status(202).json({
      success: true,
      message: 'PDF to Excel conversion started successfully',
      jobId: job.id,
      status: 'pending',
      outputFormat,
    });
  } catch (error) {
    logger.error(`PDF to Excel failed for request ${requestId}:`, error);
    throw error;
  }
});

export default { pdfToExcel };
