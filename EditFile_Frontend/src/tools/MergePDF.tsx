import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  X,
  FileText,
  Download,
  GripVertical,
  ArrowUp,
  ArrowDown,
  Check,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import {
  queueMergePdf,
  pollJobUntilDone,
  getJobDownloadInfo,
  startFileDownload,
} from '@/lib/compressionApi';

interface MergeFile {
  id: string;
  file: File;
  name: string;
  size: number;
  pages: number;
  progress: number;
  status: 'uploading' | 'processing' | 'completed' | 'error';
  error?: string;
}

const createFileId = () => Math.random().toString(36).slice(2, 11);
const DEFAULT_MERGED_FILE_NAME = 'merged_output.pdf';

export default function MergePDF() {
  const [files, setFiles] = useState<MergeFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [mergeSuccess, setMergeSuccess] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadFileName, setDownloadFileName] = useState(DEFAULT_MERGED_FILE_NAME);

  const resetMergeState = () => {
    setMergeError(null);
    setMergeSuccess(null);
    setDownloadUrl(null);
    setDownloadFileName(DEFAULT_MERGED_FILE_NAME);
  };

  const simulateUpload = (fileId: string) => {
    let progress = 0;
    const interval = setInterval(() => {
      progress += 20;
      setFiles((prev) =>
        prev.map((item) =>
          item.id === fileId ? { ...item, progress: Math.min(progress, 100) } : item
        )
      );

      if (progress >= 100) {
        clearInterval(interval);
        setFiles((prev) =>
          prev.map((item) =>
            item.id === fileId ? { ...item, status: 'completed', progress: 100 } : item
          )
        );
      }
    }, 80);
  };

  const handleFiles = (newFiles: File[]) => {
    if (newFiles.length === 0) {
      return;
    }

    const validFiles = newFiles.filter((file) => file.type === 'application/pdf');
    if (validFiles.length !== newFiles.length) {
      setMergeError('Only PDF files are allowed.');
    }

    if (validFiles.length === 0) {
      return;
    }

    resetMergeState();

    const createdFiles: MergeFile[] = validFiles.map((file) => ({
      id: createFileId(),
      file,
      name: file.name,
      size: file.size,
      pages: Math.floor(Math.random() * 20) + 1,
      progress: 0,
      status: 'uploading',
    }));

    setFiles((prev) => [...prev, ...createdFiles]);
    createdFiles.forEach((file) => simulateUpload(file.id));
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
    if (isMerging) {
      return;
    }

    resetMergeState();
    setFiles((prev) => prev.filter((file) => file.id !== id));
  };

  const moveFile = (index: number, direction: 'up' | 'down') => {
    if (isMerging) {
      return;
    }

    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= files.length) {
      return;
    }

    resetMergeState();
    setFiles((prev) => {
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(newIndex, 0, moved);
      return next;
    });
  };

  const handleMerge = async () => {
    if (isMerging) {
      return;
    }

    const readyFiles = files.filter((file) => file.status === 'completed');
    if (readyFiles.length < 2) {
      setMergeError('Please upload at least 2 PDF files.');
      return;
    }

    setIsMerging(true);
    setMergeError(null);
    setMergeSuccess(null);
    setDownloadUrl(null);

    setFiles((prev) =>
      prev.map((file) =>
        file.status === 'completed'
          ? {
              ...file,
              status: 'processing',
              progress: 65,
              error: undefined,
            }
          : file
      )
    );

    try {
      const queueResult = await queueMergePdf(readyFiles.map((file) => file.file));
      await pollJobUntilDone(queueResult.jobId, {
        timeoutMs: 10 * 60 * 1000,
      });

      const downloadInfo = await getJobDownloadInfo(queueResult.jobId);
      setDownloadUrl(downloadInfo.downloadUrl);
      setDownloadFileName(downloadInfo.fileName || DEFAULT_MERGED_FILE_NAME);
      setMergeSuccess('PDF files merged successfully.');

      setFiles((prev) =>
        prev.map((file) =>
          file.status === 'processing' ? { ...file, status: 'completed', progress: 100 } : file
        )
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Merge failed';
      setMergeError(message);

      setFiles((prev) =>
        prev.map((file) =>
          file.status === 'processing'
            ? { ...file, status: 'completed', progress: 100, error: message }
            : file
        )
      );
    } finally {
      setIsMerging(false);
    }
  };

  const handleDownload = () => {
    if (!downloadUrl) {
      return;
    }
    startFileDownload(downloadUrl, downloadFileName);
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const totalPages = files.reduce((acc, file) => acc + file.pages, 0);
  const readyFilesCount = files.filter((file) => file.status === 'completed').length;
  const isUploading = files.some((file) => file.status === 'uploading');

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
                Drop PDF files to merge
              </h3>
              <p className="text-gray text-center mb-6">
                Add multiple files and arrange them in order
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

        {/* Files List with Reorder */}
        <AnimatePresence>
          {files.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              {/* Summary */}
              <div className="sticker-card p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-4">
                  <span className="sticker-label bg-violet text-white border-violet">
                    {files.length} files
                  </span>
                  <span className="text-gray text-sm">
                    Total: {totalPages} pages
                  </span>
                </div>
                <button
                  onClick={downloadUrl ? handleDownload : handleMerge}
                  disabled={isMerging || isUploading || (!downloadUrl && readyFilesCount < 2)}
                  className="sticker-button py-2 px-4 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isMerging ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Merging...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 mr-2" />
                      {downloadUrl ? 'Download Merged PDF' : 'Merge'}
                    </>
                  )}
                </button>
              </div>

              {(mergeError || mergeSuccess) && (
                <div className="sticker-card p-4">
                  {mergeError && (
                    <p className="text-red-500 text-sm flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      {mergeError}
                    </p>
                  )}
                  {!mergeError && mergeSuccess && (
                    <p className="text-green-600 text-sm">{mergeSuccess}</p>
                  )}
                </div>
              )}

              {/* Reorderable File List */}
              <div className="space-y-2">
                {files.map((file, index) => (
                  <motion.div
                    key={file.id}
                    layout
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="sticker-card p-4"
                  >
                    <div className="flex flex-wrap items-center gap-4">
                      {/* Drag Handle */}
                      <div className="cursor-move text-gray hover:text-violet">
                        <GripVertical className="w-5 h-5" />
                      </div>

                      {/* File Number */}
                      <div className="w-8 h-8 bg-violet/10 rounded-lg flex items-center justify-center">
                        <span className="font-display font-bold text-violet text-sm">
                          {index + 1}
                        </span>
                      </div>

                      {/* File Icon */}
                      <div className="w-10 h-10 bg-violet/10 rounded-lg flex items-center justify-center">
                        <FileText className="w-5 h-5 text-violet" />
                      </div>

                      {/* File Info */}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-dark truncate">
                          {file.name}
                        </p>
                        <p className="text-gray text-sm">
                          {file.pages} pages - {formatSize(file.size)}
                        </p>
                        {file.error && (
                          <p className="text-red-500 text-xs mt-1">{file.error}</p>
                        )}
                      </div>

                      {/* Status/Actions */}
                      <div className="flex items-center gap-2">
                        {file.status === 'completed' ? (
                          <>
                            <button
                              onClick={() => moveFile(index, 'up')}
                              disabled={index === 0 || isMerging}
                              className="w-8 h-8 bg-gray-100 hover:bg-violet/20 disabled:opacity-30 rounded-lg flex items-center justify-center transition-colors"
                            >
                              <ArrowUp className="w-4 h-4 text-gray" />
                            </button>
                            <button
                              onClick={() => moveFile(index, 'down')}
                              disabled={index === files.length - 1 || isMerging}
                              className="w-8 h-8 bg-gray-100 hover:bg-violet/20 disabled:opacity-30 rounded-lg flex items-center justify-center transition-colors"
                            >
                              <ArrowDown className="w-4 h-4 text-gray" />
                            </button>
                          </>
                        ) : (
                          <div className="w-20">
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
                          disabled={isMerging}
                          className="w-8 h-8 bg-gray-100 hover:bg-red-100 disabled:opacity-30 rounded-lg flex items-center justify-center transition-colors"
                        >
                          <X className="w-4 h-4 text-gray hover:text-red-500" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Add More */}
              <div className="flex items-center justify-center">
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

        {/* Tips */}
        <div className="sticker-card p-6 mt-8">
          <h4 className="font-display font-bold text-dark mb-3">
            Tips for merging
          </h4>
          <ul className="space-y-2 text-gray text-sm">
            <li className="flex items-start gap-2">
              <Check className="w-4 h-4 text-violet mt-0.5 flex-shrink-0" />
              Drag files to reorder them before merging
            </li>
            <li className="flex items-start gap-2">
              <Check className="w-4 h-4 text-violet mt-0.5 flex-shrink-0" />
              All pages will be combined into a single PDF
            </li>
            <li className="flex items-start gap-2">
              <Check className="w-4 h-4 text-violet mt-0.5 flex-shrink-0" />
              Original files are not modified
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

