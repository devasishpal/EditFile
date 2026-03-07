import { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, X, FileText, Download, Settings, Loader2, AlertCircle } from 'lucide-react';
import {
  queueSplitPdf,
  pollJobUntilDone,
  getJobDownloadInfo,
  startFileDownload,
  type SplitMethod,
} from '@/lib/compressionApi';

interface SplitFile {
  id: string;
  file: File;
  name: string;
  size: number;
  progress: number;
  status: 'uploading' | 'processing' | 'completed' | 'error';
  downloadUrl: string | null;
  outputName: string | null;
  error?: string;
}

const createFileId = () => Math.random().toString(36).slice(2, 11);

export default function SplitPDF() {
  const location = useLocation();
  const isExtractToolPage = location.pathname.endsWith('/extract-pages');
  const [splitMethod, setSplitMethod] = useState<SplitMethod>(() =>
    isExtractToolPage ? 'extract' : 'range'
  );

  useEffect(() => {
    setSplitMethod(location.pathname.endsWith('/extract-pages') ? 'extract' : 'range');
  }, [location.pathname]);
  const [pageRange, setPageRange] = useState('');
  const [files, setFiles] = useState<SplitFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestSuccess, setRequestSuccess] = useState<string | null>(null);

  const resetStatus = () => {
    setRequestError(null);
    setRequestSuccess(null);
  };

  const simulateUpload = (fileId: string) => {
    let progress = 0;
    const interval = setInterval(() => {
      progress += 20;
      setFiles((prev) =>
        prev.map((file) =>
          file.id === fileId ? { ...file, progress: Math.min(progress, 100) } : file
        )
      );

      if (progress >= 100) {
        clearInterval(interval);
        setFiles((prev) =>
          prev.map((file) =>
            file.id === fileId ? { ...file, status: 'completed', progress: 100 } : file
          )
        );
      }
    }, 80);
  };

  const handleFiles = (incomingFiles: File[]) => {
    if (incomingFiles.length === 0) {
      return;
    }

    const validFiles = incomingFiles.filter((file) => file.type === 'application/pdf');
    if (validFiles.length !== incomingFiles.length) {
      setRequestError('Only PDF files are allowed.');
    }

    if (validFiles.length === 0) {
      return;
    }

    const selected = validFiles[0];

    resetStatus();

    const nextFile: SplitFile = {
      id: createFileId(),
      file: selected,
      name: selected.name,
      size: selected.size,
      progress: 0,
      status: 'uploading',
      downloadUrl: null,
      outputName: null,
    };

    setFiles([nextFile]);
    simulateUpload(nextFile.id);
  };

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
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    handleFiles(selectedFiles);
  }, []);

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((file) => file.id !== id));
    resetStatus();
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const validatePageSettings = () => {
    const trimmedRange = pageRange.trim();
    if ((splitMethod === 'range' || splitMethod === 'extract') && !trimmedRange) {
      return 'Please enter a page range.';
    }

    if (splitMethod === 'every' && trimmedRange) {
      const value = Number(trimmedRange);
      if (!Number.isInteger(value) || value < 1) {
        return 'For "Every N Pages", enter a positive number.';
      }
    }

    return null;
  };

  const processSplit = async (fileId: string) => {
    const targetFile = files.find((file) => file.id === fileId);
    if (!targetFile) {
      return;
    }

    const validationError = validatePageSettings();
    if (validationError) {
      setRequestError(validationError);
      return;
    }

    resetStatus();
    setFiles((prev) =>
      prev.map((file) =>
        file.id === fileId
          ? { ...file, status: 'processing', progress: 60, error: undefined }
          : file
      )
    );

    try {
      const queueResult = await queueSplitPdf(targetFile.file, {
        splitMethod,
        pageRange: pageRange.trim(),
      });

      await pollJobUntilDone(queueResult.jobId, {
        timeoutMs: 10 * 60 * 1000,
      });

      const downloadInfo = await getJobDownloadInfo(queueResult.jobId);

      setFiles((prev) =>
        prev.map((file) =>
          file.id === fileId
            ? {
                ...file,
                status: 'completed',
                progress: 100,
                downloadUrl: downloadInfo.downloadUrl,
                outputName: downloadInfo.fileName || file.name,
                error: undefined,
              }
            : file
        )
      );
      setRequestSuccess('PDF split completed successfully.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Split failed';
      setFiles((prev) =>
        prev.map((file) =>
          file.id === fileId
            ? {
                ...file,
                status: 'error',
                progress: 0,
                error: message,
              }
            : file
        )
      );
      setRequestError(message);
    }
  };

  const handlePrimaryAction = async () => {
    if (files.length === 0) {
      return;
    }

    const file = files[0];
    if (file.status === 'processing' || file.status === 'uploading') {
      return;
    }

    if (!file.downloadUrl) {
      await processSplit(file.id);
      return;
    }

    startFileDownload(file.downloadUrl, file.outputName || file.name);
  };

  const primaryActionLabel = isExtractToolPage ? 'Extract' : 'Split';
  const getPrimaryActionLabel = () => {
    const file = files[0];
    if (!file) {
      return primaryActionLabel;
    }
    if (file.status === 'processing') {
      return 'Processing...';
    }
    if (file.status === 'uploading') {
      return 'Uploading...';
    }
    return file.downloadUrl ? 'Download ZIP' : primaryActionLabel;
  };
  const isPrimaryActionDisabled = () => {
    const file = files[0];
    return !file || file.status === 'processing' || file.status === 'uploading';
  };

  const settingsComponent = (
    <div className="space-y-4">
      <div>
        <label className="font-display font-bold text-dark block mb-3">
          Split Method
        </label>
        <div className="flex flex-wrap gap-2">
          {[
            { value: 'range', label: 'By Range' },
            { value: 'every', label: 'Every N Pages' },
            { value: 'extract', label: 'Extract Pages' },
          ].map((method) => (
            <button
              key={method.value}
              onClick={() => setSplitMethod(method.value as SplitMethod)}
              className={`px-4 py-2 rounded-xl border-2 font-medium transition-colors ${
                splitMethod === method.value
                  ? 'bg-violet text-white border-violet'
                  : 'bg-white text-dark border-gray-200 hover:border-violet'
              }`}
            >
              {method.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="font-display font-bold text-dark block mb-2">
          {splitMethod === 'range' && 'Page Range (e.g., 1-5, 8, 11-13)'}
          {splitMethod === 'every' && 'Split every N pages'}
          {splitMethod === 'extract' && 'Pages to extract (e.g., 1, 3, 5-7)'}
        </label>
        <input
          type="text"
          value={pageRange}
          onChange={(e) => setPageRange(e.target.value)}
          placeholder={
            splitMethod === 'range'
              ? '1-5, 8, 11-13'
              : splitMethod === 'every'
                ? '2'
                : '1, 3, 5-7'
          }
          className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-violet focus:outline-none"
        />
      </div>
    </div>
  );

  return (
    <div className="w-full px-4 lg:px-6 py-8">
      <div className="max-w-4xl mx-auto">
        {/* Upload Area */}
        {files.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="sticker-card p-8 lg:p-12"
          >
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-3 border-dashed rounded-2xl p-12 lg:p-16 flex flex-col items-center justify-center transition-all cursor-pointer ${
                isDragging
                  ? 'border-pink bg-pink/5'
                  : 'border-gray-300 hover:border-violet hover:bg-violet/5'
              }`}
            >
              <div className="w-20 h-20 bg-violet/10 rounded-2xl flex items-center justify-center mb-6">
                <Upload className="w-10 h-10 text-violet" />
              </div>
              <h3 className="font-display font-bold text-2xl text-dark text-center mb-2">
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
                  multiple={false}
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
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-violet/10 rounded-xl flex items-center justify-center flex-shrink-0">
                      <FileText className="w-6 h-6 text-violet" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-dark truncate">
                        {file.name}
                      </p>
                      <p className="text-gray text-sm">
                        {formatSize(file.size)}
                      </p>
                      {file.error && (
                        <p className="text-red-500 text-xs mt-1">{file.error}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {file.status === 'processing' ? (
                        <div className="flex items-center gap-2 text-violet">
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span className="text-sm">Processing...</span>
                        </div>
                      ) : file.status === 'completed' ? (
                        <span
                          className={`text-sm font-medium ${
                            file.downloadUrl ? 'text-green-600' : 'text-violet'
                          }`}
                        >
                          {file.downloadUrl ? 'ZIP ready' : 'Ready to split'}
                        </span>
                      ) : (
                        <div className="w-24">
                          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-violet transition-all duration-300"
                              style={{ width: `${file.progress}%` }}
                            />
                          </div>
                        </div>
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

              {/* Settings Panel */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="sticker-card p-6"
              >
                <div className="flex items-center gap-2 mb-4">
                  <Settings className="w-4 h-4 text-dark" />
                  <p className="font-display font-bold text-dark">Settings</p>
                </div>
                {settingsComponent}
              </motion.div>

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

              {/* Actions */}
              <div className="flex items-center justify-between">
                <label className="sticker-button-secondary cursor-pointer">
                  <Upload className="w-4 h-4 mr-2" />
                  <span>Add More Files</span>
                  <input
                    type="file"
                    accept=".pdf"
                    multiple={false}
                    onChange={handleFileInput}
                    className="hidden"
                  />
                </label>

                <button
                  onClick={() => void handlePrimaryAction()}
                  disabled={isPrimaryActionDisabled()}
                  className={`sticker-button ${isPrimaryActionDisabled() ? 'opacity-70 cursor-not-allowed' : ''}`}
                >
                  {files[0]?.status === 'processing' ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 mr-2" />
                  )}
                  {getPrimaryActionLabel()}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
