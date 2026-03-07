import { Worker } from 'bullmq';
import { redisOptions } from '../config/redis.js';
import { isLocalQueueMode } from '../config/runtime.js';
import { logger } from '../utils/logger.js';
import { resolveConcurrency } from '../utils/concurrency.js';

// Import all service processors
import { processCompressPdf } from '../modules/compress-pdf/service.js';
import { processMergePdf } from '../modules/merge-pdf/service.js';
import { processSplitPdf } from '../modules/split-pdf/service.js';
import { processPdfToWord } from '../modules/pdf-to-word/service.js';
import { processWordToPdf } from '../modules/word-to-pdf/service.js';
import { processPdfToJpg } from '../modules/pdf-to-jpg/service.js';
import { processJpgToPdf } from '../modules/jpg-to-pdf/service.js';
import { processProtectPdf } from '../modules/protect-pdf/service.js';
import { processUnlockPdf } from '../modules/unlock-pdf/service.js';
import { processOcrPdf } from '../modules/ocr-pdf/service.js';
import { processImageCompress } from '../modules/image-compress/service.js';
import { processImageResize } from '../modules/image-resize/service.js';
import { processImageConvert } from '../modules/image-convert/service.js';
import { processImageRotate } from '../modules/image-rotate/service.js';
import { processImageCrop } from '../modules/image-crop/service.js';
import { processImageWatermark } from '../modules/image-watermark/service.js';
import { processImageThumbnail } from '../modules/image-thumbnail/service.js';

// Worker configuration
const WORKER_CONCURRENCY = resolveConcurrency('WORKER_CONCURRENCY', {
  reserve: 1,
  min: 1,
  max: 16,
});
const useLocalQueue = isLocalQueueMode || !redisOptions;

if (useLocalQueue) {
  logger.info('LOCAL_MODE queue enabled: dedicated BullMQ worker is not required');
  process.exit(0);
}

/**
 * Create a worker for a queue
 * @param {string} queueName - Queue name
 * @param {Function} processor - Job processor function
 * @returns {Worker} - BullMQ worker instance
 */
const createWorker = (queueName, processor) => {
  const worker = new Worker(
    queueName,
    async (job) => {
      logger.info(`Processing job ${job.id} from ${queueName}`);
      const startTime = Date.now();

      try {
        const result = await processor(job.data);
        const duration = Date.now() - startTime;
        logger.info(`Job ${job.id} completed in ${duration}ms`);
        return result;
      } catch (error) {
        logger.error(`Job ${job.id} failed:`, error);
        throw error;
      }
    },
    {
      connection: redisOptions,
      concurrency: WORKER_CONCURRENCY,
      limiter: {
        max: 10,
        duration: 1000, // 10 jobs per second max
      },
    }
  );

  worker.on('completed', (job) => {
    logger.info(`Job ${job.id} completed successfully`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`Job ${job?.id} failed:`, err);
  });

  worker.on('error', (err) => {
    logger.error(`Worker ${queueName} error:`, err);
  });

  logger.info(`Worker created for queue: ${queueName} (concurrency: ${WORKER_CONCURRENCY})`);
  return worker;
};

// Create all workers
const workers = {
  compressPdf: createWorker('compress-pdf', processCompressPdf),
  mergePdf: createWorker('merge-pdf', processMergePdf),
  splitPdf: createWorker('split-pdf', processSplitPdf),
  pdfToWord: createWorker('pdf-to-word', processPdfToWord),
  wordToPdf: createWorker('word-to-pdf', processWordToPdf),
  pdfToJpg: createWorker('pdf-to-jpg', processPdfToJpg),
  jpgToPdf: createWorker('jpg-to-pdf', processJpgToPdf),
  protectPdf: createWorker('protect-pdf', processProtectPdf),
  unlockPdf: createWorker('unlock-pdf', processUnlockPdf),
  ocrPdf: createWorker('ocr-pdf', processOcrPdf),
  imageCompress: createWorker('image-compress', processImageCompress),
  imageResize: createWorker('image-resize', processImageResize),
  imageConvert: createWorker('image-convert', processImageConvert),
  imageRotate: createWorker('image-rotate', processImageRotate),
  imageCrop: createWorker('image-crop', processImageCrop),
  imageWatermark: createWorker('image-watermark', processImageWatermark),
  imageThumbnail: createWorker('image-thumbnail', processImageThumbnail),
};

// Graceful shutdown
const shutdown = async () => {
  logger.info('Shutting down workers...');
  
  for (const [name, worker] of Object.entries(workers)) {
    await worker.close();
    logger.info(`Worker ${name} closed`);
  }
  
  logger.info('All workers shut down');
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

logger.info('All workers started successfully');

export default workers;
