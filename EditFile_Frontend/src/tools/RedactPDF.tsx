import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  Download,
  EyeOff,
  FileText,
  Loader2,
  ScanText,
  Square,
  Upload,
  X,
} from 'lucide-react';
import { loadPdfPreview, type PdfPreviewDocument } from '@/lib/pdfPreview';
import {
  downloadProcessedPdf,
  isPdfToolFile,
  redactPdfFile,
  type PdfRedactionPlacement,
  type ProcessedPdfFile,
} from '@/lib/pdfToolApi';

type RedactionMode = 'draw' | 'text';
type RedactionStyle = 'black' | 'white' | 'blur';

interface RedactionItem extends PdfRedactionPlacement {
  id: string;
}

interface DraftRedaction {
  pageIndex: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

const formatSize = (bytes: number) => {
  if (bytes === 0) {
    return '0 B';
  }

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

const createItemId = () => Math.random().toString(36).slice(2, 11);

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const normalizeDraft = (draft: DraftRedaction) => {
  const x = Math.min(draft.startX, draft.currentX);
  const y = Math.min(draft.startY, draft.currentY);
  const width = Math.abs(draft.currentX - draft.startX);
  const height = Math.abs(draft.currentY - draft.startY);

  return {
    x: clamp(x, 0, 1),
    y: clamp(y, 0, 1),
    width: clamp(width, 0, 1),
    height: clamp(height, 0, 1),
  };
};

const toApiRedactions = (items: RedactionItem[]) =>
  items.map((item) => ({
    pageIndex: item.pageIndex,
    x: item.x,
    y: item.y,
    width: item.width,
    height: item.height,
    style: item.style,
  }));

const getStylePreviewClass = (style: RedactionStyle) => {
  if (style === 'white') {
    return 'bg-white/95 border-white';
  }

  if (style === 'blur') {
    return 'bg-white/15 border-amber-400 backdrop-blur-md';
  }

  return 'bg-black/95 border-black';
};

export default function RedactPDF() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewDocument, setPreviewDocument] = useState<PdfPreviewDocument | null>(null);
  const [mode, setMode] = useState<RedactionMode>('draw');
  const [redactionStyle, setRedactionStyle] = useState<RedactionStyle>('black');
  const [redactions, setRedactions] = useState<RedactionItem[]>([]);
  const [selectedRedactionId, setSelectedRedactionId] = useState<string | null>(null);
  const [draftRedaction, setDraftRedaction] = useState<DraftRedaction | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewProgress, setPreviewProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProcessedPdfFile | null>(null);
  const [resultPreviewUrl, setResultPreviewUrl] = useState('');
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const selectedRedaction = redactions.find((item) => item.id === selectedRedactionId) || null;

  useEffect(() => {
    if (!result) {
      setResultPreviewUrl('');
      return;
    }

    const nextUrl = URL.createObjectURL(result.blob);
    setResultPreviewUrl(nextUrl);
    return () => {
      URL.revokeObjectURL(nextUrl);
    };
  }, [result]);

  const loadFilePreview = useCallback(async (file: File) => {
    setIsLoadingPreview(true);
    setPreviewProgress(0);
    setError(null);
    setResult(null);

    try {
      const loadedPreview = await loadPdfPreview(file, {
        maxPageWidth: 760,
        includeTextSpans: true,
        onProgress: setPreviewProgress,
      });

      setSelectedFile(file);
      setPreviewDocument(loadedPreview);
      setRedactions([]);
      setSelectedRedactionId(null);
      setDraftRedaction(null);
    } catch (requestError) {
      setSelectedFile(null);
      setPreviewDocument(null);
      setRedactions([]);
      setSelectedRedactionId(null);
      setError(
        requestError instanceof Error ? requestError.message : 'Failed to load PDF preview'
      );
    } finally {
      setIsLoadingPreview(false);
    }
  }, []);

  const handleSelectFile = useCallback(
    (files: File[]) => {
      const pdfFile = files.find(isPdfToolFile);
      if (!pdfFile) {
        setError('Please upload a PDF file.');
        return;
      }

      void loadFilePreview(pdfFile);
    },
    [loadFilePreview]
  );

