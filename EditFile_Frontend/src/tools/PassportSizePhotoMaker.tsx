import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Crop as CropIcon, Download, Loader2, Upload, X, Wand2 } from 'lucide-react';
import Cropper from 'cropperjs';
import 'cropperjs/dist/cropper.css';
import {
  convertToPassportPhotoFile,
  cropImageFile,
  downloadProcessedAsset,
  isSupportedToolImage,
  revokePreviewUrl,
  type ProcessedAsset,
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

interface CropSizeInput {
  width: string;
  height: string;
}

type BackgroundChoice = 'white' | 'light-blue' | 'light-gray' | 'custom';

const PASSPORT_WIDTH = 413;
const PASSPORT_HEIGHT = 531;
const ALPHA_THRESHOLD = 8;

const BACKGROUND_PRESETS: Array<{ id: Exclude<BackgroundChoice, 'custom'>; label: string; color: string }> = [
  { id: 'white', label: 'White', color: '#ffffff' },
  { id: 'light-blue', label: 'Light Blue', color: '#dcecff' },
  { id: 'light-gray', label: 'Light Gray', color: '#ececec' },
];

const EMPTY_SELECTION: CropSelection = {
  x: 0,
  y: 0,
  width: 0,
  height: 0,
};

const EMPTY_SIZE_INPUT: CropSizeInput = {
  width: '0',
  height: '0',
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

const getPassportDownloadName = (fileName: string) => {
  const baseName = fileName.replace(/\.[^.]+$/, '');
  return `${baseName}.png`;
};

const getExtensionFromMimeType = (mimeType: string) => {
  const normalized = String(mimeType || '').toLowerCase();
  if (normalized.includes('jpeg') || normalized.includes('jpg')) {
    return 'jpg';
  }
  if (normalized.includes('webp')) {
    return 'webp';
  }
  return 'png';
};

const canvasToPngBlob = (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Unable to create passport image'));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });

const getOpaqueBounds = (
  context: CanvasRenderingContext2D,
  width: number,
  height: number
) => {
  const { data } = context.getImageData(0, 0, width, height);

  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;

  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * width * 4;
    for (let x = 0; x < width; x += 1) {
      const alpha = data[rowOffset + x * 4 + 3];
      if (alpha <= ALPHA_THRESHOLD) {
        continue;
      }

      if (x < left) {
        left = x;
      }
      if (x > right) {
        right = x;
      }
      if (y < top) {
        top = y;
      }
      if (y > bottom) {
        bottom = y;
      }
    }
  }

  if (right < left || bottom < top) {
    return {
      left: 0,
      top: 0,
      width,
      height,
    };
  }

  return {
    left,
    top,
    width: right - left + 1,
    height: bottom - top + 1,
  };
};

const recomposePassportBottomCenter = async (
  sourceBlob: Blob,
  outputSize: Dimensions,
  backgroundColor?: string
): Promise<Blob> => {
  const sourceUrl = URL.createObjectURL(sourceBlob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const instance = new Image();
      instance.onload = () => resolve(instance);
      instance.onerror = () => reject(new Error('Unable to load passport image'));
      instance.src = sourceUrl;
    });

    const sourceWidth = Math.max(1, image.naturalWidth || image.width);
    const sourceHeight = Math.max(1, image.naturalHeight || image.height);
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = sourceWidth;
    sourceCanvas.height = sourceHeight;

    const sourceContext = sourceCanvas.getContext('2d');
    if (!sourceContext) {
      throw new Error('Unable to prepare passport image');
    }

    sourceContext.clearRect(0, 0, sourceWidth, sourceHeight);
    sourceContext.drawImage(image, 0, 0, sourceWidth, sourceHeight);
    const bounds = getOpaqueBounds(sourceContext, sourceWidth, sourceHeight);

    const canvas = document.createElement('canvas');
    canvas.width = outputSize.width;
    canvas.height = outputSize.height;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Unable to prepare passport output');
    }

    if (backgroundColor) {
      context.fillStyle = backgroundColor;
      context.fillRect(0, 0, outputSize.width, outputSize.height);
    } else {
      context.clearRect(0, 0, outputSize.width, outputSize.height);
    }

    const scale = Math.min(outputSize.width / bounds.width, outputSize.height / bounds.height);
    const drawWidth = Math.max(1, Math.round(bounds.width * scale));
    const drawHeight = Math.max(1, Math.round(bounds.height * scale));
    const drawX = Math.max(0, Math.floor((outputSize.width - drawWidth) / 2));
    const drawY = Math.max(0, outputSize.height - drawHeight);

    context.drawImage(
      sourceCanvas,
      bounds.left,
      bounds.top,
      bounds.width,
      bounds.height,
      drawX,
      drawY,
      drawWidth,
      drawHeight
    );

    return canvasToPngBlob(canvas);
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
};

