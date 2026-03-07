import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  X,
  Image as ImageIcon,
  Download,
  Eye,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import JSZip from 'jszip';
import {
  queueJpegCompression,
  pollJobUntilDone,
  getJobDownloadInfo,
  startFileDownload,
} from '@/lib/compressionApi';
import { runWithConcurrency } from '@/lib/concurrency';

interface CompressedImage {
  id: string;
  file: File;
  name: string;
  preview: string;
  originalSize: number;
  compressedSize: number;
  targetSizeKB: number | null;
  status: 'ready' | 'processing' | 'completed' | 'error';
  downloadUrl: string | null;
  outputName: string | null;
  error?: string;
}

const createFileId = () => Math.random().toString(36).slice(2, 11);
const MAX_PARALLEL_COMPRESSIONS = 2;
const isImageFile = (file: File) => {
  if (file.type.toLowerCase().startsWith('image/')) {
    return true;
  }

  return /\.(avif|bmp|gif|heic|heif|ico|jfif|jpe?g|png|svg|tiff?|webp)$/i.test(file.name);
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

export default function CompressJPEG() {
  const [files, setFiles] = useState<CompressedImage[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [targetSizeInput, setTargetSizeInput] = useState('');
  const [quality, setQuality] = useState(92);
  const [inputError, setInputError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [selectedPreview, setSelectedPreview] = useState<string | null>(null);

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
    const droppedFiles = Array.from(e.dataTransfer.files).filter(isImageFile);
    handleFiles(droppedFiles);
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []).filter(isImageFile);
    handleFiles(selectedFiles);
  }, []);

  const handleFiles = (newFiles: File[]) => {
    if (newFiles.length === 0) {
      return;
    }

    setRequestError(null);

    newFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const newImage: CompressedImage = {
          id: createFileId(),
          file,
          name: file.name,
          preview: (e.target?.result as string) || '',
          originalSize: file.size,
          compressedSize: 0,
          targetSizeKB: null,
          status: 'ready',
          downloadUrl: null,
          outputName: null,
        };

        setFiles((prev) => [...prev, newImage]);
      };
      reader.readAsDataURL(file);
    });
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
        `Target size must be smaller than ${smallestOriginalSizeKB} KB (smallest uploaded image).`
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
                outputName: null,
                targetSizeKB,
              }
            : item
        )
      );

      try {
        const queueResult = await queueJpegCompression(file.file, targetSizeKB, quality);
        await pollJobUntilDone(queueResult.jobId);
        const downloadInfo = await getJobDownloadInfo(queueResult.jobId);

        setFiles((prev) =>
          prev.map((item) =>
            item.id === file.id
              ? {
                  ...item,
                  status: 'completed',
                  compressedSize: downloadInfo.outputSize,
                  downloadUrl: downloadInfo.downloadUrl,
                  outputName: downloadInfo.fileName || file.name,
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
                  outputName: null,
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

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 KB';
    return (bytes / 1024).toFixed(1) + ' KB';
  };

  const getReductionPercentage = (original: number, compressed: number) => {
    if (!compressed || compressed >= original) return 0;
    return Math.round(((original - compressed) / original) * 100);
  };

  const previewTargetSizeKB = targetSizeInput ? Number.parseInt(targetSizeInput, 10) : null;

  const handleDownload = (file: CompressedImage) => {
    if (!file.downloadUrl) {
      return;
    }

    startFileDownload(file.downloadUrl, file.outputName || file.name);
  };

  const downloadZip = async (completedFiles: CompressedImage[]) => {
    const zip = new JSZip();
    const zipFolder = zip.folder('compressed-images');

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
        const fallbackName = `compressed-image-${index + 1}.img`;
        const zipName = createUniqueZipFileName(
          file.outputName || file.name || fallbackName,
          usedNames
        );
        zipFolder.file(zipName, outputBlob);
      })
    );

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    triggerBlobDownload(zipBlob, `compressed-images-${timestamp}.zip`);
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
                <ImageIcon className="w-10 h-10 text-violet" />
              </div>
              <h3 className="font-display font-bold text-2xl text-dark text-center mb-2">
                Drop image files here
              </h3>
              <p className="text-gray text-center mb-6">
                All image formats supported
              </p>
              <label className="sticker-button cursor-pointer">
                <span>Select Images</span>
                <input
                  type="file"
                  accept="image/*"
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Quality Slider */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="font-display font-bold text-dark">
                        Quality
                      </label>
                      <span className="sticker-label bg-violet text-white border-violet">
                        {quality}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="100"
                      value={quality}
                      onChange={(e) => setQuality(Number(e.target.value))}
                      className="w-full h-3 bg-gray-200 rounded-full appearance-none cursor-pointer accent-violet"
                      disabled={isCompressing}
                    />
                  </div>

                  {/* Target Size Input */}
                  <div>
                    <label className="font-display font-bold text-dark block mb-3">
                      Enter Target Size (KB)
                    </label>
                    <div className="flex items-center gap-2">
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
                      <span className="text-gray text-sm">KB</span>
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <div className="text-sm text-red-500">
                    {inputError || requestError}
                  </div>
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
              </div>

              {/* Image Cards */}
              <div
                className={
                  files.length === 1
                    ? 'flex justify-center'
                    : 'grid grid-cols-1 md:grid-cols-2 gap-4'
                }
              >
                {files.map((file) => (
                  <motion.div
                    key={file.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className={`sticker-card overflow-hidden ${
                      files.length === 1 ? 'w-full md:w-[520px]' : ''
                    }`}
                  >
                    {/* Preview */}
                    <div className="relative aspect-video bg-gray-100 overflow-hidden">
                      <img
                        src={file.preview}
                        alt={file.name}
                        className="w-full h-full object-cover"
                      />
                      <button
                        onClick={() => {
                          setSelectedPreview(file.preview);
                          setShowPreview(true);
                        }}
                        className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
                      >
                        <Eye className="w-8 h-8 text-white" />
                      </button>
                    </div>

                    {/* Info */}
                    <div className="p-4">
                      <p className="font-medium text-dark truncate mb-2">
                        {file.name}
                      </p>
                      {(file.targetSizeKB || previewTargetSizeKB) ? (
                        <p className="text-xs text-gray mb-2">
                          Target: {file.targetSizeKB || previewTargetSizeKB} KB
                        </p>
                      ) : null}
                      <div className="flex items-center justify-between">
                        <div className="text-sm">
                          <span className="text-gray">{formatSize(file.originalSize)}</span>
                          {file.status === 'completed' && (
                            <>
                              <span className="mx-2 text-gray">-&gt;</span>
                              <span className="text-pink font-medium">
                                {formatSize(file.compressedSize)}
                              </span>
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {file.status === 'completed' ? (
                            <>
                              <span className="sticker-label bg-green-500 text-white border-green-500 text-[10px]">
                                {getReductionPercentage(file.originalSize, file.compressedSize)}%
                              </span>
                              <button
                                onClick={() => handleDownload(file)}
                                className="w-8 h-8 bg-violet/10 hover:bg-violet/20 rounded-lg flex items-center justify-center"
                              >
                                <Download className="w-4 h-4 text-violet" />
                              </button>
                            </>
                          ) : file.status === 'processing' ? (
                            <Loader2 className="w-4 h-4 text-violet animate-spin" />
                          ) : file.status === 'error' ? (
                            <AlertCircle className="w-4 h-4 text-red-500" />
                          ) : (
                            <span className="text-xs text-gray">Ready</span>
                          )}
                          <button
                            onClick={() => removeFile(file.id)}
                            className="w-8 h-8 bg-gray-100 hover:bg-red-100 rounded-lg flex items-center justify-center"
                          >
                            <X className="w-4 h-4 text-gray hover:text-red-500" />
                          </button>
                        </div>
                      </div>
                      {file.status === 'error' && (
                        <p className="text-xs text-red-500 mt-2">{file.error || 'Compression failed'}</p>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between">
                <label className="sticker-button-secondary cursor-pointer">
                  <Upload className="w-4 h-4 mr-2" />
                  <span>Add More</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFileInput}
                    className="hidden"
                  />
                </label>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Preview Modal */}
        <AnimatePresence>
          {showPreview && selectedPreview && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPreview(false)}
              className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
            >
              <motion.img
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.9 }}
                src={selectedPreview}
                alt="Preview"
                className="max-w-full max-h-full rounded-xl"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
