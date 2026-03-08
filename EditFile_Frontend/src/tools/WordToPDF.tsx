import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, X, FileText, Download, Loader2, AlertCircle } from 'lucide-react';
import JSZip from 'jszip';
import {
  queueWordToPdf,
  pollJobUntilDone,
  getJobDownloadInfo,
  startFileDownload,
} from '@/lib/compressionApi';
import { runWithConcurrency } from '@/lib/concurrency';

type ConversionStatus = 'ready' | 'uploading' | 'processing' | 'completed' | 'error';

interface WordToPdfFile {
  id: string;
  file: File;
  name: string;
  size: number;
  status: ConversionStatus;
  progress: number;
  downloadUrl: string | null;
  outputName: string | null;
  error?: string;
}

const createFileId = () => Math.random().toString(36).slice(2, 11);
const MAX_PARALLEL_CONVERSIONS = 2;

const isWordFile = (file: File) => {
  const lowerName = file.name.toLowerCase();
  return (
    lowerName.endsWith('.doc') ||
    lowerName.endsWith('.docx') ||
    lowerName.endsWith('.rtf') ||
    lowerName.endsWith('.odt') ||
    file.type === 'application/msword' ||
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    file.type === 'application/rtf' ||
    file.type === 'text/rtf' ||
    file.type === 'application/vnd.oasis.opendocument.text' ||
    file.type === 'text/plain'
  );
};

const ensurePdfExtension = (fileName: string) => `${fileName.replace(/\.[^.]+$/, '')}.pdf`;

