import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Crop as CropIcon, Download, Loader2, Upload, X } from 'lucide-react';
import Cropper from 'cropperjs';
import 'cropperjs/dist/cropper.css';
import {
  cropImageFile,
  downloadProcessedAsset,
  isSupportedToolImage,
  type ProcessedAsset,
  revokePreviewUrl,
} from '@/lib/imageToolApi';

interface Dimensions {
  width: number;
  height: number;
}

interface CropSelection {
  x: number;
  y: number;
  width: number;
  height: number;
}

const EMPTY_SELECTION: CropSelection = {
  x: 0,
  y: 0,
  width: 0,
  height: 0,
};

const toFiniteInt = (value: number, fallback: number) => {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.round(value);
};

const getElementCropper = (imageElement: HTMLImageElement | null): Cropper | null => {
  if (!imageElement) {
    return null;
  }

  const cropperElement = imageElement as HTMLImageElement & { cropper?: Cropper };
  return cropperElement.cropper || null;
};

const normalizeCropSelection = (cropper: Cropper): CropSelection => {
  const data = cropper.getData(true);
  const imageData = cropper.getImageData();
  const imageWidth = Math.max(
    1,
    toFiniteInt(imageData.naturalWidth, toFiniteInt(data.width, 1))
  );
  const imageHeight = Math.max(
    1,
    toFiniteInt(imageData.naturalHeight, toFiniteInt(data.height, 1))
  );
  const x = Math.min(Math.max(0, toFiniteInt(data.x, 0)), imageWidth - 1);
  const y = Math.min(Math.max(0, toFiniteInt(data.y, 0)), imageHeight - 1);
  const width = Math.max(
    1,
    Math.min(toFiniteInt(data.width, imageWidth), imageWidth - x)
  );
  const height = Math.max(
    1,
    Math.min(toFiniteInt(data.height, imageHeight), imageHeight - y)
  );

  return {
    x,
    y,
    width,
    height,
  };
};

