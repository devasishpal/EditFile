import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Download, Loader2, RotateCw, Upload, X } from 'lucide-react';
import {
  downloadProcessedAsset,
  isSupportedToolImage,
  revokePreviewUrl,
  rotateImageFile,
  type ProcessedAsset,
} from '@/lib/imageToolApi';

const parseAngleValue = (value: string, fallback: number) => {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
};

export default function RotateImage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [originalPreview, setOriginalPreview] = useState<string | null>(null);
  const [result, setResult] = useState<ProcessedAsset | null>(null);
  const [angle, setAngle] = useState<number>(90);
  const [customAngle, setCustomAngle] = useState('90');
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const originalPreviewRef = useRef<string | null>(null);
  const resultPreviewRef = useRef<string | null>(null);

  useEffect(() => {
    originalPreviewRef.current = originalPreview;
  }, [originalPreview]);

  useEffect(() => {
    resultPreviewRef.current = result?.previewUrl || null;
  }, [result]);

  useEffect(() => {
    return () => {
      revokePreviewUrl(originalPreviewRef.current);
      revokePreviewUrl(resultPreviewRef.current);
    };
  }, []);

  const resetTool = useCallback(() => {
    revokePreviewUrl(originalPreview);
    revokePreviewUrl(result?.previewUrl);
    setSelectedFile(null);
    setOriginalPreview(null);
    setResult(null);
    setAngle(90);
    setCustomAngle('90');
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

  const handleRotate = async () => {
    if (!selectedFile || isProcessing) {
      return;
    }

    const numericAngle = parseAngleValue(customAngle, angle);

    if (!Number.isFinite(numericAngle) || numericAngle < -3600 || numericAngle > 3600) {
      setError('Angle must be between -3600 and 3600.');
      return;
    }

    setError(null);
    setIsProcessing(true);

    try {
      const nextResult = await rotateImageFile(selectedFile, numericAngle);
      revokePreviewUrl(result?.previewUrl);
      setResult(nextResult);
      setAngle(numericAngle);
      setCustomAngle(String(numericAngle));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Rotation failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const presetAngles = [90, 180, 270];

  return (
    <div className="w-full px-4 lg:px-6 py-8">
      <div className="max-w-4xl mx-auto">
        {!selectedFile && (
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
                <RotateCw className="w-10 h-10 text-violet" />
              </div>
              <h3 className="font-display font-bold text-2xl text-dark text-center mb-2">
                Drop image to rotate
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
                <label className="font-display font-bold text-dark block mb-3">Preset Angles</label>
                <div className="flex flex-wrap gap-2">
                  {presetAngles.map((preset) => (
                    <button
                      key={preset}
                      onClick={() => {
                        setAngle(preset);
                        setCustomAngle(String(preset));
                      }}
                      className={`px-4 py-2 rounded-xl border-2 font-medium transition-colors ${
                        angle === preset
                          ? 'bg-violet text-white border-violet'
                          : 'bg-white text-dark border-gray-200 hover:border-violet'
                      }`}
                      disabled={isProcessing}
                    >
                      {preset}°
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="font-display font-bold text-dark block mb-2">Custom Angle</label>
                <input
                  type="number"
                  value={customAngle}
                  onChange={(e) => {
                    setCustomAngle(e.target.value);
                    const next = parseAngleValue(e.target.value, angle);
                    setAngle(next);
                  }}
                  className="w-full md:w-64 px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-violet focus:outline-none"
                  disabled={isProcessing}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="text-sm text-gray">Selected angle: {angle}°</div>
                <button
                  onClick={handleRotate}
                  disabled={isProcessing}
                  className="sticker-button disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Rotating...
                    </>
                  ) : (
                    'Rotate Image'
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
                    <img src={result.previewUrl} alt="Rotated" className="w-full h-full object-contain" />
                  ) : (
                    <div className="text-gray text-sm">{isProcessing ? 'Processing...' : 'Rotated preview will appear here'}</div>
                  )}
                </div>
                <div className="p-4 flex items-center justify-between">
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

            <div className="flex items-center justify-between">
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