const formatSize = (bytes: number) => {
  if (bytes === 0) {
    return '0 B';
  }

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

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

export default function WordToPDF() {
  const [files, setFiles] = useState<WordToPdfFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [quality, setQuality] = useState('standard');
  const [isConverting, setIsConverting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestSuccess, setRequestSuccess] = useState<string | null>(null);
  const filesRef = useRef<WordToPdfFile[]>([]);

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  const handleFiles = useCallback((incomingFiles: File[]) => {
    if (incomingFiles.length === 0) {
      return;
    }

    const validFiles = incomingFiles.filter(isWordFile);
    if (validFiles.length !== incomingFiles.length) {
      setRequestError('Only Word-compatible files are allowed (.doc, .docx, .rtf, .odt, .txt).');
    } else {
      setRequestError(null);
    }

    if (validFiles.length === 0) {
      return;
    }

    const createdFiles: WordToPdfFile[] = validFiles.map((file) => ({
      id: createFileId(),
      file,
      name: file.name,
      size: file.size,
      status: 'ready',
      progress: 0,
      downloadUrl: null,
      outputName: null,
    }));

    setRequestSuccess(null);
    setFiles((prev) => [...prev, ...createdFiles]);
  }, []);

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

  const removeFile = (id: string) => {
    if (isConverting) {
      return;
    }

    setFiles((prev) => prev.filter((file) => file.id !== id));
  };

  const handleSingleDownload = (file: WordToPdfFile) => {
    if (!file.downloadUrl) {
      return;
    }

    const outputName = file.outputName || ensurePdfExtension(file.name);
    startFileDownload(file.downloadUrl, outputName);
  };

  const autoDownloadZip = async (completedFiles: WordToPdfFile[]) => {
    const zip = new JSZip();

    await Promise.all(
      completedFiles.map(async (file) => {
        if (!file.downloadUrl) {
          return;
        }

        const response = await fetch(file.downloadUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch "${file.name}" for ZIP download.`);
        }

        const outputBlob = await response.blob();
        zip.file(file.outputName || ensurePdfExtension(file.name), outputBlob);
      })
    );

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    triggerBlobDownload(zipBlob, `word-to-pdf-${timestamp}.zip`);
  };

  const handleConvert = async () => {
    if (isConverting || files.length === 0) {
      return;
    }

    const filesToConvert = files.filter(
      (file) => file.status === 'ready' || file.status === 'error'
    );

    if (filesToConvert.length === 0) {
      return;
    }

    setIsConverting(true);
    setRequestError(null);
    setRequestSuccess(null);

    const updateFileState = (
      fileId: string,
      updater: (target: WordToPdfFile) => WordToPdfFile
    ) => {
      setFiles((prev) => {
        const next = prev.map((file) => (file.id === fileId ? updater(file) : file));
        filesRef.current = next;
        return next;
      });
    };

    await runWithConcurrency(filesToConvert, MAX_PARALLEL_CONVERSIONS, async (file) => {
      updateFileState(file.id, (target) => ({
        ...target,
        status: 'uploading',
        progress: 0,
        error: undefined,
      }));

      try {
        const queueResult = await queueWordToPdf(file.file, (progress) => {
          updateFileState(file.id, (target) => ({
            ...target,
            status: 'uploading',
            progress,
            error: undefined,
          }));
        });

        updateFileState(file.id, (target) => ({
          ...target,
          status: 'processing',
          progress: 100,
          error: undefined,
        }));

        await pollJobUntilDone(queueResult.jobId, {
          timeoutMs: 10 * 60 * 1000,
        });

        const downloadInfo = await getJobDownloadInfo(queueResult.jobId);
        const outputName = ensurePdfExtension(downloadInfo.fileName || file.name);

        updateFileState(file.id, (target) => ({
          ...target,
          status: 'completed',
          progress: 100,
          downloadUrl: downloadInfo.downloadUrl,
          outputName,
          error: undefined,
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Conversion failed';

        updateFileState(file.id, (target) => ({
          ...target,
          status: 'error',
          progress: 0,
          downloadUrl: null,
          outputName: null,
          error: message,
        }));
        setRequestError(message);
      }
    });

    setIsConverting(false);

    const latestFiles = filesRef.current;
    const completedFiles = latestFiles.filter(
      (file) => file.status === 'completed' && file.downloadUrl
    );
    const failedCount = latestFiles.filter((file) => file.status === 'error').length;

    try {
      if (latestFiles.length > 1 && completedFiles.length > 1) {
        await autoDownloadZip(completedFiles);
        setRequestSuccess('Conversion completed. ZIP download started automatically.');
      } else if (completedFiles.length === 1) {
        setRequestSuccess('Conversion completed. Use Download for your file.');
      }

      if (failedCount > 0) {
        setRequestError(`${failedCount} file(s) failed to convert.`);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'ZIP download failed after conversion.';
      setRequestError(message);
    }
  };

  const completedFiles = files.filter((file) => file.status === 'completed' && file.downloadUrl);
  const hasPendingConversion = files.some(
    (file) => file.status === 'ready' || file.status === 'error'
  );
  const shouldShowDownloadAction =
    !isConverting && !hasPendingConversion && completedFiles.length > 0;

  const handlePrimaryAction = async () => {
    if (shouldShowDownloadAction) {
      try {
        setRequestError(null);

        if (completedFiles.length > 1) {
          await autoDownloadZip(completedFiles);
          setRequestSuccess('ZIP download started.');
        } else {
          handleSingleDownload(completedFiles[0]);
          setRequestSuccess('Download started.');
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Download failed. Try again.';
        setRequestError(message);
      }
      return;
    }

    await handleConvert();
  };

  const isPrimaryActionDisabled = files.length === 0 || isConverting;
  const primaryActionLabel = isConverting
    ? 'Converting...'
    : shouldShowDownloadAction
      ? completedFiles.length > 1
        ? 'Download ZIP'
        : 'Download'
      : 'Convert';

  return (
    <div className="w-full px-3 sm:px-4 lg:px-6 py-8 overflow-x-clip">
      <div className="max-w-4xl mx-auto">
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
                Drop Word files here
              </h3>
              <p className="text-gray text-center mb-6">or click to browse from your computer</p>
              <label className="sticker-button cursor-pointer">
                <span>Select Word Files</span>
                <input
                  type="file"
                  accept=".doc,.docx,.rtf,.odt,.txt"
                  multiple
                  onChange={handleFileInput}
                  className="hidden"
                />
              </label>
            </div>
          </motion.div>
        )}

        <AnimatePresence>
          {files.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              <div className="sticker-card p-6">
                <label className="font-display font-bold text-dark block mb-3">PDF Quality</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: 'low', label: 'Low (Smaller file)' },
                    { value: 'standard', label: 'Standard (Recommended)' },
                    { value: 'high', label: 'High (Better quality)' },
                  ].map((q) => (
                    <button
                      key={q.value}
                      onClick={() => setQuality(q.value)}
                      disabled={isConverting}
                      className={`px-4 py-2 rounded-xl border-2 font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                        quality === q.value
                          ? 'bg-violet text-white border-violet'
                          : 'bg-white text-dark border-gray-200 hover:border-violet'
                      }`}
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>

              {(requestError || requestSuccess) && (
                <div className="sticker-card p-4">
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

              {files.map((file) => (
                <motion.div
                  key={file.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="sticker-card p-5"
                >
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="w-12 h-12 bg-violet/10 rounded-xl flex items-center justify-center flex-shrink-0">
                      <FileText className="w-6 h-6 text-violet" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-dark truncate">{file.name}</p>
                      <p className="text-gray text-sm">{formatSize(file.size)}</p>
                      {file.status === 'ready' && (
                        <p className="text-violet text-xs mt-1">Ready to convert</p>
                      )}
                      {file.status === 'error' && file.error && (
                        <p className="text-red-500 text-xs mt-1">{file.error}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {file.status === 'uploading' && (
                        <div className="w-24">
                          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-violet transition-all duration-300"
                              style={{ width: `${file.progress}%` }}
                            />
                          </div>
                        </div>
                      )}
                      {file.status === 'completed' && (
                        <button onClick={() => handleSingleDownload(file)} className="sticker-button py-2 px-4">
                          <Download className="w-4 h-4 mr-2" />
                          Download
                        </button>
                      )}
                      {file.status === 'processing' && (
                        <div className="flex items-center gap-2 text-violet">
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span className="text-sm">Converting...</span>
                        </div>
                      )}
                      {(file.status === 'ready' || file.status === 'error') && (
                        <span className="text-sm text-gray">Waiting</span>
                      )}

                      <button
                        onClick={() => removeFile(file.id)}
                        disabled={isConverting}
                        className="w-10 h-10 bg-gray-100 hover:bg-red-100 disabled:opacity-60 rounded-xl flex items-center justify-center transition-colors"
                      >
                        <X className="w-5 h-5 text-gray hover:text-red-500" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="sticker-button-secondary cursor-pointer">
                  <Upload className="w-4 h-4 mr-2" />
                  <span>Add More Files</span>
                  <input
                    type="file"
                    accept=".doc,.docx,.rtf,.odt,.txt"
                    multiple
                    onChange={handleFileInput}
                    className="hidden"
                  />
                </label>

                <button
                  onClick={() => void handlePrimaryAction()}
                  disabled={isPrimaryActionDisabled}
                  className={`sticker-button ${isPrimaryActionDisabled ? 'opacity-70 cursor-not-allowed' : ''}`}
                >
                  {isConverting ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 mr-2" />
                  )}
                  {primaryActionLabel}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
