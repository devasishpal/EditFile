import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, X, Download, Wand2, Check, Loader2, AlertCircle } from 'lucide-react';
import {
  downloadProcessedAsset,
  isSupportedToolImage,
  removeImageBackground,
  revokePreviewUrl,
  type ProcessedAsset,
} from '@/lib/imageToolApi';
import { runWithConcurrency } from '@/lib/concurrency';

type BackgroundMode = 'transparent' | 'color';

interface ProcessedImage {
  id: string;
  name: string;
  original: string;
  status: 'processing' | 'completed' | 'error';
  result: ProcessedAsset | null;
  backgroundMode: BackgroundMode;
  backgroundColor: string;
  error?: string;
}

const createId = () => Math.random().toString(36).slice(2, 11);
const DEFAULT_BACKGROUND_COLOR = '#ffffff';
const MAX_PARALLEL_REMOVALS = 3;
const CHECKERBOARD_BACKGROUND_CLASS =
  "bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+PHJlY3Qgd2lkdGg9IjEwIiBoZWlnaHQ9IjEwIiBmaWxsPSIjZjBmMGYwIi8+PHJlY3QgeD0iMTAiIHk9IjEwIiB3aWR0aD0iMTAiIGhlaWdodD0iMTAiIGZpbGw9IiNmMGYwZjAiLz48cmVjdCB4PSIxMCIgd2lkdGg9IjEwIiBoZWlnaHQ9IjEwIiBmaWxsPSIjZmZmIi8+PHJlY3QgeT0iMTAiIHdpZHRoPSIxMCIgaGVpZ2h0PSIxMCIgZmlsbD0iI2ZmZiIvPjwvc3ZnPg==')]";