export default function CropImage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [originalPreview, setOriginalPreview] = useState<string | null>(null);
  const [result, setResult] = useState<ProcessedAsset | null>(null);
  const [dimensions, setDimensions] = useState<Dimensions | null>(null);
  const [cropSelection, setCropSelection] = useState<CropSelection>(EMPTY_SELECTION);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const originalPreviewRef = useRef<string | null>(null);
  const resultPreviewRef = useRef<string | null>(null);
  const cropperRef = useRef<Cropper | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const initialSyncTimeoutRef = useRef<number | null>(null);
  const pendingPreviewRef = useRef<string | null>(null);

  const syncSelectionFromCropper = useCallback((cropper: Cropper | null) => {
    if (!cropper) {
      return;
    }

    const nextSelection = normalizeCropSelection(cropper);
    setCropSelection((previousSelection) => {
      if (
        previousSelection.x === nextSelection.x &&
        previousSelection.y === nextSelection.y &&
        previousSelection.width === nextSelection.width &&
        previousSelection.height === nextSelection.height
      ) {
        return previousSelection;
      }

      return nextSelection;
    });
  }, []);

  useEffect(() => {
    originalPreviewRef.current = originalPreview;
  }, [originalPreview]);

  useEffect(() => {
    resultPreviewRef.current = result?.previewUrl || null;
  }, [result]);

  useEffect(() => {
    return () => {
      if (initialSyncTimeoutRef.current !== null) {
        window.clearTimeout(initialSyncTimeoutRef.current);
      }
      revokePreviewUrl(pendingPreviewRef.current);
      cropperRef.current?.destroy();
      cropperRef.current = null;
      revokePreviewUrl(originalPreviewRef.current);
      revokePreviewUrl(resultPreviewRef.current);
    };
  }, []);

  useEffect(() => {
    const imageElement = imageRef.current;
    if (!imageElement || !originalPreview) {
      if (initialSyncTimeoutRef.current !== null) {
        window.clearTimeout(initialSyncTimeoutRef.current);
        initialSyncTimeoutRef.current = null;
      }
      cropperRef.current?.destroy();
      cropperRef.current = null;
      return;
    }

    const readAndSyncDimensions = () => {
      const activeCropper = getElementCropper(imageElement) || cropperRef.current;
      if (!activeCropper) {
        return;
      }

      const imageData = activeCropper.getImageData();
      setDimensions({
        width: Math.max(1, toFiniteInt(imageData.naturalWidth, 1)),
        height: Math.max(1, toFiniteInt(imageData.naturalHeight, 1)),
      });
      syncSelectionFromCropper(activeCropper);
    };

    const cropper = new Cropper(imageElement, {
      viewMode: 1,
      dragMode: 'move',
      movable: true,
      cropBoxMovable: true,
      cropBoxResizable: true,
      minCropBoxWidth: 24,
      minCropBoxHeight: 24,
      responsive: true,
      autoCrop: true,
      autoCropArea: 1,
      guides: true,
      center: true,
      background: false,
      zoomable: true,
      zoomOnWheel: true,
      zoomOnTouch: true,
      scalable: false,
      rotatable: false,
      ready: () => {
        readAndSyncDimensions();
      },
      crop: () => {
        const activeCropper = getElementCropper(imageElement) || cropperRef.current;
        syncSelectionFromCropper(activeCropper);
      },
    });

    cropperRef.current = cropper;
    initialSyncTimeoutRef.current = window.setTimeout(() => {
      readAndSyncDimensions();
      initialSyncTimeoutRef.current = null;
    }, 0);

    return () => {
      if (initialSyncTimeoutRef.current !== null) {
        window.clearTimeout(initialSyncTimeoutRef.current);
        initialSyncTimeoutRef.current = null;
      }
      cropper.destroy();
      if (cropperRef.current === cropper) {
        cropperRef.current = null;
      }
    };
  }, [originalPreview, syncSelectionFromCropper]);

  const resetTool = useCallback(() => {
    cropperRef.current?.destroy();
    cropperRef.current = null;
    revokePreviewUrl(originalPreview);
    revokePreviewUrl(result?.previewUrl);
    setSelectedFile(null);
    setOriginalPreview(null);
    setResult(null);
    setDimensions(null);
    setCropSelection(EMPTY_SELECTION);
    setError(null);
    setIsProcessing(false);
  }, [originalPreview, result]);

  const handleSelectFiles = useCallback(
    (files: File[]) => {
      const imageFile = files.find(isSupportedToolImage);

      if (!imageFile) {
        setError('Please upload a JPG, JPEG, PNG, or WEBP image.');
        return;
      }

      setError(null);
      revokePreviewUrl(pendingPreviewRef.current);
      pendingPreviewRef.current = null;

      const previewUrl = URL.createObjectURL(imageFile);
      pendingPreviewRef.current = previewUrl;
      const img = new Image();
      img.onload = () => {
        if (pendingPreviewRef.current !== previewUrl) {
          revokePreviewUrl(previewUrl);
          return;
        }

        pendingPreviewRef.current = null;
        const width = Math.max(1, Math.round(img.width));
        const height = Math.max(1, Math.round(img.height));
        revokePreviewUrl(originalPreview);
        revokePreviewUrl(result?.previewUrl);
        setDimensions({ width, height });
        setSelectedFile(imageFile);
        setOriginalPreview(previewUrl);
        setResult(null);
        setCropSelection(EMPTY_SELECTION);
        setIsProcessing(false);
      };
      img.onerror = () => {
        if (pendingPreviewRef.current === previewUrl) {
          pendingPreviewRef.current = null;
        }
        revokePreviewUrl(previewUrl);
        setError('Unable to read image dimensions.');
      };
      img.src = previewUrl;
    },
    [originalPreview, result]
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
      handleSelectFiles(Array.from(e.dataTransfer.files));
    },
    [handleSelectFiles]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleSelectFiles(Array.from(e.target.files || []));
      e.target.value = '';
    },
    [handleSelectFiles]
  );

  const handleCrop = async () => {
    if (isProcessing) {
      return;
    }

    if (!selectedFile) {
      setError('Please upload an image before cropping.');
      return;
    }

    const activeSelection = cropperRef.current
      ? normalizeCropSelection(cropperRef.current)
      : cropSelection;

    if (
      activeSelection.width < 1 ||
      activeSelection.height < 1 ||
      activeSelection.x < 0 ||
      activeSelection.y < 0
    ) {
      setError('Crop values must be valid positive numbers.');
      return;
    }

    if (
      dimensions &&
      (
        activeSelection.x + activeSelection.width > dimensions.width ||
        activeSelection.y + activeSelection.height > dimensions.height
      )
    ) {
      setError('Crop area exceeds image boundaries.');
      return;
    }

    setError(null);
    setCropSelection(activeSelection);
    setIsProcessing(true);

    try {
      const nextResult = await cropImageFile(selectedFile, {
        x: activeSelection.x,
        y: activeSelection.y,
        width: activeSelection.width,
        height: activeSelection.height,
      });

      revokePreviewUrl(result?.previewUrl);
      setResult(nextResult);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Crop failed');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="w-full px-3 sm:px-4 lg:px-6 py-8 overflow-x-clip">
      <div className="max-w-4xl mx-auto">
        {!selectedFile && (
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
                <CropIcon className="w-8 h-8 sm:w-10 sm:h-10 text-violet" />
              </div>
              <h3 className="font-display font-bold text-xl sm:text-2xl text-dark text-center mb-2">
                Drop image to crop
              </h3>
              <p className="text-gray text-center mb-6">JPG, JPEG, PNG, WEBP supported</p>
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

        {selectedFile && originalPreview && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <div className="sticker-card p-6">
              <div className="grid grid-cols-1 min-[480px]:grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="font-display font-bold text-dark block mb-2">X</label>
                  <input
                    type="number"
                    min={0}
                    value={cropSelection.x}
                    readOnly
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-violet focus:outline-none"
                    disabled={isProcessing}
                  />
                </div>
                <div>
                  <label className="font-display font-bold text-dark block mb-2">Y</label>
                  <input
                    type="number"
                    min={0}
                    value={cropSelection.y}
                    readOnly
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-violet focus:outline-none"
                    disabled={isProcessing}
                  />
                </div>
                <div>
                  <label className="font-display font-bold text-dark block mb-2">Width</label>
                  <input
                    type="number"
                    min={1}
                    value={cropSelection.width}
                    readOnly
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-violet focus:outline-none"
                    disabled={isProcessing}
                  />
                </div>
                <div>
                  <label className="font-display font-bold text-dark block mb-2">Height</label>
                  <input
                    type="number"
                    min={1}
                    value={cropSelection.height}
                    readOnly
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-violet focus:outline-none"
                    disabled={isProcessing}
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-gray">
                  {dimensions ? `Image size: ${dimensions.width} x ${dimensions.height}` : 'Loading image dimensions...'}
                </div>
                <button
                  onClick={handleCrop}
                  disabled={isProcessing}
                  className="sticker-button disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Cropping...
                    </>
                  ) : (
                    'Crop Image'
                  )}
                </button>
              </div>

              {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="sticker-card overflow-hidden">
                <div className="relative h-[420px] sm:h-[460px] bg-gray-100 overflow-hidden cropper-editor">
                  <img
                    key={originalPreview}
                    ref={imageRef}
                    src={originalPreview}
                    alt="Original"
                    className="block max-w-full"
                  />
                </div>
                <div className="p-4">
                  <p className="font-medium text-dark truncate">{selectedFile.name}</p>
                  <p className="text-gray text-sm mt-1">Original</p>
                </div>
              </div>

              <div className="sticker-card overflow-hidden">
                <div className="relative h-[420px] sm:h-[460px] bg-gray-100 overflow-hidden flex items-center justify-center">
                  {result ? (
                    <img src={result.previewUrl} alt="Cropped" className="w-full h-full object-contain" />
                  ) : (
                    <div className="text-gray text-sm">{isProcessing ? 'Processing...' : 'Cropped preview will appear here'}</div>
                  )}
                </div>
                <div className="p-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="font-medium text-dark">Result</p>
                  {result && (
                    <button
                      onClick={() => downloadProcessedAsset(result)}
                      className="w-8 h-8 bg-violet/10 hover:bg-violet/20 rounded-lg flex items-center justify-center"
                    >
                      <Download className="w-4 h-4 text-violet" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="sticker-button-secondary cursor-pointer">
                <Upload className="w-4 h-4 mr-2" />
                <span>Choose Another Image</span>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                  onChange={handleFileInput}
                  className="hidden"
                />
              </label>

              <button
                onClick={resetTool}
                className="w-10 h-10 bg-gray-100 hover:bg-red-100 rounded-xl flex items-center justify-center transition-colors"
              >
                <X className="w-5 h-5 text-gray hover:text-red-500" />
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

