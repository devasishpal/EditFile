import { body, param, validationResult } from 'express-validator';
import { logger } from '../utils/logger.js';

/**
 * Middleware to check validation results
 */
export const requestValidator = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array(),
    });
  }
  next();
};

/**
 * Validation rules for job ID parameter
 */
export const validateJobId = [
  param('id')
    .isUUID()
    .withMessage('Invalid job ID format'),
  requestValidator,
];

/**
 * Validation rules for compression level
 */
export const validateCompressionLevel = [
  body('compressionLevel')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Compression level must be between 1 and 100'),
  requestValidator,
];

/**
 * Validation rules for target size (KB)
 */
export const validateTargetSizeKB = [
  body('targetSizeKB')
    .optional()
    .isInt({ min: 1, max: 102400 })
    .withMessage('Target size must be between 1KB and 102400KB'),
  body('targetSize')
    .optional()
    .isInt({ min: 1, max: 102400 })
    .withMessage('Target size must be between 1KB and 102400KB'),
  requestValidator,
];

/**
 * Validation rules for image dimensions
 */
export const validateImageDimensions = [
  body('width')
    .optional()
    .isInt({ min: 1, max: 10000 })
    .withMessage('Width must be between 1 and 10000 pixels'),
  body('height')
    .optional()
    .isInt({ min: 1, max: 10000 })
    .withMessage('Height must be between 1 and 10000 pixels'),
  requestValidator,
];

/**
 * Validation rules for image rotation
 */
export const validateRotateAngle = [
  body('angle')
    .exists()
    .withMessage('angle is required')
    .bail()
    .isInt()
    .withMessage('angle must be an integer')
    .bail()
    .custom((value) => [90, 180, 270].includes(Number.parseInt(value, 10)))
    .withMessage('angle must be 90, 180, or 270'),
  requestValidator,
];

/**
 * Validation rules for image crop values
 */
export const validateCropDimensions = [
  body('x')
    .exists()
    .withMessage('x is required')
    .bail()
    .isInt({ min: 0, max: 20000 })
    .withMessage('x must be between 0 and 20000'),
  body('y')
    .exists()
    .withMessage('y is required')
    .bail()
    .isInt({ min: 0, max: 20000 })
    .withMessage('y must be between 0 and 20000'),
  body('width')
    .exists()
    .withMessage('width is required')
    .bail()
    .isInt({ min: 1, max: 20000 })
    .withMessage('width must be between 1 and 20000'),
  body('height')
    .exists()
    .withMessage('height is required')
    .bail()
    .isInt({ min: 1, max: 20000 })
    .withMessage('height must be between 1 and 20000'),
  requestValidator,
];

/**
 * Validation rules for watermark options
 */
