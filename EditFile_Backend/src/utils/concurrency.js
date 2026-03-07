import os from 'os';

const asInteger = (value) => {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isInteger(parsed) ? parsed : null;
};

export const getCpuCoreCount = () => {
  const envOverride = asInteger(process.env.CPU_CORE_COUNT);
  if (envOverride && envOverride > 0) {
    return envOverride;
  }

  const detected = os.cpus()?.length;
  if (Number.isInteger(detected) && detected > 0) {
    return detected;
  }

  return 1;
};

export const getRecommendedConcurrency = ({ reserve = 1, min = 1, max = 8 } = {}) => {
  const cpuCores = getCpuCoreCount();
  const baseline = Math.max(min, cpuCores - reserve);
  return Math.min(max, baseline);
};

export const resolveConcurrency = (
  envKey,
  { reserve = 1, min = 1, max = getCpuCoreCount() } = {}
) => {
  const configured = asInteger(process.env[envKey]);
  if (configured && configured >= min) {
    return Math.min(max, configured);
  }

  return getRecommendedConcurrency({ reserve, min, max });
};

export const createLimiter = (concurrency = 1) => {
  const safeConcurrency = Math.max(1, Number.parseInt(concurrency, 10) || 1);
  let activeCount = 0;
  const queue = [];

  const runNext = () => {
    if (activeCount >= safeConcurrency || queue.length === 0) {
      return;
    }

    const next = queue.shift();
    activeCount += 1;

    Promise.resolve()
      .then(next.task)
      .then(next.resolve, next.reject)
      .finally(() => {
        activeCount -= 1;
        runNext();
      });
  };

  return (task) =>
    new Promise((resolve, reject) => {
      queue.push({ task, resolve, reject });
      runNext();
    });
};

export const mapWithConcurrency = async (items, concurrency, mapper) => {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  const limit = createLimiter(concurrency);
  const results = new Array(items.length);

  await Promise.all(
    items.map((item, index) =>
      limit(async () => {
        results[index] = await mapper(item, index);
      })
    )
  );

  return results;
};

export default {
  getCpuCoreCount,
  getRecommendedConcurrency,
  resolveConcurrency,
  createLimiter,
  mapWithConcurrency,
};
