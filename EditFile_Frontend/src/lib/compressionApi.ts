import { API_BASE_URL, isLocalApiTarget } from './apiConfig';

type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

interface QueuedJobResponse {
  success: boolean;
  jobId: string;
}

export type SplitMethod = 'range' | 'every' | 'extract';
export type PdfToWordOutputFormat = 'docx' | 'doc' | 'rtf';
export type PdfToExcelOutputFormat = 'xlsx' | 'xls';
export type PdfToPowerPointOutputFormat = 'pptx' | 'ppt';
export type OcrOutputFormat = 'searchable-pdf' | 'text' | 'word';
export type PdfaVersion = 'pdfa-1' | 'pdfa-2' | 'pdfa-3';
export type UploadProgressHandler = (progress: number) => void;
export type OrganizePdfRotation = 0 | 90 | 180 | 270;

export interface OrganizePdfPageOperation {
  sourceIndex: number;
  rotation: OrganizePdfRotation;
}

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

const requestJsonWithUploadProgress = <T>(
  path: string,
  formData: FormData,
  onUploadProgress?: UploadProgressHandler
): Promise<T> =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE_URL}${path}`);

    xhr.upload.onprogress = (event) => {
      if (!onUploadProgress) {
        return;
      }

      if (!event.lengthComputable) {
        return;
      }

      const progress = Math.min(100, Math.max(0, Math.round((event.loaded / event.total) * 100)));
      onUploadProgress(progress);
    };

    xhr.onerror = () => {
      reject(new Error('Network request failed'));
    };

    xhr.onload = () => {
      let payload: unknown = null;
      try {
        payload = JSON.parse(xhr.responseText || '{}');
      } catch {
        payload = null;
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        if (onUploadProgress) {
          onUploadProgress(100);
        }
        resolve(payload as T);
        return;
      }

      const rawErrorMessage =
        (payload &&
          typeof payload === 'object' &&
          (payload as { error?: string; message?: string }).error) ||
        (payload &&
          typeof payload === 'object' &&
          (payload as { error?: string; message?: string }).message) ||
        'Request failed';
      const errorMessage =
        typeof rawErrorMessage === 'string' && rawErrorMessage.trim()
          ? rawErrorMessage
          : 'Request failed';
      reject(new Error(errorMessage));
    };

    xhr.send(formData);
  });

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
  outputFormat: PdfToWordOutputFormat = 'docx',
  onUploadProgress?: UploadProgressHandler
) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('format', outputFormat);

  if (onUploadProgress) {
    return requestJsonWithUploadProgress<QueuedJobResponse>(
      '/api/pdf-to-word',
      formData,
      onUploadProgress
    );
  }

  return requestJson<QueuedJobResponse>('/api/pdf-to-word', {
    method: 'POST',
    body: formData,
  });
};

export const queueWordToPdf = async (
  file: File,
  onUploadProgress?: UploadProgressHandler
) => {
  const formData = new FormData();
  formData.append('file', file);

  if (onUploadProgress) {
    return requestJsonWithUploadProgress<QueuedJobResponse>(
      '/api/word-to-pdf',
      formData,
      onUploadProgress
    );
  }

  return requestJson<QueuedJobResponse>('/api/word-to-pdf', {
    method: 'POST',
    body: formData,
  });
};

export const queueExcelToPdf = async (
  file: File,
  onUploadProgress?: UploadProgressHandler
) => {
  const formData = new FormData();
  formData.append('file', file);

  if (onUploadProgress) {
    return requestJsonWithUploadProgress<QueuedJobResponse>(
      '/api/excel-to-pdf',
      formData,
      onUploadProgress
    );
  }

  return requestJson<QueuedJobResponse>('/api/excel-to-pdf', {
    method: 'POST',
    body: formData,
  });
};

export const queuePowerPointToPdf = async (
  file: File,
  onUploadProgress?: UploadProgressHandler
) => {
  const formData = new FormData();
  formData.append('file', file);

  if (onUploadProgress) {
    return requestJsonWithUploadProgress<QueuedJobResponse>(
      '/api/powerpoint-to-pdf',
      formData,
      onUploadProgress
    );
  }

  return requestJson<QueuedJobResponse>('/api/powerpoint-to-pdf', {
    method: 'POST',
    body: formData,
  });
};

export const queuePdfToExcel = async (
  file: File,
  outputFormat: PdfToExcelOutputFormat = 'xlsx',
  onUploadProgress?: UploadProgressHandler
) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('format', outputFormat);

  if (onUploadProgress) {
    return requestJsonWithUploadProgress<QueuedJobResponse>(
      '/api/pdf-to-excel',
      formData,
      onUploadProgress
    );
  }

  return requestJson<QueuedJobResponse>('/api/pdf-to-excel', {
    method: 'POST',
    body: formData,
  });
};

export const queuePdfToPowerPoint = async (
  file: File,
  outputFormat: PdfToPowerPointOutputFormat = 'pptx',
  onUploadProgress?: UploadProgressHandler
) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('format', outputFormat);

  if (onUploadProgress) {
    return requestJsonWithUploadProgress<QueuedJobResponse>(
      '/api/pdf-to-powerpoint',
      formData,
      onUploadProgress
    );
  }

  return requestJson<QueuedJobResponse>('/api/pdf-to-powerpoint', {
    method: 'POST',
    body: formData,
  });
};

export const queuePdfToPdfA = async (
  file: File,
  pdfaVersion: PdfaVersion = 'pdfa-2',
  onUploadProgress?: UploadProgressHandler
) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('pdfaVersion', pdfaVersion);

  if (onUploadProgress) {
    return requestJsonWithUploadProgress<QueuedJobResponse>(
      '/api/pdf-to-pdfa',
      formData,
      onUploadProgress
    );
  }

  return requestJson<QueuedJobResponse>('/api/pdf-to-pdfa', {
    method: 'POST',
    body: formData,
  });
};

export const queueProtectPdf = async (
  file: File,
  options: {
    password: string;
    printing: boolean;
    copying: boolean;
    editing: boolean;
  },
  onUploadProgress?: UploadProgressHandler
) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('password', options.password);
  formData.append('printing', String(options.printing));
  formData.append('copying', String(options.copying));
  formData.append('editing', String(options.editing));

  if (onUploadProgress) {
    return requestJsonWithUploadProgress<QueuedJobResponse>(
      '/api/protect-pdf',
      formData,
      onUploadProgress
    );
  }

  return requestJson<QueuedJobResponse>('/api/protect-pdf', {
    method: 'POST',
    body: formData,
  });
};

export const queueUnlockPdf = async (
  file: File,
  password: string,
  onUploadProgress?: UploadProgressHandler
) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('password', password);

  if (onUploadProgress) {
    return requestJsonWithUploadProgress<QueuedJobResponse>(
      '/api/unlock-pdf',
      formData,
      onUploadProgress
    );
  }

  return requestJson<QueuedJobResponse>('/api/unlock-pdf', {
    method: 'POST',
    body: formData,
  });
};

export const queueRepairPdf = async (
  file: File,
  onUploadProgress?: UploadProgressHandler
) => {
  const formData = new FormData();
  formData.append('file', file);

  if (onUploadProgress) {
    return requestJsonWithUploadProgress<QueuedJobResponse>(
      '/api/repair-pdf',
      formData,
      onUploadProgress
    );
  }

  return requestJson<QueuedJobResponse>('/api/repair-pdf', {
    method: 'POST',
    body: formData,
  });
};

interface OrganizePdfInspectResponse {
  success: boolean;
  pageCount: number;
}

export const inspectOrganizePdf = async (
  file: File,
  onUploadProgress?: UploadProgressHandler
) => {
  const formData = new FormData();
  formData.append('file', file);

  if (onUploadProgress) {
    return requestJsonWithUploadProgress<OrganizePdfInspectResponse>(
      '/api/organize-pdf/inspect',
      formData,
      onUploadProgress
    );
  }

  return requestJson<OrganizePdfInspectResponse>('/api/organize-pdf/inspect', {
    method: 'POST',
    body: formData,
  });
};

export const queueOrganizePdf = async (
  file: File,
  pages: OrganizePdfPageOperation[],
  onUploadProgress?: UploadProgressHandler
) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('pages', JSON.stringify(pages));

  if (onUploadProgress) {
    return requestJsonWithUploadProgress<QueuedJobResponse>(
      '/api/organize-pdf',
      formData,
      onUploadProgress
    );
  }

  return requestJson<QueuedJobResponse>('/api/organize-pdf', {
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
      throw new Error(result.job.errorMessage || 'Processing failed');
    }

    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('Processing timed out');
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
