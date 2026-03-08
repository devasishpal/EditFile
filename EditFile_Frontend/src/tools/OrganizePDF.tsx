import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  Download,
  ArrowUp,
  ArrowDown,
  RotateCw,
  Trash2,
  Check,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import {
  inspectOrganizePdf,
  queueOrganizePdf,
  pollJobUntilDone,
  getJobDownloadInfo,
  startFileDownload,
  type OrganizePdfPageOperation,
} from '@/lib/compressionApi';

interface Page {
  id: string;
  sourceIndex: number;
  pageNumber: number;
  preview: string;
  rotation: 0 | 90 | 180 | 270;
}

const isPdfFile = (file: File) =>
  file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

const createPagePreview = (index: number) =>
  `https://placehold.co/150x200/violet/white?text=Page+${index + 1}`;

export default function OrganizePDF() {
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedPages, setSelectedPages] = useState<string[]>([]);
  const [isInspecting, setIsInspecting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestSuccess, setRequestSuccess] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadFileName, setDownloadFileName] = useState('organized.pdf');

  const loadPdfForOrganizing = useCallback(async (file: File) => {
    setIsInspecting(true);
    setRequestError(null);
    setRequestSuccess(null);
    setDownloadUrl(null);
    setUploadProgress(0);

    try {
      const inspectResult = await inspectOrganizePdf(file, (progress) => {
        setUploadProgress(progress);
      });

      const nextPages: Page[] = Array.from({ length: inspectResult.pageCount }, (_, i) => ({
        id: `page-${i}`,
        sourceIndex: i,
        pageNumber: i + 1,
        preview: createPagePreview(i),
        rotation: 0,
      }));

      setPages(nextPages);
      setSourceFile(file);
      setSelectedPages([]);
      setRequestSuccess(`Loaded ${inspectResult.pageCount} pages.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load PDF pages.';
      setRequestError(message);
      setPages([]);
      setSourceFile(null);
    } finally {
      setIsInspecting(false);
      setUploadProgress(0);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, [loadPdfForOrganizing]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, [loadPdfForOrganizing]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length === 0) {
      return;
    }

    const selected = dropped[0];
    if (!isPdfFile(selected)) {
      setRequestError('Only PDF files are allowed.');
      return;
    }

    void loadPdfForOrganizing(selected);
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length === 0) {
      return;
    }

    if (!isPdfFile(selected[0])) {
      setRequestError('Only PDF files are allowed.');
      return;
    }

    void loadPdfForOrganizing(selected[0]);
  }, []);

  const movePage = (index: number, direction: 'up' | 'down') => {
    if (isSaving) {
      return;
    }

    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= pages.length) {
      return;
    }

    setRequestError(null);
    setRequestSuccess(null);
    setDownloadUrl(null);

    const nextPages = [...pages];
    const [moved] = nextPages.splice(index, 1);
    nextPages.splice(newIndex, 0, moved);
    setPages(nextPages);
  };

  const rotatePage = (id: string) => {
    if (isSaving) {
      return;
    }

    setRequestError(null);
    setRequestSuccess(null);
    setDownloadUrl(null);

    setPages((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, rotation: ((p.rotation + 90) % 360) as 0 | 90 | 180 | 270 } : p
      )
    );
  };

  const deletePage = (id: string) => {
    if (isSaving) {
      return;
    }

    if (pages.length <= 1) {
      setRequestError('At least one page must remain in the PDF.');
      return;
    }

    setRequestError(null);
    setRequestSuccess(null);
    setDownloadUrl(null);
    setPages((prev) => prev.filter((p) => p.id !== id));
    setSelectedPages((prev) => prev.filter((pid) => pid !== id));
  };

  const toggleSelection = (id: string) => {
    if (isSaving) {
      return;
    }

    setSelectedPages((prev) =>
      prev.includes(id) ? prev.filter((pid) => pid !== id) : [...prev, id]
    );
  };

  const deleteSelected = () => {
    if (isSaving) {
      return;
    }

    if (selectedPages.length === 0) {
      return;
    }

    if (selectedPages.length >= pages.length) {
      setRequestError('At least one page must remain in the PDF.');
      return;
    }

    setRequestError(null);
    setRequestSuccess(null);
    setDownloadUrl(null);
    setPages((prev) => prev.filter((p) => !selectedPages.includes(p.id)));
    setSelectedPages([]);
  };

  const saveOrganizedPdf = async () => {
    if (!sourceFile || isSaving || pages.length === 0) {
      return;
    }

    setIsSaving(true);
    setRequestError(null);
    setRequestSuccess(null);
    setUploadProgress(0);

    try {
      const operations: OrganizePdfPageOperation[] = pages.map((page) => ({
        sourceIndex: page.sourceIndex,
        rotation: page.rotation,
      }));

      const queueResult = await queueOrganizePdf(sourceFile, operations, (progress) => {
        setUploadProgress(progress);
      });

      await pollJobUntilDone(queueResult.jobId, {
        timeoutMs: 10 * 60 * 1000,
      });

      const downloadInfo = await getJobDownloadInfo(queueResult.jobId);
      setDownloadUrl(downloadInfo.downloadUrl);
      setDownloadFileName(downloadInfo.fileName || 'organized.pdf');
      setRequestSuccess('PDF organized successfully.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to organize PDF.';
      setRequestError(message);
    } finally {
      setIsSaving(false);
      setUploadProgress(0);
    }
  };

  const handleSaveOrDownload = async () => {
    if (downloadUrl) {
      startFileDownload(downloadUrl, downloadFileName);
      return;
    }

    await saveOrganizedPdf();
  };

  return (
    <div className="w-full px-3 sm:px-4 lg:px-6 py-8 overflow-x-clip">
      <div className="max-w-6xl mx-auto">
        {(requestError || requestSuccess) && (
          <div className="sticker-card p-4 mb-4">
            {requestError && (
              <p className="text-red-500 text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                {requestError}
              </p>
            )}
            {!requestError && requestSuccess && (
              <p className="text-green-600 text-sm">{requestSuccess}</p>
            )}
          </div>
        )}

        {(isInspecting || isSaving) && (
          <div className="sticker-card p-4 mb-4">
            <div className="flex items-center gap-3 mb-2 text-violet">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">
                {isInspecting ? 'Loading pages...' : 'Saving organized PDF...'}
              </span>
            </div>
            {uploadProgress > 0 && (
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-violet transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            )}
          </div>
        )}

        {pages.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="sticker-card p-5 sm:p-8 lg:p-12"
          >
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-3 border-dashed rounded-2xl p-6 sm:p-10 lg:p-16 flex flex-col items-center justify-center transition-all cursor-pointer ${
                isDragging
                  ? 'border-pink bg-pink/5'
                  : 'border-gray-300 hover:border-violet hover:bg-violet/5'
              }`}
            >
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-violet/10 rounded-2xl flex items-center justify-center mb-6">
                <Upload className="w-8 h-8 sm:w-10 sm:h-10 text-violet" />
              </div>
              <h3 className="font-display font-bold text-xl sm:text-2xl text-dark text-center mb-2">
                Drop a PDF to organize
              </h3>
              <p className="text-gray text-center mb-6">Reorder, rotate, and delete pages visually</p>
              <label className="sticker-button cursor-pointer">
                <span>Select PDF File</span>
                <input
                  type="file"
                  accept=".pdf"
                  multiple={false}
                  onChange={handleFileInput}
                  className="hidden"
                />
              </label>
            </div>
          </motion.div>
        )}

        <AnimatePresence>
          {pages.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <div className="sticker-card p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-4">
                  <span className="sticker-label bg-violet text-white border-violet">
                    {pages.length} pages
                  </span>
                  {selectedPages.length > 0 && (
                    <span className="sticker-label bg-pink text-white border-pink">
                      {selectedPages.length} selected
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {selectedPages.length > 0 && (
                    <button
                      onClick={deleteSelected}
                      disabled={isSaving}
                      className="px-4 py-2 bg-red-500 text-white rounded-xl border-2 border-black font-medium hover:bg-red-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                    >
                      <Trash2 className="w-4 h-4 inline mr-2" />
                      Delete Selected
                    </button>
                  )}
                  <button
                    onClick={() => void handleSaveOrDownload()}
                    disabled={isSaving || isInspecting || pages.length === 0}
                    className="sticker-button disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isSaving ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4 mr-2" />
                    )}
                    {downloadUrl ? 'Download PDF' : 'Save PDF'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {pages.map((page, index) => (
                  <motion.div
                    key={page.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className={`sticker-card p-3 ${
                      selectedPages.includes(page.id) ? 'ring-2 ring-pink ring-offset-2' : ''
                    }`}
                  >
                    <div
                      onClick={() => toggleSelection(page.id)}
                      className="relative aspect-[3/4] bg-gray-100 rounded-lg overflow-hidden cursor-pointer mb-3"
                    >
                      <img
                        src={page.preview}
                        alt={`Page ${page.pageNumber}`}
                        className="w-full h-full object-cover transition-transform"
                        style={{ transform: `rotate(${page.rotation}deg)` }}
                      />
                      <div className="absolute top-2 left-2">
                        <span className="sticker-label text-[10px] py-0.5">{index + 1}</span>
                      </div>
                      {selectedPages.includes(page.id) && (
                        <div className="absolute inset-0 bg-pink/20 flex items-center justify-center">
                          <div className="w-8 h-8 bg-pink rounded-full flex items-center justify-center">
                            <Check className="w-5 h-5 text-white" />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => movePage(index, 'up')}
                        disabled={index === 0 || isSaving}
                        className="w-8 h-8 bg-gray-100 hover:bg-violet/20 disabled:opacity-30 rounded-lg flex items-center justify-center transition-colors"
                      >
                        <ArrowUp className="w-4 h-4 text-gray" />
                      </button>
                      <button
                        onClick={() => movePage(index, 'down')}
                        disabled={index === pages.length - 1 || isSaving}
                        className="w-8 h-8 bg-gray-100 hover:bg-violet/20 disabled:opacity-30 rounded-lg flex items-center justify-center transition-colors"
                      >
                        <ArrowDown className="w-4 h-4 text-gray" />
                      </button>
                      <button
                        onClick={() => rotatePage(page.id)}
                        disabled={isSaving}
                        className="w-8 h-8 bg-gray-100 hover:bg-violet/20 disabled:opacity-30 rounded-lg flex items-center justify-center transition-colors"
                      >
                        <RotateCw className="w-4 h-4 text-gray" />
                      </button>
                      <button
                        onClick={() => deletePage(page.id)}
                        disabled={isSaving}
                        className="w-8 h-8 bg-gray-100 hover:bg-red-100 disabled:opacity-30 rounded-lg flex items-center justify-center transition-colors"
                      >
                        <Trash2 className="w-4 h-4 text-gray hover:text-red-500" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
