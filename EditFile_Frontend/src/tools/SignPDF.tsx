import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  Download,
  FileSignature,
  FileText,
  Loader2,
  PencilLine,
  Type,
  Upload,
  UserRound,
  X,
} from 'lucide-react';
import { loadPdfPreview, type PdfPreviewDocument } from '@/lib/pdfPreview';
import {
  downloadProcessedPdf,
  isPdfToolFile,
  signPdfFile,
  type PdfSignPlacement,
  type ProcessedPdfFile,
} from '@/lib/pdfToolApi';

type SignatureMode = 'draw' | 'upload' | 'type';
type TypedSignatureStyle = 'script' | 'elegant' | 'clean';
type SignItemKind = 'signature' | 'date' | 'name' | 'text';

interface SignEditorItem extends PdfSignPlacement {
  id: string;
  kind: SignItemKind;
}

interface SignInteraction {
  type: 'move' | 'resize';
  itemId: string;
  pageIndex: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  originWidth: number;
  originHeight: number;
}

const formatSize = (bytes: number) => {
  if (bytes === 0) {
    return '0 B';
  }

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

const createItemId = () => Math.random().toString(36).slice(2, 11);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const typedFontMap: Record<TypedSignatureStyle, string> = {
  script: '"Brush Script MT", "Segoe Script", cursive',
  elegant: 'Georgia, "Times New Roman", serif',
  clean: '"Trebuchet MS", Helvetica, sans-serif',
};

const createTypedSignatureDataUrl = (text: string, style: TypedSignatureStyle) => {
  const content = text.trim();
  if (!content) {
    return '';
  }

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    return '';
  }

  context.font = `64px ${typedFontMap[style]}`;
  const metrics = context.measureText(content);
  const width = Math.ceil(metrics.width + 56);
  const height = 128;
  canvas.width = width;
  canvas.height = height;

  const nextContext = canvas.getContext('2d');
  if (!nextContext) {
    return '';
  }

  nextContext.clearRect(0, 0, width, height);
  nextContext.font = `64px ${typedFontMap[style]}`;
  nextContext.fillStyle = '#111111';
  nextContext.textBaseline = 'middle';
  nextContext.fillText(content, 24, height / 2 + 2);

  return canvas.toDataURL('image/png');
};

const toApiPlacements = (items: SignEditorItem[]) =>
  items.map((item) => ({
    renderer: item.renderer,
    pageIndex: item.pageIndex,
    x: item.x,
    y: item.y,
    width: item.width,
    height: item.height,
    rotation: item.rotation,
    opacity: item.opacity,
    align: item.align,
    text: item.text,
    fontFamily: item.fontFamily,
    fontStyle: item.fontStyle,
    fontColor: item.fontColor,
    assetDataUrl: item.assetDataUrl,
  }));

