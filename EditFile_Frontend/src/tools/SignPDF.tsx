import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  Calendar,
  Download,
  FileSignature,
  FileText,
  Loader2,
  PencilLine,
  Redo2,
  Trash2,
  Type,
  Upload,
  Undo2,
  UserRound,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { loadPdfPreview, type PdfPreviewDocument, type PdfPreviewPage } from '@/lib/pdfPreview';
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
type SavedSignature = {
  id: string;
  dataUrl: string;
  source: SignatureMode;
  createdAt: number;
};

interface SignEditorItem extends PdfSignPlacement {
  id: string;
  kind: SignItemKind;
}

interface SignInteraction {
  type: 'move' | 'resize' | 'rotate';
  itemId: string;
  pageIndex: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  originWidth: number;
  originHeight: number;
  originRotation: number;
  centerX?: number;
  centerY?: number;
  startAngle?: number;
}

const MAX_PDF_SIZE_BYTES = 100 * 1024 * 1024;
const VIEWER_HEIGHT_RATIO = 0.62;
const VIEWER_MIN_HEIGHT = 360;
const VIEWER_MAX_HEIGHT = 720;
const VIEWER_HEADER_OFFSET = 120;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2;
const PAGE_THUMB_HEIGHT = 160;
const PAGE_THUMB_GAP = 12;
const PAGE_THUMB_VISIBLE_COUNT = 2;
const SIGN_ITEM_DEFAULTS: Record<SignItemKind, { width: number; height: number }> = {
  signature: { width: 0.26, height: 0.1 },
  date: { width: 0.22, height: 0.06 },
  name: { width: 0.22, height: 0.06 },
  text: { width: 0.26, height: 0.06 },
};

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
const cloneItems = (values: SignEditorItem[]) => values.map((item) => ({ ...item }));

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
  const [savedSignatures, setSavedSignatures] = useState<SavedSignature[]>([]);
  const [activeSignatureId, setActiveSignatureId] = useState<string | null>(null);
  const [customName, setCustomName] = useState('Alok Sharma');
  const [customText, setCustomText] = useState('Approved');
  const [customDate, setCustomDate] = useState(new Date().toISOString().slice(0, 10));
  const [isDragging, setIsDragging] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewProgress, setPreviewProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [result, setResult] = useState<ProcessedPdfFile | null>(null);
  const [hasDrawnSignature, setHasDrawnSignature] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [placementMode, setPlacementMode] = useState<SignItemKind | null>(null);
  const [history, setHistory] = useState<SignEditorItem[][]>([]);
  const [future, setFuture] = useState<SignEditorItem[][]>([]);
  const [viewerHeight, setViewerHeight] = useState<number | null>(null);
  const [pageViewportSize, setPageViewportSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawContextRef = useRef<CanvasRenderingContext2D | null>(null);
  const isDrawingRef = useRef(false);
  const hasDrawnSignatureRef = useRef(false);
  const interactionRef = useRef<SignInteraction | null>(null);
  const interactionSnapshotRef = useRef<SignEditorItem[] | null>(null);
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const activeViewportRef = useRef<HTMLDivElement | null>(null);
  const scrollRafRef = useRef<number | null>(null);
  const itemsRef = useRef<SignEditorItem[]>([]);
  const activePageIndexRef = useRef(0);

  const selectedItem = items.find((item) => item.id === selectedItemId) || null;
  const activeSignature =
    savedSignatures.find((signature) => signature.id === activeSignatureId) || null;
  const activeSignatureDataUrl = activeSignature?.dataUrl || '';

  const typedSignatureDataUrl = useMemo(
    () => createTypedSignatureDataUrl(typedSignature, typedSignatureStyle),
    [typedSignature, typedSignatureStyle]
  );

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    activePageIndexRef.current = activePageIndex;
  }, [activePageIndex]);

  useEffect(() => {
    hasDrawnSignatureRef.current = hasDrawnSignature;
  }, [hasDrawnSignature]);

  useEffect(() => {
    if (!previewDocument) {
      return;
    }

    const updateViewerHeight = () => {
      if (typeof window === 'undefined') {
        return;
      }
      const target = Math.round(window.innerHeight * VIEWER_HEIGHT_RATIO);
      setViewerHeight(clamp(target, VIEWER_MIN_HEIGHT, VIEWER_MAX_HEIGHT));
    };

    updateViewerHeight();
    window.addEventListener('resize', updateViewerHeight);
    return () => window.removeEventListener('resize', updateViewerHeight);
  }, [previewDocument]);

  useEffect(() => {
    if (!previewDocument) {
      setPageViewportSize(null);
      return;
    }

    if (typeof window === 'undefined') {
      return;
    }

    const element = activeViewportRef.current;
    if (!element) {
      return;
    }

    let rafId: number | null = null;
    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        return;
      }
      setPageViewportSize({ width: rect.width, height: rect.height });
    };

    const scheduleUpdate = () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      rafId = window.requestAnimationFrame(updateSize);
    };

    scheduleUpdate();

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => scheduleUpdate());
      observer.observe(element);
    } else {
      window.addEventListener('resize', scheduleUpdate);
    }

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      observer?.disconnect();
      if (!observer) {
        window.removeEventListener('resize', scheduleUpdate);
      }
    };
  }, [previewDocument, activePageIndex, viewerHeight]);

  const resolveFitScale = useCallback(
    (page?: PdfPreviewPage | null) => {
      if (!page) {
        return 1;
      }

      let viewportWidth = pageViewportSize?.width || 0;
      let viewportHeight = pageViewportSize?.height || 0;

      if ((!viewportWidth || !viewportHeight) && viewerRef.current) {
        const rect = viewerRef.current.getBoundingClientRect();
        viewportWidth = rect.width;
        viewportHeight = Math.max(0, rect.height - VIEWER_HEADER_OFFSET);
      }

      if (!viewportWidth || !viewportHeight) {
        return 1;
      }

      const scale = Math.min(viewportWidth / page.width, viewportHeight / page.height);
      return Number(scale.toFixed(3));
    },
    [pageViewportSize]
  );

  const resolvePageScale = useCallback(
    (pageIndex: number) => {
      if (!previewDocument) {
        return zoom;
      }

      const page = previewDocument.pages[pageIndex];
      if (!page) {
        return zoom;
      }

      const fitScale = resolveFitScale(page);
      const isActive = pageIndex === activePageIndexRef.current;
      return Number((fitScale * (isActive ? zoom : 1)).toFixed(3));
    },
    [previewDocument, resolveFitScale, zoom]
  );

  const syncDrawCanvas = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const canvas = drawCanvasRef.current;
    if (!canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return;
    }

    const snapshot = hasDrawnSignatureRef.current
      ? canvas.toDataURL('image/png')
      : null;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    canvas.height = Math.max(1, Math.floor(rect.height * ratio));

    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.lineWidth = 3;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = '#111111';
    context.clearRect(0, 0, rect.width, rect.height);
    drawContextRef.current = context;

    if (snapshot) {
      const image = new Image();
      image.onload = () => {
        context.drawImage(image, 0, 0, rect.width, rect.height);
      };
      image.src = snapshot;
    }
  }, []);

  useEffect(() => {
    if (signatureMode !== 'draw') {
      return;
    }

    const canvas = drawCanvasRef.current;
    if (!canvas) {
      return;
    }

    syncDrawCanvas();

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => syncDrawCanvas());
      observer.observe(canvas);
    }

    window.addEventListener('resize', syncDrawCanvas);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', syncDrawCanvas);
    };
  }, [signatureMode, syncDrawCanvas]);

  const pushHistory = useCallback((snapshot: SignEditorItem[]) => {
    setHistory((prev) => [...prev, cloneItems(snapshot)]);
    setFuture([]);
  }, []);

  const commitItems = useCallback(
    (updater: (current: SignEditorItem[]) => SignEditorItem[]) => {
      setItems((current) => {
        pushHistory(current);
        return updater(current);
      });
    },
    [pushHistory]
  );

  const handleUndo = () => {
    setHistory((prev) => {
      if (prev.length === 0) {
        return prev;
      }
      const previous = prev[prev.length - 1];
      setFuture((next) => [cloneItems(itemsRef.current), ...next]);
      setItems(previous);
      setSelectedItemId(null);
      setResult(null);
      return prev.slice(0, -1);
    });
  };

  const handleRedo = () => {
    setFuture((prev) => {
      if (prev.length === 0) {
        return prev;
      }
      const [nextItems, ...rest] = prev;
      setHistory((historyPrev) => [...historyPrev, cloneItems(itemsRef.current)]);
      setItems(nextItems);
      setSelectedItemId(null);
      setResult(null);
      return rest;
    });
  };

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const activeInteraction = interactionRef.current;
      if (!activeInteraction || !previewDocument) {
        return;
      }

      const page = previewDocument.pages[activeInteraction.pageIndex];
      if (!page) {
        return;
      }

      if (activeInteraction.type === 'rotate') {
        if (
          activeInteraction.centerX === undefined ||
          activeInteraction.centerY === undefined ||
          activeInteraction.startAngle === undefined
        ) {
          return;
        }

        const angle = Math.atan2(
          event.clientY - activeInteraction.centerY,
          event.clientX - activeInteraction.centerX
        );
        const delta = (angle - activeInteraction.startAngle) * (180 / Math.PI);
        setItems((currentItems) =>
          currentItems.map((item) =>
            item.id === activeInteraction.itemId
              ? { ...item, rotation: activeInteraction.originRotation + delta }
              : item
          )
        );
        return;
      }

      const pageScale = resolvePageScale(activeInteraction.pageIndex);
      const deltaX =
        (event.clientX - activeInteraction.startX) / (page.width * pageScale);
      const deltaY =
        (event.clientY - activeInteraction.startY) / (page.height * pageScale);

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

    const handlePointerUp = () => {
      if (interactionRef.current && interactionSnapshotRef.current) {
        pushHistory(interactionSnapshotRef.current);
        interactionSnapshotRef.current = null;
      }
      interactionRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [previewDocument, pushHistory, resolvePageScale]);

  const loadFilePreview = useCallback(async (file: File) => {
    setIsLoadingPreview(true);
    setPreviewProgress(0);
    setError(null);
    setWarning(null);
    setResult(null);
    setPlacementMode(null);

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
      setHistory([]);
      setFuture([]);
      if (typeof window !== 'undefined') {
        const targetHeight = clamp(
          Math.round(window.innerHeight * VIEWER_HEIGHT_RATIO),
          VIEWER_MIN_HEIGHT,
          VIEWER_MAX_HEIGHT
        );
        setViewerHeight(targetHeight);
      }
      setZoom(1);
      setPageViewportSize(null);
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
        setWarning(null);
        return;
      }

      if (pdfFile.size > MAX_PDF_SIZE_BYTES) {
        setWarning('File is too large. Maximum size is 100MB.');
        setError(null);
        return;
      }

      setWarning(null);
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

    const rect = canvas.getBoundingClientRect();
    context.clearRect(0, 0, rect.width, rect.height);
    setHasDrawnSignature(false);
  };

  const getCanvasPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = drawCanvasRef.current;
    if (!canvas) {
      return null;
    }
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  const beginDrawing = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = drawCanvasRef.current;
    const context = drawContextRef.current;
    if (!canvas || !context) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const point = getCanvasPoint(event);
    if (!point) {
      return;
    }
    context.beginPath();
    context.moveTo(point.x, point.y);
    isDrawingRef.current = true;
    setHasDrawnSignature(true);
  };

  const continueDrawing = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = drawCanvasRef.current;
    const context = drawContextRef.current;
    if (!canvas || !context || !isDrawingRef.current) {
      return;
    }

    event.preventDefault();
    const point = getCanvasPoint(event);
    if (!point) {
      return;
    }
    context.lineTo(point.x, point.y);
    context.stroke();
  };

  const stopDrawing = (event?: React.PointerEvent<HTMLCanvasElement>) => {
    if (event) {
      event.preventDefault();
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    isDrawingRef.current = false;
  };

  const handleSignatureUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const [file] = Array.from(event.target.files || []);
    event.target.value = '';
    if (!file) {
      return;
    }

    if (!['image/png', 'image/jpeg'].includes(file.type)) {
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

  const resolveDraftSignatureAsset = () => {
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

  const resolvePlacementSignatureAsset = () => {
    const draft = resolveDraftSignatureAsset();
    if (draft) {
      return draft;
    }
    if (activeSignatureDataUrl) {
      return activeSignatureDataUrl;
    }
    return savedSignatures[savedSignatures.length - 1]?.dataUrl || '';
  };

  const handleSaveSignature = () => {
    const assetDataUrl = resolveDraftSignatureAsset();
    if (!assetDataUrl) {
      setError('Create or upload a signature first.');
      return;
    }

    setSavedSignatures((prev) => {
      const existing = prev.find((signature) => signature.dataUrl === assetDataUrl);
      if (existing) {
        setActiveSignatureId(existing.id);
        return prev;
      }

      const nextSignature: SavedSignature = {
        id: createItemId(),
        dataUrl: assetDataUrl,
        source: signatureMode,
        createdAt: Date.now(),
      };
      setActiveSignatureId(nextSignature.id);
      return [...prev, nextSignature];
    });
    setPlacementMode('signature');
    setError(null);
  };

  const addItem = (nextItem: SignEditorItem) => {
    commitItems((currentItems) => [...currentItems, nextItem]);
    setSelectedItemId(nextItem.id);
    setResult(null);
    setError(null);
  };

  const beginPlacement = (kind: SignItemKind) => {
    if (!previewDocument) {
      return;
    }

    if (kind === 'signature') {
      if (!canPlaceSignature) {
        setError('Create or upload a signature first.');
        return;
      }
      if (!activeSignatureId && savedSignatures.length > 0) {
        setActiveSignatureId(savedSignatures[savedSignatures.length - 1].id);
      }
    }

    if (kind === 'date' && !customDate.trim()) {
      setError('Select a date before adding it.');
      return;
    }

    if (kind === 'text' && !customText.trim()) {
      setError('Enter text before adding it.');
      return;
    }

    if (kind === 'name' && !customName.trim()) {
      setError('Enter a name before adding it.');
      return;
    }

    setPlacementMode(kind);
    setError(null);
  };

  const placeItemAtPoint = (
    kind: SignItemKind,
    pageIndex: number,
    x: number,
    y: number,
    signatureAssetDataUrl?: string
  ) => {
    if (!previewDocument) {
      return;
    }

    const { width, height } = SIGN_ITEM_DEFAULTS[kind];
    const nextX = clamp(x - width / 2, 0, 1 - width);
    const nextY = clamp(y - height / 2, 0, 1 - height);

    if (kind === 'signature') {
      const assetDataUrl = signatureAssetDataUrl || resolvePlacementSignatureAsset();
      if (!assetDataUrl) {
        setError('Create or upload a signature first.');
        return;
      }

      addItem({
        id: createItemId(),
        kind: 'signature',
        renderer: 'image',
        pageIndex,
        x: nextX,
        y: nextY,
        width,
        height,
        rotation: 0,
        opacity: 1,
        assetDataUrl,
      });
      return;
    }

    const value =
      kind === 'date' ? customDate : kind === 'name' ? customName : customText;

    addItem({
      id: createItemId(),
      kind,
      renderer: 'text',
      pageIndex,
      x: nextX,
      y: nextY,
      width,
      height,
      rotation: 0,
      opacity: 1,
      align: 'left',
      text: value.trim(),
      fontFamily: kind === 'text' ? 'sans' : 'serif',
      fontStyle: kind === 'name' ? 'bold' : 'normal',
      fontColor: '#111111',
    });
  };

  const handlePlaceOnPage = (
    event: React.MouseEvent<HTMLDivElement>,
    pageIndex: number
  ) => {
    if (!previewDocument) {
      return;
    }

    if (!placementMode) {
      setActivePageIndex(pageIndex);
      setSelectedItemId(null);
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setActivePageIndex(pageIndex);
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width;
    const y = (event.clientY - bounds.top) / bounds.height;
    placeItemAtPoint(placementMode, pageIndex, x, y);
    setPlacementMode(null);
  };

  const handleSignatureDragStart = (
    event: React.DragEvent<HTMLButtonElement>,
    signatureId: string
  ) => {
    event.dataTransfer.setData('application/x-signature-id', signatureId);
    event.dataTransfer.setData('text/plain', signatureId);
    event.dataTransfer.effectAllowed = 'copy';
    setActiveSignatureId(signatureId);
    setError(null);
  };

  const handleSignatureDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    const types = event.dataTransfer.types;
    if (types.includes('application/x-signature-id') || types.includes('text/plain')) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleSignatureDrop = (
    event: React.DragEvent<HTMLDivElement>,
    pageIndex: number
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const signatureId =
      event.dataTransfer.getData('application/x-signature-id') ||
      event.dataTransfer.getData('text/plain');
    const signature = savedSignatures.find((item) => item.id === signatureId);
    if (!signature) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width;
    const y = (event.clientY - bounds.top) / bounds.height;
    setActivePageIndex(pageIndex);
    placeItemAtPoint('signature', pageIndex, x, y, signature.dataUrl);
    setPlacementMode(null);
  };

  const handleViewerScroll = useCallback(() => {
    if (!viewerRef.current || scrollRafRef.current) {
      return;
    }

    scrollRafRef.current = window.requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const containerRect = viewerRef.current?.getBoundingClientRect();
      if (!containerRect) {
        return;
      }
      const target = containerRect.top + containerRect.height / 2;
      let closestIndex = activePageIndexRef.current;
      let closestDistance = Number.POSITIVE_INFINITY;

      pageRefs.current.forEach((pageRef, index) => {
        if (!pageRef) {
          return;
        }
        const rect = pageRef.getBoundingClientRect();
        const distance = Math.abs(rect.top + rect.height / 2 - target);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = index;
        }
      });

      if (closestIndex !== activePageIndexRef.current) {
        setActivePageIndex(closestIndex);
      }
    });
  }, []);

  useEffect(() => {
    return () => {
      if (scrollRafRef.current) {
        window.cancelAnimationFrame(scrollRafRef.current);
      }
    };
  }, []);

  const scrollToPage = (pageIndex: number) => {
    const target = pageRefs.current[pageIndex];
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActivePageIndex(pageIndex);
    }
  };

  const startInteraction = (
    event: React.PointerEvent<HTMLDivElement | HTMLButtonElement>,
    item: SignEditorItem,
    type: 'move' | 'resize' | 'rotate'
  ) => {
    if (placementMode) {
      return;
    }

    event.stopPropagation();
    event.preventDefault();

    interactionSnapshotRef.current = cloneItems(itemsRef.current);
    setResult(null);

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
      originRotation: item.rotation,
    };

    if (type === 'rotate') {
      const target = event.currentTarget.parentElement;
      if (target) {
        const rect = target.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        interactionRef.current.centerX = centerX;
        interactionRef.current.centerY = centerY;
        interactionRef.current.startAngle = Math.atan2(
          event.clientY - centerY,
          event.clientX - centerX
        );
      }
    }

    event.currentTarget.setPointerCapture?.(event.pointerId);

    setSelectedItemId(item.id);
  };

  const updateSelectedItem = (updater: (item: SignEditorItem) => SignEditorItem) => {
    if (!selectedItemId) {
      return;
    }

    commitItems((currentItems) =>
      currentItems.map((item) => (item.id === selectedItemId ? updater(item) : item))
    );
    setResult(null);
  };

  const removeSelectedItem = () => {
    if (!selectedItem) {
      return;
    }

    commitItems((currentItems) =>
      currentItems.filter((item) => item.id !== selectedItem.id)
    );
    setSelectedItemId(null);
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
    setWarning(null);
    setPreviewProgress(0);
    setPlacementMode(null);
    setHistory([]);
    setFuture([]);
    setZoom(1);
    setActivePageIndex(0);
    setPageViewportSize(null);
  };

  const handlePrimaryAction = () => {
    if (isProcessing) {
      return;
    }

    if (result) {
      downloadProcessedPdf(result);
      return;
    }

    void handleApplySignature();
  };

  const placementHint =
    placementMode === 'signature'
      ? 'Click on the PDF to place your signature.'
      : placementMode === 'date'
        ? 'Click on the PDF to place the date.'
        : placementMode === 'text'
          ? 'Click on the PDF to place the text.'
          : placementMode === 'name'
            ? 'Click on the PDF to place the name.'
            : '';

  const visiblePageThumbs = previewDocument
    ? Math.min(PAGE_THUMB_VISIBLE_COUNT, previewDocument.pageCount)
    : 0;
  const pagesPanelHeight =
    visiblePageThumbs > 0
      ? visiblePageThumbs * PAGE_THUMB_HEIGHT +
        Math.max(0, visiblePageThumbs - 1) * PAGE_THUMB_GAP
      : 0;

  const canPlaceSignature =
    savedSignatures.length > 0 ||
    (signatureMode === 'upload' ? !!uploadedSignatureDataUrl : false) ||
    (signatureMode === 'type' ? !!typedSignatureDataUrl : false) ||
    (signatureMode === 'draw' ? hasDrawnSignature : false);

  const isPrimaryDisabled = isProcessing || (!result && items.length === 0);

  const zoomIn = () => {
    setZoom((value) => clamp(Number((value + 0.1).toFixed(2)), MIN_ZOOM, MAX_ZOOM));
  };

  const zoomOut = () => {
    setZoom((value) => clamp(Number((value - 0.1).toFixed(2)), MIN_ZOOM, MAX_ZOOM));
  };

  const activePage = previewDocument?.pages[activePageIndex] ?? previewDocument?.pages[0];
  const activePageScale = activePage ? resolveFitScale(activePage) * zoom : zoom;

  return (
    <div className="w-full px-3 sm:px-4 lg:px-6 py-8 overflow-x-clip">
      <div className="max-w-6xl mx-auto space-y-4">
        {!selectedFile && (error || warning) && (
          <div className="space-y-3">
            {error && (
              <div className="sticker-card p-4">
                <p className="text-red-500 text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  {error}
                </p>
              </div>
            )}
            {warning && (
              <div className="sticker-card p-4">
                <p className="text-amber-600 text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  {warning}
                </p>
              </div>
            )}
          </div>
        )}

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
              <p className="text-gray text-center">Upload a PDF to sign</p>
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
            className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)_320px]"
          >
            <div className="space-y-3 order-2 lg:order-1 lg:flex lg:flex-col lg:min-h-0">
              <div className="sticker-card p-4 flex flex-col min-h-0 relative overflow-hidden bg-gradient-to-b from-white via-white to-violet/5">
                <div
                  className="absolute -top-12 -right-10 h-24 w-24 rounded-full bg-violet/10"
                  aria-hidden="true"
                />
                <div
                  className="absolute -bottom-16 -left-12 h-28 w-28 rounded-full bg-pink/10"
                  aria-hidden="true"
                />
                <div className="relative flex items-center justify-between">
                  <div className="flex items-center gap-2 text-dark">
                    <span className="inline-flex h-2.5 w-2.5 rounded-full bg-violet shadow-[0_0_0_4px_rgba(107,77,255,0.15)]" />
                    <span className="font-display font-bold">Pages</span>
                  </div>
                  <span className="text-xs text-gray bg-white/80 border border-gray-200 rounded-full px-2 py-1">
                    {previewDocument.pageCount} total
                  </span>
                </div>
                <div
                  className="relative mt-4 space-y-3 overflow-y-auto pr-1"
                  style={{
                    height: pagesPanelHeight ? `${pagesPanelHeight}px` : 'auto',
                    maxHeight: pagesPanelHeight ? `${pagesPanelHeight}px` : 'auto',
                  }}
                >
                  {previewDocument.pages.map((page) => {
                    const isActive = activePageIndex === page.pageIndex;
                    return (
                      <button
                        key={page.pageIndex}
                        onClick={() => scrollToPage(page.pageIndex)}
                        className={`group w-full rounded-2xl border-2 p-2 transition flex flex-col items-center justify-between h-40 ${
                          isActive
                            ? 'border-violet bg-white shadow-[0_12px_24px_rgba(107,77,255,0.18)]'
                            : 'border-transparent hover:border-gray-200 hover:bg-white/80'
                        }`}
                      >
                        <div
                          className={`rounded-xl overflow-hidden border bg-white transition flex items-center justify-center h-28 w-28 ${
                            isActive ? 'border-violet/40 ring-2 ring-violet/20' : 'border-gray-200'
                          }`}
                        >
                          <img
                            src={page.imageUrl}
                            alt={`Page ${page.pageIndex + 1}`}
                            className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-[1.02]"
                          />
                        </div>
                        <div className="mt-2 w-full flex items-center justify-between text-xs text-gray">
                          <span>Page {page.pageIndex + 1}</span>
                          {isActive && (
                            <span className="text-violet font-semibold bg-violet/10 px-2 py-0.5 rounded-full">
                              Active
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="sticker-card p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-display font-bold text-dark">Editor</span>
                  <span className="text-xs text-gray">
                    Page {activePageIndex + 1} of {previewDocument.pageCount}
                  </span>
                </div>

                <div className="space-y-2">
                  <span className="text-[11px] uppercase tracking-wider text-gray font-semibold">
                    History
                  </span>
                  <button
                    onClick={handleUndo}
                    disabled={history.length === 0}
                    className="sticker-button-secondary w-full justify-start px-3 py-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <Undo2 className="w-4 h-4 mr-2" />
                    Undo
                  </button>
                  <button
                    onClick={handleRedo}
                    disabled={future.length === 0}
                    className="sticker-button-secondary w-full justify-start px-3 py-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <Redo2 className="w-4 h-4 mr-2" />
                    Redo
                  </button>
                </div>

                <div className="space-y-2">
                  <span className="text-[11px] uppercase tracking-wider text-gray font-semibold">
                    Zoom
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={zoomOut}
                      className="sticker-button-secondary flex-1 justify-center px-3 py-2 text-sm"
                    >
                      <ZoomOut className="w-4 h-4" />
                    </button>
                    <span className="text-xs text-gray w-12 text-center">
                      {Math.round(activePageScale * 100)}%
                    </span>
                    <button
                      onClick={zoomIn}
                      className="sticker-button-secondary flex-1 justify-center px-3 py-2 text-sm"
                    >
                      <ZoomIn className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-[11px] uppercase tracking-wider text-gray font-semibold">
                    Insert
                  </span>
                  <button
                    onClick={() => beginPlacement('date')}
                    className="sticker-button-secondary w-full justify-start px-3 py-2 text-sm"
                  >
                    <Calendar className="w-4 h-4 mr-2" />
                    Add Date
                  </button>
                  <button
                    onClick={() => beginPlacement('text')}
                    className="sticker-button-secondary w-full justify-start px-3 py-2 text-sm"
                  >
                    <Type className="w-4 h-4 mr-2" />
                    Add Text
                  </button>
                  <button
                    onClick={removeSelectedItem}
                    disabled={!selectedItem}
                    className="sticker-button-secondary w-full justify-start px-3 py-2 text-sm text-red-600 border-red-200 hover:border-red-300 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Selected
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-3 order-3 lg:order-3 lg:flex lg:flex-col lg:min-h-0 lg:overflow-auto lg:pr-1">
              <div className="sticker-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-dark">
                    <FileSignature className="w-4 h-4 text-violet" />
                    <span className="font-display font-bold">Signature</span>
                  </div>
                  {savedSignatures.length > 0 && (
                    <span className="text-xs text-violet font-medium">
                      {savedSignatures.length} saved
                    </span>
                  )}
                </div>
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
                        className={`flex-1 px-3 py-2 rounded-xl border-2 text-sm font-medium transition-colors ${
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

                {signatureMode === 'draw' && (
                  <div className="space-y-3">
                    <div className="rounded-2xl border-2 border-gray-200 bg-white overflow-hidden">
                      <canvas
                        ref={drawCanvasRef}
                        onPointerDown={beginDrawing}
                        onPointerMove={continueDrawing}
                        onPointerUp={stopDrawing}
                        onPointerLeave={stopDrawing}
                        onPointerCancel={stopDrawing}
                        className="w-full h-[170px] cursor-crosshair touch-none"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={clearSignatureCanvas}
                        className="sticker-button-secondary"
                      >
                        Clear
                      </button>
                      <button onClick={handleSaveSignature} className="sticker-button">
                        Save Signature
                      </button>
                    </div>
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
                    <p className="text-xs text-gray">
                      PNG with a transparent background looks best.
                    </p>
                    {uploadedSignatureDataUrl && (
                      <div className="rounded-2xl border-2 border-gray-200 bg-white p-4">
                        <img
                          src={uploadedSignatureDataUrl}
                          alt="Uploaded signature"
                          className="max-h-24 mx-auto object-contain"
                        />
                      </div>
                    )}
                    <button onClick={handleSaveSignature} className="sticker-button w-full">
                      Save Signature
                    </button>
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
                    <div className="grid gap-2">
                      {([
                        { value: 'script', label: 'Script' },
                        { value: 'elegant', label: 'Elegant' },
                        { value: 'clean', label: 'Clean' },
                      ] as const).map((item) => (
                        <button
                          key={item.value}
                          onClick={() => setTypedSignatureStyle(item.value)}
                          className={`w-full rounded-xl border-2 p-3 text-left transition-colors ${
                            typedSignatureStyle === item.value
                              ? 'border-violet bg-violet/5'
                              : 'border-gray-200 hover:border-violet'
                          }`}
                        >
                          <span className="text-xs text-gray block">{item.label}</span>
                          <span
                            className="text-lg text-dark"
                            style={{ fontFamily: typedFontMap[item.value] }}
                          >
                            {typedSignature.trim() || 'Signature'}
                          </span>
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
                    <button onClick={handleSaveSignature} className="sticker-button w-full">
                      Save Signature
                    </button>
                  </div>
                )}

                {savedSignatures.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-gray">
                      <span>Saved signatures</span>
                      <span className="text-violet font-medium">Drag to place</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {savedSignatures.map((signature) => (
                        <button
                          key={signature.id}
                          type="button"
                          draggable
                          onDragStart={(event) =>
                            handleSignatureDragStart(event, signature.id)
                          }
                          onClick={() => {
                            setActiveSignatureId(signature.id);
                            setPlacementMode('signature');
                            setError(null);
                          }}
                          className={`rounded-xl border-2 bg-white p-2 text-left transition ${
                            activeSignatureId === signature.id
                              ? 'border-violet shadow-[0_8px_18px_rgba(107,77,255,0.18)]'
                              : 'border-gray-200 hover:border-violet'
                          }`}
                        >
                          <div className="flex items-center justify-center h-16">
                            <img
                              src={signature.dataUrl}
                              alt="Saved signature"
                              className="max-h-16 w-full object-contain"
                            />
                          </div>
                          <span className="mt-1 block text-[10px] uppercase tracking-wide text-gray">
                            {signature.source === 'draw'
                              ? 'Drawn'
                              : signature.source === 'upload'
                                ? 'Uploaded'
                                : 'Typed'}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={() => beginPlacement('signature')}
                  disabled={!canPlaceSignature}
                  className="sticker-button w-full disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <FileSignature className="w-4 h-4 mr-2" />
                  Place Signature
                </button>
                <p className="text-xs text-gray text-center">
                  Click on the PDF or drag a saved signature onto the page.
                </p>
              </div>

              <div className="sticker-card p-4 space-y-3">
                <div className="flex items-center gap-2 text-dark">
                  <UserRound className="w-4 h-4 text-violet" />
                  <span className="font-display font-bold">Fields</span>
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-gray">Full name</label>
                  <input
                    type="text"
                    value={customName}
                    onChange={(event) => setCustomName(event.target.value)}
                    placeholder="Full name"
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-violet focus:outline-none"
                  />
                  <button
                    onClick={() => beginPlacement('name')}
                    className="sticker-button-secondary w-full"
                  >
                    Place Name
                  </button>
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-gray">Date</label>
                  <input
                    type="date"
                    value={customDate}
                    onChange={(event) => setCustomDate(event.target.value)}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-violet focus:outline-none"
                  />
                  <button
                    onClick={() => beginPlacement('date')}
                    className="sticker-button-secondary w-full"
                  >
                    Place Date
                  </button>
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-gray">Custom text</label>
                  <input
                    type="text"
                    value={customText}
                    onChange={(event) => setCustomText(event.target.value)}
                    placeholder="Custom text"
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-violet focus:outline-none"
                  />
                  <button
                    onClick={() => beginPlacement('text')}
                    className="sticker-button-secondary w-full"
                  >
                    Place Text
                  </button>
                </div>
              </div>

              {selectedItem && (
                <div className="sticker-card p-4 space-y-2">
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
                    onClick={removeSelectedItem}
                    className="sticker-button-secondary w-full text-red-600 border-red-200 hover:border-red-300"
                  >
                    Remove Selected
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-3 order-1 lg:order-2 lg:flex lg:flex-col lg:min-h-0">
              {error && (
                <div className="sticker-card p-4">
                  <p className="text-red-500 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    {error}
                  </p>
                </div>
              )}
              {warning && (
                <div className="sticker-card p-4">
                  <p className="text-amber-600 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    {warning}
                  </p>
                </div>
              )}

              <div className="sticker-card p-4 sm:p-5 lg:shrink-0">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="w-12 h-12 bg-violet/10 rounded-xl flex items-center justify-center">
                    <FileText className="w-6 h-6 text-violet" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-dark truncate">{selectedFile.name}</p>
                    <p className="text-gray text-sm">
                      {formatSize(selectedFile.size)} - {previewDocument.pageCount} pages
                    </p>
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
                      onClick={clearFile}
                      disabled={isProcessing}
                      className="w-10 h-10 bg-gray-100 hover:bg-red-100 rounded-xl flex items-center justify-center transition-colors disabled:opacity-60"
                    >
                      <X className="w-5 h-5 text-gray hover:text-red-500" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="sticker-card p-4 sm:p-5 space-y-3 flex flex-col min-h-0 lg:flex-1">
                {placementMode && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-violet/10 px-3 py-2 text-sm text-violet">
                    <span>{placementHint}</span>
                    <button
                      onClick={() => setPlacementMode(null)}
                      className="text-xs underline"
                    >
                      Cancel
                    </button>
                  </div>
                )}
                <div
                  ref={viewerRef}
                  onScroll={handleViewerScroll}
                  className="viewer-container flex-1 overflow-y-auto overflow-x-hidden pr-1 snap-y snap-mandatory scroll-smooth"
                  style={{ height: viewerHeight ? `${viewerHeight}px` : '70vh' }}
                >
                  {previewDocument.pages.map((page) => {
                    const pageItems = items.filter((item) => item.pageIndex === page.pageIndex);
                    const isActive = activePageIndex === page.pageIndex;
                    const visibleItems = isActive ? pageItems : [];
                    const fitScale = resolveFitScale(page);
                    const pageScale = fitScale * (isActive ? zoom : 1);

                    return (
                      <div
                        key={page.pageIndex}
                        ref={(element) => {
                          pageRefs.current[page.pageIndex] = element;
                        }}
                        className="page-container snap-start snap-always"
                        style={{ height: viewerHeight ? `${viewerHeight}px` : '70vh' }}
                      >
                        <div
                          className={`sticker-card p-4 h-full w-full flex flex-col overflow-hidden ${
                            isActive ? 'ring-2 ring-violet ring-offset-2' : ''
                          }`}
                          onClick={() => setActivePageIndex(page.pageIndex)}
                        >
                          <div className="flex items-center justify-between gap-3 mb-3">
                            <div className="flex items-center gap-2">
                              <span className="sticker-label">Page {page.pageIndex + 1}</span>
                              {isActive && (
                                <span className="text-xs text-violet font-medium">
                                  Active page
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-gray">
                              Drag to move, handle to resize or rotate
                            </span>
                          </div>

                          <div
                            ref={(element) => {
                              if (isActive) {
                                activeViewportRef.current = element;
                              }
                            }}
                            className="flex-1 min-h-0 flex items-center justify-center"
                          >
                            <div
                              className={`relative mx-auto bg-gray-100 rounded-xl overflow-hidden border border-gray-200 ${
                                placementMode ? 'cursor-crosshair' : ''
                              }`}
                              style={{
                                width: `${page.width * pageScale}px`,
                                height: `${page.height * pageScale}px`,
                              }}
                              onClick={(event) => handlePlaceOnPage(event, page.pageIndex)}
                              onDragOver={handleSignatureDragOver}
                              onDrop={(event) => handleSignatureDrop(event, page.pageIndex)}
                            >
                              <img
                                src={page.imageUrl}
                                alt={`Page ${page.pageIndex + 1}`}
                                className="block w-full h-full object-contain"
                              />

                              {visibleItems.map((item) => {
                                const isSelected = item.id === selectedItemId;

                                return (
                                  <div
                                    key={item.id}
                                    onPointerDown={(event) =>
                                      startInteraction(event, item, 'move')
                                    }
                                    onClick={(event) => {
                                      if (placementMode) {
                                        return;
                                      }
                                      event.stopPropagation();
                                      setSelectedItemId(item.id);
                                    }}
                                    className={`absolute cursor-move border-2 ${
                                      isSelected
                                        ? 'border-pink shadow-[0_0_0_2px_rgba(236,72,153,0.16)]'
                                        : 'border-violet/70'
                                    } bg-white/70 backdrop-blur-[1px] touch-none`}
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
                                          fontSize: `${Math.max(
                                            12,
                                            page.height * pageScale * item.height * 0.45
                                          )}px`,
                                        }}
                                      >
                                        <span className="truncate pointer-events-none">
                                          {item.text}
                                        </span>
                                      </div>
                                    )}

                                    {isSelected && (
                                      <>
                                        <button
                                          onPointerDown={(event) =>
                                            startInteraction(event, item, 'rotate')
                                          }
                                          className="absolute -top-3 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-violet border-2 border-white cursor-grab"
                                          aria-label="Rotate field"
                                        />
                                        <button
                                          onPointerDown={(event) =>
                                            startInteraction(event, item, 'resize')
                                          }
                                          className="absolute -bottom-2 -right-2 w-5 h-5 rounded-full bg-pink border-2 border-white cursor-se-resize"
                                          aria-label="Resize field"
                                        />
                                      </>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="sticker-card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 lg:mt-auto lg:shrink-0">
                <div className="flex flex-wrap items-center gap-2 text-sm text-gray">
                  <span className="sticker-label bg-violet text-white border-violet">
                    {items.length} field{items.length === 1 ? '' : 's'}
                  </span>
                  <span>Ready to sign when you are.</span>
                </div>
                <button
                  onClick={handlePrimaryAction}
                  disabled={isPrimaryDisabled}
                  className="sticker-button w-full sm:w-auto justify-center disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Signing...
                    </>
                  ) : result ? (
                    <>
                      <Download className="w-4 h-4 mr-2" />
                      Download Signed PDF
                    </>
                  ) : (
                    <>
                      <FileSignature className="w-4 h-4 mr-2" />
                      Sign PDF
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
