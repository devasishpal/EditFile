import Redis from 'ioredis';
import { logger } from '../utils/logger.js';
import { isLocalQueueMode } from './runtime.js';

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
};

// Redis connection for BullMQ
export const redisConnection = isLocalQueueMode ? null : new Redis({
  ...redisConfig,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

if (redisConnection) {
  redisConnection.on('connect', () => {
    logger.info('Redis connected successfully');
  });

  redisConnection.on('error', (error) => {
    logger.error('Redis connection error:', error);
  });
} else {
  logger.info('LOCAL_MODE queue enabled: Redis connection skipped');
}

// For BullMQ v5, we need to export the connection options
export const redisOptions = isLocalQueueMode ? null : redisConfig;

export default redisConnection;
