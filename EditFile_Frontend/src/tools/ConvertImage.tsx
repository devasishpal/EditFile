import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  X,
  Download,
  RefreshCw,
  Loader2,
  AlertCircle,
  Check,
} from 'lucide-react';
import {
  convertImageFile,
  downloadProcessedAsset,
  isSupportedToolImage,
  revokePreviewUrl,
  type ProcessedAsset,
} from '@/lib/imageToolApi';
import { runWithConcurrency } from '@/lib/concurrency';

type TargetFormat = 'jpg' | 'png' | 'webp';

interface ConvertedImage {
  id: string;
  file: File;
  name: string;
  preview: string;
  sourceFormat: string;
  status: 'ready' | 'processing' | 'completed' | 'error';
  result: ProcessedAsset | null;
  error?: string;
}

const formats: Array<{ value: TargetFormat; label: string; desc: string }> = [
  { value: 'jpg', label: 'JPG', desc: 'Best for photos' },
  { value: 'png', label: 'PNG', desc: 'Best for transparency' },
  { value: 'webp', label: 'WebP', desc: 'Best for web' },
];

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
const MAX_PARALLEL_CONVERSIONS = 3;
const createId = () => Math.random().toString(36).slice(2, 11);

const getImageFormatLabel = (file: File) => {
  const mimeFormat = file.type.split('/')[1];
  if (mimeFormat) {
    return mimeFormat.replace('jpeg', 'jpg').toUpperCase();
  }

  const extension = file.name.split('.').pop();
  return (extension || 'IMG').replace('jpeg', 'jpg').toUpperCase();
};

