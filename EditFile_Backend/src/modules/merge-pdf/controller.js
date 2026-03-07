import { v4 as uuidv4 } from 'uuid';
import { createJob } from '../../services/database.service.js';
import { uploadFile, generateS3Key } from '../../config/s3.js';
import { addJob } from '../../queue/queue.js';
import { logger } from '../../utils/logger.js';
import { asyncHandler } from '../../middleware/error.middleware.js';

const isPdfBuffer = (buffer) => {
  if (!buffer || buffer.length < 5) {
    return false;
  }
  return buffer.subarray(0, 5).toString('utf8') === '%PDF-';
};

const parseFileOrder = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  if (Array.isArray(value)) {
    return value;
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // Fall back to comma-separated values.
  }

  return text
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

const reorderFiles = (files, rawOrder) => {
  const parsedOrder = parseFileOrder(rawOrder);
  if (!parsedOrder || parsedOrder.length === 0) {
    return files;
  }

  const allNumeric = parsedOrder.every((item) => /^\d+$/.test(String(item)));
  if (allNumeric) {
    const numericOrder = parsedOrder.map((item) => Number(item));
    const looksOneBased = numericOrder.every(
      (value) => Number.isInteger(value) && value >= 1 && value <= files.length
    );

    const used = new Set();
    const ordered = [];

    for (const rawIndex of numericOrder) {
      const index = looksOneBased ? rawIndex - 1 : rawIndex;
      if (Number.isInteger(index) && index >= 0 && index < files.length && !used.has(index)) {
        ordered.push(files[index]);
        used.add(index);
      }
    }

    for (let i = 0; i < files.length; i++) {
      if (!used.has(i)) {
        ordered.push(files[i]);
      }
    }

    return ordered;
  }

  const remaining = [...files];
  const ordered = [];

  for (const targetName of parsedOrder.map((item) => String(item))) {
    const matchIndex = remaining.findIndex((file) => file.originalname === targetName);
    if (matchIndex !== -1) {
      ordered.push(remaining[matchIndex]);
      remaining.splice(matchIndex, 1);
    }
  }

  return [...ordered, ...remaining];
};

export const mergePdf = asyncHandler(async (req, res) => {
  const startTime = Date.now();
  
  if (!req.files || req.files.length < 2) {
    return res.status(400).json({
      success: false,
      error: 'At least 2 PDF files are required for merging',
    });
  }

  const invalidFile = req.files.find((file) => !isPdfBuffer(file.buffer));
  if (invalidFile) {
    return res.status(400).json({
      success: false,
      error: `Invalid PDF file: ${invalidFile.originalname}`,
    });
  }

  const files = reorderFiles(req.files, req.body?.fileOrder);
  const jobId = uuidv4();
  
  logger.info(`Merge PDF request: ${jobId}, files: ${files.length}`);

  try {
    // Upload all files to S3
    const fileUrls = [];
    let totalSize = 0;
    
    for (const file of files) {
      const s3Key = generateS3Key(jobId, file.originalname, 'input');
      const fileUrl = await uploadFile(file.buffer, s3Key, file.mimetype);
      fileUrls.push({
        url: fileUrl,
        name: file.originalname,
        size: file.size || file.buffer?.length || 0,
      });
      totalSize += file.size || file.buffer?.length || 0;
    }

    // Create job
    const job = await createJob({
      toolType: 'merge-pdf',
      originalFileUrl: fileUrls[0].url, // Store first file as reference
      originalSize: totalSize,
      metadata: {
        fileCount: files.length,
        fileNames: files.map(f => f.originalname),
        fileOrder: files.map((f, index) => ({
          name: f.originalname,
          order: index + 1,
        })),
      },
      ipAddress: req.ip,
    });

    // Add to queue
    await addJob('mergePdf', {
      jobId: job.id,
      fileUrls,
      originalNames: files.map((file) => file.originalname),
    });

    const duration = Date.now() - startTime;
    logger.info(`Merge PDF job created: ${job.id} in ${duration}ms`);

    res.status(202).json({
      success: true,
      message: 'PDF merge job queued successfully',
      jobId: job.id,
      status: 'pending',
      fileCount: files.length,
      totalSize,
    });

  } catch (error) {
    logger.error(`Merge PDF failed for job ${jobId}:`, error);
    throw error;
  }
});

export default { mergePdf };
