import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowDown, ArrowUp, Download, FileImage, Loader2, Upload, X } from 'lucide-react';
import {
  convertImagesToPdf,
  downloadProcessedAsset,
  isSupportedToolImage,
  revokePreviewUrl,
  type ProcessedAsset,
} from '@/lib/imageToolApi';

interface ImageItem {
  id: string;
  file: File;
  previewUrl: string;
}

const createId = () => Math.random().toString(36).slice(2, 11);

const formatSize = (bytes: number) => {
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }
  return `${(kb / 1024).toFixed(2)} MB`;
};

export default function ImageToPDF() {
  const [files, setFiles] = useState<ImageItem[]>([]);
  const [result, setResult] = useState<ProcessedAsset | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filePreviewRef = useRef<string[]>([]);
  const resultPreviewRef = useRef<string | null>(null);

  useEffect(() => {
    filePreviewRef.current = files.map((file) => file.previewUrl);
  }, [files]);

  useEffect(() => {
    resultPreviewRef.current = result?.previewUrl || null;
  }, [result]);

  useEffect(() => {
    return () => {
      filePreviewRef.current.forEach((previewUrl) => revokePreviewUrl(previewUrl));
      revokePreviewUrl(resultPreviewRef.current);
    };
  }, []);

  const handleFiles = useCallback(
    (incomingFiles: File[]) => {
      const supportedFiles = incomingFiles.filter(isSupportedToolImage);

      if (supportedFiles.length === 0) {
        setError('Please upload JPG, JPEG, PNG, or WEBP images.');
        return;
      }

      setError(null);
      setFiles((prev) => [
        ...prev,
        ...supportedFiles.map((file) => ({
          id: createId(),
          file,
          previewUrl: URL.createObjectURL(file),
        })),
      ]);

      if (result) {
        revokePreviewUrl(result.previewUrl);
        setResult(null);
      }
    },
    [result]
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
        revokePreviewUrl(target.previewUrl);
      }
      return prev.filter((file) => file.id !== id);
    });
  };

  const moveFile = (index: number, direction: 'up' | 'down') => {
    setFiles((prev) => {
      const next = [...prev];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;

      if (targetIndex < 0 || targetIndex >= next.length) {
        return prev;
      }

      const temp = next[index];
      next[index] = next[targetIndex];
      next[targetIndex] = temp;
      return next;
    });
  };

  const handleConvert = async () => {
    if (files.length === 0 || isProcessing) {
      return;
    }

    setError(null);
    setIsProcessing(true);

    try {
      const processed = await convertImagesToPdf(files.map((file) => file.file));
      if (result) {
        revokePreviewUrl(result.previewUrl);
      }
      setResult(processed);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'PDF conversion failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const clearAll = () => {
    files.forEach((file) => revokePreviewUrl(file.previewUrl));
    revokePreviewUrl(result?.previewUrl);
    setFiles([]);
    setResult(null);
    setError(null);
    setIsProcessing(false);
  };

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
                <FileImage className="w-10 h-10 text-violet" />
              </div>
              <h3 className="font-display font-bold text-2xl text-dark text-center mb-2">
                Drop images to convert
              </h3>
              <p className="text-gray text-center mb-6">JPG, JPEG, PNG, WEBP supported</p>
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

        {files.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <div className="sticker-card p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="font-display font-bold text-dark">Image Order</p>
                  <p className="text-sm text-gray">The PDF keeps this order.</p>
                </div>
                <button
                  onClick={handleConvert}
                  disabled={isProcessing}
                  className="sticker-button disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Converting...
                    </>
                  ) : (
                    'Convert to PDF'
                  )}
                </button>
              </div>

              <div className="space-y-3">
                {files.map((file, index) => (
                  <div key={file.id} className="flex items-center gap-3 p-3 border-2 border-gray-100 rounded-xl">
                    <div className="w-14 h-14 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                      <img src={file.previewUrl} alt={file.file.name} className="w-full h-full object-cover" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-dark truncate">{file.file.name}</p>
                      <p className="text-xs text-gray">{formatSize(file.file.size)}</p>
                    </div>

                    <span className="sticker-label text-[10px]">#{index + 1}</span>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => moveFile(index, 'up')}
                        className="w-8 h-8 bg-gray-100 hover:bg-violet/10 rounded-lg flex items-center justify-center"
                        disabled={index === 0}
                      >
                        <ArrowUp className="w-4 h-4 text-gray" />
                      </button>
                      <button
                        onClick={() => moveFile(index, 'down')}
                        className="w-8 h-8 bg-gray-100 hover:bg-violet/10 rounded-lg flex items-center justify-center"
                        disabled={index === files.length - 1}
                      >
                        <ArrowDown className="w-4 h-4 text-gray" />
                      </button>
                      <button
                        onClick={() => removeFile(file.id)}
                        className="w-8 h-8 bg-gray-100 hover:bg-red-100 rounded-lg flex items-center justify-center"
                      >
                        <X className="w-4 h-4 text-gray hover:text-red-500" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {error && <p className="text-sm text-red-500 mt-4">{error}</p>}
            </div>

            {result && (
              <div className="sticker-card p-6">
                <div className="flex items-center justify-between mb-3">
                  <p className="font-display font-bold text-dark">PDF Preview</p>
                  <button
                    onClick={() => downloadProcessedAsset(result)}
                    className="sticker-button py-2 px-4"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download PDF
                  </button>
                </div>
                <iframe
                  src={result.previewUrl}
                  title="Converted PDF"
                  className="w-full h-96 rounded-xl border-2 border-gray-100"
                />
              </div>
            )}

            <div className="flex items-center justify-between">
              <label className="sticker-button-secondary cursor-pointer">
                <Upload className="w-4 h-4 mr-2" />
                <span>Add More Images</span>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                  multiple
                  onChange={handleFileInput}
                  className="hidden"
                />
              </label>

              <button
                onClick={clearAll}
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
