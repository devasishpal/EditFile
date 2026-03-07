import fs from 'fs/promises';
import path from 'path';
import { getExpiredJobs, deleteJob } from './database.service.js';
import { deleteFile } from '../config/s3.js';
import { logger } from '../utils/logger.js';
import {
  ensureWorkspaceDirectories,
  getWorkspaceDirectories,
} from '../utils/workspace.js';

const FILE_RETENTION_MS = 30 * 60 * 1000;

const cleanupDirectoryOlderThan = async (directoryPath, cutoffTimeMs) => {
  let deletedCount = 0;
  let errorCount = 0;

  const walk = async (currentPath, isRoot = false) => {
    let entries = [];
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch (error) {
      errorCount += 1;
      logger.warn(`Unable to read cleanup directory ${currentPath}: ${error.message}`);
      return;
    }

    for (const entry of entries) {
      const absolutePath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        await walk(absolutePath, false);
        if (!isRoot) {
          try {
            const remaining = await fs.readdir(absolutePath);
            if (remaining.length === 0) {
              await fs.rmdir(absolutePath);
            }
          } catch {
            // Best effort.
          }
        }
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      try {
        const stats = await fs.stat(absolutePath);
        if (stats.mtimeMs < cutoffTimeMs) {
          await fs.unlink(absolutePath);
          deletedCount += 1;
        }
      } catch (error) {
        errorCount += 1;
        logger.warn(`Failed to cleanup file ${absolutePath}: ${error.message}`);
      }
    }
  };

  await walk(directoryPath, true);

  return {
    deletedCount,
    errorCount,
  };
};

/**
 * Service for cleaning up expired files and jobs
 */
class CleanupService {
  constructor() {
    this.isRunning = false;
  }

  /**
   * Clean up expired files and jobs
   */
  async cleanupExpiredFiles() {
    if (this.isRunning) {
      logger.warn('Cleanup already in progress, skipping...');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();
    let deletedCount = 0;
    let errorCount = 0;

    try {
      await ensureWorkspaceDirectories();
      logger.info('Starting cleanup of expired files...');

      const workspaceDirectories = getWorkspaceDirectories();
      const uniqueWorkspaceDirectories = [...new Set(Object.values(workspaceDirectories))];
      const cutoffTimeMs = Date.now() - FILE_RETENTION_MS;
      const fileCleanupStats = await Promise.all(
        uniqueWorkspaceDirectories.map((directoryPath) =>
          cleanupDirectoryOlderThan(directoryPath, cutoffTimeMs)
        )
      );

      const cleanedFiles = fileCleanupStats.reduce((sum, stat) => sum + stat.deletedCount, 0);
      const fileCleanupErrors = fileCleanupStats.reduce((sum, stat) => sum + stat.errorCount, 0);
      deletedCount += cleanedFiles;
      errorCount += fileCleanupErrors;
      logger.info(
        `Workspace cleanup finished. Deleted files: ${cleanedFiles}, Errors: ${fileCleanupErrors}`
      );

      // Get expired jobs
      const expiredJobs = await getExpiredJobs(1);
      logger.info(`Found ${expiredJobs.length} expired jobs to clean up`);

      for (const job of expiredJobs) {
        try {
          // Delete original file from S3
          if (job.original_file_url) {
            await deleteFile(job.original_file_url);
          }

          // Delete output file from S3
          if (job.output_file_url) {
            await deleteFile(job.output_file_url);
          }

          // Delete job from database
          await deleteJob(job.id);

          deletedCount += 1;
          logger.info(`Cleaned up job: ${job.id}`);
        } catch (error) {
          errorCount += 1;
          logger.error(`Failed to cleanup job ${job.id}:`, error);
          // Continue with next job
        }
      }

      const duration = Date.now() - startTime;
      logger.info(`Cleanup completed in ${duration}ms. Deleted: ${deletedCount}, Errors: ${errorCount}`);

    } catch (error) {
      logger.error('Cleanup job failed:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Clean up a specific job immediately
   * @param {string} jobId - Job ID
   * @param {Object} job - Job data
   */
  async cleanupJobImmediately(jobId, job) {
    try {
      if (job.original_file_url) {
        await deleteFile(job.original_file_url);
      }
      if (job.output_file_url) {
        await deleteFile(job.output_file_url);
      }
      await deleteJob(jobId);
      logger.info(`Immediately cleaned up job: ${jobId}`);
    } catch (error) {
      logger.error(`Failed to immediately cleanup job ${jobId}:`, error);
    }
  }
}

export const cleanupService = new CleanupService();
export default cleanupService;
