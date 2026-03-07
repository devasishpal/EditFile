export const runWithConcurrency = async <T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>
) => {
  if (items.length === 0) {
    return;
  }

  const maxWorkers = Math.max(1, Math.min(concurrency, items.length));
  let nextIndex = 0;

  const runners = Array.from({ length: maxWorkers }, async () => {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= items.length) {
        return;
      }

      await worker(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(runners);
};
