import { useCallback, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  X,
  FileText,
  Download,
  Minimize2,
  Check,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import JSZip from 'jszip';
import {
  queuePdfCompression,
  pollJobUntilDone,
  getJobDownloadInfo,
  startFileDownload,
} from '@/lib/compressionApi';
import { runWithConcurrency } from '@/lib/concurrency';

interface CompressedFile {
  id: string;
  file: File;
  name: string;
  originalSize: number;
  compressedSize: number;
  targetSizeKB: number | null;
  status: 'ready' | 'processing' | 'completed' | 'error';
  downloadUrl: string | null;
  error?: string;
}

const createFileId = () => Math.random().toString(36).slice(2, 11);
const MAX_PARALLEL_COMPRESSIONS = 2;

const triggerBlobDownload = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener noreferrer';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};

const sanitizeFileName = (fileName: string) =>
  fileName.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');

const createUniqueZipFileName = (fileName: string, usedNames: Set<string>) => {
  const safeName = sanitizeFileName(fileName);
  const extensionIndex = safeName.lastIndexOf('.');
  const baseName = extensionIndex > 0 ? safeName.slice(0, extensionIndex) : safeName;
  const extension = extensionIndex > 0 ? safeName.slice(extensionIndex) : '';

  let candidate = safeName;
  let counter = 2;

  while (usedNames.has(candidate.toLowerCase())) {
    candidate = `${baseName} (${counter})${extension}`;
    counter += 1;
  }

  usedNames.add(candidate.toLowerCase());
  return candidate;
};

export default function CompressPDF() {
  const [files, setFiles] = useState<CompressedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [targetSizeInput, setTargetSizeInput] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);

  const smallestOriginalSizeKB = useMemo(() => {
    if (files.length === 0) {
      return null;
    }

    return Math.floor(Math.min(...files.map((file) => file.originalSize / 1024)));
  }, [files]);

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
    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      (file) => file.type === 'application/pdf'
    );
    handleFiles(droppedFiles);
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []).filter(
      (file) => file.type === 'application/pdf'
    );
    handleFiles(selectedFiles);
  }, []);

  const handleFiles = (newFiles: File[]) => {
    if (newFiles.length === 0) {
      return;
    }

    const newCompressedFiles: CompressedFile[] = newFiles.map((file) => ({
      id: createFileId(),
      file,
      name: file.name,
      originalSize: file.size,
      compressedSize: 0,
      targetSizeKB: null,
      status: 'ready',
      downloadUrl: null,
    }));

    setRequestError(null);
    setFiles((prev) => [...prev, ...newCompressedFiles]);
  };

  const validateTargetSize = () => {
    if (!targetSizeInput) {
      setInputError('Enter a target size in KB.');
      return null;
    }

    const targetSizeKB = Number(targetSizeInput);
    if (!Number.isInteger(targetSizeKB) || targetSizeKB <= 0) {
      setInputError('Only positive numbers are allowed.');
      return null;
    }

    if (smallestOriginalSizeKB !== null && targetSizeKB >= smallestOriginalSizeKB) {
      setInputError(
        `Target size must be smaller than ${smallestOriginalSizeKB} KB (smallest uploaded file).`
      );
      return null;
    }

    setInputError(null);
    return targetSizeKB;
  };

  const handleCompress = async () => {
    if (files.length === 0 || isCompressing) {
      return;
    }

    const targetSizeKB = validateTargetSize();
    if (!targetSizeKB) {
      return;
    }

    setIsCompressing(true);
    setRequestError(null);

    const filesToProcess = files.filter((file) => file.status !== 'completed');

    await runWithConcurrency(filesToProcess, MAX_PARALLEL_COMPRESSIONS, async (file) => {
      setFiles((prev) =>
        prev.map((item) =>
          item.id === file.id
            ? {
                ...item,
                status: 'processing',
                error: undefined,
                compressedSize: 0,
                downloadUrl: null,
                targetSizeKB,
              }
            : item
        )
      );

      try {
        const queueResult = await queuePdfCompression(file.file, targetSizeKB);
        await pollJobUntilDone(queueResult.jobId, {
          timeoutMs: 10 * 60 * 1000,
        });
        const downloadInfo = await getJobDownloadInfo(queueResult.jobId);

        setFiles((prev) =>
          prev.map((item) =>
            item.id === file.id
              ? {
                  ...item,
                  status: 'completed',
                  compressedSize: downloadInfo.outputSize,
                  downloadUrl: downloadInfo.downloadUrl,
                  targetSizeKB,
                  error: undefined,
                }
              : item
          )
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Compression failed';

        setFiles((prev) =>
          prev.map((item) =>
            item.id === file.id
              ? {
                  ...item,
                  status: 'error',
                  error: message,
                  compressedSize: 0,
                  downloadUrl: null,
                  targetSizeKB,
                }
              : item
          )
        );
        setRequestError(message);
      }
    });

    setIsCompressing(false);
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleTargetSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const numericOnly = e.target.value.replace(/\D+/g, '');
    setTargetSizeInput(numericOnly);
    if (inputError) {
      setInputError(null);
    }
  };

  const handleDownload = (file: CompressedFile) => {
    if (!file.downloadUrl) {
      return;
    }

    startFileDownload(file.downloadUrl, file.name);
  };

  const downloadZip = async (completedFiles: CompressedFile[]) => {
    const zip = new JSZip();
    const zipFolder = zip.folder('compressed-pdfs');

    if (!zipFolder) {
      throw new Error('Failed to create ZIP folder.');
    }

    const usedNames = new Set<string>();

    await Promise.all(
      completedFiles.map(async (file, index) => {
        if (!file.downloadUrl) {
          return;
        }

        const response = await fetch(file.downloadUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch "${file.name}" for ZIP download.`);
        }

        const outputBlob = await response.blob();
        const fallbackName = `compressed-file-${index + 1}.pdf`;
        const zipName = createUniqueZipFileName(file.name || fallbackName, usedNames);
        zipFolder.file(zipName, outputBlob);
      })
    );

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    triggerBlobDownload(zipBlob, `compressed-pdfs-${timestamp}.zip`);
  };

  const completedFiles = files.filter(
    (file) => file.status === 'completed' && file.downloadUrl
  );

  const shouldShowDownloadAction =
    !isCompressing &&
    files.length > 0 &&
    completedFiles.length > 0 &&
    completedFiles.length === files.length;

  const handlePrimaryAction = async () => {
    if (!shouldShowDownloadAction) {
      await handleCompress();
      return;
    }

    try {
      setRequestError(null);

      if (completedFiles.length === 1) {
        handleDownload(completedFiles[0]);
        return;
      }

      await downloadZip(completedFiles);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Download failed. Try again.';
      setRequestError(message);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getReductionPercentage = (original: number, compressed: number) => {
    if (!compressed || compressed >= original) return 0;
    return Math.round(((original - compressed) / original) * 100);
  };

  const previewTargetSizeKB = targetSizeInput ? Number.parseInt(targetSizeInput, 10) : null;

  return (
    <div className="w-full px-3 sm:px-4 lg:px-6 py-8 overflow-x-clip">
      <div className="max-w-4xl mx-auto">
        {/* Upload Area */}
        {files.length === 0 && (
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
                Drop PDF files here
              </h3>
              <p className="text-gray text-center mb-6">
                or click to browse from your computer
              </p>
              <label className="sticker-button cursor-pointer">
                <span>Select PDF Files</span>
                <input
                  type="file"
                  accept=".pdf"
                  multiple
                  onChange={handleFileInput}
                  className="hidden"
                />
              </label>
            </div>
          </motion.div>
        )}

        {/* Files List */}
        <AnimatePresence>
          {files.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              {/* Compression Settings */}
              <div className="sticker-card p-6">
                <label className="font-display font-bold text-dark block mb-3">
                  Enter Target Size (KB)
                </label>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="100"
                    value={targetSizeInput}
                    onChange={handleTargetSizeChange}
                    className="flex-1 px-4 py-2 border-2 border-gray-200 rounded-xl focus:border-violet focus:outline-none text-dark placeholder:text-gray caret-black"
                    disabled={isCompressing}
                  />
                  <button
                    onClick={() => void handlePrimaryAction()}
                    disabled={isCompressing || files.length === 0}
                    className="sticker-button disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isCompressing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Compressing...
                      </>
                    ) : shouldShowDownloadAction ? (
                      <>
                        <Download className="w-4 h-4 mr-2" />
                        {completedFiles.length > 1 ? 'Download ZIP' : 'Download'}
                      </>
                    ) : (
                      'Compress'
                    )}
                  </button>
                </div>
                {inputError && (
                  <p className="mt-2 text-sm text-red-500">{inputError}</p>
                )}
                {requestError && (
                  <p className="mt-2 text-sm text-red-500">{requestError}</p>
                )}
              </div>

              {/* File Cards */}
              {files.map((file) => (
                <motion.div
                  key={file.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="sticker-card p-5"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="w-12 h-12 bg-violet/10 rounded-xl flex items-center justify-center flex-shrink-0">
                      <FileText className="w-6 h-6 text-violet" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-dark truncate">
                        {file.name}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray">
                        <span>Original: {formatSize(file.originalSize)}</span>
                        {(file.targetSizeKB || previewTargetSizeKB) ? (
                          <span>Target: {file.targetSizeKB || previewTargetSizeKB} KB</span>
                        ) : null}
                        {file.status === 'completed' && (
                          <>
                            <span>-&gt;</span>
                            <span className="text-pink font-medium">
                              {formatSize(file.compressedSize)}
                            </span>
                            <span className="sticker-label bg-green-500 text-white border-green-500 text-[10px] py-0">
                              <Check className="w-3 h-3 mr-1" />
                              {getReductionPercentage(file.originalSize, file.compressedSize)}% saved
                            </span>
                          </>
                        )}
                        {file.status === 'error' && (
                          <span className="text-red-500 flex items-center gap-1">
                            <AlertCircle className="w-4 h-4" />
                            {file.error || 'Compression failed'}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex w-full sm:w-auto items-center justify-between sm:justify-end gap-2">
                      {file.status === 'completed' ? (
                        <span className="text-sm text-green-600 font-medium">Completed</span>
                      ) : file.status === 'processing' ? (
                        <div className="flex items-center gap-2 text-violet">
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span className="text-sm">Compressing...</span>
                        </div>
                      ) : (
                        <span className="text-sm text-gray">Ready</span>
                      )}
                      <button
                        onClick={() => removeFile(file.id)}
                        className="w-10 h-10 bg-gray-100 hover:bg-red-100 rounded-xl flex items-center justify-center transition-colors"
                      >
                        <X className="w-5 h-5 text-gray hover:text-red-500" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}

              {/* Add More Files */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="sticker-button-secondary cursor-pointer">
                  <Upload className="w-4 h-4 mr-2" />
                  <span>Add More Files</span>
                  <input
                    type="file"
                    accept=".pdf"
                    multiple
                    onChange={handleFileInput}
                    className="hidden"
                  />
                </label>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
          {[
            { icon: Minimize2, title: 'Smart Compression', desc: 'Reduces size while keeping quality' },
            { icon: Check, title: '100% Secure', desc: 'Files deleted after 1 hour' },
            { icon: Download, title: 'Batch Download', desc: 'Get all files as ZIP' },
          ].map((item) => (
            <div key={item.title} className="sticker-card p-5 text-center">
              <div className="w-12 h-12 bg-violet/10 rounded-xl flex items-center justify-center mx-auto mb-3">
                <item.icon className="w-6 h-6 text-violet" />
              </div>
              <h4 className="font-display font-bold text-dark text-sm mb-1">
                {item.title}
              </h4>
              <p className="text-gray text-xs">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

