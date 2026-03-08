import fs from 'fs/promises';
import path from 'path';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { logger } from '../utils/logger.js';
import { isLocalStorageMode } from './runtime.js';
import { ensureWorkspaceDirectories, STORAGE_DIR } from '../utils/workspace.js';

const BUCKET_NAME = process.env.S3_BUCKET_NAME;
const EXPIRES_IN = 3600;
const LOCAL_STORAGE_ROOT = path.resolve(
  process.env.LOCAL_STORAGE_PATH
    || process.env.FILE_STORAGE_PATH
    || STORAGE_DIR
);

const s3Client = isLocalStorageMode
  ? null
  : new S3Client({
      region: process.env.S3_REGION || 'auto',
      endpoint: process.env.S3_ENDPOINT,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      },
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    });

if (isLocalStorageMode) {
  logger.info(`LOCAL_MODE storage enabled at: ${LOCAL_STORAGE_ROOT}`);
}

const streamToBuffer = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};

const normalizeStorageKey = (keyOrUrl = '') => {
  let key = String(keyOrUrl);

  if (key.startsWith('local://')) {
    key = key.replace('local://', '');
  }

  if (BUCKET_NAME && key.startsWith(`s3://${BUCKET_NAME}/`)) {
    key = key.replace(`s3://${BUCKET_NAME}/`, '');
  }

  return key.replace(/^\/+/, '');
};

const normalizeLocalStorageKey = (key = '') => {
  let cleanKey = normalizeStorageKey(key);

  if (cleanKey.startsWith('input/')) {
    cleanKey = cleanKey.replace(/^input\//, 'uploads/');
  }

  if (cleanKey.startsWith('output/')) {
    cleanKey = cleanKey.replace(/^output\//, 'outputs/');
  }

  return cleanKey;
};

const toFlatLocalFileName = (key = '') => {
  const cleanKey = normalizeLocalStorageKey(key);
  return cleanKey.replace(/[\\/]+/g, '__');
};

const getLocalFilePath = (keyOrUrl) => {
  const cleanKey = normalizeLocalStorageKey(keyOrUrl);
  const absolutePath = path.resolve(LOCAL_STORAGE_ROOT, toFlatLocalFileName(cleanKey));

  if (!absolutePath.startsWith(LOCAL_STORAGE_ROOT)) {
    throw new Error('Invalid storage key');
  }

  return {
    cleanKey,
    absolutePath,
  };
};

const getLocalMetadataPath = (absolutePath) => `${absolutePath}.meta.json`;

const ensureLocalDirectory = async (absolutePath) => {
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
};

const getPublicBaseUrl = () =>
  process.env.BACKEND_PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`;

const sanitizeHeaderFileName = (fileName = 'download') => {
  const sanitized = String(fileName || '')
    .replace(/["\\\r\n]/g, '_')
    .trim();
  return sanitized || 'download';
};

export const uploadFile = async (buffer, key, contentType) => {
  try {
    if (isLocalStorageMode) {
      await ensureWorkspaceDirectories();
      const { cleanKey, absolutePath } = getLocalFilePath(key);
      await ensureLocalDirectory(absolutePath);
      await fs.writeFile(absolutePath, buffer);
      await fs.writeFile(
        getLocalMetadataPath(absolutePath),
        JSON.stringify(
          {
            contentType,
            uploadedAt: new Date().toISOString(),
          },
          null,
          2
        )
      );

      logger.info(`File uploaded to local storage: ${cleanKey}`);
      return `local://${cleanKey}`;
    }

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      Metadata: {
        'uploaded-at': new Date().toISOString(),
      },
    });

    await s3Client.send(command);
    logger.info(`File uploaded to S3: ${key}`);

    return `s3://${BUCKET_NAME}/${key}`;
  } catch (error) {
    logger.error('Storage upload error:', error);
    throw new Error('Failed to upload file to storage');
  }
};

export const downloadFile = async (keyOrUrl) => {
  try {
    if (isLocalStorageMode) {
      const { absolutePath } = getLocalFilePath(keyOrUrl);
      return await fs.readFile(absolutePath);
    }

    const cleanKey = normalizeStorageKey(keyOrUrl);
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: cleanKey,
    });

    const response = await s3Client.send(command);
    return streamToBuffer(response.Body);
  } catch (error) {
    logger.error('Storage download error:', error);
    throw new Error('Failed to download file from storage');
  }
};

