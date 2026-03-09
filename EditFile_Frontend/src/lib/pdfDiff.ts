import type { PdfPreviewPage } from './pdfPreview';

export interface SpanDiffResult {
  addedIndices: Set<number>;
  removedIndices: Set<number>;
  addedSamples: string[];
  removedSamples: string[];
  addedCount: number;
  removedCount: number;
  changedCount: number;
}

export interface VisualDiffRegion {
  ratio: number;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
}

const normalizeToken = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();

const loadImageElement = (source: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load preview image.'));
    image.src = source;
  });

export const diffSpanText = (
  originalPage: PdfPreviewPage | null,
  modifiedPage: PdfPreviewPage | null
): SpanDiffResult => {
  const originalTokens = (originalPage?.textSpans || []).map((span) => normalizeToken(span.text));
  const modifiedTokens = (modifiedPage?.textSpans || []).map((span) => normalizeToken(span.text));
  const matrix = Array.from(
    { length: originalTokens.length + 1 },
    () => new Uint16Array(modifiedTokens.length + 1)
  );

  for (let i = 1; i <= originalTokens.length; i += 1) {
    for (let j = 1; j <= modifiedTokens.length; j += 1) {
      matrix[i][j] = originalTokens[i - 1] === modifiedTokens[j - 1]
        ? matrix[i - 1][j - 1] + 1
        : Math.max(matrix[i - 1][j], matrix[i][j - 1]);
    }
  }

  const keptOriginal = new Set<number>();
  const keptModified = new Set<number>();
  let i = originalTokens.length;
  let j = modifiedTokens.length;

  while (i > 0 && j > 0) {
    if (originalTokens[i - 1] === modifiedTokens[j - 1]) {
      keptOriginal.add(i - 1);
      keptModified.add(j - 1);
      i -= 1;
      j -= 1;
    } else if (matrix[i - 1][j] >= matrix[i][j - 1]) {
      i -= 1;
    } else {
      j -= 1;
    }
  }

  const removedIndices = new Set<number>();
  originalTokens.forEach((token, index) => {
    if (token && !keptOriginal.has(index)) {
      removedIndices.add(index);
    }
  });

  const addedIndices = new Set<number>();
  modifiedTokens.forEach((token, index) => {
    if (token && !keptModified.has(index)) {
      addedIndices.add(index);
    }
  });

  const removedSamples = Array.from(removedIndices)
    .slice(0, 4)
    .map((index) => originalPage?.textSpans[index]?.text || '')
    .filter(Boolean);

  const addedSamples = Array.from(addedIndices)
    .slice(0, 4)
    .map((index) => modifiedPage?.textSpans[index]?.text || '')
    .filter(Boolean);

  return {
    addedIndices,
    removedIndices,
    addedSamples,
    removedSamples,
    addedCount: addedIndices.size,
    removedCount: removedIndices.size,
    changedCount: Math.min(addedIndices.size, removedIndices.size),
  };
};

export const calculateVisualDiffRegion = async (
  originalPage: PdfPreviewPage | null,
  modifiedPage: PdfPreviewPage | null
): Promise<VisualDiffRegion> => {
  if (!originalPage || !modifiedPage) {
    return {
      ratio: 1,
      bounds: null,
    };
  }

  const [originalImage, modifiedImage] = await Promise.all([
    loadImageElement(originalPage.imageUrl),
    loadImageElement(modifiedPage.imageUrl),
  ]);

  const comparisonWidth = 360;
  const maxAspectRatio = Math.max(
    originalImage.height / originalImage.width,
    modifiedImage.height / modifiedImage.width
  );
  const comparisonHeight = Math.max(240, Math.round(comparisonWidth * maxAspectRatio));
  const originalCanvas = document.createElement('canvas');
  const modifiedCanvas = document.createElement('canvas');
  const originalContext = originalCanvas.getContext('2d');
  const modifiedContext = modifiedCanvas.getContext('2d');

  if (!originalContext || !modifiedContext) {
    throw new Error('Canvas comparison is not available in this browser.');
  }

  originalCanvas.width = comparisonWidth;
  originalCanvas.height = comparisonHeight;
  modifiedCanvas.width = comparisonWidth;
  modifiedCanvas.height = comparisonHeight;

  originalContext.fillStyle = '#ffffff';
  modifiedContext.fillStyle = '#ffffff';
  originalContext.fillRect(0, 0, comparisonWidth, comparisonHeight);
  modifiedContext.fillRect(0, 0, comparisonWidth, comparisonHeight);

  originalContext.drawImage(originalImage, 0, 0, comparisonWidth, comparisonHeight);
  modifiedContext.drawImage(modifiedImage, 0, 0, comparisonWidth, comparisonHeight);

  const originalPixels = originalContext.getImageData(0, 0, comparisonWidth, comparisonHeight).data;
  const modifiedPixels = modifiedContext.getImageData(0, 0, comparisonWidth, comparisonHeight).data;

  let changed = 0;
  let minX = comparisonWidth;
  let minY = comparisonHeight;
  let maxX = 0;
  let maxY = 0;
  let total = 0;

  for (let y = 0; y < comparisonHeight; y += 2) {
    for (let x = 0; x < comparisonWidth; x += 2) {
      const pixelIndex = (y * comparisonWidth + x) * 4;
      const difference =
        Math.abs(originalPixels[pixelIndex] - modifiedPixels[pixelIndex]) +
        Math.abs(originalPixels[pixelIndex + 1] - modifiedPixels[pixelIndex + 1]) +
        Math.abs(originalPixels[pixelIndex + 2] - modifiedPixels[pixelIndex + 2]);

      total += 1;

      if (difference > 54) {
        changed += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (changed === 0 || total === 0) {
    return {
      ratio: 0,
      bounds: null,
    };
  }

  return {
    ratio: changed / total,
    bounds: {
      x: minX / comparisonWidth,
      y: minY / comparisonHeight,
      width: (maxX - minX + 2) / comparisonWidth,
      height: (maxY - minY + 2) / comparisonHeight,
    },
  };
};