export default function ConvertImage() {
  const [files, setFiles] = useState<ConvertedImage[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [targetFormat, setTargetFormat] = useState<TargetFormat>('jpg');
  const [isConverting, setIsConverting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  const filesRef = useRef<ConvertedImage[]>([]);

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  useEffect(() => {
    return () => {
      filesRef.current.forEach((file) => {
        revokePreviewUrl(file.preview);
        revokePreviewUrl(file.result?.previewUrl);
      });
    };
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFiles = useCallback((incomingFiles: File[]) => {
    const supportedFiles = incomingFiles.filter(isSupportedToolImage);

    if (supportedFiles.length === 0) {
      setRequestError('Please upload JPG, JPEG, PNG, or WEBP images.');
      return;
    }

    const oversized = supportedFiles.find((file) => file.size > MAX_FILE_SIZE_BYTES);
    if (oversized) {
      setRequestError('Maximum file size is 20MB per image.');
      return;
    }

    setRequestError(null);
    setFiles((prev) => [
      ...prev,
      ...supportedFiles.map((file) => ({
        id: createId(),
        file,
        name: file.name,
        preview: URL.createObjectURL(file),
        sourceFormat: getImageFormatLabel(file),
        status: 'ready' as const,
        result: null,
      })),
    ]);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      handleFiles(Array.from(e.dataTransfer.files));
    },
    [handleFiles]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFiles(Array.from(e.target.files || []));
      e.target.value = '';
    },
    [handleFiles]
  );

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const target = prev.find((entry) => entry.id === id);
      if (target) {
        revokePreviewUrl(target.preview);
        revokePreviewUrl(target.result?.previewUrl);
      }
      return prev.filter((entry) => entry.id !== id);
    });
  };

  const handleTargetFormatChange = (nextFormat: TargetFormat) => {
    setTargetFormat(nextFormat);
    setRequestError(null);
    setFiles((prev) =>
      prev.map((entry) => {
        if (entry.result?.previewUrl) {
          revokePreviewUrl(entry.result.previewUrl);
        }

        return {
          ...entry,
          status: 'ready',
          result: null,
          error: undefined,
        };
      })
    );
  };

  const handleConvertAll = async () => {
    if (files.length === 0 || isConverting) {
      return;
    }

    setRequestError(null);
    setIsConverting(true);

    const filesToProcess = files.map((entry) => ({ id: entry.id, file: entry.file }));

    await runWithConcurrency(filesToProcess, MAX_PARALLEL_CONVERSIONS, async (item) => {
      setFiles((prev) =>
        prev.map((entry) =>
          entry.id === item.id
            ? {
                ...entry,
                status: 'processing',
                result: null,
                error: undefined,
              }
            : entry
        )
      );

      try {
        const processed = await convertImageFile(item.file, targetFormat);

        setFiles((prev) =>
          prev.map((entry) => {
            if (entry.id !== item.id) {
              return entry;
            }

            if (entry.result?.previewUrl) {
              revokePreviewUrl(entry.result.previewUrl);
            }

            return {
              ...entry,
              status: 'completed',
              result: processed,
              error: undefined,
            };
          })
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Image conversion failed';
        setRequestError(message);
        setFiles((prev) =>
          prev.map((entry) =>
            entry.id === item.id
              ? {
                  ...entry,
                  status: 'error',
                  result: null,
                  error: message,
                }
              : entry
          )
        );
      }
    });

    setIsConverting(false);
  };

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
                <RefreshCw className="w-8 h-8 sm:w-10 sm:h-10 text-violet" />
              </div>
              <h3 className="font-display font-bold text-xl sm:text-2xl text-dark text-center mb-2">
                Drop images to convert
              </h3>
              <p className="text-gray text-center mb-6">
                Convert between JPG, PNG, and WebP
              </p>
              <label className="sticker-button cursor-pointer">
                <span>Select Images</span>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
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
                <label className="font-display font-bold text-dark block mb-4">
                  Convert To
                </label>
                <div className="grid grid-cols-1 min-[480px]:grid-cols-2 sm:grid-cols-3 gap-3">
                  {formats.map((format) => (
                    <button
                      key={format.value}
                      onClick={() => handleTargetFormatChange(format.value)}
                      disabled={isConverting}
                      className={`p-4 rounded-xl border-2 text-center transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                        targetFormat === format.value
                          ? 'bg-violet text-white border-violet'
                          : 'bg-white text-dark border-gray-200 hover:border-violet'
                      }`}
                    >
                      <p className="font-display font-bold">{format.label}</p>
                      <p
                        className={`text-xs mt-1 ${
                          targetFormat === format.value ? 'text-white/70' : 'text-gray'
                        }`}
                      >
                        {format.desc}
                      </p>
                    </button>
                  ))}
                </div>
                {requestError && <p className="text-sm text-red-500 mt-4">{requestError}</p>}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {files.map((file) => (
                  <motion.div
                    key={file.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="sticker-card overflow-hidden"
                  >
                    <div className="relative aspect-video bg-gray-100 overflow-hidden">
                      <img
                        src={file.result?.previewUrl || file.preview}
                        alt={file.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="p-4">
                      <p className="font-medium text-dark truncate mb-2">{file.name}</p>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="sticker-label text-[10px]">{file.sourceFormat}</span>
                          <span className="text-gray">-&gt;</span>
                          <span className="sticker-label bg-violet text-white border-violet text-[10px]">
                            {targetFormat.toUpperCase()}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {file.status === 'processing' && (
                            <Loader2 className="w-4 h-4 text-violet animate-spin" />
                          )}
                          {file.status === 'completed' && (
                            <Check className="w-4 h-4 text-green-600" />
                          )}
                          {file.status === 'error' && (
                            <AlertCircle className="w-4 h-4 text-red-500" />
                          )}
                          <button
                            onClick={() => file.result && downloadProcessedAsset(file.result)}
                            disabled={!file.result}
                            className="w-8 h-8 bg-violet/10 hover:bg-violet/20 rounded-lg flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Download className="w-4 h-4 text-violet" />
                          </button>
                          <button
                            onClick={() => removeFile(file.id)}
                            className="w-8 h-8 bg-gray-100 hover:bg-red-100 rounded-lg flex items-center justify-center"
                          >
                            <X className="w-4 h-4 text-gray hover:text-red-500" />
                          </button>
                        </div>
                      </div>
                      {file.error && <p className="text-xs text-red-500 mt-2">{file.error}</p>}
                    </div>
                  </motion.div>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="sticker-button-secondary cursor-pointer">
                  <Upload className="w-4 h-4 mr-2" />
                  <span>Add More</span>
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                    multiple
                    onChange={handleFileInput}
                    className="hidden"
                  />
                </label>

                <button
                  onClick={() => void handleConvertAll()}
                  disabled={isConverting || files.length === 0}
                  className="sticker-button disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isConverting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Converting...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 mr-2" />
                      Convert All
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