const canvasToPngBlob = (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Unable to create image with background color'));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });

const composeImageWithBackgroundColor = async (
  sourceBlob: Blob,
  backgroundColor: string
): Promise<Blob> => {
  const sourceUrl = URL.createObjectURL(sourceBlob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const instance = new Image();
      instance.onload = () => resolve(instance);
      instance.onerror = () => reject(new Error('Unable to load processed image'));
      instance.src = sourceUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Unable to apply background color');
    }

    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    return canvasToPngBlob(canvas);
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
};

const getColoredDownloadName = (fileName: string) => {
  const baseName = fileName.replace(/\.[^.]+$/, '');
  return `${baseName}-bg.png`;
};

export default function RemoveBackground() {
  const [files, setFiles] = useState<ProcessedImage[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const fileRef = useRef<ProcessedImage[]>([]);

  useEffect(() => {
    fileRef.current = files;
  }, [files]);

  useEffect(() => {
    return () => {
      fileRef.current.forEach((file) => {
        revokePreviewUrl(file.original);
        revokePreviewUrl(file.result?.previewUrl);
      });
    };
  }, []);

  const processFile = useCallback(async (id: string, file: File) => {
    try {
      const processed = await removeImageBackground(file, 20);

      setFiles((prev) =>
        prev.map((entry) => {
          if (entry.id !== id) {
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
      const message = error instanceof Error ? error.message : 'Background removal failed';
      setRequestError(message);
      setFiles((prev) =>
        prev.map((entry) =>
          entry.id === id
            ? {
                ...entry,
                status: 'error',
                error: message,
                result: null,
              }
            : entry
        )
      );
    }
  }, []);

  const handleFiles = useCallback(
    (incomingFiles: File[]) => {
      const supportedFiles = incomingFiles.filter(isSupportedToolImage);

      if (supportedFiles.length === 0) {
        setRequestError('Please upload JPG, JPEG, PNG, or WEBP images.');
        return;
      }

      setRequestError(null);

      const nextEntries = supportedFiles.map((file) => ({
        id: createId(),
        name: file.name,
        original: URL.createObjectURL(file),
        status: 'processing' as const,
        result: null,
        backgroundMode: 'transparent' as const,
        backgroundColor: DEFAULT_BACKGROUND_COLOR,
      }));

      setFiles((prev) => [...prev, ...nextEntries]);

      void runWithConcurrency(nextEntries, MAX_PARALLEL_REMOVALS, async (entry, index) => {
        const sourceFile = supportedFiles[index];
        if (sourceFile) {
          await processFile(entry.id, sourceFile);
        }
      });
    },
    [processFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
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
      const target = prev.find((file) => file.id === id);
      if (target) {
        revokePreviewUrl(target.original);
        revokePreviewUrl(target.result?.previewUrl);
      }
      return prev.filter((file) => file.id !== id);
    });
  };

  const updateBackgroundMode = useCallback((id: string, mode: BackgroundMode) => {
    setFiles((prev) =>
      prev.map((entry) => (entry.id === id ? { ...entry, backgroundMode: mode } : entry))
    );
  }, []);

  const updateBackgroundColor = useCallback((id: string, color: string) => {
    setFiles((prev) =>
      prev.map((entry) => (entry.id === id ? { ...entry, backgroundColor: color } : entry))
    );
  }, []);

  const handleDownload = useCallback(async (file: ProcessedImage) => {
    if (!file.result) {
      return;
    }

    if (file.backgroundMode === 'transparent') {
      downloadProcessedAsset(file.result);
      return;
    }

    try {
      const composedBlob = await composeImageWithBackgroundColor(
        file.result.blob,
        file.backgroundColor
      );

      downloadProcessedAsset({
        ...file.result,
        blob: composedBlob,
        fileName: getColoredDownloadName(file.name),
        contentType: 'image/png',
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to apply selected background color';
      setRequestError(message);
    }
  }, []);

  return (
    <div className="w-full px-4 lg:px-6 py-8">
      <div className="max-w-4xl mx-auto">
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
                <Wand2 className="w-10 h-10 text-violet" />
              </div>
              <h3 className="font-display font-bold text-2xl text-dark text-center mb-2">
                Remove Background With EditFile
              </h3>
              <p className="text-gray text-center mb-6">Upload an image and process it instantly</p>
              <label className="sticker-button cursor-pointer">
                <span>Select Image</span>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
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
              {requestError && (
                <div className="sticker-card p-4 text-sm text-red-500 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  {requestError}
                </div>
              )}

              <div className="grid grid-cols-1 gap-4">
                {files.map((file) => (
                  <motion.div
                    key={file.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="sticker-card p-6"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <p className="font-display font-bold text-dark mb-3">Original</p>
                        <div className="relative aspect-square bg-gray-100 rounded-xl overflow-hidden">
                          <img src={file.original} alt="Original" className="w-full h-full object-cover" />
                        </div>
                      </div>

                      <div>
                        <p className="font-display font-bold text-dark mb-3 flex items-center gap-2">
                          Result
                          {file.status === 'processing' && (
                            <span className="sticker-label bg-violet text-white border-violet text-[10px]">
                              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              Processing...
                            </span>
                          )}
                          {file.status === 'completed' && (
                            <span className="sticker-label bg-green-500 text-white border-green-500 text-[10px]">
                              <Check className="w-3 h-3 mr-1" />
                              Done
                            </span>
                          )}
                          {file.status === 'error' && (
                            <span className="sticker-label bg-red-500 text-white border-red-500 text-[10px]">
                              <AlertCircle className="w-3 h-3 mr-1" />
                              Failed
                            </span>
                          )}
                        </p>
                        <div
                          className={`relative aspect-square rounded-xl overflow-hidden ${
                            file.backgroundMode === 'transparent'
                              ? CHECKERBOARD_BACKGROUND_CLASS
                              : ''
                          }`}
                          style={
                            file.backgroundMode === 'color'
                              ? { backgroundColor: file.backgroundColor }
                              : undefined
                          }
                        >
                          {file.status === 'completed' && file.result ? (
                            <img src={file.result.previewUrl} alt="Result" className="w-full h-full object-cover" />
                          ) : file.status === 'error' ? (
                            <div className="w-full h-full flex items-center justify-center text-center px-4">
                              <p className="text-red-500 text-sm">{file.error || 'Unable to process this file'}</p>
                            </div>
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <div className="text-center">
                                <Loader2 className="w-10 h-10 text-violet animate-spin mx-auto mb-2" />
                                <p className="text-gray text-sm">Removing background...</p>
                              </div>
                            </div>
                          )}
                        </div>

                        {file.status === 'completed' && file.result && (
                          <div className="flex items-center gap-2 mt-3">
                            <button
                              onClick={() => updateBackgroundMode(file.id, 'transparent')}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                                file.backgroundMode === 'transparent'
                                  ? 'bg-violet text-white border-violet'
                                  : 'bg-white text-gray border-gray-300 hover:border-violet'
                              }`}
                            >
                              Transparent
                            </button>
                            <button
                              onClick={() => updateBackgroundMode(file.id, 'color')}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                                file.backgroundMode === 'color'
                                  ? 'bg-violet text-white border-violet'
                                  : 'bg-white text-gray border-gray-300 hover:border-violet'
                              }`}
                            >
                              Color
                            </button>
                            {file.backgroundMode === 'color' && (
                              <input
                                type="color"
                                value={file.backgroundColor}
                                onChange={(event) =>
                                  updateBackgroundColor(file.id, event.target.value)
                                }
                                className="w-10 h-10 p-1 bg-white border border-gray-300 rounded-lg cursor-pointer"
                                aria-label="Pick background color"
                              />
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
                      <p className="font-medium text-dark truncate pr-4">{file.name}</p>
                      <div className="flex items-center gap-2">
                        {file.status === 'completed' && file.result && (
                          <button
                            onClick={() => void handleDownload(file)}
                            className="sticker-button py-2 px-4"
                          >
                            <Download className="w-4 h-4 mr-2" />
                            Download
                          </button>
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
              </div>

              <div className="flex items-center justify-center">
                <label className="sticker-button-secondary cursor-pointer">
                  <Upload className="w-4 h-4 mr-2" />
                  <span>Process Another Image</span>
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                    onChange={handleFileInput}
                    className="hidden"
                  />
                </label>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
