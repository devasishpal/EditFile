import { API_BASE_URL } from './apiConfig';

export interface ProcessedPdfFile {
  blob: Blob;
  fileName: string;
  contentType: string;
}

export interface PdfSignPlacement {
  renderer: 'image' | 'text';
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity?: number;
  align?: 'left' | 'center' | 'right';
  text?: string;
  fontFamily?: 'sans' | 'serif' | 'mono';
  fontStyle?: 'normal' | 'bold' | 'italic';
  fontColor?: string;
  assetDataUrl?: string;
}

export interface PdfRedactionPlacement {
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  style: 'black' | 'white' | 'blur';
}

export interface ComparePdfPageReportPayload {
  pageIndex: number;
  differenceTypes: Array<'text' | 'layout' | 'image'>;
  addedCount: number;
  removedCount: number;
  changedCount: number;
  visualChangeRatio: number;
  addedSamples: string[];
  removedSamples: string[];
  originalPreviewDataUrl: string;
  modifiedPreviewDataUrl: string;
}

export interface ComparePdfSummaryPayload {
  totalPages: number;
  pagesWithDifferences: number;
  textChanges: number;
  layoutChanges: number;
  imageChanges: number;
  pageReports: ComparePdfPageReportPayload[];
}

const getErrorMessage = async (response: Response) => {
  try {
    const payload = await response.json();
    return payload.error || payload.message || 'Request failed';
  } catch {
    return 'Request failed';
  }
};

const ensurePdfName = (name: string) => {
  const trimmed = name.trim();
  if (!trimmed) {
    return 'processed.pdf';
  }

  return trimmed.toLowerCase().endsWith('.pdf') ? trimmed : `${trimmed}.pdf`;
};

const extractFileName = (headerValue: string | null, fallbackName: string) => {
  if (!headerValue) {
    return fallbackName;
  }

  const cleaned = headerValue.replace(/^['"]|['"]$/g, '').trim();
  if (!cleaned) {
    return fallbackName;
  }

  return ensurePdfName(cleaned);
};

const requestProcessedPdf = async (
  endpoint: string,
  formData: FormData,
  fallbackFileName: string
): Promise<ProcessedPdfFile> => {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await getErrorMessage(response));
  }

  const blob = await response.blob();
  const fileName = extractFileName(
    response.headers.get('x-processed-file-name'),
    ensurePdfName(fallbackFileName)
  );

  return {
    blob,
    fileName,
    contentType: response.headers.get('content-type') || blob.type || 'application/pdf',
  };
};

export const isPdfToolFile = (file: File) =>
  file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

export const rotatePdfFile = async (
  file: File,
  options: {
    rotation: 90 | 180 | 270;
    pages?: string;
  }
) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('rotation', String(options.rotation));
  if (options.pages?.trim()) {
    formData.append('pages', options.pages.trim());
  }

  return requestProcessedPdf(
    '/api/rotate-pdf',
    formData,
    file.name
  );
};

export const deletePdfPagesFile = async (
  file: File,
  options: {
    pages: string;
  }
) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('pages', options.pages.trim());

  return requestProcessedPdf(
    '/api/delete-pages',
    formData,
    file.name
  );
};

export const addPdfPageNumbersFile = async (
  file: File,
  options: {
    position: 'bottom-center' | 'bottom-right' | 'top-right';
    startNumber?: number;
  }
) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('position', options.position);
  if (typeof options.startNumber === 'number' && Number.isInteger(options.startNumber)) {
    formData.append('startNumber', String(options.startNumber));
  }

  return requestProcessedPdf(
    '/api/add-page-numbers',
    formData,
    file.name
  );
};

export const addPdfWatermarkFile = async (
  file: File,
  options: {
    watermarkType: 'text' | 'image';
    text?: string;
    watermarkImage?: File | null;
    placement: 'center' | 'diagonal';
    opacity: number;
  }
) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('watermarkType', options.watermarkType);
  formData.append('placement', options.placement);
  formData.append('opacity', String(options.opacity));

  if (options.watermarkType === 'text') {
    formData.append('text', options.text?.trim() || '');
  } else if (options.watermarkImage) {
    formData.append('watermarkImage', options.watermarkImage);
  }

  return requestProcessedPdf(
    '/api/add-watermark',
    formData,
    file.name
  );
};

export const signPdfFile = async (
  file: File,
  placements: PdfSignPlacement[]
) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('placements', JSON.stringify(placements));

  return requestProcessedPdf(
    '/api/sign-pdf',
    formData,
    file.name.replace(/\.pdf$/i, '_signed.pdf')
  );
};

export const redactPdfFile = async (
  file: File,
  redactions: PdfRedactionPlacement[]
) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('redactions', JSON.stringify(redactions));

  return requestProcessedPdf(
    '/api/redact-pdf',
    formData,
    file.name.replace(/\.pdf$/i, '_redacted.pdf')
  );
};

export const comparePdfReportFile = async (
  originalFile: File,
  modifiedFile: File,
  summary: ComparePdfSummaryPayload
) => {
  const formData = new FormData();
  formData.append('originalFile', originalFile);
  formData.append('modifiedFile', modifiedFile);
  formData.append('summary', JSON.stringify(summary));

  return requestProcessedPdf(
    '/api/compare-pdf',
    formData,
    `${originalFile.name.replace(/\.pdf$/i, '')}_vs_${modifiedFile.name.replace(/\.pdf$/i, '')}_comparison.pdf`
  );
};

export const downloadProcessedPdf = (asset: ProcessedPdfFile) => {
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
