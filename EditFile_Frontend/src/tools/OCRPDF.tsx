import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, X, FileText, Download, Loader2, AlertCircle } from 'lucide-react';
import JSZip from 'jszip';
import {
  queueOcrPdf,
  pollJobUntilDone,
  getJobDownloadInfo,
  startFileDownload,
  type OcrOutputFormat,
} from '@/lib/compressionApi';
import { runWithConcurrency } from '@/lib/concurrency';

type OcrStatus = 'ready' | 'processing' | 'completed' | 'error';

interface OcrPdfFile {
  id: string;
  file: File;
  name: string;
  size: number;
  status: OcrStatus;
  downloadUrl: string | null;
  outputName: string | null;
  error?: string;
}

const OCR_LANGUAGES = [
  { code: 'eng', name: 'English' },
  { code: 'spa', name: 'Spanish' },
  { code: 'fra', name: 'French' },
  { code: 'deu', name: 'German' },
  { code: 'ita', name: 'Italian' },
  { code: 'por', name: 'Portuguese' },
  { code: 'rus', name: 'Russian' },
  { code: 'chi_sim', name: 'Chinese (Simplified)' },
  { code: 'chi_tra', name: 'Chinese (Traditional)' },
  { code: 'jpn', name: 'Japanese' },
  { code: 'kor', name: 'Korean' },
  { code: 'ara', name: 'Arabic' },
  { code: 'hin', name: 'Hindi' },
];

const createFileId = () => Math.random().toString(36).slice(2, 11);
const MAX_PARALLEL_CONVERSIONS = 2;

const isPdfFile = (file: File) =>
  file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

const getOutputExtension = (format: OcrOutputFormat) => {
  if (format === 'searchable-pdf') {
    return 'pdf';
  }

  if (format === 'word') {
    return 'docx';
  }

  return 'txt';
};

const ensureOutputExtension = (fileName: string, format: OcrOutputFormat) => {
  const expectedExtension = getOutputExtension(format);
  const normalized = fileName.trim();
  if (normalized.toLowerCase().endsWith(`.${expectedExtension}`)) {
    return normalized;
  }

  return `${normalized.replace(/\.[^.]+$/, '')}.${expectedExtension}`;
};

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

export default function OCRPDF() {
  const [files, setFiles] = useState<OcrPdfFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [language, setLanguage] = useState('eng');
  const [outputFormat, setOutputFormat] = useState<OcrOutputFormat>('searchable-pdf');
  const [isConverting, setIsConverting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestSuccess, setRequestSuccess] = useState<string | null>(null);
  const filesRef = useRef<OcrPdfFile[]>([]);

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  const handleFiles = useCallback((incomingFiles: File[]) => {
    if (incomingFiles.length === 0) {
      return;
    }

    const validFiles = incomingFiles.filter(isPdfFile);
    if (validFiles.length !== incomingFiles.length) {
      setRequestError('Only PDF files are allowed.');
    } else {
      setRequestError(null);
    }

    if (validFiles.length === 0) {
      return;
    }

    const createdFiles: OcrPdfFile[] = validFiles.map((file) => ({
      id: createFileId(),
      file,
      name: file.name,
      size: file.size,
      status: 'ready',
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
    const droppedFiles = Array.from(e.dataTransfer.files);
    handleFiles(droppedFiles);
  }, [handleFiles]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    handleFiles(selectedFiles);
  }, [handleFiles]);

  const removeFile = (id: string) => {
    if (isConverting) {
      return;
    }

    setFiles((prev) => prev.filter((file) => file.id !== id));
  };

  const handleSingleDownload = (file: OcrPdfFile) => {
    if (!file.downloadUrl) {
      return;
    }

    const outputName = file.outputName || ensureOutputExtension(file.name, outputFormat);
    startFileDownload(file.downloadUrl, outputName);
  };

  const autoDownloadZip = async (completedFiles: OcrPdfFile[]) => {
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
        zip.file(file.outputName || ensureOutputExtension(file.name, outputFormat), outputBlob);
      })
    );

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    triggerBlobDownload(zipBlob, `ocr-pdf-${timestamp}.zip`);
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
      updater: (target: OcrPdfFile) => OcrPdfFile
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
        status: 'processing',
        error: undefined,
      }));

      try {
        const queueResult = await queueOcrPdf(file.file, {
          language,
          outputFormat,
        });
        await pollJobUntilDone(queueResult.jobId, {
          timeoutMs: 20 * 60 * 1000,
        });

        const downloadInfo = await getJobDownloadInfo(queueResult.jobId);
        const outputName = ensureOutputExtension(
          downloadInfo.fileName || file.name,
          outputFormat
        );

        updateFileState(file.id, (target) => ({
          ...target,
          status: 'completed',
          downloadUrl: downloadInfo.downloadUrl,
          outputName,
          error: undefined,
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'OCR conversion failed';

        updateFileState(file.id, (target) => ({
          ...target,
          status: 'error',
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
        setRequestSuccess('Conversion completed. Convert button is now Download.');
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

  const completedFiles = files.filter(
    (file) => file.status === 'completed' && file.downloadUrl
  );
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
        const message =
          error instanceof Error ? error.message : 'Download failed. Try again.';
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

        <AnimatePresence>
          {files.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              <div className="sticker-card p-6 space-y-5">
                <div>
                  <label className="font-display font-bold text-dark block mb-3">
                    Document Language
                  </label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    disabled={isConverting}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-violet focus:outline-none bg-white disabled:opacity-60"
                  >
                    {OCR_LANGUAGES.map((lang) => (
                      <option key={lang.code} value={lang.code}>
                        {lang.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-display font-bold text-dark block mb-3">
                    Output Format
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: 'searchable-pdf', label: 'Searchable PDF' },
                      { value: 'text', label: 'Plain Text' },
                      { value: 'word', label: 'Word Document' },
                    ].map((format) => (
                      <button
                        key={format.value}
                        onClick={() => setOutputFormat(format.value as OcrOutputFormat)}
                        disabled={isConverting}
                        className={`px-4 py-2 rounded-xl border-2 font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                          outputFormat === format.value
                            ? 'bg-violet text-white border-violet'
                            : 'bg-white text-dark border-gray-200 hover:border-violet'
                        }`}
                      >
                        {format.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-4 bg-violet/10 rounded-xl">
                  <p className="text-violet text-sm">
                    <strong>Tip:</strong> For best results, use clear scans with good contrast and
                    minimal skew.
                  </p>
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
                      {file.status === 'completed' ? (
                        <span className="text-sm font-medium text-green-600">
                          Completed
                        </span>
                      ) : file.status === 'processing' ? (
                        <div className="flex items-center gap-2 text-violet">
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span className="text-sm">Converting...</span>
                        </div>
                      ) : (
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
                    accept=".pdf"
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

