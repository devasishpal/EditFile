import { getJobById } from '../../services/database.service.js';
import { getSignedDownloadUrl } from '../../config/s3.js';
import { logger } from '../../utils/logger.js';
import { asyncHandler } from '../../middleware/error.middleware.js';

/**
 * Get job status
 */
export const getJobStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  logger.info(`Job status request: ${id}`);
  
  const job = await getJobById(id);
  
  if (!job) {
    return res.status(404).json({
      success: false,
      error: 'Job not found',
    });
  }
  
  // Calculate reduction percentage if completed
  let reductionPercent = null;
  if (job.status === 'completed' && job.original_size && job.output_size) {
    reductionPercent = ((job.original_size - job.output_size) / job.original_size * 100).toFixed(2);
  }
  
  res.json({
    success: true,
    job: {
      id: job.id,
      toolType: job.tool_type,
      status: job.status,
      originalSize: job.original_size,
      outputSize: job.output_size,
      reductionPercent,
      metadata: job.metadata,
      errorMessage: job.error_message,
      createdAt: job.created_at,
      updatedAt: job.updated_at,
      expiresAt: job.expires_at,
    },
  });
});

/**
 * Get download URL for completed job
 */
export const downloadFile = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  logger.info(`Download request: ${id}`);
  
  const job = await getJobById(id);
  
  if (!job) {
    return res.status(404).json({
      success: false,
      error: 'Job not found',
    });
  }
  
  if (job.status !== 'completed') {
    return res.status(400).json({
      success: false,
      error: 'Job is not completed yet',
      status: job.status,
    });
  }
  
  if (!job.output_file_url) {
    return res.status(404).json({
      success: false,
      error: 'Output file not available',
    });
  }
  
  // Generate signed URL (valid for 1 hour)
  const downloadUrl = await getSignedDownloadUrl(job.output_file_url, 3600);
  
  // Calculate reduction percentage
  const reductionPercent = ((job.original_size - job.output_size) / job.original_size * 100).toFixed(2);
  
  res.json({
    success: true,
    downloadUrl,
    expiresIn: 3600,
    fileName: job.metadata?.outputFileName || job.metadata?.originalName || 'download',
    originalSize: job.original_size,
    outputSize: job.output_size,
    reductionPercent,
  });
});

export default { getJobStatus, downloadFile };
