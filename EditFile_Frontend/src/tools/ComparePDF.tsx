import { useCallback, useMemo, useState } from 'react';
import {
  AlertCircle,
  Download,
  FileDiff,
  FileText,
  Loader2,
  RefreshCw,
  Upload,
  X,
} from 'lucide-react';
import type { PdfPreviewPage } from '@/lib/pdfPreview';
import { loadPdfPreview } from '@/lib/pdfPreview';
import { calculateVisualDiffRegion, diffSpanText } from '@/lib/pdfDiff';
import {
  comparePdfReportFile,
  downloadProcessedPdf,
  isPdfToolFile,
  type ComparePdfSummaryPayload,
  type ProcessedPdfFile,
} from '@/lib/pdfToolApi';

type DifferenceType = 'text' | 'layout' | 'image';

interface ComparisonPageResult {
  pageIndex: number;
  originalPage: PdfPreviewPage | null;
  modifiedPage: PdfPreviewPage | null;
  differenceTypes: DifferenceType[];
  addedIndices: Set<number>;
  removedIndices: Set<number>;
  addedCount: number;
  removedCount: number;
  changedCount: number;
  addedSamples: string[];
  removedSamples: string[];
  visualChangeRatio: number;
  visualBounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
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

const createPlaceholderPreview = (label: string) => {
  const canvas = document.createElement('canvas');
  canvas.width = 620;
  canvas.height = 820;
  const context = canvas.getContext('2d');

  if (!context) {
    return '';
  }

  context.fillStyle = '#f3f4f6';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = '#d1d5db';
  context.lineWidth = 2;
  context.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);
  context.fillStyle = '#4b5563';
  context.font = 'bold 34px Helvetica';
  context.textAlign = 'center';
  context.fillText(label, canvas.width / 2, canvas.height / 2);

  return canvas.toDataURL('image/jpeg', 0.92);
};

const drawHighlightsToCanvas = async (
  page: PdfPreviewPage | null,
  indices: Set<number>,
  color: string,
  visualBounds: ComparisonPageResult['visualBounds']
) => {
  const source = page?.imageUrl || createPlaceholderPreview('Page missing');
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const nextImage = new Image();
    nextImage.onload = () => resolve(nextImage);
    nextImage.onerror = () => reject(new Error('Failed to load page preview'));
    nextImage.src = source;
  });

  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Canvas is not available for comparison rendering');
  }

  context.drawImage(image, 0, 0, image.width, image.height);

  if (page) {
    indices.forEach((index) => {
      const span = page.textSpans[index];
      if (!span) {
        return;
      }

      context.fillStyle = color;
      context.fillRect(span.left, span.top, span.width, span.height);
      context.strokeStyle = color.replace('0.24', '0.9').replace('0.18', '0.9');
      context.lineWidth = 2;
      context.strokeRect(span.left, span.top, span.width, span.height);
    });
  }

  if (visualBounds) {
    context.strokeStyle = '#f59e0b';
    context.lineWidth = 4;
    context.strokeRect(
      visualBounds.x * canvas.width,
      visualBounds.y * canvas.height,
      visualBounds.width * canvas.width,
      visualBounds.height * canvas.height
    );
  }

  return canvas.toDataURL('image/jpeg', 0.9);
};

const summarizeComparison = (comparisons: ComparisonPageResult[]): ComparePdfSummaryPayload => ({
  totalPages: comparisons.length,
  pagesWithDifferences: comparisons.filter((page) => page.differenceTypes.length > 0).length,
  textChanges: comparisons.reduce((count, page) => count + page.changedCount, 0),
  layoutChanges: comparisons.filter((page) => page.differenceTypes.includes('layout')).length,
  imageChanges: comparisons.filter((page) => page.differenceTypes.includes('image')).length,
  pageReports: [],
});

