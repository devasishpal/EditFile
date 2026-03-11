const truthyValues = new Set(['1', 'true', 'yes', 'on']);

const toBoolean = (value) => truthyValues.has(String(value || '').toLowerCase());

const pickEnv = (...keys) => {
  for (const key of keys) {
    const value = process.env[key];
    if (value && String(value).trim()) {
      return value;
    }
  }
  return undefined;
};

const missingRemoteDependencies = [
  process.env.DATABASE_URL,
  pickEnv('S3_ENDPOINT', 'R2_ENDPOINT'),
  pickEnv('S3_BUCKET_NAME', 'R2_BUCKET_NAME'),
  pickEnv('S3_ACCESS_KEY_ID', 'R2_ACCESS_KEY'),
  pickEnv('S3_SECRET_ACCESS_KEY', 'R2_SECRET_KEY'),
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
