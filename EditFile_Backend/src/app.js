import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import dotenv from 'dotenv';
import cron from 'node-cron';
import rateLimit from 'express-rate-limit';

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
import htmlToPdfRoutes from './modules/html-to-pdf/route.js';
import excelToPdfRoutes from './modules/excel-to-pdf/route.js';
import pdfToExcelRoutes from './modules/pdf-to-excel/route.js';
import powerpointToPdfRoutes from './modules/powerpoint-to-pdf/route.js';
import pdfToPowerpointRoutes from './modules/pdf-to-powerpoint/route.js';
import pdfToJpgRoutes from './modules/pdf-to-jpg/route.js';
import pdfToPdfaRoutes from './modules/pdf-to-pdfa/route.js';
import pdfToHtmlRoutes from './modules/pdf-to-html/route.js';
import jpgToPdfRoutes from './modules/jpg-to-pdf/route.js';
import protectPdfRoutes from './modules/protect-pdf/route.js';
import unlockPdfRoutes from './modules/unlock-pdf/route.js';
import repairPdfRoutes from './modules/repair-pdf/route.js';
import organizePdfRoutes from './modules/organize-pdf/route.js';
import ocrPdfRoutes from './modules/ocr-pdf/route.js';
import signPdfRoutes from './modules/sign-pdf/route.js';
import redactPdfRoutes from './modules/redact-pdf/route.js';
import comparePdfRoutes from './modules/compare-pdf/route.js';
import imageCompressRoutes from './modules/image-compress/route.js';
import imageResizeRoutes from './modules/image-resize/route.js';
import imageConvertRoutes from './modules/image-convert/route.js';
import imageRotateRoutes from './modules/image-rotate/route.js';
import imageCropRoutes from './modules/image-crop/route.js';
import imageWatermarkRoutes from './modules/image-watermark/route.js';
import imageThumbnailRoutes from './modules/image-thumbnail/route.js';
import removeBackgroundRoutes from './modules/remove-background/route.js';
import passportPhotoRoutes from './modules/passport-photo/route.js';
import directImageRoutes from './modules/direct-image/route.js';
import pdfEditRoutes from './modules/pdf-edit/route.js';
import jobStatusRoutes from './modules/job-status/route.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Security middleware
if (process.env.TRUST_PROXY) {
  app.set('trust proxy', process.env.TRUST_PROXY);
}

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}));

app.use(compression());

// CORS configuration
const defaultAllowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
  'https://*.vercel.app',
];

const configuredFrontendOrigins = (process.env.FRONTEND_URL || defaultAllowedOrigins.join(','))
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowAnyOrigin = isLocalMode || configuredFrontendOrigins.includes('*');
const parseOriginPattern = (pattern) => {
  const trimmed = String(pattern || '').trim();
  if (!trimmed || trimmed === '*') {
    return { any: true };
  }

  const hasScheme = trimmed.includes('://');
  const [scheme, rest] = hasScheme ? trimmed.split('://') : [null, trimmed];
  const hostWithPort = rest.split('/')[0];
  const [hostPattern, portPattern] = hostWithPort.split(':');
  return {
    any: false,
    scheme: scheme ? scheme.toLowerCase() : null,
    hostPattern: (hostPattern || '').toLowerCase(),
    portPattern: portPattern || null,
  };
};

const matchHostPattern = (hostname, hostPattern) => {
  if (!hostPattern || hostPattern === '*') {
    return true;
  }

  if (!hostPattern.includes('*')) {
    return hostname === hostPattern;
  }

  const normalizedHost = hostname.toLowerCase();
  const suffix = hostPattern.replace(/^\*\./, '');
  return normalizedHost === suffix || normalizedHost.endsWith(`.${suffix}`);
};

