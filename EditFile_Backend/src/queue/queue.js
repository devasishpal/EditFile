import { Queue } from 'bullmq';
import { redisOptions } from '../config/redis.js';
import { isLocalQueueMode } from '../config/runtime.js';
import { logger } from '../utils/logger.js';
import { createLimiter, resolveConcurrency } from '../utils/concurrency.js';
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

const useLocalQueue = isLocalQueueMode || !redisOptions;
const LOCAL_QUEUE_CONCURRENCY = resolveConcurrency('LOCAL_QUEUE_CONCURRENCY', {
  reserve: 1,
  min: 1,
  max: 16,
});
const localQueueLimiter = createLimiter(LOCAL_QUEUE_CONCURRENCY);
const localQueueStats = new Map();

const getLocalQueueStats = (queueName) => {
  if (!localQueueStats.has(queueName)) {
    localQueueStats.set(queueName, {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
    });
  }

  return localQueueStats.get(queueName);
};

const localProcessors = {
  compressPdf: processCompressPdf,
  mergePdf: processMergePdf,
  splitPdf: processSplitPdf,
  pdfToWord: processPdfToWord,
  wordToPdf: processWordToPdf,
  pdfToJpg: processPdfToJpg,
  jpgToPdf: processJpgToPdf,
  protectPdf: processProtectPdf,
  unlockPdf: processUnlockPdf,
  ocrPdf: processOcrPdf,
  imageCompress: processImageCompress,
  imageResize: processImageResize,
  imageConvert: processImageConvert,
  imageRotate: processImageRotate,
  imageCrop: processImageCrop,
  imageWatermark: processImageWatermark,
  imageThumbnail: processImageThumbnail,
};

// Default job options
const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000,
  },
  removeOnComplete: {
    count: 100,
    age: 24 * 3600, // 24 hours
  },
  removeOnFail: {
    count: 50,
    age: 7 * 24 * 3600, // 7 days
  },
};

/**
 * Create a new BullMQ queue
 * @param {string} name - Queue name
 * @returns {Queue} - BullMQ queue instance
 */
export const createQueue = (name) => {
  if (useLocalQueue) {
    logger.info(`LOCAL_MODE queue stub created: ${name}`);
    return {
      name,
      async getWaitingCount() { return getLocalQueueStats(name).waiting; },
      async getActiveCount() { return getLocalQueueStats(name).active; },
      async getCompletedCount() { return getLocalQueueStats(name).completed; },
      async getFailedCount() { return getLocalQueueStats(name).failed; },
      async getDelayedCount() { return getLocalQueueStats(name).delayed; },
    };
  }

  const queue = new Queue(name, {
    connection: redisOptions,
    defaultJobOptions,
  });

  queue.on('error', (error) => {
    logger.error(`Queue ${name} error:`, error);
  });

  logger.info(`Queue created: ${name}`);
  return queue;
};

// Define all tool queues
export const queues = {
  compressPdf: createQueue('compress-pdf'),
  mergePdf: createQueue('merge-pdf'),
  splitPdf: createQueue('split-pdf'),
  pdfToWord: createQueue('pdf-to-word'),
  wordToPdf: createQueue('word-to-pdf'),
  pdfToJpg: createQueue('pdf-to-jpg'),
  jpgToPdf: createQueue('jpg-to-pdf'),
  protectPdf: createQueue('protect-pdf'),
  unlockPdf: createQueue('unlock-pdf'),
  ocrPdf: createQueue('ocr-pdf'),
  imageCompress: createQueue('image-compress'),
  imageResize: createQueue('image-resize'),
  imageConvert: createQueue('image-convert'),
  imageRotate: createQueue('image-rotate'),
  imageCrop: createQueue('image-crop'),
  imageWatermark: createQueue('image-watermark'),
  imageThumbnail: createQueue('image-thumbnail'),
};

/**
 * Add a job to a queue
 * @param {string} queueName - Queue name
 * @param {Object} data - Job data
 * @param {Object} options - Job options
 * @returns {Promise<Object>} - Job
 */
export const addJob = async (queueName, data, options = {}) => {
  if (useLocalQueue) {
    const processor = localProcessors[queueName];
    if (!processor) {
      throw new Error(`Queue processor ${queueName} not found`);
    }

    const jobId = data.jobId || `${queueName}-${Date.now()}`;
    const stats = getLocalQueueStats(queueName);
    stats.waiting += 1;

    localQueueLimiter(async () => {
      stats.waiting = Math.max(0, stats.waiting - 1);
      stats.active += 1;

      try {
        await processor(data);
        stats.completed += 1;
      } catch (error) {
        stats.failed += 1;
        logger.error(`Local queue job failed (${queueName}:${jobId}):`, error);
      } finally {
        stats.active = Math.max(0, stats.active - 1);
      }
    }).catch((error) => {
      stats.failed += 1;
      stats.waiting = Math.max(0, stats.waiting - 1);
      logger.error(`Local queue limiter failure (${queueName}:${jobId}):`, error);
    });

    logger.info(
      `Local job queued: ${queueName}:${jobId} (max concurrency: ${LOCAL_QUEUE_CONCURRENCY})`
    );
    return {
      id: jobId,
      name: `${queueName}-job`,
      data,
      local: true,
    };
  }

  const queue = queues[queueName];
  if (!queue) {
    throw new Error(`Queue ${queueName} not found`);
  }

  const job = await queue.add(`${queueName}-job`, data, options);
  logger.info(`Job added to ${queueName}: ${job.id}`);
  return job;
};

/**
 * Get queue status
 * @param {string} queueName - Queue name
 * @returns {Promise<Object>} - Queue status
 */
export const getQueueStatus = async (queueName) => {
  if (useLocalQueue) {
    const stats = getLocalQueueStats(queueName);
    return {
      waiting: stats.waiting,
      active: stats.active,
      completed: stats.completed,
      failed: stats.failed,
      delayed: stats.delayed,
      total: stats.waiting + stats.active + stats.completed + stats.failed + stats.delayed,
      mode: 'local',
      maxConcurrency: LOCAL_QUEUE_CONCURRENCY,
    };
  }

  const queue = queues[queueName];
  if (!queue) {
    throw new Error(`Queue ${queueName} not found`);
  }

  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    total: waiting + active + completed + failed + delayed,
  };
};

/**
 * Get all queues status
 * @returns {Promise<Object>} - All queues status
 */
export const getAllQueuesStatus = async () => {
  const status = {};
  for (const [name, queue] of Object.entries(queues)) {
    status[name] = await getQueueStatus(name);
  }
  return status;
};

export default queues;
