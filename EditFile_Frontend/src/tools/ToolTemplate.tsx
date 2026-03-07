import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, X, FileText, Download, Settings } from 'lucide-react';

interface ToolFile {
  id: string;
  file: File;
  name: string;
  size: number;
  progress: number;
  status: 'ready' | 'uploading' | 'processing' | 'completed' | 'error';
}

interface ToolTemplateProps {
  acceptedFileTypes: string;
  fileTypeLabel: string;
  allowMultiple?: boolean;
  showSettings?: boolean;
  showSettingsToggle?: boolean;
  settingsComponent?: React.ReactNode;
  autoOpenSettingsOnUpload?: boolean;
  manualProcessing?: boolean;
  convertButtonLabel?: string;
  convertingButtonLabel?: string;
  downloadButtonLabel?: string;
  onManualProcess?: (files: File[]) => Promise<void>;
  onManualDownload?: () => void;
}

export default function ToolTemplate({
  acceptedFileTypes = '.pdf',
  fileTypeLabel = 'PDF',
  allowMultiple = true,
  showSettings = false,
  showSettingsToggle = true,
  settingsComponent,
  autoOpenSettingsOnUpload = false,
  manualProcessing = false,
  convertButtonLabel = 'Convert',
  convertingButtonLabel = 'Converting...',
  downloadButtonLabel = 'Download',
  onManualProcess,
  onManualDownload,
}: ToolTemplateProps) {
  const [files, setFiles] = useState<ToolFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [isConverted, setIsConverted] = useState(false);
  const [manualActionError, setManualActionError] = useState<string | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    handleFiles(droppedFiles);
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    handleFiles(selectedFiles);
  }, []);

  const handleFiles = (newFiles: File[]) => {
    const toolFiles: ToolFile[] = newFiles.map((file) => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      name: file.name,
      size: file.size,
      progress: 0,
      status: manualProcessing ? 'ready' : 'uploading',
    }));

    setFiles((prev) => [...prev, ...toolFiles]);
    setIsConverted(false);
    setManualActionError(null);

    if (showSettings && autoOpenSettingsOnUpload) {
      setShowSettingsPanel(true);
    }

    if (!manualProcessing) {
      toolFiles.forEach((file) => {
        void simulateProcessing(file.id);
      });
    }
  };

  const simulateProcessing = (fileId: string) =>
    new Promise<void>((resolve) => {
      let progress = 0;

      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileId
            ? { ...f, progress: 0, status: 'processing' }
            : f
        )
      );

      const interval = setInterval(() => {
        progress += 15;
        const nextProgress = Math.min(progress, 100);
        const nextStatus: ToolFile['status'] = nextProgress >= 100 ? 'completed' : 'processing';

        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileId ? { ...f, progress: nextProgress, status: nextStatus } : f
          )
        );

        if (nextProgress >= 100) {
          clearInterval(interval);
          resolve();
        }
      }, 100);
    });

  const handleConvert = async () => {
    if (!manualProcessing || files.length === 0 || isConverting) {
      return;
    }

    setManualActionError(null);
    setIsConverting(true);
    setFiles((prev) =>
      prev.map((f) => ({
        ...f,
        progress: 25,
        status: 'processing',
      }))
    );

    try {
      if (onManualProcess) {
        await onManualProcess(files.map((file) => file.file));
      } else {
        await Promise.all(files.map((file) => simulateProcessing(file.id)));
      }

      setFiles((prev) =>
        prev.map((f) => ({
          ...f,
          progress: 100,
          status: 'completed',
        }))
      );
      setIsConverted(true);
    } catch (error) {
      setFiles((prev) =>
        prev.map((f) => ({
          ...f,
          progress: 0,
          status: 'ready',
        }))
      );
      setIsConverted(false);
      setManualActionError(error instanceof Error ? error.message : 'Processing failed');
    } finally {
      setIsConverting(false);
    }
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
    setIsConverted(false);
    setManualActionError(null);
  };

  const handleManualPrimaryAction = async () => {
    if (!manualProcessing || isConverting || files.length === 0) {
      return;
    }

    if (isConverted) {
      if (!onManualDownload) {
        return;
      }

      setManualActionError(null);
      try {
        onManualDownload();
      } catch (error) {
        setManualActionError(error instanceof Error ? error.message : 'Download failed');
      }
      return;
    }

    await handleConvert();
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const primaryActionLabel = isConverting
    ? convertingButtonLabel
    : isConverted
      ? downloadButtonLabel
      : convertButtonLabel;

  return (
    <div className="w-full px-4 lg:px-6 py-8">
      <div className="max-w-4xl mx-auto">
        {/* Upload Area */}
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
                <Upload className="w-10 h-10 text-violet" />
              </div>
              <h3 className="font-display font-bold text-2xl text-dark text-center mb-2">
                Drop {fileTypeLabel} files here
              </h3>
              <p className="text-gray text-center mb-6">
                or click to browse from your computer
              </p>
              <label className="sticker-button cursor-pointer">
                <span>Select {fileTypeLabel} Files</span>
                <input
                  type="file"
                  accept={acceptedFileTypes}
                  multiple={allowMultiple}
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
              {/* Settings Toggle */}
              {showSettings && showSettingsToggle && (
                <div className="flex justify-end">
                  <button
                    onClick={() => setShowSettingsPanel(!showSettingsPanel)}
                    className="sticker-button-secondary py-2 px-4"
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    Settings
                  </button>
                </div>
              )}

              {/* Settings Panel */}
              <AnimatePresence>
                {settingsComponent && (showSettingsPanel || (showSettings && !showSettingsToggle)) && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="sticker-card p-6"
                  >
                    {settingsComponent}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* File Cards */}
              {files.map((file) => (
                <motion.div
                  key={file.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="sticker-card p-5"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-violet/10 rounded-xl flex items-center justify-center flex-shrink-0">
                      <FileText className="w-6 h-6 text-violet" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-dark truncate">
                        {file.name}
                      </p>
                      <p className="text-gray text-sm">
                        {formatSize(file.size)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {file.status === 'completed' && !manualProcessing ? (
                        <button className="sticker-button py-2 px-4">
                          <Download className="w-4 h-4 mr-2" />
                          Download
                        </button>
                      ) : manualProcessing && file.status === 'ready' ? (
                        <span className="text-sm text-gray px-3">Ready</span>
                      ) : manualProcessing && file.status === 'completed' ? (
                        <span className="sticker-label">Done</span>
                      ) : manualProcessing && file.status === 'error' ? (
                        <span className="text-sm text-red-500 px-3">Error</span>
                      ) : (
                        <div className="w-24">
                          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-violet transition-all duration-300"
                              style={{ width: `${file.progress}%` }}
                            />
                          </div>
                        </div>
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

              {/* Actions */}
              <div className="flex items-center justify-between">
                <label className="sticker-button-secondary cursor-pointer">
                  <Upload className="w-4 h-4 mr-2" />
                  <span>Add More Files</span>
                  <input
                    type="file"
                    accept={acceptedFileTypes}
                    multiple={allowMultiple}
                    onChange={handleFileInput}
                    className="hidden"
                  />
                </label>

                {manualProcessing ? (
                  <button
                    onClick={() => void handleManualPrimaryAction()}
                    disabled={isConverting || files.length === 0 || (isConverted && !onManualDownload)}
                    className="sticker-button disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    {primaryActionLabel}
                  </button>
                ) : files.some((f) => f.status === 'completed') ? (
                  <button className="sticker-button">
                    <Download className="w-4 h-4 mr-2" />
                    Download All
                  </button>
                ) : null}
              </div>
              {manualActionError && (
                <p className="text-sm text-red-500">{manualActionError}</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
