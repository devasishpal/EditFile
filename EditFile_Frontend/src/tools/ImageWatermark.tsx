import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Download, Droplets, Loader2, Upload, X } from 'lucide-react';
import {
  downloadProcessedAsset,
  isSupportedToolImage,
  revokePreviewUrl,
  watermarkImageFile,
  type ProcessedAsset,
} from '@/lib/imageToolApi';

type WatermarkType = 'text' | 'image';

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

export default function ImageWatermark() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [watermarkFile, setWatermarkFile] = useState<File | null>(null);
  const [originalPreview, setOriginalPreview] = useState<string | null>(null);
  const [watermarkPreview, setWatermarkPreview] = useState<string | null>(null);
  const [result, setResult] = useState<ProcessedAsset | null>(null);

  const [watermarkType, setWatermarkType] = useState<WatermarkType>('text');
  const [text, setText] = useState('CONFIDENTIAL');
  const [position, setPosition] = useState('center');
  const [opacity, setOpacity] = useState(50);
  const [fontSize, setFontSize] = useState(48);

  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const originalPreviewRef = useRef<string | null>(null);
  const watermarkPreviewRef = useRef<string | null>(null);
  const resultPreviewRef = useRef<string | null>(null);

  useEffect(() => {
    originalPreviewRef.current = originalPreview;
  }, [originalPreview]);

  useEffect(() => {
    watermarkPreviewRef.current = watermarkPreview;
  }, [watermarkPreview]);

  useEffect(() => {
    resultPreviewRef.current = result?.previewUrl || null;
  }, [result]);

  useEffect(() => {
    return () => {
      revokePreviewUrl(originalPreviewRef.current);
      revokePreviewUrl(watermarkPreviewRef.current);
      revokePreviewUrl(resultPreviewRef.current);
    };
  }, []);

  const resetTool = useCallback(() => {
    revokePreviewUrl(originalPreview);
    revokePreviewUrl(watermarkPreview);
    revokePreviewUrl(result?.previewUrl);
    setSelectedFile(null);
    setWatermarkFile(null);
    setOriginalPreview(null);
    setWatermarkPreview(null);
    setResult(null);
    setError(null);
    setIsProcessing(false);
  }, [originalPreview, watermarkPreview, result]);

  const handleSelectFiles = useCallback(
    (files: File[]) => {
      const imageFile = files.find(isSupportedToolImage);

      if (!imageFile) {
        setError('Please upload a JPG, JPEG, PNG, or WEBP image.');
        return;
      }

      if (imageFile.size > MAX_FILE_SIZE_BYTES) {
        setError('Maximum file size is 20MB.');
        return;
      }

      setError(null);
      revokePreviewUrl(originalPreview);
      revokePreviewUrl(result?.previewUrl);

      const previewUrl = URL.createObjectURL(imageFile);
      setSelectedFile(imageFile);
      setOriginalPreview(previewUrl);
      setResult(null);
      setIsProcessing(false);
    },
    [originalPreview, result]
  );

  const handleSelectWatermark = useCallback(
    (files: File[]) => {
      const imageFile = files.find(isSupportedToolImage);

      if (!imageFile) {
        setError('Please choose a JPG, JPEG, PNG, or WEBP watermark image.');
        return;
      }

      if (imageFile.size > MAX_FILE_SIZE_BYTES) {
        setError('Maximum file size is 20MB.');
        return;
      }

      setError(null);
      revokePreviewUrl(watermarkPreview);
      setWatermarkFile(imageFile);
      setWatermarkPreview(URL.createObjectURL(imageFile));
      revokePreviewUrl(result?.previewUrl);
      setResult(null);
    },
    [watermarkPreview, result]
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

  const handleWatermarkInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleSelectWatermark(Array.from(e.target.files || []));
      e.target.value = '';
    },
    [handleSelectWatermark]
  );

  const handleApplyWatermark = async () => {
    if (!selectedFile || isProcessing) {
      return;
    }

    if (watermarkType === 'text' && !text.trim()) {
      setError('Watermark text is required.');
      return;
    }

    if (watermarkType === 'image' && !watermarkFile) {
      setError('Please choose a watermark image.');
      return;
    }

    setError(null);
    setIsProcessing(true);

    try {
      const processed = await watermarkImageFile(selectedFile, {
        type: watermarkType,
        text,
        position,
        opacity: opacity / 100,
        fontSize,
        watermarkImage: watermarkType === 'image' ? watermarkFile : null,
      });

      revokePreviewUrl(result?.previewUrl);
      setResult(processed);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Watermark failed');
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
                <Droplets className="w-8 h-8 sm:w-10 sm:h-10 text-violet" />
              </div>
              <h3 className="font-display font-bold text-xl sm:text-2xl text-dark text-center mb-2">
                Drop image to watermark
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
            <div className="sticker-card p-6 space-y-4">
              <div>
                <label className="font-display font-bold text-dark block mb-3">
                  Watermark Type
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: 'text', label: 'Text' },
                    { value: 'image', label: 'Image' },
                  ].map((type) => (
                    <button
                      key={type.value}
                      onClick={() => {
                        setWatermarkType(type.value as WatermarkType);
                        revokePreviewUrl(result?.previewUrl);
                        setResult(null);
                      }}
                      className={`px-4 py-2 rounded-xl border-2 font-medium transition-colors ${
                        watermarkType === type.value
                          ? 'bg-violet text-white border-violet'
                          : 'bg-white text-dark border-gray-200 hover:border-violet'
                      }`}
                      disabled={isProcessing}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>

              {watermarkType === 'text' && (
                <>
                  <div>
                    <label className="font-display font-bold text-dark block mb-2">
                      Text
                    </label>
                    <input
                      type="text"
                      value={text}
                      onChange={(e) => {
                        setText(e.target.value);
                        revokePreviewUrl(result?.previewUrl);
                        setResult(null);
                      }}
                      placeholder="Enter watermark text"
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-violet focus:outline-none"
                      disabled={isProcessing}
                    />
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                      <label className="font-display font-bold text-dark">
                        Font Size
                      </label>
                      <span className="sticker-label bg-violet text-white border-violet">
                        {fontSize}px
                      </span>
                    </div>
                    <input
                      type="range"
                      min="12"
                      max="120"
                      value={fontSize}
                      onChange={(e) => {
                        setFontSize(Number(e.target.value));
                        revokePreviewUrl(result?.previewUrl);
                        setResult(null);
                      }}
                      className="w-full h-3 bg-gray-200 rounded-full appearance-none cursor-pointer accent-violet"
                      disabled={isProcessing}
                    />
                  </div>
                </>
              )}

              {watermarkType === 'image' && (
                <div>
                  <label className="font-display font-bold text-dark block mb-2">
                    Watermark Image
                  </label>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="sticker-button-secondary cursor-pointer py-2 px-4">
                      <span>Select Watermark</span>
                      <input
                        type="file"
                        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                        onChange={handleWatermarkInput}
                        className="hidden"
                        disabled={isProcessing}
                      />
                    </label>
                    <span className="text-sm text-gray truncate min-w-0">
                      {watermarkFile ? watermarkFile.name : 'No file selected'}
                    </span>
                  </div>
                  {watermarkPreview && (
                    <div className="mt-3 w-24 h-24 rounded-xl overflow-hidden bg-gray-100 border border-gray-200">
                      <img
                        src={watermarkPreview}
                        alt="Watermark preview"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="font-display font-bold text-dark block mb-3">
                  Position
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { value: 'top-left', label: 'Top Left' },
                    { value: 'top-center', label: 'Top' },
                    { value: 'top-right', label: 'Top Right' },
                    { value: 'center-left', label: 'Left' },
                    { value: 'center', label: 'Center' },
                    { value: 'center-right', label: 'Right' },
                    { value: 'bottom-left', label: 'Bottom Left' },
                    { value: 'bottom-center', label: 'Bottom' },
                    { value: 'bottom-right', label: 'Bottom Right' },
                  ].map((pos) => (
                    <button
                      key={pos.value}
                      onClick={() => {
                        setPosition(pos.value);
                        revokePreviewUrl(result?.previewUrl);
                        setResult(null);
                      }}
                      className={`px-3 py-2 rounded-xl border-2 text-sm font-medium transition-colors ${
                        position === pos.value
                          ? 'bg-violet text-white border-violet'
                          : 'bg-white text-dark border-gray-200 hover:border-violet'
                      }`}
                      disabled={isProcessing}
                    >
                      {pos.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                  <label className="font-display font-bold text-dark">Opacity</label>
                  <span className="sticker-label bg-violet text-white border-violet">
                    {opacity}%
                  </span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="100"
                  value={opacity}
                  onChange={(e) => {
                    setOpacity(Number(e.target.value));
                    revokePreviewUrl(result?.previewUrl);
                    setResult(null);
                  }}
                  className="w-full h-3 bg-gray-200 rounded-full appearance-none cursor-pointer accent-violet"
                  disabled={isProcessing}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm text-gray">
                  {watermarkType === 'text'
                    ? 'Apply text watermark on your image.'
                    : 'Overlay watermark image on your image.'}
                </span>
                <button
                  onClick={() => void handleApplyWatermark()}
                  disabled={isProcessing}
                  className="sticker-button disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    'Apply Watermark'
                  )}
                </button>
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="sticker-card overflow-hidden">
                <div className="relative aspect-video bg-gray-100 overflow-hidden">
                  <img src={originalPreview} alt="Original" className="w-full h-full object-contain" />
                </div>
                <div className="p-4">
                  <p className="font-medium text-dark truncate">{selectedFile.name}</p>
                  <p className="text-gray text-sm mt-1">Original</p>
                </div>
              </div>

              <div className="sticker-card overflow-hidden">
                <div className="relative aspect-video bg-gray-100 overflow-hidden flex items-center justify-center">
                  {result ? (
                    <img src={result.previewUrl} alt="Watermarked" className="w-full h-full object-contain" />
                  ) : (
                    <div className="text-gray text-sm">
                      {isProcessing ? 'Processing...' : 'Watermarked preview will appear here'}
                    </div>
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

