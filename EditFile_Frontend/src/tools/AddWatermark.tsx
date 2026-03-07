import { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, Download, Droplets, FileText, Loader2, Upload, X } from 'lucide-react';
import {
  addPdfWatermarkFile,
  downloadProcessedPdf,
  isPdfToolFile,
  type ProcessedPdfFile,
} from '@/lib/pdfToolApi';

type WatermarkType = 'text' | 'image';
type WatermarkPlacement = 'center' | 'diagonal';

const formatSize = (bytes: number) => {
  if (bytes === 0) {
    return '0 B';
  }

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

const isSupportedWatermarkImage = (file: File) => {
  const type = file.type.toLowerCase();
  return type === 'image/png' || type === 'image/jpeg' || type === 'image/jpg';
};

export default function AddWatermark() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [watermarkType, setWatermarkType] = useState<WatermarkType>('text');
  const [text, setText] = useState('CONFIDENTIAL');
  const [placement, setPlacement] = useState<WatermarkPlacement>('center');
  const [opacity, setOpacity] = useState(25);
  const [watermarkImage, setWatermarkImage] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProcessedPdfFile | null>(null);

  const handleSelectFile = useCallback((files: File[]) => {
    const pdfFile = files.find(isPdfToolFile);
    if (!pdfFile) {
      setError('Please upload a PDF file.');
      return;
    }

    setSelectedFile(pdfFile);
    setResult(null);
    setError(null);
  }, []);

  const handleFileInput = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      handleSelectFile(Array.from(event.target.files || []));
      event.target.value = '';
    },
    [handleSelectFile]
  );

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setIsDragging(false);
      handleSelectFile(Array.from(event.dataTransfer.files));
    },
    [handleSelectFile]
  );

  const handleWatermarkInput = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const imageFile = Array.from(event.target.files || []).find(isSupportedWatermarkImage);
    event.target.value = '';

    if (!imageFile) {
      setError('Please upload a PNG or JPG watermark image.');
      return;
    }

    setWatermarkImage(imageFile);
    setResult(null);
    setError(null);
  }, []);

  const handleProcess = async () => {
    if (!selectedFile || isProcessing) {
      return;
    }

    if (watermarkType === 'text' && !text.trim()) {
      setError('Watermark text is required.');
      return;
    }

    if (watermarkType === 'image' && !watermarkImage) {
      setError('Please upload a watermark image.');
      return;
    }

    setError(null);
    setIsProcessing(true);

    try {
      const processed = await addPdfWatermarkFile(selectedFile, {
        watermarkType,
        text,
        watermarkImage,
        placement,
        opacity,
      });
      setResult(processed);
    } catch (requestError) {
      setResult(null);
      setError(requestError instanceof Error ? requestError.message : 'Watermark failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const clearFile = () => {
    if (isProcessing) {
      return;
    }

    setSelectedFile(null);
    setWatermarkImage(null);
    setResult(null);
    setError(null);
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
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                setIsDragging(false);
              }}
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
                Drop PDF file to watermark
              </h3>
              <p className="text-gray text-center mb-6">
                Add text or image watermark with center or diagonal placement
              </p>
              <label className="sticker-button cursor-pointer">
                <span>Select PDF File</span>
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={handleFileInput}
                  className="hidden"
                />
              </label>
            </div>
          </motion.div>
        )}

        {selectedFile && (
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
                  ].map((item) => (
                    <button
                      key={item.value}
                      onClick={() => {
                        setWatermarkType(item.value as WatermarkType);
                        setResult(null);
                      }}
                      disabled={isProcessing}
                      className={`px-4 py-2 rounded-xl border-2 font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                        watermarkType === item.value
                          ? 'bg-violet text-white border-violet'
                          : 'bg-white text-dark border-gray-200 hover:border-violet'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {watermarkType === 'text' ? (
                <div>
                  <label className="font-display font-bold text-dark block mb-2">Text</label>
                  <input
                    type="text"
                    value={text}
                    onChange={(event) => {
                      setText(event.target.value);
                      setResult(null);
                    }}
                    disabled={isProcessing}
                    placeholder="Enter watermark text"
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-violet focus:outline-none"
                  />
                </div>
              ) : (
                <div>
                  <label className="font-display font-bold text-dark block mb-2">
                    Watermark Image
                  </label>
                  <div className="flex items-center gap-3">
                    <label className="sticker-button-secondary cursor-pointer py-2 px-4">
                      <span>Select Image</span>
                      <input
                        type="file"
                        accept=".png,.jpg,.jpeg,image/png,image/jpeg"
                        onChange={handleWatermarkInput}
                        className="hidden"
                        disabled={isProcessing}
                      />
                    </label>
                    <span className="text-sm text-gray truncate">
                      {watermarkImage ? watermarkImage.name : 'No file selected'}
                    </span>
                  </div>
                </div>
              )}

              <div>
                <label className="font-display font-bold text-dark block mb-3">Placement</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: 'center', label: 'Center Watermark' },
                    { value: 'diagonal', label: 'Diagonal Watermark' },
                  ].map((item) => (
                    <button
                      key={item.value}
                      onClick={() => {
                        setPlacement(item.value as WatermarkPlacement);
                        setResult(null);
                      }}
                      disabled={isProcessing}
                      className={`px-4 py-2 rounded-xl border-2 font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                        placement === item.value
                          ? 'bg-violet text-white border-violet'
                          : 'bg-white text-dark border-gray-200 hover:border-violet'
                      }`}
                    >
                      {item.label}
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
                  min="5"
                  max="90"
                  value={opacity}
                  onChange={(event) => {
                    setOpacity(Number(event.target.value));
                    setResult(null);
                  }}
                  disabled={isProcessing}
                  className="w-full h-3 bg-gray-200 rounded-full appearance-none cursor-pointer accent-violet"
                />
              </div>
            </div>

            <div className="sticker-card p-5">
              <div className="flex flex-wrap items-center gap-4">
                <div className="w-12 h-12 bg-violet/10 rounded-xl flex items-center justify-center">
                  <FileText className="w-6 h-6 text-violet" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-dark truncate">{selectedFile.name}</p>
                  <p className="text-gray text-sm">{formatSize(selectedFile.size)}</p>
                </div>
                <button
                  onClick={clearFile}
                  disabled={isProcessing}
                  className="w-10 h-10 bg-gray-100 hover:bg-red-100 rounded-xl flex items-center justify-center transition-colors disabled:opacity-60"
                >
                  <X className="w-5 h-5 text-gray hover:text-red-500" />
                </button>
              </div>
            </div>

            {error && (
              <div className="sticker-card p-4">
                <p className="text-red-500 text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  {error}
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="sticker-button-secondary cursor-pointer">
                <Upload className="w-4 h-4 mr-2" />
                <span>Choose Another PDF</span>
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={handleFileInput}
                  className="hidden"
                />
              </label>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => void handleProcess()}
                  disabled={!selectedFile || isProcessing}
                  className="sticker-button disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Droplets className="w-4 h-4 mr-2" />
                      Add Watermark
                    </>
                  )}
                </button>
                <button
                  onClick={() => {
                    if (result) {
                      downloadProcessedPdf(result);
                    }
                  }}
                  disabled={!result || isProcessing}
                  className="sticker-button-secondary disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