  const handleFileInput = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      handleSelectFile(Array.from(event.target.files || []));
      event.target.value = '';
    },
    [handleSelectFile]
  );

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setIsDragging(false);
      handleSelectFile(Array.from(event.dataTransfer.files));
    },
    [handleSelectFile]
  );

  const addRedaction = (placement: PdfRedactionPlacement) => {
    setRedactions((currentItems) => [
      ...currentItems,
      {
        id: createItemId(),
        ...placement,
      },
    ]);
    setResult(null);
    setError(null);
  };

  const beginDrawRedaction = (event: React.MouseEvent<HTMLDivElement>, pageIndex: number) => {
    if (mode !== 'draw') {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const x = clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
    const y = clamp((event.clientY - bounds.top) / bounds.height, 0, 1);

    setDraftRedaction({
      pageIndex,
      startX: x,
      startY: y,
      currentX: x,
      currentY: y,
    });
  };

  const continueDrawRedaction = (event: React.MouseEvent<HTMLDivElement>, pageIndex: number) => {
    if (!draftRedaction || draftRedaction.pageIndex !== pageIndex || mode !== 'draw') {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const x = clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
    const y = clamp((event.clientY - bounds.top) / bounds.height, 0, 1);

    setDraftRedaction((currentDraft) =>
      currentDraft
        ? {
            ...currentDraft,
            currentX: x,
            currentY: y,
          }
        : null
    );
  };

  const finalizeDrawRedaction = () => {
    if (!draftRedaction) {
      return;
    }

    const normalized = normalizeDraft(draftRedaction);
    if (normalized.width > 0.01 && normalized.height > 0.01) {
      addRedaction({
        pageIndex: draftRedaction.pageIndex,
        style: redactionStyle,
        ...normalized,
      });
    }

    setDraftRedaction(null);
  };

  const handleTextSelection = (pageIndex: number) => {
    if (mode !== 'text') {
      return;
    }

    const selection = window.getSelection();
    const container = pageRefs.current[pageIndex];
    if (!selection || selection.rangeCount === 0 || !container) {
      return;
    }

    const range = selection.getRangeAt(0);
    const rects = Array.from(range.getClientRects());
    const bounds = container.getBoundingClientRect();

    rects.forEach((rect) => {
      if (rect.width < 3 || rect.height < 3) {
        return;
      }

      if (
        rect.right < bounds.left ||
        rect.left > bounds.right ||
        rect.bottom < bounds.top ||
        rect.top > bounds.bottom
      ) {
        return;
      }

      addRedaction({
        pageIndex,
        style: redactionStyle,
        x: clamp((rect.left - bounds.left) / bounds.width, 0, 1),
        y: clamp((rect.top - bounds.top) / bounds.height, 0, 1),
        width: clamp(rect.width / bounds.width, 0, 1),
        height: clamp(rect.height / bounds.height, 0, 1),
      });
    });

    selection.removeAllRanges();
  };

  const updateSelectedRedaction = (style: RedactionStyle) => {
    if (!selectedRedactionId) {
      return;
    }

    setRedactions((currentItems) =>
      currentItems.map((item) =>
        item.id === selectedRedactionId
          ? {
              ...item,
              style,
            }
          : item
      )
    );
    setResult(null);
  };

  const handleApplyRedactions = async () => {
    if (!selectedFile || redactions.length === 0 || isProcessing) {
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const processed = await redactPdfFile(selectedFile, toApiRedactions(redactions));
      setResult(processed);
    } catch (requestError) {
      setResult(null);
      setError(requestError instanceof Error ? requestError.message : 'Failed to redact PDF');
    } finally {
      setIsProcessing(false);
    }
  };

  const clearFile = () => {
    if (isProcessing) {
      return;
    }

    setSelectedFile(null);
    setPreviewDocument(null);
    setRedactions([]);
    setSelectedRedactionId(null);
    setResult(null);
    setError(null);
    setPreviewProgress(0);
  };

  return (
    <div className="w-full px-3 sm:px-4 lg:px-6 py-8 overflow-x-clip">
      <div className="max-w-6xl mx-auto space-y-4">
        {!selectedFile && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="sticker-card p-5 sm:p-8 lg:p-12"
          >
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                setIsDragging(false);
              }}
              onDrop={handleDrop}
              className={`border-3 border-dashed rounded-2xl p-6 sm:p-10 lg:p-16 flex flex-col items-center justify-center transition-all cursor-pointer ${
                isDragging
                  ? 'border-pink bg-pink/5'
                  : 'border-gray-300 hover:border-violet hover:bg-violet/5'
              }`}
            >
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-violet/10 rounded-2xl flex items-center justify-center mb-6">
                <EyeOff className="w-8 h-8 sm:w-10 sm:h-10 text-violet" />
              </div>
              <h3 className="font-display font-bold text-xl sm:text-2xl text-dark text-center mb-2">
                Drop PDF file to redact
              </h3>
              <p className="text-gray text-center mb-6">
                Select text or draw boxes to permanently remove sensitive content
              </p>
              <label className="sticker-button cursor-pointer">
                <span>Select PDF File</span>
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={handleFileInput}
                  className="hidden"
                />
              </label>
            </div>
          </motion.div>
        )}

        {isLoadingPreview && (
          <div className="sticker-card p-4">
            <div className="flex items-center gap-3 mb-2 text-violet">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Loading text-aware PDF preview...</span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-violet transition-all duration-300"
                style={{ width: `${previewProgress}%` }}
              />
            </div>
          </div>
        )}

        {selectedFile && previewDocument && !isLoadingPreview && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]"
          >
            <div className="space-y-4">
              <div className="sticker-card p-5">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="w-12 h-12 bg-violet/10 rounded-xl flex items-center justify-center">
                    <FileText className="w-6 h-6 text-violet" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-dark truncate">{selectedFile.name}</p>
                    <p className="text-gray text-sm">{formatSize(selectedFile.size)}</p>
                  </div>
                  <button
                    onClick={clearFile}
                    disabled={isProcessing}
                    className="w-10 h-10 bg-gray-100 hover:bg-red-100 rounded-xl flex items-center justify-center transition-colors disabled:opacity-60"
                  >
                    <X className="w-5 h-5 text-gray hover:text-red-500" />
                  </button>
                </div>
              </div>

              <div className="sticker-card p-5 space-y-4">
                <div>
                  <label className="font-display font-bold text-dark block mb-3">Mode</label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: 'draw', label: 'Draw Area', icon: Square },
                      { value: 'text', label: 'Select Text', icon: ScanText },
                    ].map((item) => {
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.value}
                          onClick={() => setMode(item.value as RedactionMode)}
                          className={`px-4 py-2 rounded-xl border-2 font-medium transition-colors ${
                            mode === item.value
                              ? 'bg-violet text-white border-violet'
                              : 'bg-white text-dark border-gray-200 hover:border-violet'
                          }`}
                        >
                          <Icon className="w-4 h-4 inline mr-2" />
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="font-display font-bold text-dark block mb-3">
                    Redaction Style
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {([
                      { value: 'black', label: 'Black' },
                      { value: 'white', label: 'White' },
                      { value: 'blur', label: 'Blur' },
                    ] as const).map((item) => (
                      <button
                        key={item.value}
                        onClick={() => {
                          setRedactionStyle(item.value);
                          updateSelectedRedaction(item.value);
                        }}
                        className={`px-4 py-2 rounded-xl border-2 font-medium transition-colors ${
                          redactionStyle === item.value
                            ? 'bg-violet text-white border-violet'
                            : 'bg-white text-dark border-gray-200 hover:border-violet'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border-2 border-gray-200 bg-gray-50 p-4 text-sm text-gray">
                  {mode === 'draw'
                    ? 'Draw mode: click and drag anywhere on a page to create a redaction box.'
                    : 'Text mode: select text directly on the page to convert the selection into permanent redaction areas.'}
                </div>
              </div>

              {selectedRedaction && (
                <div className="sticker-card p-5 space-y-3">
                  <p className="font-display font-bold text-dark">Selected Redaction</p>
                  <p className="text-sm text-gray">
                    Page {selectedRedaction.pageIndex + 1} · {selectedRedaction.style}
                  </p>
                  <button
                    onClick={() => {
                      setRedactions((currentItems) =>
                        currentItems.filter((item) => item.id !== selectedRedaction.id)
                      );
                      setSelectedRedactionId(null);
                    }}
                    className="w-full px-4 py-3 bg-red-500 text-white rounded-xl border-2 border-black font-medium hover:bg-red-600 transition-colors"
                  >
                    Remove Selected
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-4">
              {error && (
                <div className="sticker-card p-4">
                  <p className="text-red-500 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    {error}
                  </p>
                </div>
              )}

              <div className="sticker-card p-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm text-gray">
                  <span className="sticker-label bg-violet text-white border-violet">
                    {previewDocument.pageCount} pages
                  </span>
                  <span>Areas: {redactions.length}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <label className="sticker-button-secondary cursor-pointer">
                    <Upload className="w-4 h-4 mr-2" />
                    <span>Choose Another PDF</span>
                    <input
                      type="file"
                      accept=".pdf,application/pdf"
                      onChange={handleFileInput}
                      className="hidden"
                    />
                  </label>
                  <button
                    onClick={() => void handleApplyRedactions()}
                    disabled={redactions.length === 0 || isProcessing}
                    className="sticker-button disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Redacting...
                      </>
                    ) : (
                      <>
                        <EyeOff className="w-4 h-4 mr-2" />
                        Apply Redact
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      if (result) {
                        downloadProcessedPdf(result);
                      }
                    }}
                    disabled={!result || isProcessing}
                    className="sticker-button-secondary disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </button>
                </div>
              </div>

              <div className="space-y-6">
                {previewDocument.pages.map((page) => {
                  const pageRedactions = redactions.filter((item) => item.pageIndex === page.pageIndex);
                  const currentDraft = draftRedaction && draftRedaction.pageIndex === page.pageIndex
                    ? normalizeDraft(draftRedaction)
                    : null;

                  return (
                    <div key={page.pageIndex} className="sticker-card p-4">
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <span className="sticker-label">Page {page.pageIndex + 1}</span>
                        <span className="text-xs text-gray">
                          {mode === 'draw' ? 'Draw a box to redact' : 'Select text directly on the page'}
                        </span>
                      </div>

                      <div
                        ref={(element) => {
                          pageRefs.current[page.pageIndex] = element;
                        }}
                        onMouseDown={(event) => beginDrawRedaction(event, page.pageIndex)}
                        onMouseMove={(event) => continueDrawRedaction(event, page.pageIndex)}
                        onMouseUp={() => {
                          finalizeDrawRedaction();
                          handleTextSelection(page.pageIndex);
                        }}
                        className="relative mx-auto bg-gray-100 rounded-xl overflow-hidden border border-gray-200"
                        style={{
                          width: `${page.width}px`,
                          maxWidth: '100%',
                          userSelect: mode === 'draw' ? 'none' : 'text',
                        }}
                      >
                        <img
                          src={page.imageUrl}
                          alt={`Page ${page.pageIndex + 1}`}
                          className="block w-full h-auto"
                          draggable={false}
                        />

                        {page.textSpans.map((span) => (
                          <span
                            key={span.id}
                            className="absolute whitespace-pre"
                            style={{
                              left: `${(span.left / page.width) * 100}%`,
                              top: `${(span.top / page.height) * 100}%`,
                              width: `${(span.width / page.width) * 100}%`,
                              height: `${(span.height / page.height) * 100}%`,
                              fontSize: `${Math.max(10, span.height * 0.8)}px`,
                              lineHeight: `${span.height}px`,
                              color: 'rgba(17, 17, 17, 0.015)',
                              background: 'transparent',
                              cursor: mode === 'text' ? 'text' : 'default',
                            }}
                          >
                            {span.text}
                          </span>
                        ))}

                        {pageRedactions.map((item) => (
                          <button
                            key={item.id}
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedRedactionId(item.id);
                            }}
                            className={`absolute border-2 ${getStylePreviewClass(item.style)} ${
                              selectedRedactionId === item.id ? 'ring-2 ring-pink ring-offset-1' : ''
                            }`}
                            style={{
                              left: `${item.x * 100}%`,
                              top: `${item.y * 100}%`,
                              width: `${item.width * 100}%`,
                              height: `${item.height * 100}%`,
                            }}
                            aria-label="Select redaction"
                          />
                        ))}

                        {currentDraft && (
                          <div
                            className="absolute border-2 border-dashed border-pink bg-pink/15"
                            style={{
                              left: `${currentDraft.x * 100}%`,
                              top: `${currentDraft.y * 100}%`,
                              width: `${currentDraft.width * 100}%`,
                              height: `${currentDraft.height * 100}%`,
                            }}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {resultPreviewUrl && (
                <div className="sticker-card p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-display font-bold text-dark">Redacted PDF Preview</h3>
                    <span className="text-xs text-gray">Processed output</span>
                  </div>
                  <iframe
                    src={resultPreviewUrl}
                    title="Redacted PDF preview"
                    className="w-full h-[640px] rounded-xl border border-gray-200 bg-white"
                  />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
