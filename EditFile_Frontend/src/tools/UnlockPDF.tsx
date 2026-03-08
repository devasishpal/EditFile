import { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, X, FileText, Download, Loader2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import {
  queueUnlockPdf,
  pollJobUntilDone,
  getJobDownloadInfo,
  startFileDownload,
} from '@/lib/compressionApi';

interface UnlockFile {
  id: string;
  file: File;
  name: string;
  size: number;
  status: 'ready' | 'uploading' | 'processing' | 'completed' | 'error';
  progress: number;
  downloadUrl: string | null;
  outputName: string | null;
  error?: string;
}

const createFileId = () => Math.random().toString(36).slice(2, 11);

const isPdfFile = (file: File) =>
  file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

export default function UnlockPDF() {
  const [fileItem, setFileItem] = useState<UnlockFile | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestSuccess, setRequestSuccess] = useState<string | null>(null);

  const handleFiles = useCallback((incomingFiles: File[]) => {
    if (incomingFiles.length === 0) {
      return;
    }

    const selected = incomingFiles[0];
    if (!isPdfFile(selected)) {
      setRequestError('Only PDF files are allowed.');
      return;
    }

    setRequestError(null);
    setRequestSuccess(null);
    setFileItem({
      id: createFileId(),
      file: selected,
      name: selected.name,
      size: selected.size,
      status: 'ready',
      progress: 0,
      downloadUrl: null,
      outputName: null,
    });
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

    if (!password.trim()) {
      setRequestError('Password is required.');
      return;
    }

    setIsRunning(true);
    setRequestError(null);
    setRequestSuccess(null);

    setFileItem((prev) =>
      prev
        ? {
            ...prev,
            status: 'uploading',
            progress: 0,
            error: undefined,
            downloadUrl: null,
            outputName: null,
          }
        : prev
    );

    try {
      const queueResult = await queueUnlockPdf(fileItem.file, password, (progress) => {
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
        timeoutMs: 10 * 60 * 1000,
      });

      const downloadInfo = await getJobDownloadInfo(queueResult.jobId);
      setFileItem((prev) =>
        prev
          ? {
              ...prev,
              status: 'completed',
              downloadUrl: downloadInfo.downloadUrl,
              outputName: downloadInfo.fileName || 'unlocked.pdf',
              error: undefined,
            }
          : prev
      );
      setRequestSuccess('PDF unlocked successfully.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to unlock PDF.';
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
      startFileDownload(fileItem.downloadUrl, fileItem.outputName || 'unlocked.pdf');
      return;
    }

    await processFile();
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
                Drop protected PDF file here
              </h3>
              <p className="text-gray text-center mb-6">or click to browse from your computer</p>
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
          {fileItem && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              <div className="sticker-card p-6">
                <label className="font-display font-bold text-dark block mb-2">PDF Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className="w-full px-4 py-3 pr-12 border-2 border-gray-200 rounded-xl focus:border-violet focus:outline-none"
                  />
                  <button
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray hover:text-violet"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
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

              <div className="sticker-card p-5">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="w-12 h-12 bg-violet/10 rounded-xl flex items-center justify-center flex-shrink-0">
                    <FileText className="w-6 h-6 text-violet" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-dark truncate">{fileItem.name}</p>
                    <p className="text-gray text-sm">{formatSize(fileItem.size)}</p>
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
                        <span className="text-sm">Processing...</span>
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

              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="sticker-button-secondary cursor-pointer">
                  <Upload className="w-4 h-4 mr-2" />
                  <span>Choose Another File</span>
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
                  disabled={isRunning || !fileItem}
                  className={`sticker-button ${isRunning ? 'opacity-70 cursor-not-allowed' : ''}`}
                >
                  {isRunning ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 mr-2" />
                  )}
                  {fileItem.downloadUrl ? 'Download' : isRunning ? 'Processing...' : 'Unlock PDF'}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
