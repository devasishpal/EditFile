import { useCallback, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  X,
  FileText,
  Download,
  Loader2,
  AlertCircle,
  Check,
  Archive,
} from 'lucide-react';
import {
  queuePdfToPdfA,
  pollJobUntilDone,
  getJobDownloadInfo,
  startFileDownload,
  type PdfaVersion,
} from '@/lib/compressionApi';

interface PdfaFile {
  id: string;
  file: File;
  name: string;
  size: number;
  selectedVersion: PdfaVersion;
  status: 'ready' | 'uploading' | 'processing' | 'completed' | 'error';
  progress: number;
  downloadUrl: string | null;
  outputName: string | null;
  outputSize: number | null;
  error?: string;
}

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;
const createFileId = () => Math.random().toString(36).slice(2, 11);

const PDFA_OPTIONS: Array<{
  value: PdfaVersion;
  label: string;
  description: string;
}> = [
  {
    value: 'pdfa-2',
    label: 'PDF/A-2',
    description: 'Recommended for modern archival compatibility',
  },
  {
    value: 'pdfa-1',
    label: 'PDF/A-1',
    description: 'Best for older archival workflows',
  },
  {
    value: 'pdfa-3',
    label: 'PDF/A-3',
    description: 'Allows embedded source attachments when needed',
  },
];

const isPdfFile = (file: File) =>
  file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

const ensurePdfExtension = (fileName: string) =>
  fileName.toLowerCase().endsWith('.pdf')
    ? fileName
    : `${fileName.replace(/\.[^.]+$/, '')}.pdf`;