export const readLocalFileByKey = async (keyOrUrl) => {
  if (!isLocalStorageMode) {
    throw new Error('Local storage mode is disabled');
  }

  const { cleanKey, absolutePath } = getLocalFilePath(keyOrUrl);
  const buffer = await fs.readFile(absolutePath);

  let contentType = 'application/octet-stream';
  try {
    const metadataRaw = await fs.readFile(getLocalMetadataPath(absolutePath), 'utf-8');
    const metadata = JSON.parse(metadataRaw);
    contentType = metadata.contentType || contentType;
  } catch {
    // Use default content type
  }

  return {
    key: cleanKey,
    fileName: path.basename(cleanKey),
    contentType,
    buffer,
  };
};

export const getSignedDownloadUrl = async (keyOrUrl, expiresIn = EXPIRES_IN, fileName = null) => {
  try {
    const cleanKey = normalizeStorageKey(keyOrUrl);
    const safeFileName = fileName ? sanitizeHeaderFileName(fileName) : null;

    if (isLocalStorageMode) {
      const params = new URLSearchParams({
        key: cleanKey,
      });

      if (safeFileName) {
        params.set('filename', safeFileName);
      }

      return `${getPublicBaseUrl()}/api/local-download?${params.toString()}`;
    }

    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: cleanKey,
      ...(safeFileName
        ? {
            ResponseContentDisposition: `attachment; filename="${safeFileName}"`,
          }
        : {}),
    });

    return await getSignedUrl(s3Client, command, { expiresIn });
  } catch (error) {
    logger.error('Storage signed URL error:', error);
    throw new Error('Failed to generate download URL');
  }
};

export const deleteFile = async (keyOrUrl) => {
  try {
    const cleanKey = normalizeStorageKey(keyOrUrl);

    if (isLocalStorageMode) {
      const { absolutePath } = getLocalFilePath(cleanKey);
      await Promise.allSettled([
        fs.unlink(absolutePath),
        fs.unlink(getLocalMetadataPath(absolutePath)),
      ]);
      logger.info(`File deleted from local storage: ${cleanKey}`);
      return;
    }

    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: cleanKey,
    });

    await s3Client.send(command);
    logger.info(`File deleted from S3: ${cleanKey}`);
  } catch (error) {
    logger.error('Storage delete error:', error);
  }
};

export const getFileMetadata = async (keyOrUrl) => {
  try {
    const cleanKey = normalizeStorageKey(keyOrUrl);

    if (isLocalStorageMode) {
      const { absolutePath } = getLocalFilePath(cleanKey);
      const stats = await fs.stat(absolutePath);
      const localMeta = {
        size: stats.size,
        contentType: 'application/octet-stream',
        lastModified: stats.mtime,
      };

      try {
        const metadataRaw = await fs.readFile(getLocalMetadataPath(absolutePath), 'utf-8');
        const metadata = JSON.parse(metadataRaw);
        localMeta.contentType = metadata.contentType || localMeta.contentType;
      } catch {
        // Keep default local metadata
      }

      return localMeta;
    }

    const command = new HeadObjectCommand({
      Bucket: BUCKET_NAME,
      Key: cleanKey,
    });

    const response = await s3Client.send(command);
    return {
      size: response.ContentLength,
      contentType: response.ContentType,
      lastModified: response.LastModified,
    };
  } catch (error) {
    logger.error('Storage metadata error:', error);
    return null;
  }
};

export const generateS3Key = (jobId, filename, prefix = 'input') => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  const extension = filename.includes('.') ? filename.split('.').pop() : 'bin';
  let normalizedPrefix = prefix;

  if (prefix === 'input') {
    normalizedPrefix = 'uploads';
  } else if (prefix === 'output') {
    normalizedPrefix = 'outputs';
  }

  return `${normalizedPrefix}/${jobId}/${timestamp}-${random}.${extension}`;
};

export default s3Client;
