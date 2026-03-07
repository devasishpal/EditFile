import { API_BASE_URL, isLocalApiTarget } from './apiConfig';

type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

interface QueuedJobResponse {
  success: boolean;
  jobId: string;
}

export type SplitMethod = 'range' | 'every' | 'extract';
export type PdfToWordOutputFormat = 'docx' | 'doc' | 'rtf';
export type OcrOutputFormat = 'searchable-pdf' | 'text' | 'word';

interface JobStatusResponse {
  success: boolean;
  job: {
    id: string;
    status: JobStatus;
    outputSize: number | null;
    errorMessage: string | null;
  };
}

interface DownloadResponse {
  success: boolean;
  downloadUrl: string;
  outputSize: number;
  fileName?: string;
}

const DEFAULT_POLL_INTERVAL_MS = 1200;
const LOCAL_POLL_INTERVAL_MS = 350;

const getErrorMessage = async (response: Response) => {
  try {
    const payload = await response.json();
    return payload.error || payload.message || 'Request failed';
  } catch {
    return 'Request failed';
  }
};

const requestJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}${path}`, init);
  if (!response.ok) {
    throw new Error(await getErrorMessage(response));
  }
  return response.json() as Promise<T>;
};

export const queuePdfCompression = async (file: File, targetSizeKB: number) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('targetSizeKB', String(targetSizeKB));

  return requestJson<QueuedJobResponse>('/api/compress-pdf', {
    method: 'POST',
    body: formData,
  });
};

export const queuePdfToWord = async (
  file: File,
  outputFormat: PdfToWordOutputFormat = 'docx'
) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('format', outputFormat);

  return requestJson<QueuedJobResponse>('/api/pdf-to-word', {
    method: 'POST',
    body: formData,
  });
};

export const queueOcrPdf = async (
  file: File,
  options: {
    language?: string;
    outputFormat?: OcrOutputFormat;
  } = {}
) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('language', options.language || 'eng');
  formData.append('outputFormat', options.outputFormat || 'searchable-pdf');

  return requestJson<QueuedJobResponse>('/api/ocr-pdf', {
    method: 'POST',
    body: formData,
  });
};

export const queuePdfToJpg = async (
  file: File,
  options: {
    quality?: number;
    dpi?: number;
  } = {}
) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('quality', String(options.quality ?? 90));
  formData.append('dpi', String(options.dpi ?? 150));

  return requestJson<QueuedJobResponse>('/api/pdf-to-jpg', {
    method: 'POST',
    body: formData,
  });
};

export const queueMergePdf = async (files: File[]) => {
  const formData = new FormData();
  files.forEach((file) => {
    formData.append('files', file);
  });

  return requestJson<QueuedJobResponse>('/api/merge-pdf', {
    method: 'POST',
    body: formData,
  });
};

export const queueSplitPdf = async (
  file: File,
  options: {
    splitMethod: SplitMethod;
    pageRange?: string;
  }
) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('splitMethod', options.splitMethod);
  if (typeof options.pageRange === 'string') {
    formData.append('pageRange', options.pageRange);
  }

  return requestJson<QueuedJobResponse>('/api/split-pdf', {
    method: 'POST',
    body: formData,
  });
};

export const queueJpegCompression = async (
  file: File,
  targetSizeKB: number,
  quality: number
) => {
  const formData = new FormData();
  formData.append('files', file);
  formData.append('targetSizeKB', String(targetSizeKB));
  formData.append('quality', String(quality));

  return requestJson<QueuedJobResponse>('/api/image-compress', {
    method: 'POST',
    body: formData,
  });
};

export const queueImageResize = async (
  file: File,
  options: {
    width: number;
    height: number;
    maintainAspectRatio: boolean;
  }
) => {
  const formData = new FormData();
  formData.append('files', file);
  formData.append('width', String(options.width));
  formData.append('height', String(options.height));
  formData.append('maintainAspectRatio', String(options.maintainAspectRatio));

  return requestJson<QueuedJobResponse>('/api/image-resize', {
    method: 'POST',
    body: formData,
  });
};

export const pollJobUntilDone = async (
  jobId: string,
  options: {
    intervalMs?: number;
    timeoutMs?: number;
  } = {}
) => {
  const intervalMs = options.intervalMs ?? (
    isLocalApiTarget ? LOCAL_POLL_INTERVAL_MS : DEFAULT_POLL_INTERVAL_MS
  );
  const timeoutMs = options.timeoutMs ?? 120000;
  const startedAt = Date.now();

  while (true) {
    const result = await requestJson<JobStatusResponse>(`/api/job-status/${jobId}`);

    if (result.job.status === 'completed') {
      return result.job;
    }

    if (result.job.status === 'failed') {
      throw new Error(result.job.errorMessage || 'Compression failed');
    }

    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('Compression timed out');
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
};

export const getJobDownloadInfo = async (jobId: string) => {
  return requestJson<DownloadResponse>(`/api/download/${jobId}`);
};

export const startFileDownload = (downloadUrl: string, fileName: string) => {
  const anchor = document.createElement('a');
  anchor.href = downloadUrl;
  anchor.download = fileName;
  anchor.rel = 'noopener noreferrer';
  anchor.target = '_blank';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
};
