import express from 'express';
import { getJobStatus, downloadFile } from './controller.js';
import { validateJobId } from '../../middleware/validation.middleware.js';

const router = express.Router();

/**
 * GET /api/job-status/:id
 * Get job status and details
 */
router.get('/job-status/:id', validateJobId, getJobStatus);

/**
 * GET /api/download/:id
 * Get signed download URL for completed job
 */
router.get('/download/:id', validateJobId, downloadFile);

export default router;
