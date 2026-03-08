import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  X,
  Image as ImageIcon,
  Download,
  Lock,
  Unlock,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import {
  queueImageResize,
  pollJobUntilDone,
  getJobDownloadInfo,
  startFileDownload,
} from '@/lib/compressionApi';
import {
  downloadProcessedAsset,
  resizeImageFile,
  revokePreviewUrl,
  type ProcessedAsset,
} from '@/lib/imageToolApi';
import { runWithConcurrency } from '@/lib/concurrency';
import { isLocalApiTarget } from '@/lib/apiConfig';

type ResizeUnit = 'px' | 'percent';

interface ResizedImage {
  id: string;
  file: File;
  name: string;
  preview: string;
  originalWidth: number;
  originalHeight: number;
  newWidth: number;
  newHeight: number;
  status: 'ready' | 'processing' | 'completed' | 'error';
  downloadUrl: string | null;
  outputName: string | null;
  result: ProcessedAsset | null;
  error?: string;
}

const createFileId = () => Math.random().toString(36).slice(2, 11);
const MAX_PARALLEL_RESIZES = 3;

const clampPositiveInt = (value: number, min = 1, max = 10000) => {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
};

const normalizeInputValue = (value: number, unit: ResizeUnit) => {
  const max = unit === 'px' ? 10000 : 1000;
  return clampPositiveInt(value, 1, max);
};

const getTargetDimensions = ({
  originalWidth,
  originalHeight,
  widthInput,
  heightInput,
  unit,
  maintainAspectRatio,
}: {
  originalWidth: number;
  originalHeight: number;
  widthInput: number;
  heightInput: number;
  unit: ResizeUnit;
  maintainAspectRatio: boolean;
}) => {
  if (unit === 'percent') {
    const widthPercent = Math.max(1, widthInput);
    const heightPercent = Math.max(1, heightInput);
    const scaleWidth = widthPercent / 100;
    const scaleHeight = (maintainAspectRatio ? widthPercent : heightPercent) / 100;

    return {
      width: clampPositiveInt(originalWidth * scaleWidth),
      height: clampPositiveInt(originalHeight * scaleHeight),
    };
  }

  const requestedWidth = clampPositiveInt(widthInput);
  const requestedHeight = clampPositiveInt(heightInput);

  if (!maintainAspectRatio) {
    return { width: requestedWidth, height: requestedHeight };
  }

  const widthScale = requestedWidth / originalWidth;
  const heightScale = requestedHeight / originalHeight;
  const scale = Math.max(0.0001, Math.min(widthScale, heightScale));

  return {
    width: clampPositiveInt(originalWidth * scale),
    height: clampPositiveInt(originalHeight * scale),
  };
};

