import { API_BASE_URL } from './apiConfig';

export interface ProcessedAsset {
  blob: Blob;
  previewUrl: string;
  fileName: string;
  contentType: string;
}

const getErrorMessage = async (response: Response) => {
  try {
    const payload = await response.json();
    return payload.error || payload.message || 'Request failed';
  } catch {
    return 'Request failed';
  }
};

const extractFileName = (value: string | null, fallback: string) => {
  if (!value) {
    return fallback;
  }

  const cleaned = value.replace(/^['"]|['"]$/g, '').trim();
  return cleaned || fallback;
};

const requestProcessedFile = async (
  endpoint: string,
  formData: FormData,
  fallbackFileName: string
): Promise<ProcessedAsset> => {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await getErrorMessage(response));
  }

  const blob = await response.blob();
  const previewUrl = URL.createObjectURL(blob);
  const fileName = extractFileName(
    response.headers.get('x-processed-file-name'),
    fallbackFileName
  );

  return {
    blob,
    previewUrl,
    fileName,
    contentType: response.headers.get('content-type') || blob.type || 'application/octet-stream',
  };
};

export const cropImageFile = async (
  file: File,
  options: { x: number; y: number; width: number; height: number }
) => {
  const appendCropPayload = () => {
    const formData = new FormData();
    formData.append('image', file);
    formData.append('file', file);
    formData.append('x', String(options.x));
    formData.append('y', String(options.y));
    formData.append('width', String(options.width));
    formData.append('height', String(options.height));
    return formData;
  };

  try {
    return await requestProcessedFile('/api/crop-image', appendCropPayload(), `${file.name}-cropped`);
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    const shouldFallback =
      message.includes('endpoint not found') ||
      message.includes('failed to fetch') ||
      message.includes('not found');

    if (!shouldFallback) {
      throw error;
    }

    return requestProcessedFile('/api/image-tools/crop', appendCropPayload(), `${file.name}-cropped`);
  }
};

export const rotateImageFile = async (file: File, angle: number) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('angle', String(angle));

  return requestProcessedFile('/api/image-tools/rotate', formData, `${file.name}-rotated`);
};

export const convertImageFile = async (
  file: File,
  targetFormat: 'jpg' | 'png' | 'webp'
) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('targetFormat', targetFormat);

  return requestProcessedFile('/api/image-tools/convert', formData, `${file.name}.${targetFormat}`);
};

export const resizeImageFile = async (
  file: File,
  options: {
    width: number;
    height: number;
    maintainAspectRatio: boolean;
  }
) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('width', String(options.width));
  formData.append('height', String(options.height));
  formData.append('maintainAspectRatio', String(options.maintainAspectRatio));

  return requestProcessedFile('/api/image-tools/resize', formData, `${file.name}-resized`);
};

export const watermarkImageFile = async (
  file: File,
  options: {
    type: 'text' | 'image';
    text?: string;
    position?: string;
    opacity?: number;
    fontSize?: number;
    color?: string;
    offsetX?: number;
    offsetY?: number;
    scale?: number;
    watermarkImage?: File | null;
  }
) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('type', options.type);
  formData.append('position', options.position || 'bottom-right');
  formData.append('opacity', String(options.opacity ?? 0.35));
  formData.append('fontSize', String(options.fontSize ?? 36));
  formData.append('color', options.color || '#ffffff');
  formData.append('offsetX', String(options.offsetX ?? 20));
  formData.append('offsetY', String(options.offsetY ?? 20));
  formData.append('scale', String(options.scale ?? 25));

  if (options.type === 'text') {
    formData.append('text', options.text || '');
  } else if (options.watermarkImage) {
    formData.append('watermarkImage', options.watermarkImage);
  }

  return requestProcessedFile('/api/image-tools/watermark', formData, `${file.name}-watermarked`);
};

export const convertImagesToPdf = async (files: File[]) => {
  const formData = new FormData();
  files.forEach((file) => {
    formData.append('files', file);
  });

  return requestProcessedFile('/api/image-to-pdf', formData, 'images.pdf');
};

export const removeImageBackground = async (file: File, fuzz = 20) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('fuzz', String(fuzz));

  return requestProcessedFile('/api/remove-background', formData, `${file.name}-transparent.png`);
};

export const downloadProcessedAsset = (asset: ProcessedAsset) => {
  const downloadUrl = URL.createObjectURL(asset.blob);
  const anchor = document.createElement('a');
  anchor.href = downloadUrl;
  anchor.download = asset.fileName;
  anchor.rel = 'noopener noreferrer';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(downloadUrl);
  }, 0);
};

export const revokePreviewUrl = (previewUrl: string | null | undefined) => {
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
  }
};

export const isSupportedToolImage = (file: File) => {
  const normalizedType = file.type.toLowerCase();
  return [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
  ].includes(normalizedType);
};