const formatSize = (bytes: number) => {
  if (bytes === 0) {
    return '0 B';
  }

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

export default function PDFToPDFA() {
  const [fileItem, setFileItem] = useState<PdfaFile | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestSuccess, setRequestSuccess] = useState<string | null>(null);
  const [pdfaVersion, setPdfaVersion] = useState<PdfaVersion>('pdfa-2');

  const activeVersion = fileItem?.selectedVersion || pdfaVersion;
  const selectedOption = useMemo(
    () => PDFA_OPTIONS.find((option) => option.value === activeVersion) || PDFA_OPTIONS[0],
    [activeVersion]
  );
  const isVersionSelectionLocked = fileItem
    ? !['ready', 'error'].includes(fileItem.status)
    : false;

  const handleFiles = useCallback((incomingFiles: File[]) => {
    if (incomingFiles.length === 0) {
      return;
    }

    const selected = incomingFiles[0];

    if (!isPdfFile(selected)) {
      setRequestError('Only PDF files are allowed.');
      return;
    }

    if (selected.size > MAX_FILE_SIZE_BYTES) {
      setRequestError('Maximum file size is 100MB.');
      return;
    }

    setRequestError(null);
    setRequestSuccess(null);
    setFileItem({
      id: createFileId(),
      file: selected,
      name: selected.name,
      size: selected.size,
      selectedVersion: pdfaVersion,
      status: 'ready',
      progress: 0,
      downloadUrl: null,
      outputName: null,
      outputSize: null,
    });
  }, [pdfaVersion]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(Array.from(e.dataTransfer.files));
  }, [handleFiles]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(Array.from(e.target.files || []));
  }, [handleFiles]);

  const removeFile = () => {
    if (isRunning) {
      return;
    }

    setFileItem(null);
    setRequestError(null);
    setRequestSuccess(null);
  };

  const processFile = async () => {
    if (!fileItem || isRunning) {
      return;
    }

    setIsRunning(true);
    setRequestError(null);
    setRequestSuccess(null);

    setFileItem((prev) =>
      prev
        ? {
            ...prev,
            selectedVersion: pdfaVersion,
            status: 'uploading',
            progress: 0,
            error: undefined,
            downloadUrl: null,
            outputName: null,
            outputSize: null,
          }
        : prev
    );

    try {
      const queueResult = await queuePdfToPdfA(fileItem.file, pdfaVersion, (progress) => {
        setFileItem((prev) =>
          prev
            ? {
                ...prev,
                status: 'uploading',
                progress,
              }
            : prev
        );
      });

      setFileItem((prev) =>
        prev
          ? {
              ...prev,
              status: 'processing',
              progress: 100,
            }
          : prev
      );

      await pollJobUntilDone(queueResult.jobId, {
        timeoutMs: 15 * 60 * 1000,
      });

      const downloadInfo = await getJobDownloadInfo(queueResult.jobId);
      setFileItem((prev) =>
        prev
          ? {
              ...prev,
              status: 'completed',
              downloadUrl: downloadInfo.downloadUrl,
              outputName: downloadInfo.fileName || ensurePdfExtension(prev.name),
              outputSize: downloadInfo.outputSize,
              error: undefined,
            }
          : prev
      );
      setRequestSuccess(`Conversion completed. Your ${selectedOption.label} file is ready.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to convert PDF.';
      setFileItem((prev) =>
        prev
          ? {
              ...prev,
              status: 'error',
              progress: 0,
              error: message,
            }
          : prev
      );
      setRequestError(message);
    } finally {
      setIsRunning(false);
    }
  };

  const handlePrimaryAction = async () => {
    if (!fileItem) {
      return;
    }

    if (fileItem.downloadUrl) {
      startFileDownload(
        fileItem.downloadUrl,
        fileItem.outputName || ensurePdfExtension(fileItem.name)
      );
      return;
    }

    await processFile();
  };

  return (
    <div className="w-full px-3 sm:px-4 lg:px-6 py-8 overflow-x-clip">
      <div className="max-w-4xl mx-auto">
        {!fileItem && (
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
                Drop PDF file here
              </h3>
              <p className="text-gray text-center mb-6">or click to browse from your computer</p>
              <label className="sticker-button cursor-pointer">
                <span>Select PDF File</span>
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  multiple={false}
                  onChange={handleFileInput}
                  className="hidden"
                />
              </label>
            </div>
          </motion.div>
        )}

        <AnimatePresence>
          {fileItem && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              <div className="sticker-card p-6 space-y-4">
                <div>
                  <label className="font-display font-bold text-dark block mb-3">
                    PDF/A Version
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {PDFA_OPTIONS.map((option) => {
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            setPdfaVersion(option.value);
                            setFileItem((prev) =>
                              prev && ['ready', 'error'].includes(prev.status)
                                ? {
                                    ...prev,
                                    selectedVersion: option.value,
                                  }
                                : prev
                            );
                          }}
                          disabled={isVersionSelectionLocked}
                          className={`text-left rounded-2xl border-[2px] p-4 transition-colors ${
                            fileItem?.selectedVersion === option.value
                              ? 'border-violet bg-violet/10'
                              : 'border-gray-200 bg-white hover:border-violet/40'
                          } ${isVersionSelectionLocked ? 'opacity-70 cursor-not-allowed' : ''}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-display font-bold text-dark">{option.label}</span>
                            {fileItem?.selectedVersion === option.value && (
                              <Check className="w-4 h-4 text-violet" />
                            )}
                          </div>
                          <p className="text-xs text-gray mt-2">{option.description}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-2xl border-[2px] border-violet/20 bg-violet/5 p-4">
                  <p className="text-sm text-dark flex items-center gap-2">
                    <Archive className="w-4 h-4 text-violet" />
                    Convert standard PDFs into archival {selectedOption.label} output for long-term storage.
                  </p>
                </div>
              </div>

              <div className="sticker-card p-5">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="w-12 h-12 bg-violet/10 rounded-xl flex items-center justify-center flex-shrink-0">
                    <FileText className="w-6 h-6 text-violet" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-dark truncate">{fileItem.name}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray">
                      <span>{formatSize(fileItem.size)}</span>
                      <span>{selectedOption.label}</span>
                      {fileItem.outputSize ? (
                        <>
                          <span>-&gt;</span>
                          <span className="text-pink font-medium">{formatSize(fileItem.outputSize)}</span>
                        </>
                      ) : null}
                    </div>
                    {fileItem.error && <p className="text-red-500 text-xs mt-1">{fileItem.error}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {fileItem.status === 'uploading' && (
                      <div className="w-24">
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-violet transition-all duration-300"
                            style={{ width: `${fileItem.progress}%` }}
                          />
                        </div>
                      </div>
                    )}
                    {fileItem.status === 'processing' && (
                      <div className="flex items-center gap-2 text-violet">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span className="text-sm">Converting...</span>
                      </div>
                    )}
                    {fileItem.status === 'completed' && (
                      <span className="text-sm text-green-600 font-medium">Ready</span>
                    )}
                    {(fileItem.status === 'ready' || fileItem.status === 'error') && (
                      <span className="text-sm text-gray">Waiting</span>
                    )}
                    <button
                      onClick={removeFile}
                      disabled={isRunning}
                      className="w-10 h-10 bg-gray-100 hover:bg-red-100 disabled:opacity-60 rounded-xl flex items-center justify-center transition-colors"
                    >
                      <X className="w-5 h-5 text-gray hover:text-red-500" />
                    </button>
                  </div>
                </div>
              </div>

              {(requestError || requestSuccess || fileItem.status === 'completed') && (
                <div className="sticker-card p-4">
                  {requestError && (
                    <p className="text-red-500 text-sm flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      {requestError}
                    </p>
                  )}
                  {!requestError && requestSuccess && (
                    <div className="space-y-2">
                      <p className="text-green-600 text-sm flex items-center gap-2">
                        <Check className="w-4 h-4" />
                        {requestSuccess}
                      </p>
                      {fileItem.outputSize ? (
                        <p className="text-sm text-dark">
                          File size: <span className="font-medium">{formatSize(fileItem.outputSize)}</span>
                        </p>
                      ) : null}
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="sticker-button-secondary cursor-pointer">
                  <Upload className="w-4 h-4 mr-2" />
                  <span>Choose Another File</span>
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    multiple={false}
                    onChange={handleFileInput}
                    className="hidden"
                  />
                </label>

                <button
                  onClick={() => void handlePrimaryAction()}
                  disabled={isRunning || !fileItem}
                  className={`sticker-button ${isRunning ? 'opacity-70 cursor-not-allowed' : ''}`}
                >
                  {isRunning ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 mr-2" />
                  )}
                  {fileItem.downloadUrl
                    ? 'Download PDF/A'
                    : isRunning
                      ? 'Processing...'
                      : 'Convert to PDF/A'}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