const normalizePassportAsset = async (
  asset: ProcessedAsset,
  outputSize: Dimensions
): Promise<ProcessedAsset> => {
  const blob = await recomposePassportBottomCenter(asset.blob, outputSize);
  const previewUrl = URL.createObjectURL(blob);
  return {
    ...asset,
    blob,
    previewUrl,
    contentType: 'image/png',
  };
};

const composePassportWithBackgroundColor = async (
  sourceBlob: Blob,
  backgroundColor: string,
  outputSize: Dimensions
): Promise<Blob> => {
  return recomposePassportBottomCenter(sourceBlob, outputSize, backgroundColor);
};

export default function PassportSizePhotoMaker() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [originalPreview, setOriginalPreview] = useState<string | null>(null);
  const [croppedResult, setCroppedResult] = useState<ProcessedAsset | null>(null);
  const [passportResult, setPassportResult] = useState<ProcessedAsset | null>(null);
  const [passportDimensions, setPassportDimensions] = useState<Dimensions>({
    width: PASSPORT_WIDTH,
    height: PASSPORT_HEIGHT,
  });
  const [dimensions, setDimensions] = useState<Dimensions | null>(null);
  const [cropSelection, setCropSelection] = useState<CropSelection>(EMPTY_SELECTION);
  const [cropSizeInput, setCropSizeInput] = useState<CropSizeInput>(EMPTY_SIZE_INPUT);
  const [backgroundChoice, setBackgroundChoice] = useState<BackgroundChoice>('white');
  const [backgroundColor, setBackgroundColor] = useState('#ffffff');
  const [isDragging, setIsDragging] = useState(false);
  const [isCropping, setIsCropping] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const originalPreviewRef = useRef<string | null>(null);
  const croppedPreviewRef = useRef<string | null>(null);
  const passportPreviewRef = useRef<string | null>(null);
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
    croppedPreviewRef.current = croppedResult?.previewUrl || null;
  }, [croppedResult]);

  useEffect(() => {
    passportPreviewRef.current = passportResult?.previewUrl || null;
  }, [passportResult]);

  useEffect(() => {
    setCropSizeInput({
      width: String(cropSelection.width || 0),
      height: String(cropSelection.height || 0),
    });
  }, [cropSelection.width, cropSelection.height]);

  useEffect(() => {
    return () => {
      if (initialSyncTimeoutRef.current !== null) {
        window.clearTimeout(initialSyncTimeoutRef.current);
      }
      revokePreviewUrl(pendingPreviewRef.current);
      cropperRef.current?.destroy();
      cropperRef.current = null;
      revokePreviewUrl(originalPreviewRef.current);
      revokePreviewUrl(croppedPreviewRef.current);
      revokePreviewUrl(passportPreviewRef.current);
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
      autoCropArea: 0.8,
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
    revokePreviewUrl(croppedResult?.previewUrl);
    revokePreviewUrl(passportResult?.previewUrl);
    setSelectedFile(null);
    setOriginalPreview(null);
    setCroppedResult(null);
    setPassportResult(null);
    setPassportDimensions({
      width: PASSPORT_WIDTH,
      height: PASSPORT_HEIGHT,
    });
    setDimensions(null);
    setCropSelection(EMPTY_SELECTION);
    setCropSizeInput(EMPTY_SIZE_INPUT);
    setBackgroundChoice('white');
    setBackgroundColor('#ffffff');
    setError(null);
    setIsCropping(false);
    setIsConverting(false);
  }, [originalPreview, croppedResult, passportResult]);

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
        revokePreviewUrl(croppedResult?.previewUrl);
        revokePreviewUrl(passportResult?.previewUrl);
        setDimensions({ width, height });
        setSelectedFile(imageFile);
        setOriginalPreview(previewUrl);
        setCroppedResult(null);
        setPassportResult(null);
        setPassportDimensions({
          width: PASSPORT_WIDTH,
          height: PASSPORT_HEIGHT,
        });
        setCropSelection(EMPTY_SELECTION);
        setCropSizeInput(EMPTY_SIZE_INPUT);
        setBackgroundChoice('white');
        setBackgroundColor('#ffffff');
        setIsCropping(false);
        setIsConverting(false);
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
    [originalPreview, croppedResult, passportResult]
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

  const handleCrop = useCallback(async () => {
    if (isCropping) {
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
    setIsCropping(true);

    try {
      const nextResult = await cropImageFile(selectedFile, {
        x: activeSelection.x,
        y: activeSelection.y,
        width: activeSelection.width,
        height: activeSelection.height,
      });

      revokePreviewUrl(croppedResult?.previewUrl);
      revokePreviewUrl(passportResult?.previewUrl);
      setCroppedResult(nextResult);
      setPassportResult(null);
      setPassportDimensions({
        width: activeSelection.width,
        height: activeSelection.height,
      });
      setBackgroundChoice('white');
      setBackgroundColor('#ffffff');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Crop failed');
    } finally {
      setIsCropping(false);
    }
  }, [isCropping, selectedFile, cropSelection, dimensions, croppedResult, passportResult]);

  const applyCropSize = useCallback((widthValue: string, heightValue: string) => {
    const cropper = cropperRef.current;
    if (!cropper) {
      return false;
    }

    const parsedWidth = Number.parseInt(widthValue, 10);
    const parsedHeight = Number.parseInt(heightValue, 10);

    if (
      !Number.isInteger(parsedWidth) ||
      !Number.isInteger(parsedHeight) ||
      parsedWidth < 1 ||
      parsedHeight < 1
    ) {
      return false;
    }

    const imageData = cropper.getImageData();
    const imageWidth = Math.max(
      1,
      toFiniteInt(imageData.naturalWidth, dimensions?.width || parsedWidth)
    );
    const imageHeight = Math.max(
      1,
      toFiniteInt(imageData.naturalHeight, dimensions?.height || parsedHeight)
    );
    const activeSelection = normalizeCropSelection(cropper);

    const nextWidth = Math.min(parsedWidth, imageWidth);
    const nextHeight = Math.min(parsedHeight, imageHeight);
    const nextX = Math.max(0, Math.min(activeSelection.x, imageWidth - nextWidth));
    const nextY = Math.max(0, Math.min(activeSelection.y, imageHeight - nextHeight));

    cropper.setData({
      x: nextX,
      y: nextY,
      width: nextWidth,
      height: nextHeight,
    });
    syncSelectionFromCropper(cropper);
    return true;
  }, [dimensions, syncSelectionFromCropper]);

  const handleCropSizeChange = useCallback((field: keyof CropSizeInput, value: string) => {
    setCropSizeInput((previous) => {
      const next = {
        ...previous,
        [field]: value,
      };
      applyCropSize(next.width, next.height);
      return next;
    });
  }, [applyCropSize]);

  const handleCropSizeCommit = useCallback(() => {
    const applied = applyCropSize(cropSizeInput.width, cropSizeInput.height);
    if (applied) {
      setError(null);
      return;
    }

    setCropSizeInput({
      width: String(cropSelection.width || 0),
      height: String(cropSelection.height || 0),
    });
    setError('Width and height must be positive numbers.');
  }, [applyCropSize, cropSelection.width, cropSelection.height, cropSizeInput.width, cropSizeInput.height]);

  const handleConvertToPassport = useCallback(async () => {
    if (isConverting) {
      return;
    }

    if (!croppedResult || !selectedFile) {
      setError('Please crop the image before converting.');
      return;
    }

    setError(null);
    setIsConverting(true);

    try {
      const sourceContentType = croppedResult.contentType.startsWith('image/')
        ? croppedResult.contentType
        : 'image/png';
      const extension = getExtensionFromMimeType(sourceContentType);
      const croppedFile = new File(
        [croppedResult.blob],
        `${selectedFile.name.replace(/\.[^.]+$/, '')}.${extension}`,
        { type: sourceContentType }
      );
      const outputWidth = Math.max(1, passportDimensions.width);
      const outputHeight = Math.max(1, passportDimensions.height);
      const nextPassportRaw = await convertToPassportPhotoFile(croppedFile, {
        width: outputWidth,
        height: outputHeight,
      });
      const nextPassport = await (async () => {
        try {
          return await normalizePassportAsset(nextPassportRaw, {
            width: outputWidth,
            height: outputHeight,
          });
        } finally {
          revokePreviewUrl(nextPassportRaw.previewUrl);
        }
      })();
      revokePreviewUrl(passportResult?.previewUrl);
      setPassportResult(nextPassport);
      setPassportDimensions({
        width: outputWidth,
        height: outputHeight,
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Passport conversion failed');
    } finally {
      setIsConverting(false);
    }
  }, [isConverting, croppedResult, selectedFile, passportDimensions.width, passportDimensions.height, passportResult]);

  const handlePresetBackground = useCallback((choice: Exclude<BackgroundChoice, 'custom'>) => {
    const preset = BACKGROUND_PRESETS.find((item) => item.id === choice);
    if (!preset) {
      return;
    }

    setBackgroundChoice(choice);
    setBackgroundColor(preset.color);
  }, []);

  const handleCustomColorChange = useCallback((value: string) => {
    setBackgroundChoice('custom');
    setBackgroundColor(value);
  }, []);

  const handleDownload = useCallback(async () => {
    if (!passportResult || !selectedFile) {
      return;
    }

    try {
      const finalBlob = await composePassportWithBackgroundColor(
        passportResult.blob,
        backgroundColor,
        passportDimensions
      );
      downloadProcessedAsset({
        ...passportResult,
        blob: finalBlob,
        contentType: 'image/png',
        fileName: getPassportDownloadName(selectedFile.name),
      });
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to download passport photo'
      );
    }
  }, [passportResult, selectedFile, backgroundColor, passportDimensions]);

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
                Passport Size Photo Maker
              </h3>
              <p className="text-gray text-center mb-6">
                Upload, crop, convert, and download a passport-size photo
              </p>
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
              <div className="grid grid-cols-1 min-[480px]:grid-cols-2 gap-4">
                <div>
                  <label className="font-display font-bold text-dark block mb-2">Width</label>
                  <input
                    type="number"
                    min={1}
                    value={cropSizeInput.width}
                    onChange={(event) => handleCropSizeChange('width', event.target.value)}
                    onBlur={handleCropSizeCommit}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        handleCropSizeCommit();
                      }
                    }}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-violet focus:outline-none"
                    disabled={isCropping || isConverting}
                  />
                </div>
                <div>
                  <label className="font-display font-bold text-dark block mb-2">Height</label>
                  <input
                    type="number"
                    min={1}
                    value={cropSizeInput.height}
                    onChange={(event) => handleCropSizeChange('height', event.target.value)}
                    onBlur={handleCropSizeCommit}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        handleCropSizeCommit();
                      }
                    }}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-violet focus:outline-none"
                    disabled={isCropping || isConverting}
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <div className="text-sm text-gray">
                  {dimensions
                    ? `Image size: ${dimensions.width} x ${dimensions.height}`
                    : 'Loading image dimensions...'}
                </div>
              </div>
              <p className="text-xs text-gray mt-2">
                Adjust crop area on image or type width/height.
              </p>

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
                  <p className="text-gray text-sm mt-1">Crop face area</p>
                </div>
              </div>

              <div className="sticker-card overflow-hidden">
                <div className="relative h-[420px] sm:h-[460px] bg-gray-100 overflow-hidden flex items-center justify-center">
                  {croppedResult ? (
                    <img src={croppedResult.previewUrl} alt="Cropped" className="w-full h-full object-contain" />
                  ) : (
                    <div className="text-gray text-sm">
                      {isCropping ? 'Processing crop...' : 'Cropped preview will appear here'}
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <p className="font-medium text-dark">Cropped Image</p>
                  <p className="text-gray text-sm mt-1">Step 1 complete after crop</p>
                </div>
              </div>
            </div>

            <div className="sticker-card p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-display font-bold text-dark">Step Actions</p>
                  <p className="text-gray text-sm mt-2">Step 1: Crop image first.</p>
                  <p className="text-gray text-sm mt-2">
                    Step 2: Convert to passport photo ({passportDimensions.width} x {passportDimensions.height}).
                  </p>
                </div>
                <div className="w-full sm:w-auto flex flex-nowrap items-center justify-end gap-3 sm:shrink-0">
                  <button
                    onClick={() => void handleCrop()}
                    disabled={isCropping || isConverting}
                    className="sticker-button disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isCropping ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Cropping...
                      </>
                    ) : (
                      'Crop'
                    )}
                  </button>
                  <button
                    onClick={() => void handleConvertToPassport()}
                    disabled={!croppedResult || isConverting || isCropping}
                    className="sticker-button disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isConverting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Wand2 className="w-4 h-4 mr-2" />
                        Convert to Passport Photo
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {passportResult && (
              <div className="sticker-card p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <p className="font-display font-bold text-dark mb-3">Passport Preview</p>
                    <div
                      className="relative mx-auto w-full max-w-[280px] sm:max-w-[320px] rounded-xl overflow-hidden border border-gray-200"
                      style={{ backgroundColor, aspectRatio: `${passportDimensions.width} / ${passportDimensions.height}` }}
                    >
                      <img
                        src={passportResult.previewUrl}
                        alt="Passport Preview"
                        className="absolute inset-0 w-full h-full object-contain"
                      />
                    </div>
                    <p className="text-gray text-sm mt-3 text-center md:text-left">
                      Size: {passportDimensions.width} x {passportDimensions.height} px
                    </p>
                  </div>

                  <div>
                    <p className="font-display font-bold text-dark mb-3">Background Color</p>
                    <div className="flex flex-wrap gap-2">
                      {BACKGROUND_PRESETS.map((option) => (
                        <button
                          key={option.id}
                          onClick={() => handlePresetBackground(option.id)}
                          className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                            backgroundChoice === option.id
                              ? 'bg-violet text-white border-violet'
                              : 'bg-white text-gray border-gray-300 hover:border-violet'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    <div className="mt-3">
                      <label className="font-medium text-dark text-sm block mb-2">Custom Color</label>
                      <input
                        type="color"
                        value={backgroundColor}
                        onChange={(event) => handleCustomColorChange(event.target.value)}
                        className="w-12 h-12 p-1 bg-white border border-gray-300 rounded-lg cursor-pointer"
                        aria-label="Pick custom passport background color"
                      />
                    </div>
                    <div className="mt-6">
                      <button onClick={() => void handleDownload()} className="sticker-button">
                        <Download className="w-4 h-4 mr-2" />
                        Download Passport Photo
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

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