export default function ResizeImage() {
  const [files, setFiles] = useState<ResizedImage[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [width, setWidth] = useState(500);
  const [height, setHeight] = useState(281);
  const [maintainAspectRatio, setMaintainAspectRatio] = useState(true);
  const [unit, setUnit] = useState<ResizeUnit>('px');
  const [isResizing, setIsResizing] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const filesRef = useRef<ResizedImage[]>([]);

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  useEffect(() => {
    return () => {
      filesRef.current.forEach((file) => {
        revokePreviewUrl(file.result?.previewUrl);
      });
    };
  }, []);

  const handleFiles = useCallback(
    (newFiles: File[]) => {
      if (newFiles.length === 0) {
        return;
      }

      setRequestError(null);

      newFiles.forEach((file) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const image = new Image();
          image.onload = () => {
            const nextDimensions = getTargetDimensions({
              originalWidth: image.width,
              originalHeight: image.height,
              widthInput: width,
              heightInput: height,
              unit,
              maintainAspectRatio,
            });

            const newImage: ResizedImage = {
              id: createFileId(),
              file,
              name: file.name,
              preview: (event.target?.result as string) || '',
              originalWidth: image.width,
              originalHeight: image.height,
              newWidth: nextDimensions.width,
              newHeight: nextDimensions.height,
              status: 'ready',
              downloadUrl: null,
              outputName: null,
              result: null,
            };
            setFiles((prev) => [...prev, newImage]);
          };
          image.src = (event.target?.result as string) || '';
        };
        reader.readAsDataURL(file);
      });
    },
    [height, maintainAspectRatio, unit, width]
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
      const droppedFiles = Array.from(e.dataTransfer.files).filter((file) =>
        file.type.startsWith('image/')
      );
      handleFiles(droppedFiles);
    },
    [handleFiles]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(e.target.files || []).filter((file) =>
        file.type.startsWith('image/')
      );
      handleFiles(selectedFiles);
    },
    [handleFiles]
  );

  useEffect(() => {
    setFiles((prev) =>
      prev.map((file) => {
        if (file.status === 'processing') {
          return file;
        }

        const nextDimensions = getTargetDimensions({
          originalWidth: file.originalWidth,
          originalHeight: file.originalHeight,
          widthInput: width,
          heightInput: height,
          unit,
          maintainAspectRatio,
        });

        const shouldReset =
          file.status === 'completed' ||
          file.status === 'error' ||
          Boolean(file.downloadUrl) ||
          Boolean(file.result);

        if (shouldReset && file.result?.previewUrl) {
          revokePreviewUrl(file.result.previewUrl);
        }

        return {
          ...file,
          newWidth: nextDimensions.width,
          newHeight: nextDimensions.height,
          status: shouldReset ? 'ready' : file.status,
          downloadUrl: shouldReset ? null : file.downloadUrl,
          outputName: shouldReset ? null : file.outputName,
          result: shouldReset ? null : file.result,
          error: shouldReset ? undefined : file.error,
        };
      })
    );
  }, [height, maintainAspectRatio, unit, width]);

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const target = prev.find((file) => file.id === id);
      if (target?.result?.previewUrl) {
        revokePreviewUrl(target.result.previewUrl);
      }
      return prev.filter((f) => f.id !== id);
    });
  };

  const handleWidthChange = (value: number) => {
    const normalizedValue = normalizeInputValue(value, unit);

    if (maintainAspectRatio) {
      if (unit === 'percent') {
        setHeight(normalizedValue);
      } else if (files.length > 0) {
        const ratio = files[0].originalHeight / files[0].originalWidth;
        setHeight(clampPositiveInt(normalizedValue * ratio));
      } else {
        const currentRatio = height / width;
        setHeight(clampPositiveInt(normalizedValue * currentRatio));
      }
    }

    setWidth(normalizedValue);
  };

  const handleHeightChange = (value: number) => {
    const normalizedValue = normalizeInputValue(value, unit);

    if (maintainAspectRatio) {
      if (unit === 'percent') {
        setWidth(normalizedValue);
      } else if (files.length > 0) {
        const ratio = files[0].originalWidth / files[0].originalHeight;
        setWidth(clampPositiveInt(normalizedValue * ratio));
      } else {
        const currentRatio = width / height;
        setWidth(clampPositiveInt(normalizedValue * currentRatio));
      }
    }

    setHeight(normalizedValue);
  };

  const handleResize = async () => {
    if (files.length === 0 || isResizing) {
      return;
    }

    setRequestError(null);
    setIsResizing(true);

    const filesToProcess = files.filter((file) => file.status !== 'completed');
    await runWithConcurrency(filesToProcess, MAX_PARALLEL_RESIZES, async (file) => {
      const targetDimensions = getTargetDimensions({
        originalWidth: file.originalWidth,
        originalHeight: file.originalHeight,
        widthInput: width,
        heightInput: height,
        unit,
        maintainAspectRatio,
      });

      setFiles((prev) =>
        prev.map((item) => {
          if (item.id !== file.id) {
            return item;
          }

          if (item.result?.previewUrl) {
            revokePreviewUrl(item.result.previewUrl);
          }

          return {
            ...item,
            status: 'processing',
            error: undefined,
            downloadUrl: null,
            outputName: null,
            result: null,
            newWidth: targetDimensions.width,
            newHeight: targetDimensions.height,
          };
        })
      );

      try {
        let localResult: ProcessedAsset | null = null;
        let downloadUrl: string | null = null;
        let outputName: string | null = null;

        if (isLocalApiTarget) {
          try {
            localResult = await resizeImageFile(file.file, {
              width: targetDimensions.width,
              height: targetDimensions.height,
              maintainAspectRatio,
            });
          } catch (error) {
            const message = error instanceof Error ? error.message.toLowerCase() : '';
            const shouldFallbackToQueue =
              message.includes('endpoint not found') ||
              message.includes('failed to fetch') ||
              message.includes('not found');

            if (!shouldFallbackToQueue) {
              throw error;
            }
          }
        }

        if (!localResult) {
          const queueResult = await queueImageResize(file.file, {
            width: targetDimensions.width,
            height: targetDimensions.height,
            maintainAspectRatio,
          });

          await pollJobUntilDone(queueResult.jobId);
          const downloadInfo = await getJobDownloadInfo(queueResult.jobId);
          downloadUrl = downloadInfo.downloadUrl;
          outputName = downloadInfo.fileName || file.name;
        }

        setFiles((prev) =>
          prev.map((item) =>
            item.id === file.id
              ? {
                  ...item,
                  status: 'completed',
                  downloadUrl,
                  outputName,
                  result: localResult,
                  error: undefined,
                  newWidth: targetDimensions.width,
                  newHeight: targetDimensions.height,
                }
              : item
          )
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Resize failed';

        setFiles((prev) =>
          prev.map((item) =>
            item.id === file.id
              ? {
                  ...item,
                  status: 'error',
                  downloadUrl: null,
                  outputName: null,
                  result: null,
                  error: message,
                }
              : item
          )
        );
        setRequestError(message);
      }
    });

    setIsResizing(false);
  };

  const handleDownload = (file: ResizedImage) => {
    if (file.result) {
      downloadProcessedAsset(file.result);
      return;
    }

    if (!file.downloadUrl) {
      return;
    }

    startFileDownload(file.downloadUrl, file.outputName || file.name);
  };

  const handleDownloadAll = () => {
    const completedFiles = files.filter(
      (file) => file.status === 'completed' && (file.downloadUrl || file.result)
    );

    completedFiles.forEach((file) => {
      if (file.result) {
        downloadProcessedAsset(file.result);
      } else if (file.downloadUrl) {
        startFileDownload(file.downloadUrl, file.outputName || file.name);
      }
    });
  };

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
                <ImageIcon className="w-8 h-8 sm:w-10 sm:h-10 text-violet" />
              </div>
              <h3 className="font-display font-bold text-xl sm:text-2xl text-dark text-center mb-2">
                Drop images to resize
              </h3>
              <p className="text-gray text-center mb-6">JPG, PNG, WEBP supported</p>
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
              {/* Resize Settings */}
              <div className="sticker-card p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Unit Selection */}
                  <div>
                    <label className="font-display font-bold text-dark block mb-3">Unit</label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { value: 'px', label: 'Pixels' },
                        { value: 'percent', label: 'Percent' },
                      ].map((resizeUnit) => (
                        <button
                          key={resizeUnit.value}
                          onClick={() => setUnit(resizeUnit.value as ResizeUnit)}
                          disabled={isResizing}
                          className={`px-4 py-2 rounded-xl border-2 font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                            unit === resizeUnit.value
                              ? 'bg-violet text-white border-violet'
                              : 'bg-white text-dark border-gray-200 hover:border-violet'
                          }`}
                        >
                          {resizeUnit.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Aspect Ratio Lock */}
                  <div className="flex items-end">
                    <button
                      onClick={() => setMaintainAspectRatio((prev) => !prev)}
                      disabled={isResizing}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl border-2 font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                        maintainAspectRatio
                          ? 'bg-violet text-white border-violet'
                          : 'bg-white text-dark border-gray-200 hover:border-violet'
                      }`}
                    >
                      {maintainAspectRatio ? (
                        <Lock className="w-4 h-4" />
                      ) : (
                        <Unlock className="w-4 h-4" />
                      )}
                      Maintain Aspect Ratio
                    </button>
                  </div>

                  {/* Width */}
                  <div>
                    <label className="font-display font-bold text-dark block mb-2">
                      Width ({unit === 'px' ? 'px' : '%'})
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={unit === 'px' ? 10000 : 1000}
                      value={width}
                      onChange={(e) => handleWidthChange(Number(e.target.value))}
                      disabled={isResizing}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-violet focus:outline-none disabled:bg-gray-100 disabled:cursor-not-allowed"
                    />
                  </div>

                  {/* Height */}
                  <div>
                    <label className="font-display font-bold text-dark block mb-2">
                      Height ({unit === 'px' ? 'px' : '%'})
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={unit === 'px' ? 10000 : 1000}
                      value={height}
                      onChange={(e) => handleHeightChange(Number(e.target.value))}
                      disabled={isResizing}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-violet focus:outline-none disabled:bg-gray-100 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm text-red-500">{requestError}</div>
                  <button
                    onClick={handleResize}
                    disabled={isResizing || files.length === 0}
                    className="sticker-button disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isResizing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      'Start Processing'
                    )}
                  </button>
                </div>
              </div>

              {/* Image Cards */}
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
                      <img src={file.preview} alt={file.name} className="w-full h-full object-cover" />
                    </div>
                    <div className="p-4">
                      <p className="font-medium text-dark truncate mb-2">{file.name}</p>
                      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                        <span className="text-gray">
                          {file.originalWidth}x{file.originalHeight}
                        </span>
                        <span className="text-pink font-medium">
                          -&gt; {file.newWidth}x{file.newHeight}
                        </span>
                      </div>
                      <div className="mt-2 text-xs">
                        {file.status === 'ready' && <span className="text-gray">Ready</span>}
                        {file.status === 'processing' && (
                          <span className="inline-flex items-center text-violet">
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                            Processing
                          </span>
                        )}
                        {file.status === 'completed' && <span className="text-green-600">Completed</span>}
                        {file.status === 'error' && (
                          <span className="inline-flex items-center text-red-500">
                            <AlertCircle className="w-3 h-3 mr-1" />
                            {file.error || 'Resize failed'}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-end gap-2 mt-3">
                        <button
                          onClick={() => handleDownload(file)}
                          disabled={!file.downloadUrl && !file.result}
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
                  </motion.div>
                ))}
              </div>

              {/* Actions */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label
                  className={`sticker-button-secondary cursor-pointer ${
                    isResizing ? 'opacity-60 pointer-events-none' : ''
                  }`}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  <span>Add More</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFileInput}
                    disabled={isResizing}
                    className="hidden"
                  />
                </label>

                {files.some((file) => file.status === 'completed' && (file.downloadUrl || file.result)) && (
                  <button onClick={handleDownloadAll} className="sticker-button">
                    <Download className="w-4 h-4 mr-2" />
                    Download All
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}


