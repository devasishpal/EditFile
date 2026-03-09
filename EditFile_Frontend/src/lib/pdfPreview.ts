export interface PdfPreviewTextSpan {
  id: string;
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PdfPreviewPage {
  pageIndex: number;
  width: number;
  height: number;
  imageUrl: string;
  textSpans: PdfPreviewTextSpan[];
}

export interface PdfPreviewDocument {
  pageCount: number;
  pages: PdfPreviewPage[];
}

interface PdfJsPageViewport {
  width: number;
  height: number;
  scale: number;
  transform: number[];
}

interface PdfJsTextItem {
  str: string;
  width: number;
  height: number;
  transform: number[];
}

interface PdfJsTextContent {
  items: PdfJsTextItem[];
}

interface PdfJsRenderTask {
  promise: Promise<void>;
}

interface PdfJsPage {
  getViewport(options: { scale: number }): PdfJsPageViewport;
  render(options: {
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfJsPageViewport;
  }): PdfJsRenderTask;
  getTextContent(): Promise<PdfJsTextContent>;
}

interface PdfJsDocument {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfJsPage>;
  cleanup?: () => void;
  destroy?: () => void;
}

interface PdfJsLoadingTask<T> {
  promise: Promise<T>;
}

interface PdfJsModuleShape {
  GlobalWorkerOptions: {
    workerSrc: string;
  };
  getDocument(source: { data: Uint8Array }): PdfJsLoadingTask<PdfJsDocument>;
  Util: {
    transform(first: number[], second: number[]): number[];
  };
}

const PDFJS_CDN_BASE = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38';

let pdfJsPromise: Promise<PdfJsModuleShape> | null = null;

const loadPdfJs = async () => {
  if (!pdfJsPromise) {
    pdfJsPromise = import(
      /* @vite-ignore */ `${PDFJS_CDN_BASE}/build/pdf.mjs`
    ).then((module) => {
      const pdfjs = module as unknown as PdfJsModuleShape;
      pdfjs.GlobalWorkerOptions.workerSrc = `${PDFJS_CDN_BASE}/build/pdf.worker.mjs`;
      return pdfjs;
    });
  }

  return pdfJsPromise;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const extractTextSpans = (
  pdfjs: PdfJsModuleShape,
  textContent: PdfJsTextContent,
  viewport: PdfJsPageViewport
): PdfPreviewTextSpan[] =>
  textContent.items.flatMap((item, index) => {
    const text = String(item?.str || '');
    const normalizedText = text.replace(/\s+/g, ' ').trim();
    if (!normalizedText) {
      return [];
    }

    const transform = pdfjs.Util.transform(viewport.transform, item.transform);
    const rawHeight = Math.abs(item.height || 0) * viewport.scale;
    const rawWidth = Math.abs(item.width || 0) * viewport.scale;
    const height = clamp(rawHeight || Math.abs(transform[3]) || 14, 10, viewport.height);
    const width = clamp(rawWidth || normalizedText.length * height * 0.45, 6, viewport.width);
    const left = clamp(transform[4], 0, Math.max(0, viewport.width - width));
    const top = clamp(transform[5] - height, 0, Math.max(0, viewport.height - height));

    return [
      {
        id: `text-${index}`,
        text: normalizedText,
        left,
        top,
        width,
        height,
      },
    ];
  });

export const loadPdfPreview = async (
  file: File,
  options: {
    maxPageWidth?: number;
    includeTextSpans?: boolean;
    onProgress?: (progress: number) => void;
  } = {}
): Promise<PdfPreviewDocument> => {
  const pdfjs = await loadPdfJs();
  const maxPageWidth = options.maxPageWidth ?? 760;
  const includeTextSpans = options.includeTextSpans ?? false;
  const source = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data: source });
  const documentProxy = await loadingTask.promise;

  try {
    const pages: PdfPreviewPage[] = [];

    for (let pageNumber = 1; pageNumber <= documentProxy.numPages; pageNumber += 1) {
      const page = await documentProxy.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = baseViewport.width > maxPageWidth ? maxPageWidth / baseViewport.width : 1;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');

      if (!context) {
        throw new Error('Canvas rendering is not available in this browser.');
      }

      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);

      await page.render({
        canvasContext: context,
        viewport,
      }).promise;

      const textSpans = includeTextSpans
        ? extractTextSpans(pdfjs, await page.getTextContent(), viewport)
        : [];

      pages.push({
        pageIndex: pageNumber - 1,
        width: viewport.width,
        height: viewport.height,
        imageUrl: canvas.toDataURL('image/jpeg', 0.92),
        textSpans,
      });

      options.onProgress?.(Math.round((pageNumber / documentProxy.numPages) * 100));
    }

    return {
      pageCount: documentProxy.numPages,
      pages,
    };
  } finally {
    documentProxy.cleanup?.();
    documentProxy.destroy?.();
  }
};