const isOriginAllowed = (origin) => {
  if (!origin) {
    return true;
  }

  if (allowAnyOrigin) {
    return true;
  }

  let parsedOrigin;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    return false;
  }

  const originScheme = parsedOrigin.protocol.replace(':', '').toLowerCase();
  const originHost = parsedOrigin.hostname.toLowerCase();
  const originPort = parsedOrigin.port || '';

  return configuredFrontendOrigins
    .map(parseOriginPattern)
    .some((pattern) => {
      if (pattern.any) {
        return true;
      }

      if (pattern.scheme && pattern.scheme !== originScheme) {
        return false;
      }

      if (!matchHostPattern(originHost, pattern.hostPattern)) {
        return false;
      }

      if (pattern.portPattern && pattern.portPattern !== originPort) {
        return false;
      }

      return true;
    });
};
const corsOrigin = allowAnyOrigin
  ? true
  : (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS blocked for origin: ${origin}`));
    };

app.use(cors({
  origin: corsOrigin,
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: !allowAnyOrigin,
}));

const rateLimitWindowMs = Number.parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10);
const rateLimitMax = Number.parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10);
const uploadRateLimitMax = Number.parseInt(process.env.UPLOAD_RATE_LIMIT_MAX || '20', 10);

const apiLimiter = rateLimit({
  windowMs: Number.isFinite(rateLimitWindowMs) ? rateLimitWindowMs : 15 * 60 * 1000,
  max: Number.isFinite(rateLimitMax) ? rateLimitMax : 100,
  standardHeaders: true,
  legacyHeaders: false,
});

const uploadLimiter = rateLimit({
  windowMs: Number.isFinite(rateLimitWindowMs) ? rateLimitWindowMs : 15 * 60 * 1000,
  max: Number.isFinite(uploadRateLimitMax) ? uploadRateLimitMax : 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => !['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method),
});

app.use('/api', apiLimiter, uploadLimiter);

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
      const requestedFileName = req.query.filename;
      if (!key || typeof key !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Missing download key',
        });
      }

      const file = await readLocalFileByKey(key);
      const safeFileName =
        typeof requestedFileName === 'string' && requestedFileName.trim()
          ? requestedFileName.replace(/["\\\r\n]/g, '_').trim()
          : file.fileName;
      res.setHeader('Content-Type', file.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);
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
app.use('/api/html-to-pdf', htmlToPdfRoutes);
app.use('/api/excel-to-pdf', excelToPdfRoutes);
app.use('/api/pdf-to-excel', pdfToExcelRoutes);
app.use('/api/powerpoint-to-pdf', powerpointToPdfRoutes);
app.use('/api/pdf-to-powerpoint', pdfToPowerpointRoutes);
app.use('/api/pdf-to-jpg', pdfToJpgRoutes);
app.use('/api/pdf-to-pdfa', pdfToPdfaRoutes);
app.use('/api/pdf-to-html', pdfToHtmlRoutes);
app.use('/api/jpg-to-pdf', jpgToPdfRoutes);
app.use('/api/protect-pdf', protectPdfRoutes);
app.use('/api/unlock-pdf', unlockPdfRoutes);
app.use('/api/repair-pdf', repairPdfRoutes);
app.use('/api/organize-pdf', organizePdfRoutes);
app.use('/api/ocr-pdf', ocrPdfRoutes);
app.use('/api/sign-pdf', signPdfRoutes);
app.use('/api/redact-pdf', redactPdfRoutes);
app.use('/api/compare-pdf', comparePdfRoutes);
app.use('/api/image-compress', imageCompressRoutes);
app.use('/api/image-resize', imageResizeRoutes);
app.use('/api/image-convert', imageConvertRoutes);
app.use('/api/image-rotate', imageRotateRoutes);
app.use('/api/image-crop', imageCropRoutes);
app.use('/api/image-watermark', imageWatermarkRoutes);
app.use('/api/image-thumbnail', imageThumbnailRoutes);
app.use('/api/remove-background', removeBackgroundRoutes);
app.use('/api/passport-photo', passportPhotoRoutes);
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

