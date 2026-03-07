import { v4 as uuidv4 } from 'uuid';
import pool, { initDatabase } from '../config/database.js';
import { isLocalDatabaseMode } from '../config/runtime.js';
import { logger } from '../utils/logger.js';

const memoryJobs = new Map();

const cloneMemoryJob = (job) => ({
  ...job,
  metadata: job.metadata ? { ...job.metadata } : {},
});

const createMemoryJobRecord = (jobData) => {
  const now = new Date();
  const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);

  return {
    id: uuidv4(),
    tool_type: jobData.toolType,
    status: 'pending',
    original_file_url: jobData.originalFileUrl || null,
    output_file_url: null,
    original_size: jobData.originalSize || null,
    output_size: null,
    metadata: jobData.metadata || {},
    error_message: null,
    created_at: now,
    updated_at: now,
    expires_at: oneHourLater,
    ip_address: jobData.ipAddress || null,
  };
};

/**
 * Connect to database and initialize tables
 */
export const connectDatabase = async () => {
  if (isLocalDatabaseMode) {
    logger.info('LOCAL_MODE database enabled: using in-memory job store');
    return;
  }

  try {
    // Test connection
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    logger.info(`Database connected at ${result.rows[0].now}`);
    client.release();

    // Initialize tables
    await initDatabase();
  } catch (error) {
    logger.error('Database connection failed:', error);
    throw error;
  }
};

/**
 * Create a new job record
 * @param {Object} jobData - Job data
 * @returns {Promise<Object>} - Created job
 */
export const createJob = async (jobData) => {
  if (isLocalDatabaseMode) {
    const job = createMemoryJobRecord(jobData);
    memoryJobs.set(job.id, job);
    return cloneMemoryJob(job);
  }

  const {
    toolType,
    originalFileUrl,
    originalSize,
    metadata = {},
    ipAddress,
  } = jobData;

  const query = `
    INSERT INTO jobs (tool_type, original_file_url, original_size, metadata, ip_address)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `;

  const values = [
    toolType,
    originalFileUrl,
    originalSize,
    JSON.stringify(metadata),
    ipAddress,
  ];

  const result = await pool.query(query, values);
  return result.rows[0];
};

/**
 * Get job by ID
 * @param {string} jobId - Job ID
 * @returns {Promise<Object|null>} - Job or null
 */
export const getJobById = async (jobId) => {
  if (isLocalDatabaseMode) {
    const job = memoryJobs.get(jobId);
    return job ? cloneMemoryJob(job) : null;
  }

  const query = 'SELECT * FROM jobs WHERE id = $1';
  const result = await pool.query(query, [jobId]);
  return result.rows[0] || null;
};

/**
 * Update job status
 * @param {string} jobId - Job ID
 * @param {string} status - New status
 * @param {Object} updates - Additional fields to update
 */
export const updateJobStatus = async (jobId, status, updates = {}) => {
  if (isLocalDatabaseMode) {
    const current = memoryJobs.get(jobId);
    if (!current) {
      return null;
    }

    const next = {
      ...current,
      status,
      updated_at: new Date(),
    };

    if (Object.prototype.hasOwnProperty.call(updates, 'output_file_url')) {
      next.output_file_url = updates.output_file_url;
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'output_size')) {
      next.output_size = updates.output_size;
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'metadata')) {
      next.metadata = updates.metadata;
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'error_message')) {
      next.error_message = updates.error_message;
    }

    memoryJobs.set(jobId, next);
    return cloneMemoryJob(next);
  }

  const allowedFields = [
    'output_file_url',
    'output_size',
    'metadata',
    'error_message',
  ];

  const setClause = ['status = $1'];
  const values = [status];
  let paramIndex = 2;

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      setClause.push(`${key} = $${paramIndex}`);
      values.push(key === 'metadata' ? JSON.stringify(value) : value);
      paramIndex++;
    }
  }

  values.push(jobId);

  const query = `
    UPDATE jobs
    SET ${setClause.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING *
  `;

  const result = await pool.query(query, values);
  return result.rows[0];
};

/**
 * Mark job as completed
 * @param {string} jobId - Job ID
 * @param {string} outputFileUrl - Output file URL
 * @param {number} outputSize - Output file size
 */
export const completeJob = async (jobId, outputFileUrl, outputSize) => {
  return updateJobStatus(jobId, 'completed', {
    output_file_url: outputFileUrl,
    output_size: outputSize,
  });
};

/**
 * Mark job as failed
 * @param {string} jobId - Job ID
 * @param {string} errorMessage - Error message
 */
export const failJob = async (jobId, errorMessage) => {
  return updateJobStatus(jobId, 'failed', {
    error_message: errorMessage,
  });
};

/**
 * Get expired jobs
 * @param {number} hours - Hours to consider expired
 * @returns {Promise<Array>} - Expired jobs
 */
export const getExpiredJobs = async (hours = 1) => {
  if (isLocalDatabaseMode) {
    const now = Date.now();
    const threshold = now - hours * 60 * 60 * 1000;

    return [...memoryJobs.values()]
      .filter((job) => {
        const createdAt = new Date(job.created_at).getTime();
        const expiresAt = new Date(job.expires_at).getTime();
        const completedOrFailed =
          (job.status === 'completed' || job.status === 'failed') && createdAt < threshold;
        return expiresAt < now || completedOrFailed;
      })
      .map(cloneMemoryJob);
  }

  const query = `
    SELECT * FROM jobs
    WHERE expires_at < CURRENT_TIMESTAMP
    OR (status IN ('completed', 'failed') AND created_at < CURRENT_TIMESTAMP - INTERVAL '${hours} hours')
  `;
  const result = await pool.query(query);
  return result.rows;
};

/**
 * Delete job by ID
 * @param {string} jobId - Job ID
 */
export const deleteJob = async (jobId) => {
  if (isLocalDatabaseMode) {
    memoryJobs.delete(jobId);
    return;
  }

  const query = 'DELETE FROM jobs WHERE id = $1';
  await pool.query(query, [jobId]);
};

/**
 * Get job statistics
 * @returns {Promise<Object>} - Statistics
 */
export const getJobStats = async () => {
  if (isLocalDatabaseMode) {
    const threshold = Date.now() - 24 * 60 * 60 * 1000;
    const stats = {
      total: 0,
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
    };

    for (const job of memoryJobs.values()) {
      const createdAt = new Date(job.created_at).getTime();
      if (createdAt < threshold) {
        continue;
      }

      if (Object.prototype.hasOwnProperty.call(stats, job.status)) {
        stats[job.status] += 1;
      }
      stats.total += 1;
    }

    return stats;
  }

  const query = `
    SELECT 
      status,
      COUNT(*) as count
    FROM jobs
    WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'
    GROUP BY status
  `;
  const result = await pool.query(query);
  
  const stats = {
    total: 0,
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
  };

  for (const row of result.rows) {
    stats[row.status] = parseInt(row.count);
    stats.total += parseInt(row.count);
  }

  return stats;
};

export default pool;
