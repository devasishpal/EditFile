import { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, Download, FileText, Loader2, Trash2, Upload, X } from 'lucide-react';
import {
  deletePdfPagesFile,
  downloadProcessedPdf,
  isPdfToolFile,
  type ProcessedPdfFile,
} from '@/lib/pdfToolApi';

const formatSize = (bytes: number) => {
  if (bytes === 0) {
    return '0 B';
  }

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

export default function DeletePDFPages() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pagesToDelete, setPagesToDelete] = useState('');
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

  const handleProcess = async () => {
    if (!selectedFile || isProcessing) {
      return;
    }

    if (!pagesToDelete.trim()) {
      setError('Enter page numbers to delete, for example: 2,4,6');
      return;
    }

    setError(null);
    setIsProcessing(true);

    try {
      const processed = await deletePdfPagesFile(selectedFile, {
        pages: pagesToDelete,
      });
      setResult(processed);
    } catch (requestError) {
      setResult(null);
      setError(requestError instanceof Error ? requestError.message : 'Delete pages failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const clearFile = () => {
    if (isProcessing) {
      return;
    }

    setSelectedFile(null);
    setResult(null);
    setError(null);
    setPagesToDelete('');
  };

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
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                setIsDragging(false);
              }}
              onDrop={handleDrop}
              className={`border-3 border-dashed rounded-2xl p-12 lg:p-16 flex flex-col items-center justify-center transition-all cursor-pointer ${
                isDragging
                  ? 'border-pink bg-pink/5'
                  : 'border-gray-300 hover:border-violet hover:bg-violet/5'
              }`}
            >
              <div className="w-20 h-20 bg-violet/10 rounded-2xl flex items-center justify-center mb-6">
                <Trash2 className="w-10 h-10 text-violet" />
              </div>
              <h3 className="font-display font-bold text-2xl text-dark text-center mb-2">
                Drop PDF file to delete pages
              </h3>
              <p className="text-gray text-center mb-6">Remove specific pages from your document</p>
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
                <label className="font-display font-bold text-dark block mb-2">
                  Pages to Delete
                </label>
                <input
                  type="text"
                  value={pagesToDelete}
                  onChange={(event) => {
                    setPagesToDelete(event.target.value);
                    setResult(null);
                  }}
                  disabled={isProcessing}
                  placeholder="Example: 2,4,6 or 2-5"
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-violet focus:outline-none"
                />
              </div>
            </div>

            <div className="sticker-card p-5">
              <div className="flex items-center gap-4">
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

            <div className="flex items-center justify-between">
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
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete Pages
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