export default function SignPDF() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewDocument, setPreviewDocument] = useState<PdfPreviewDocument | null>(null);
  const [items, setItems] = useState<SignEditorItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [signatureMode, setSignatureMode] = useState<SignatureMode>('draw');
  const [typedSignature, setTypedSignature] = useState('Alok Sharma');
  const [typedSignatureStyle, setTypedSignatureStyle] = useState<TypedSignatureStyle>('script');
  const [uploadedSignatureDataUrl, setUploadedSignatureDataUrl] = useState('');
  const [customName, setCustomName] = useState('Alok Sharma');
  const [customText, setCustomText] = useState('Approved');
  const [customDate, setCustomDate] = useState(new Date().toISOString().slice(0, 10));
  const [isDragging, setIsDragging] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewProgress, setPreviewProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProcessedPdfFile | null>(null);
  const [hasDrawnSignature, setHasDrawnSignature] = useState(false);
  const drawCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawContextRef = useRef<CanvasRenderingContext2D | null>(null);
  const isDrawingRef = useRef(false);
  const interactionRef = useRef<SignInteraction | null>(null);

  const selectedItem = items.find((item) => item.id === selectedItemId) || null;

  const typedSignatureDataUrl = useMemo(
    () => createTypedSignatureDataUrl(typedSignature, typedSignatureStyle),
    [typedSignature, typedSignatureStyle]
  );

  useEffect(() => {
    const canvas = drawCanvasRef.current;
    if (!canvas) {
      return;
    }

    canvas.width = 420;
    canvas.height = 170;
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    context.lineWidth = 3;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = '#111111';
    drawContextRef.current = context;
  }, []);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const activeInteraction = interactionRef.current;
      if (!activeInteraction || !previewDocument) {
        return;
      }

      const page = previewDocument.pages[activeInteraction.pageIndex];
      if (!page) {
        return;
      }

      const deltaX = (event.clientX - activeInteraction.startX) / page.width;
      const deltaY = (event.clientY - activeInteraction.startY) / page.height;

      setItems((currentItems) =>
        currentItems.map((item) => {
          if (item.id !== activeInteraction.itemId) {
            return item;
          }

          if (activeInteraction.type === 'move') {
            return {
              ...item,
              x: clamp(activeInteraction.originX + deltaX, 0, 1 - item.width),
              y: clamp(activeInteraction.originY + deltaY, 0, 1 - item.height),
            };
          }

          return {
            ...item,
            width: clamp(activeInteraction.originWidth + deltaX, 0.06, 1 - item.x),
            height: clamp(activeInteraction.originHeight + deltaY, 0.03, 1 - item.y),
          };
        })
      );
    };

    const handleMouseUp = () => {
      interactionRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [previewDocument]);

  const loadFilePreview = useCallback(async (file: File) => {
    setIsLoadingPreview(true);
    setPreviewProgress(0);
    setError(null);
    setResult(null);

    try {
      const loadedPreview = await loadPdfPreview(file, {
        maxPageWidth: 760,
        includeTextSpans: false,
        onProgress: setPreviewProgress,
      });

      setSelectedFile(file);
      setPreviewDocument(loadedPreview);
      setItems([]);
      setSelectedItemId(null);
      setActivePageIndex(0);
    } catch (requestError) {
      setPreviewDocument(null);
      setSelectedFile(null);
      setItems([]);
      setSelectedItemId(null);
      setError(
        requestError instanceof Error ? requestError.message : 'Failed to load PDF preview'
      );
    } finally {
      setIsLoadingPreview(false);
    }
  }, []);

  const handleSelectFile = useCallback(
    (files: File[]) => {
      const pdfFile = files.find(isPdfToolFile);
      if (!pdfFile) {
        setError('Please upload a PDF file.');
        return;
      }

      void loadFilePreview(pdfFile);
    },
    [loadFilePreview]
  );

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

  const clearSignatureCanvas = () => {
    const canvas = drawCanvasRef.current;
    const context = drawContextRef.current;
    if (!canvas || !context) {
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawnSignature(false);
  };

  const beginDrawing = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = drawCanvasRef.current;
    const context = drawContextRef.current;
    if (!canvas || !context) {
      return;
    }

    const bounds = canvas.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * canvas.width;
    const y = ((event.clientY - bounds.top) / bounds.height) * canvas.height;
    context.beginPath();
    context.moveTo(x, y);
    isDrawingRef.current = true;
    setHasDrawnSignature(true);
  };

  const continueDrawing = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = drawCanvasRef.current;
    const context = drawContextRef.current;
    if (!canvas || !context || !isDrawingRef.current) {
      return;
    }

    const bounds = canvas.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * canvas.width;
    const y = ((event.clientY - bounds.top) / bounds.height) * canvas.height;
    context.lineTo(x, y);
    context.stroke();
  };

  const stopDrawing = () => {
    isDrawingRef.current = false;
  };

  const handleSignatureUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const [file] = Array.from(event.target.files || []);
    event.target.value = '';
    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      setError('Please upload a PNG or JPG signature image.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setUploadedSignatureDataUrl(typeof reader.result === 'string' ? reader.result : '');
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  const resolveCurrentSignatureAsset = () => {
    if (signatureMode === 'upload') {
      return uploadedSignatureDataUrl;
    }

    if (signatureMode === 'type') {
      return typedSignatureDataUrl;
    }

    const canvas = drawCanvasRef.current;
    if (!canvas || !hasDrawnSignature) {
      return '';
    }

    return canvas.toDataURL('image/png');
  };

  const addItem = (nextItem: SignEditorItem) => {
    setItems((currentItems) => [...currentItems, nextItem]);
    setSelectedItemId(nextItem.id);
    setResult(null);
    setError(null);
  };

  const addSignature = () => {
    if (!previewDocument) {
      return;
    }

    const assetDataUrl = resolveCurrentSignatureAsset();
    if (!assetDataUrl) {
      setError('Create or upload a signature first.');
      return;
    }

    addItem({
      id: createItemId(),
      kind: 'signature',
      renderer: 'image',
      pageIndex: activePageIndex,
      x: 0.34,
      y: 0.56,
      width: 0.26,
      height: 0.1,
      rotation: 0,
      opacity: 1,
      assetDataUrl,
    });
  };

  const addTextField = (kind: Extract<SignItemKind, 'date' | 'name' | 'text'>, value: string) => {
    const text = value.trim();
    if (!text) {
      setError(`Enter ${kind === 'text' ? 'text' : kind} before adding it.`);
      return;
    }

    addItem({
      id: createItemId(),
      kind,
      renderer: 'text',
      pageIndex: activePageIndex,
      x: 0.34,
      y: kind === 'date' ? 0.2 : 0.35,
      width: 0.24,
      height: 0.06,
      rotation: 0,
      opacity: 1,
      align: 'left',
      text,
      fontFamily: kind === 'text' ? 'sans' : 'serif',
      fontStyle: kind === 'name' ? 'bold' : 'normal',
      fontColor: '#111111',
    });
  };

  const startInteraction = (
    event: React.MouseEvent<HTMLDivElement | HTMLButtonElement>,
    item: SignEditorItem,
    type: 'move' | 'resize'
  ) => {
    event.stopPropagation();
    event.preventDefault();

    interactionRef.current = {
      type,
      itemId: item.id,
      pageIndex: item.pageIndex,
      startX: event.clientX,
      startY: event.clientY,
      originX: item.x,
      originY: item.y,
      originWidth: item.width,
      originHeight: item.height,
    };

    setSelectedItemId(item.id);
  };

  const updateSelectedItem = (updater: (item: SignEditorItem) => SignEditorItem) => {
    if (!selectedItemId) {
      return;
    }

    setItems((currentItems) =>
      currentItems.map((item) => (item.id === selectedItemId ? updater(item) : item))
    );
    setResult(null);
  };

  const handleApplySignature = async () => {
    if (!selectedFile || items.length === 0 || isProcessing) {
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const processed = await signPdfFile(selectedFile, toApiPlacements(items));
      setResult(processed);
    } catch (requestError) {
      setResult(null);
      setError(requestError instanceof Error ? requestError.message : 'Failed to sign PDF');
    } finally {
      setIsProcessing(false);
    }
  };

  const clearFile = () => {
    if (isProcessing) {
      return;
    }

    setSelectedFile(null);
    setPreviewDocument(null);
    setItems([]);
    setSelectedItemId(null);
    setResult(null);
    setError(null);
    setPreviewProgress(0);
  };

  return (
    <div className="w-full px-3 sm:px-4 lg:px-6 py-8 overflow-x-clip">
      <div className="max-w-6xl mx-auto space-y-4">
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
                <FileSignature className="w-8 h-8 sm:w-10 sm:h-10 text-violet" />
              </div>
              <h3 className="font-display font-bold text-xl sm:text-2xl text-dark text-center mb-2">
                Drop PDF file to sign
              </h3>
              <p className="text-gray text-center mb-6">
                Draw, upload, or type your signature and place it anywhere
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

        {isLoadingPreview && (
          <div className="sticker-card p-4">
            <div className="flex items-center gap-3 mb-2 text-violet">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Rendering PDF preview...</span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-violet transition-all duration-300"
                style={{ width: `${previewProgress}%` }}
              />
            </div>
          </div>
        )}

        {selectedFile && previewDocument && !isLoadingPreview && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]"
          >
            <div className="space-y-4">
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

              <div className="sticker-card p-5 space-y-4">
                <div>
                  <label className="font-display font-bold text-dark block mb-3">
                    Signature Source
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: 'draw', label: 'Draw', icon: PencilLine },
                      { value: 'upload', label: 'Upload', icon: Upload },
                      { value: 'type', label: 'Type', icon: Type },
                    ].map((item) => {
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.value}
                          onClick={() => setSignatureMode(item.value as SignatureMode)}
                          className={`px-4 py-2 rounded-xl border-2 font-medium transition-colors ${
                            signatureMode === item.value
                              ? 'bg-violet text-white border-violet'
                              : 'bg-white text-dark border-gray-200 hover:border-violet'
                          }`}
                        >
                          <Icon className="w-4 h-4 inline mr-2" />
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {signatureMode === 'draw' && (
                  <div className="space-y-3">
                    <div className="rounded-2xl border-2 border-gray-200 bg-white overflow-hidden">
                      <canvas
                        ref={drawCanvasRef}
                        onMouseDown={beginDrawing}
                        onMouseMove={continueDrawing}
                        onMouseUp={stopDrawing}
                        onMouseLeave={stopDrawing}
                        className="w-full h-[170px] cursor-crosshair"
                      />
                    </div>
                    <button onClick={clearSignatureCanvas} className="sticker-button-secondary w-full">
                      Clear Signature
                    </button>
                  </div>
                )}

                {signatureMode === 'upload' && (
                  <div className="space-y-3">
                    <label className="sticker-button-secondary cursor-pointer w-full flex items-center justify-center">
                      <Upload className="w-4 h-4 mr-2" />
                      <span>Upload Signature Image</span>
                      <input
                        type="file"
                        accept=".png,.jpg,.jpeg,image/png,image/jpeg"
                        onChange={handleSignatureUpload}
                        className="hidden"
                      />
                    </label>
                    {uploadedSignatureDataUrl && (
                      <div className="rounded-2xl border-2 border-gray-200 bg-white p-4">
                        <img
                          src={uploadedSignatureDataUrl}
                          alt="Uploaded signature"
                          className="max-h-24 mx-auto object-contain"
                        />
                      </div>
                    )}
                  </div>
                )}

                {signatureMode === 'type' && (
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={typedSignature}
                      onChange={(event) => setTypedSignature(event.target.value)}
                      placeholder="Type your signature"
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-violet focus:outline-none"
                    />
                    <div className="flex flex-wrap gap-2">
                      {([
                        { value: 'script', label: 'Script' },
                        { value: 'elegant', label: 'Elegant' },
                        { value: 'clean', label: 'Clean' },
                      ] as const).map((item) => (
                        <button
                          key={item.value}
                          onClick={() => setTypedSignatureStyle(item.value)}
                          className={`px-4 py-2 rounded-xl border-2 font-medium transition-colors ${
                            typedSignatureStyle === item.value
                              ? 'bg-violet text-white border-violet'
                              : 'bg-white text-dark border-gray-200 hover:border-violet'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                    {typedSignatureDataUrl && (
                      <div className="rounded-2xl border-2 border-gray-200 bg-white p-4">
                        <img
                          src={typedSignatureDataUrl}
                          alt="Typed signature"
                          className="max-h-24 mx-auto object-contain"
                        />
                      </div>
                    )}
                  </div>
                )}

                <button onClick={addSignature} className="sticker-button w-full">
                  <FileSignature className="w-4 h-4 mr-2" />
                  Add Signature
                </button>
              </div>

              <div className="sticker-card p-5 space-y-4">
                <div className="flex items-center gap-2 text-dark">
                  <UserRound className="w-4 h-4 text-violet" />
                  <span className="font-display font-bold">Fields</span>
                </div>

                <div className="space-y-2">
                  <input
                    type="text"
                    value={customName}
                    onChange={(event) => setCustomName(event.target.value)}
                    placeholder="Full name"
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-violet focus:outline-none"
                  />
                  <button
                    onClick={() => addTextField('name', customName)}
                    className="sticker-button-secondary w-full"
                  >
                    Add Name
                  </button>
                </div>

                <div className="space-y-2">
                  <input
                    type="date"
                    value={customDate}
                    onChange={(event) => setCustomDate(event.target.value)}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-violet focus:outline-none"
                  />
                  <button
                    onClick={() => addTextField('date', customDate)}
                    className="sticker-button-secondary w-full"
                  >
                    Add Date
                  </button>
                </div>

                <div className="space-y-2">
                  <input
                    type="text"
                    value={customText}
                    onChange={(event) => setCustomText(event.target.value)}
                    placeholder="Custom text"
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-violet focus:outline-none"
                  />
                  <button
                    onClick={() => addTextField('text', customText)}
                    className="sticker-button-secondary w-full"
                  >
                    Add Text
                  </button>
                </div>
              </div>

              {selectedItem && (
                <div className="sticker-card p-5 space-y-3">
                  <p className="font-display font-bold text-dark capitalize">
                    Selected {selectedItem.kind}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() =>
                        updateSelectedItem((item) => ({
                          ...item,
                          rotation: item.rotation - 15,
                        }))
                      }
                      className="sticker-button-secondary"
                    >
                      Rotate Left
                    </button>
                    <button
                      onClick={() =>
                        updateSelectedItem((item) => ({
                          ...item,
                          rotation: item.rotation + 15,
                        }))
                      }
                      className="sticker-button-secondary"
                    >
                      Rotate Right
                    </button>
                    <button
                      onClick={() =>
                        updateSelectedItem((item) => ({
                          ...item,
                          width: clamp(item.width - 0.02, 0.06, 1 - item.x),
                          height: clamp(item.height - 0.01, 0.03, 1 - item.y),
                        }))
                      }
                      className="sticker-button-secondary"
                    >
                      Smaller
                    </button>
                    <button
                      onClick={() =>
                        updateSelectedItem((item) => ({
                          ...item,
                          width: clamp(item.width + 0.02, 0.06, 1 - item.x),
                          height: clamp(item.height + 0.01, 0.03, 1 - item.y),
                        }))
                      }
                      className="sticker-button-secondary"
                    >
                      Larger
                    </button>
                  </div>
                  <button
                    onClick={() => {
                      setItems((currentItems) =>
                        currentItems.filter((item) => item.id !== selectedItem.id)
                      );
                      setSelectedItemId(null);
                    }}
                    className="w-full px-4 py-3 bg-red-500 text-white rounded-xl border-2 border-black font-medium hover:bg-red-600 transition-colors"
                  >
                    Remove Selected
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-4">
              {error && (
                <div className="sticker-card p-4">
                  <p className="text-red-500 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    {error}
                  </p>
                </div>
              )}

              <div className="sticker-card p-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm text-gray">
                  <span className="sticker-label bg-violet text-white border-violet">
                    {previewDocument.pageCount} pages
                  </span>
                  <span>Selected page: {activePageIndex + 1}</span>
                  <span>Fields: {items.length}</span>
                </div>
                <div className="flex flex-wrap gap-2">
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
                  <button
                    onClick={() => void handleApplySignature()}
                    disabled={items.length === 0 || isProcessing}
                    className="sticker-button disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Applying...
                      </>
                    ) : (
                      <>
                        <FileSignature className="w-4 h-4 mr-2" />
                        Apply Signature
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

              <div className="space-y-6">
                {previewDocument.pages.map((page) => {
                  const pageItems = items.filter((item) => item.pageIndex === page.pageIndex);

                  return (
                    <div
                      key={page.pageIndex}
                      className={`sticker-card p-4 ${
                        activePageIndex === page.pageIndex ? 'ring-2 ring-violet ring-offset-2' : ''
                      }`}
                      onClick={() => setActivePageIndex(page.pageIndex)}
                    >
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <div className="flex items-center gap-2">
                          <span className="sticker-label">Page {page.pageIndex + 1}</span>
                          {activePageIndex === page.pageIndex && (
                            <span className="text-xs text-violet font-medium">Active page</span>
                          )}
                        </div>
                        <span className="text-xs text-gray">
                          Drag to move, corner handle to resize
                        </span>
                      </div>

                      <div
                        className="relative mx-auto bg-gray-100 rounded-xl overflow-hidden border border-gray-200"
                        style={{ width: `${page.width}px`, maxWidth: '100%' }}
                      >
                        <img
                          src={page.imageUrl}
                          alt={`Page ${page.pageIndex + 1}`}
                          className="block w-full h-auto"
                        />

                        {pageItems.map((item) => {
                          const isSelected = item.id === selectedItemId;

                          return (
                            <div
                              key={item.id}
                              onMouseDown={(event) => startInteraction(event, item, 'move')}
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedItemId(item.id);
                              }}
                              className={`absolute cursor-move border-2 ${
                                isSelected
                                  ? 'border-pink shadow-[0_0_0_2px_rgba(236,72,153,0.16)]'
                                  : 'border-violet/70'
                              } bg-white/70 backdrop-blur-[1px]`}
                              style={{
                                left: `${item.x * 100}%`,
                                top: `${item.y * 100}%`,
                                width: `${item.width * 100}%`,
                                height: `${item.height * 100}%`,
                                transform: `rotate(${item.rotation}deg)`,
                                transformOrigin: 'center',
                              }}
                            >
                              {item.renderer === 'image' && item.assetDataUrl ? (
                                <img
                                  src={item.assetDataUrl}
                                  alt={item.kind}
                                  className="w-full h-full object-contain pointer-events-none"
                                />
                              ) : (
                                <div
                                  className="w-full h-full px-2 flex items-center"
                                  style={{
                                    fontFamily:
                                      item.fontFamily === 'serif'
                                        ? 'Georgia, serif'
                                        : item.fontFamily === 'mono'
                                          ? '"Courier New", monospace'
                                          : 'Helvetica, Arial, sans-serif',
                                    fontWeight: item.fontStyle === 'bold' ? 700 : 400,
                                    color: item.fontColor || '#111111',
                                    fontSize: `${Math.max(12, page.height * item.height * 0.45)}px`,
                                  }}
                                >
                                  <span className="truncate pointer-events-none">{item.text}</span>
                                </div>
                              )}

                              <button
                                onMouseDown={(event) => startInteraction(event, item, 'resize')}
                                className="absolute -bottom-2 -right-2 w-5 h-5 rounded-full bg-pink border-2 border-white cursor-se-resize"
                                aria-label="Resize field"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
