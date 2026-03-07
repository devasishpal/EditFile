const truthyValues = new Set(['1', 'true', 'yes', 'on']);

const toBoolean = (value) => truthyValues.has(String(value || '').toLowerCase());

const missingRemoteDependencies = [
  process.env.DATABASE_URL,
  process.env.S3_ENDPOINT,
  process.env.S3_BUCKET_NAME,
  process.env.S3_ACCESS_KEY_ID,
  process.env.S3_SECRET_ACCESS_KEY,
].some((value) => !value);

export const isLocalMode = toBoolean(process.env.LOCAL_MODE) || missingRemoteDependencies;
export const isLocalQueueMode = isLocalMode;
export const isLocalDatabaseMode = isLocalMode || !process.env.DATABASE_URL;
export const isLocalStorageMode = isLocalMode;

export default {
  isLocalMode,
  isLocalQueueMode,
  isLocalDatabaseMode,
  isLocalStorageMode,
};
