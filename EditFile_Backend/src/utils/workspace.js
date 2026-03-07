import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

const DEFAULT_STORAGE_DIR = path.resolve(
  process.cwd(),
  process.env.FILE_STORAGE_DIR || 'storage'
);
const WORK_ROOT = path.resolve(
  process.env.FILE_WORK_ROOT
    || process.env.FILE_STORAGE_PATH
    || process.env.LOCAL_STORAGE_PATH
    || DEFAULT_STORAGE_DIR
);

export const STORAGE_DIR = WORK_ROOT;
export const UPLOADS_DIR = STORAGE_DIR;
export const TEMP_DIR = STORAGE_DIR;
export const OUTPUTS_DIR = STORAGE_DIR;

const WORK_DIRECTORIES = [STORAGE_DIR];

let ensureDirectoriesPromise = null;

export const ensureWorkspaceDirectories = async () => {
  if (!ensureDirectoriesPromise) {
    ensureDirectoriesPromise = Promise.all(
      WORK_DIRECTORIES.map((directory) => fs.mkdir(directory, { recursive: true }))
    )
      .then(() => undefined)
      .catch((error) => {
        ensureDirectoriesPromise = null;
        throw error;
      });
  }

  await ensureDirectoriesPromise;
};

export const createTempWorkspace = async (prefix = 'editfile-temp-') => {
  await ensureWorkspaceDirectories();
  return fs.mkdtemp(path.join(TEMP_DIR, prefix));
};

export const createTempFilePath = async (suffix = 'tmp') => {
  await ensureWorkspaceDirectories();
  return path.join(TEMP_DIR, `${Date.now()}-${randomUUID()}-${suffix}`);
};

export const createUploadFilePath = async (suffix = 'upload.bin') => {
  await ensureWorkspaceDirectories();
  return path.join(UPLOADS_DIR, `${Date.now()}-${randomUUID()}-${suffix}`);
};

export const createOutputFilePath = async (suffix = 'output.bin') => {
  await ensureWorkspaceDirectories();
  return path.join(OUTPUTS_DIR, `${Date.now()}-${randomUUID()}-${suffix}`);
};

export const removePathSafe = async (targetPath) => {
  if (!targetPath) {
    return;
  }

  await fs.rm(targetPath, {
    recursive: true,
    force: true,
  });
};

export const getWorkspaceDirectories = () => ({
  storage: STORAGE_DIR,
});

export default {
  STORAGE_DIR,
  UPLOADS_DIR,
  TEMP_DIR,
  OUTPUTS_DIR,
  ensureWorkspaceDirectories,
  createTempWorkspace,
  createTempFilePath,
  createUploadFilePath,
  createOutputFilePath,
  removePathSafe,
  getWorkspaceDirectories,
};
