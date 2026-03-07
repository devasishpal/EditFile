import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import cron from 'node-cron';

import { errorHandler } from './middleware/error.middleware.js';
import { logger } from './utils/logger.js';
import { connectDatabase } from './services/database.service.js';
import { cleanupService } from './services/cleanup.service.js';
import { readLocalFileByKey } from './config/s3.js';
import { isLocalMode } from './config/runtime.js';
import { ensureWorkspaceDirectories } from './utils/workspace.js';

// Import routes
import compressPdfRoutes from './modules/compress-pdf/route.js';
import mergePdfRoutes from './modules/merge-pdf/route.js';
import splitPdfRoutes from './modules/split-pdf/route.js';
import pdfToWordRoutes from './modules/pdf-to-word/route.js';
import wordToPdfRoutes from './modules/word-to-pdf/route.js';
import pdfToJpgRoutes from './modules/pdf-to-jpg/route.js';
import jpgToPdfRoutes from './modules/jpg-to-pdf/route.js';
import protectPdfRoutes from './modules/protect-pdf/route.js';
import unlockPdfRoutes from './modules/unlock-pdf/route.js';
import ocrPdfRoutes from './modules/ocr-pdf/route.js';
import imageCompressRoutes from './modules/image-compress/route.js';
import imageResizeRoutes from './modules/image-resize/route.js';
import imageConvertRoutes from './modules/image-convert/route.js';
import imageRotateRoutes from './modules/image-rotate/route.js';
import imageCropRoutes from './modules/image-crop/route.js';
import imageWatermarkRoutes from './modules/image-watermark/route.js';
import imageThumbnailRoutes from './modules/image-thumbnail/route.js';
import removeBackgroundRoutes from './modules/remove-background/route.js';
import directImageRoutes from './modules/direct-image/route.js';
import pdfEditRoutes from './modules/pdf-edit/route.js';
import jobStatusRoutes from './modules/job-status/route.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}));

// CORS configuration
const frontendOrigin = process.env.FRONTEND_URL || '*';
app.use(cors({
  origin: frontendOrigin === '*' ? true : frontendOrigin,
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: frontendOrigin !== '*',
}));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging
app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    mode: isLocalMode ? 'local' : 'remote',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

if (isLocalMode) {
  app.get('/api/local-download', async (req, res, next) => {
    try {
      const key = req.query.key;
      if (!key || typeof key !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Missing download key',
        });
      }

      const file = await readLocalFileByKey(key);
      res.setHeader('Content-Type', file.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
      return res.send(file.buffer);
    } catch (error) {
      return next(error);
    }
  });
}

// API routes
app.use('/api', directImageRoutes);
app.use('/api', pdfEditRoutes);
app.use('/api/compress-pdf', compressPdfRoutes);
app.use('/api/merge-pdf', mergePdfRoutes);
app.use('/api/split-pdf', splitPdfRoutes);
app.use('/api/pdf-to-word', pdfToWordRoutes);
app.use('/api/word-to-pdf', wordToPdfRoutes);
app.use('/api/pdf-to-jpg', pdfToJpgRoutes);
app.use('/api/jpg-to-pdf', jpgToPdfRoutes);
app.use('/api/protect-pdf', protectPdfRoutes);
app.use('/api/unlock-pdf', unlockPdfRoutes);
app.use('/api/ocr-pdf', ocrPdfRoutes);
app.use('/api/image-compress', imageCompressRoutes);
app.use('/api/image-resize', imageResizeRoutes);
app.use('/api/image-convert', imageConvertRoutes);
app.use('/api/image-rotate', imageRotateRoutes);
app.use('/api/image-crop', imageCropRoutes);
app.use('/api/image-watermark', imageWatermarkRoutes);
app.use('/api/image-thumbnail', imageThumbnailRoutes);
app.use('/api/remove-background', removeBackgroundRoutes);
app.use('/api', jobStatusRoutes);

// Error handling
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
  });
});

// Initialize database and start server
const startServer = async () => {
  try {
    await ensureWorkspaceDirectories();

    // Connect to database
    await connectDatabase();
    logger.info('Database connected successfully');

    // Start server
    app.listen(PORT, () => {
      logger.info(`EditFile backend server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`Runtime mode: ${isLocalMode ? 'local' : 'remote'}`);
    });

    // Schedule cleanup job - runs every 10 minutes and clears files older than 30 minutes
    cron.schedule('*/10 * * * *', async () => {
      logger.info('Running scheduled cleanup job...');
      try {
        await cleanupService.cleanupExpiredFiles();
        logger.info('Cleanup job completed');
      } catch (error) {
        logger.error('Cleanup job failed:', error);
      }
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

startServer();

export default app;