export const validateWatermarkOptions = [
  body('type')
    .optional()
    .isIn(['text', 'image'])
    .withMessage('type must be text or image'),
  body('watermarkType')
    .optional()
    .isIn(['text', 'image'])
    .withMessage('watermarkType must be text or image'),
  body('position')
    .optional()
    .isIn([
      'center',
      'top',
      'bottom',
      'left',
      'right',
      'top-left',
      'top-right',
      'bottom-left',
      'bottom-right',
      'north',
      'south',
      'east',
      'west',
      'northwest',
      'northeast',
      'southwest',
      'southeast',
    ])
    .withMessage('Invalid watermark position'),
  body('opacity')
    .optional()
    .isFloat({ min: 0.05, max: 1 })
    .withMessage('opacity must be between 0.05 and 1'),
  body('fontSize')
    .optional()
    .isInt({ min: 8, max: 400 })
    .withMessage('fontSize must be between 8 and 400'),
  body('scale')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('scale must be between 1 and 100'),
  body('offsetX')
    .optional()
    .isInt({ min: -5000, max: 5000 })
    .withMessage('offsetX must be between -5000 and 5000'),
  body('offsetY')
    .optional()
    .isInt({ min: -5000, max: 5000 })
    .withMessage('offsetY must be between -5000 and 5000'),
  body('text')
    .optional()
    .isString()
    .isLength({ min: 1, max: 140 })
    .withMessage('text must be between 1 and 140 characters'),
  body('watermarkText')
    .optional()
    .isString()
    .isLength({ min: 1, max: 140 })
    .withMessage('watermarkText must be between 1 and 140 characters'),
  body('color')
    .optional()
    .isString()
    .matches(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
    .withMessage('color must be a hex color like #fff or #ffffff'),
  requestValidator,
];

/**
 * Validation rules for thumbnail dimensions
 */
export const validateThumbnailDimensions = [
  body('width')
    .optional()
    .isInt({ min: 1, max: 5000 })
    .withMessage('Thumbnail width must be between 1 and 5000 pixels'),
  body('height')
    .optional()
    .isInt({ min: 1, max: 5000 })
    .withMessage('Thumbnail height must be between 1 and 5000 pixels'),
  requestValidator,
];

const getRequestFiles = (req) => {
  if (req.file) {
    return [req.file];
  }

  if (Array.isArray(req.files)) {
    return req.files;
  }

  if (req.files && typeof req.files === 'object') {
    return Object.values(req.files).flat().filter(Boolean);
  }

  return [];
};

const normalizeExtension = (fileName = '') => {
  const match = String(fileName || '')
    .trim()
    .toLowerCase()
    .match(/\.([a-z0-9]+)$/);

  return match ? match[1] : '';
};

/**
 * Validation rules for PDF password
 */
export const validatePdfPassword = [
  body('password')
    .isString()
    .isLength({ min: 1, max: 256 })
    .withMessage('Password must be between 1 and 256 characters'),
  requestValidator,
];

/**
 * Validation rules for page range
 */
export const validatePageRange = [
  body('splitMethod')
    .optional()
    .isIn(['range', 'every', 'extract'])
    .withMessage('splitMethod must be one of: range, every, extract'),
  body().custom((_, { req }) => {
    const method = (req.body?.splitMethod || 'range').toString().trim().toLowerCase();
    const rawPageRange = req.body?.pageRange;
    const pageRange = typeof rawPageRange === 'string' ? rawPageRange.trim() : '';

    if (method === 'every') {
      if (!pageRange) {
        return true;
      }

      if (!/^\d+$/.test(pageRange) || Number(pageRange) < 1) {
        throw new Error(
          'For splitMethod=every, pageRange must be a positive integer or omitted'
        );
      }

      return true;
    }

    if (!pageRange) {
      throw new Error('pageRange is required for splitMethod range or extract');
    }

    if (!/^[\d,\-\s;\n\r]+$/.test(pageRange)) {
      throw new Error('Invalid page range format. Use formats like: 1-5, 8, 11-13');
    }

    return true;
  }),
  requestValidator,
];

/**
 * Validation rules for OCR language
 */
export const validateOcrLanguage = [
  body('language')
    .optional()
    .isString()
    .isLength({ min: 2, max: 10 })
    .withMessage('Invalid language code'),
  requestValidator,
];

/**
 * File type validation helper
 */
export const validateFileType = (allowedTypes, allowedExtensions = []) => {
  const normalizedAllowedTypes = new Set(
    (allowedTypes || []).map((type) => String(type || '').toLowerCase()).filter(Boolean)
  );
  const normalizedAllowedExtensions = new Set(
    (allowedExtensions || [])
      .map((extension) => String(extension || '').toLowerCase().replace(/^\./, ''))
      .filter(Boolean)
  );

  return (req, res, next) => {
    const files = getRequestFiles(req);
    if (files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
    }
    
    for (const file of files) {
      const mimeType = String(file.mimetype || '').toLowerCase();
      const extension = normalizeExtension(file.originalname);
      const mimeAllowed =
        normalizedAllowedTypes.size > 0 && normalizedAllowedTypes.has(mimeType);
      const extensionAllowed =
        normalizedAllowedExtensions.size > 0 && normalizedAllowedExtensions.has(extension);

      if (!mimeAllowed && !extensionAllowed) {
        const detailsParts = [];
        if (normalizedAllowedTypes.size > 0) {
          detailsParts.push(`Allowed MIME types: ${[...normalizedAllowedTypes].join(', ')}`);
        }
        if (normalizedAllowedExtensions.size > 0) {
          detailsParts.push(
            `Allowed file extensions: ${[...normalizedAllowedExtensions]
              .map((value) => `.${value}`)
              .join(', ')}`
          );
        }

        return res.status(400).json({
          success: false,
          error: 'Invalid file type',
          details: detailsParts.join(' | ') || 'Unsupported file type',
        });
      }
    }

    next();
  };
};

/**
 * File size validation helper
 */
export const validateFileSize = (maxSizeMB) => {
  return (req, res, next) => {
    const files = getRequestFiles(req);
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    
    for (const file of files) {
      if (file.size > maxSizeBytes) {
        return res.status(413).json({
          success: false,
          error: 'File too large',
          details: `Maximum file size is ${maxSizeMB}MB`,
        });
      }
    }

    next();
  };
};

// Allowed MIME types
export const ALLOWED_PDF_TYPES = ['application/pdf'];
export const ALLOWED_PDF_EXTENSIONS = ['pdf'];
export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/tiff',
];
export const ALLOWED_DOC_TYPES = [
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text',
  'text/plain',
  'application/rtf',
  'text/rtf',
];
export const ALLOWED_DOC_EXTENSIONS = ['doc', 'docx', 'odt', 'rtf', 'txt'];
export const ALLOWED_EXCEL_TYPES = [
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel.sheet.macroenabled.12',
  'application/vnd.oasis.opendocument.spreadsheet',
];
export const ALLOWED_EXCEL_EXTENSIONS = ['xls', 'xlsx'];
export const ALLOWED_POWERPOINT_TYPES = [
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
  'application/vnd.ms-powerpoint.presentation.macroenabled.12',
  'application/vnd.oasis.opendocument.presentation',
];
export const ALLOWED_POWERPOINT_EXTENSIONS = ['ppt', 'pptx'];