export default function ComparePDF() {
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [modifiedFile, setModifiedFile] = useState<File | null>(null);
  const [comparisons, setComparisons] = useState<ComparisonPageResult[]>([]);
  const [isDraggingOriginal, setIsDraggingOriginal] = useState(false);
  const [isDraggingModified, setIsDraggingModified] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportResult, setReportResult] = useState<ProcessedPdfFile | null>(null);

  const summary = useMemo(() => summarizeComparison(comparisons), [comparisons]);

  const setSelectedFile = (
    kind: 'original' | 'modified',
    file: File | null
  ) => {
    if (kind === 'original') {
      setOriginalFile(file);
    } else {
      setModifiedFile(file);
    }

    setComparisons([]);
    setReportResult(null);
    setError(null);
  };

  const handleFileInput = (kind: 'original' | 'modified') =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const nextFile = Array.from(event.target.files || []).find(isPdfToolFile) || null;
      event.target.value = '';

      if (!nextFile) {
        setError('Please upload PDF files for both sides.');
        return;
      }

      setSelectedFile(kind, nextFile);
    };

  const handleDrop = (kind: 'original' | 'modified') =>
    (event: React.DragEvent) => {
      event.preventDefault();
      const nextFile = Array.from(event.dataTransfer.files).find(isPdfToolFile) || null;

      if (kind === 'original') {
        setIsDraggingOriginal(false);
      } else {
        setIsDraggingModified(false);
      }

      if (!nextFile) {
        setError('Please drop a PDF file.');
        return;
      }

      setSelectedFile(kind, nextFile);
    };

  const runComparison = useCallback(async () => {
    if (!originalFile || !modifiedFile) {
      setError('Upload both the original and modified PDF files first.');
      return;
    }

    setIsLoadingPreview(true);
    setIsAnalyzing(false);
    setAnalysisProgress(0);
    setError(null);
    setReportResult(null);

    try {
      const [loadedOriginal, loadedModified] = await Promise.all([
        loadPdfPreview(originalFile, {
          maxPageWidth: 460,
          includeTextSpans: true,
        }),
        loadPdfPreview(modifiedFile, {
          maxPageWidth: 460,
          includeTextSpans: true,
        }),
      ]);

      setIsLoadingPreview(false);
      setIsAnalyzing(true);

      const totalPages = Math.max(loadedOriginal.pageCount, loadedModified.pageCount);
      const nextComparisons: ComparisonPageResult[] = [];

      for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
        const originalPage = loadedOriginal.pages[pageIndex] || null;
        const modifiedPage = loadedModified.pages[pageIndex] || null;
        const textDiff = diffSpanText(originalPage, modifiedPage);
        const visualDiff = await calculateVisualDiffRegion(originalPage, modifiedPage);
        const differenceTypes: DifferenceType[] = [];

        if (!originalPage || !modifiedPage) {
          differenceTypes.push('layout', 'image');
        } else {
          if (textDiff.addedCount > 0 || textDiff.removedCount > 0) {
            differenceTypes.push('text');
          }

          if (visualDiff.ratio > 0.01) {
            differenceTypes.push(
              textDiff.addedCount > 0 || textDiff.removedCount > 0 ? 'layout' : 'image'
            );
          }
        }

        nextComparisons.push({
          pageIndex,
          originalPage,
          modifiedPage,
          differenceTypes: Array.from(new Set(differenceTypes)),
          addedIndices: textDiff.addedIndices,
          removedIndices: textDiff.removedIndices,
          addedCount: textDiff.addedCount,
          removedCount: textDiff.removedCount,
          changedCount: textDiff.changedCount,
          addedSamples: textDiff.addedSamples,
          removedSamples: textDiff.removedSamples,
          visualChangeRatio: visualDiff.ratio,
          visualBounds: visualDiff.bounds,
        });

        setAnalysisProgress(Math.round(((pageIndex + 1) / totalPages) * 100));
      }

      setComparisons(nextComparisons);
    } catch (requestError) {
      setComparisons([]);
      setError(requestError instanceof Error ? requestError.message : 'Failed to compare PDFs');
    } finally {
      setIsLoadingPreview(false);
      setIsAnalyzing(false);
    }
  }, [modifiedFile, originalFile]);

  const generateReport = async () => {
    if (!originalFile || !modifiedFile || comparisons.length === 0 || isGeneratingReport) {
      return;
    }

    setIsGeneratingReport(true);
    setError(null);

    try {
      const pageReports = await Promise.all(
        comparisons
          .filter((page) => page.differenceTypes.length > 0)
          .map(async (page) => ({
            pageIndex: page.pageIndex,
            differenceTypes: page.differenceTypes,
            addedCount: page.addedCount,
            removedCount: page.removedCount,
            changedCount: page.changedCount,
            visualChangeRatio: page.visualChangeRatio,
            addedSamples: page.addedSamples,
            removedSamples: page.removedSamples,
            originalPreviewDataUrl: await drawHighlightsToCanvas(
              page.originalPage,
              page.removedIndices,
              'rgba(239, 68, 68, 0.24)',
              page.visualBounds
            ),
            modifiedPreviewDataUrl: await drawHighlightsToCanvas(
              page.modifiedPage,
              page.addedIndices,
              'rgba(34, 197, 94, 0.24)',
              page.visualBounds
            ),
          }))
      );

      const processed = await comparePdfReportFile(originalFile, modifiedFile, {
        ...summary,
        pageReports,
      });
      setReportResult(processed);
    } catch (requestError) {
      setReportResult(null);
      setError(
        requestError instanceof Error ? requestError.message : 'Failed to generate comparison report'
      );
    } finally {
      setIsGeneratingReport(false);
    }
  };

  return (
    <div className="w-full px-3 sm:px-4 lg:px-6 py-8 overflow-x-clip">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          {([
            {
              kind: 'original' as const,
              title: 'Original PDF',
              file: originalFile,
              dragging: isDraggingOriginal,
              setDragging: setIsDraggingOriginal,
            },
            {
              kind: 'modified' as const,
              title: 'Modified PDF',
              file: modifiedFile,
              dragging: isDraggingModified,
              setDragging: setIsDraggingModified,
            },
          ]).map((panel) => (
            <div key={panel.kind} className="sticker-card p-5 space-y-4">
              {!panel.file ? (
                <div
                  onDragOver={(event) => {
                    event.preventDefault();
                    panel.setDragging(true);
                  }}
                  onDragLeave={(event) => {
                    event.preventDefault();
                    panel.setDragging(false);
                  }}
                  onDrop={handleDrop(panel.kind)}
                  className={`border-3 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center transition-all ${
                    panel.dragging
                      ? 'border-pink bg-pink/5'
                      : 'border-gray-300 hover:border-violet hover:bg-violet/5'
                  }`}
                >
                  <div className="w-14 h-14 bg-violet/10 rounded-2xl flex items-center justify-center mb-5">
                    <Upload className="w-7 h-7 text-violet" />
                  </div>
                  <h3 className="font-display font-bold text-lg text-dark mb-2">{panel.title}</h3>
                  <p className="text-gray text-center mb-5">
                    Upload the {panel.kind === 'original' ? 'baseline' : 'updated'} document
                  </p>
                  <label className="sticker-button cursor-pointer">
                    <span>Select PDF</span>
                    <input
                      type="file"
                      accept=".pdf,application/pdf"
                      onChange={handleFileInput(panel.kind)}
                      className="hidden"
                    />
                  </label>
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-violet/10 rounded-xl flex items-center justify-center">
                    <FileText className="w-6 h-6 text-violet" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-dark truncate">{panel.file.name}</p>
                    <p className="text-gray text-sm">{formatSize(panel.file.size)}</p>
                  </div>
                  <button
                    onClick={() => setSelectedFile(panel.kind, null)}
                    className="w-10 h-10 bg-gray-100 hover:bg-red-100 rounded-xl flex items-center justify-center transition-colors"
                  >
                    <X className="w-5 h-5 text-gray hover:text-red-500" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {(error || isLoadingPreview || isAnalyzing) && (
          <div className="sticker-card p-4">
            {error && (
              <p className="text-red-500 text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                {error}
              </p>
            )}
            {!error && (isLoadingPreview || isAnalyzing) && (
              <>
                <div className="flex items-center gap-3 mb-2 text-violet">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">
                    {isLoadingPreview ? 'Rendering PDF previews...' : 'Analyzing page differences...'}
                  </span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-violet transition-all duration-300"
                    style={{ width: `${analysisProgress}%` }}
                  />
                </div>
              </>
            )}
          </div>
        )}

        <div className="sticker-card p-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-gray">
            <span className="sticker-label bg-violet text-white border-violet">
              {comparisons.length > 0 ? `${comparisons.length} pages` : 'Ready'}
            </span>
            {comparisons.length > 0 && (
              <span>{summary.pagesWithDifferences} pages with differences</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void runComparison()}
              disabled={!originalFile || !modifiedFile || isLoadingPreview || isAnalyzing}
              className="sticker-button disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isLoadingPreview || isAnalyzing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Compare PDFs
            </button>
            <button
              onClick={() => void generateReport()}
              disabled={comparisons.length === 0 || isGeneratingReport}
              className="sticker-button-secondary disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isGeneratingReport ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <FileDiff className="w-4 h-4 mr-2" />
              )}
              Generate Report
            </button>
            <button
              onClick={() => {
                if (reportResult) {
                  downloadProcessedPdf(reportResult);
                }
              }}
              disabled={!reportResult || isGeneratingReport}
              className="sticker-button-secondary disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4 mr-2" />
              Download PDF
            </button>
          </div>
        </div>

        {comparisons.length > 0 && (
          <>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="sticker-card p-4">
                <p className="text-gray text-sm mb-1">Pages Compared</p>
                <p className="font-display font-bold text-2xl text-dark">{summary.totalPages}</p>
              </div>
              <div className="sticker-card p-4">
                <p className="text-gray text-sm mb-1">Changed Text Blocks</p>
                <p className="font-display font-bold text-2xl text-dark">{summary.textChanges}</p>
              </div>
              <div className="sticker-card p-4">
                <p className="text-gray text-sm mb-1">Layout Changes</p>
                <p className="font-display font-bold text-2xl text-dark">{summary.layoutChanges}</p>
              </div>
              <div className="sticker-card p-4">
                <p className="text-gray text-sm mb-1">Image Changes</p>
                <p className="font-display font-bold text-2xl text-dark">{summary.imageChanges}</p>
              </div>
            </div>

            <div className="space-y-6">
              {comparisons.map((page) => (
                <div key={page.pageIndex} className="sticker-card p-4 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="sticker-label">Page {page.pageIndex + 1}</span>
                      {page.differenceTypes.length > 0 ? (
                        <span className="text-sm text-pink font-medium">
                          {page.differenceTypes.join(', ')} difference
                        </span>
                      ) : (
                        <span className="text-sm text-green-600 font-medium">No difference</span>
                      )}
                    </div>
                    <div className="text-xs text-gray">
                      Added: {page.addedCount} · Removed: {page.removedCount} · Visual:{' '}
                      {(page.visualChangeRatio * 100).toFixed(1)}%
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    {([
                      {
                        label: 'Original',
                        pageData: page.originalPage,
                        indices: page.removedIndices,
                        color: 'bg-red-500/25 border-red-500',
                      },
                      {
                        label: 'Modified',
                        pageData: page.modifiedPage,
                        indices: page.addedIndices,
                        color: 'bg-green-500/25 border-green-500',
                      },
                    ] as const).map((panel) => (
                      <div key={panel.label} className="space-y-2">
                        <p className="font-display font-bold text-dark">{panel.label}</p>
                        <div className="relative rounded-xl overflow-hidden border border-gray-200 bg-gray-100">
                          <img
                            src={panel.pageData?.imageUrl || createPlaceholderPreview('Page missing')}
                            alt={`${panel.label} page ${page.pageIndex + 1}`}
                            className="block w-full h-auto"
                          />

                          {panel.pageData &&
                            Array.from(panel.indices).map((index) => {
                              const span = panel.pageData?.textSpans[index];
                              if (!span) {
                                return null;
                              }

                              return (
                                <div
                                  key={`${panel.label}-${index}`}
                                  className={`absolute border-2 ${panel.color}`}
                                  style={{
                                    left: `${(span.left / panel.pageData.width) * 100}%`,
                                    top: `${(span.top / panel.pageData.height) * 100}%`,
                                    width: `${(span.width / panel.pageData.width) * 100}%`,
                                    height: `${(span.height / panel.pageData.height) * 100}%`,
                                  }}
                                />
                              );
                            })}

                          {page.visualBounds && (
                            <div
                              className="absolute border-[3px] border-amber-400"
                              style={{
                                left: `${page.visualBounds.x * 100}%`,
                                top: `${page.visualBounds.y * 100}%`,
                                width: `${page.visualBounds.width * 100}%`,
                                height: `${page.visualBounds.height * 100}%`,
                              }}
                            />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {(page.addedSamples.length > 0 || page.removedSamples.length > 0) && (
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                        <p className="font-medium text-dark mb-2">Removed text</p>
                        <p className="text-sm text-gray">
                          {page.removedSamples.length > 0
                            ? page.removedSamples.join(' | ')
                            : 'No removed text detected'}
                        </p>
                      </div>
                      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                        <p className="font-medium text-dark mb-2">Added text</p>
                        <p className="text-sm text-gray">
                          {page.addedSamples.length > 0
                            ? page.addedSamples.join(' | ')
                            : 'No added text detected'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
