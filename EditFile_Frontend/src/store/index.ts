import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { FileUpload, CompressionOptions, WatermarkOptions, OcrOptions } from '@/types';

interface AppState {
  // Theme
  darkMode: boolean;
  toggleDarkMode: () => void;
  
  // Files
  files: FileUpload[];
  addFiles: (files: File[]) => void;
  removeFile: (id: string) => void;
  updateFileProgress: (id: string, progress: number) => void;
  updateFileStatus: (id: string, status: FileUpload['status']) => void;
  clearFiles: () => void;
  reorderFiles: (fromIndex: number, toIndex: number) => void;
  
  // Processing options
  compressionOptions: CompressionOptions;
  setCompressionOptions: (options: Partial<CompressionOptions>) => void;
  
  watermarkOptions: WatermarkOptions;
  setWatermarkOptions: (options: Partial<WatermarkOptions>) => void;
  
  ocrOptions: OcrOptions;
  setOcrOptions: (options: Partial<OcrOptions>) => void;
  
  // UI State
  isProcessing: boolean;
  setIsProcessing: (value: boolean) => void;
  
  showPreview: boolean;
  setShowPreview: (value: boolean) => void;
  
  activeTool: string | null;
  setActiveTool: (tool: string | null) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Theme
      darkMode: false,
      toggleDarkMode: () => set((state) => ({ darkMode: !state.darkMode })),
      
      // Files
      files: [],
      addFiles: (newFiles) => {
        const fileUploads: FileUpload[] = newFiles.map((file, index) => ({
          id: `${Date.now()}-${index}`,
          file,
          name: file.name,
          size: file.size,
          type: file.type,
          progress: 0,
          status: 'uploading',
          originalSize: file.size,
        }));
        set((state) => ({ files: [...state.files, ...fileUploads] }));
      },
      removeFile: (id) => {
        set((state) => ({ files: state.files.filter((f) => f.id !== id) }));
      },
      updateFileProgress: (id, progress) => {
        set((state) => ({
          files: state.files.map((f) =>
            f.id === id ? { ...f, progress } : f
          ),
        }));
      },
      updateFileStatus: (id, status) => {
        set((state) => ({
          files: state.files.map((f) =>
            f.id === id ? { ...f, status } : f
          ),
        }));
      },
      clearFiles: () => set({ files: [] }),
      reorderFiles: (fromIndex, toIndex) => {
        const { files } = get();
        const newFiles = [...files];
        const [moved] = newFiles.splice(fromIndex, 1);
        newFiles.splice(toIndex, 0, moved);
        set({ files: newFiles });
      },
      
      // Processing options
      compressionOptions: {
        quality: 80,
        maintainResolution: true,
      },
      setCompressionOptions: (options) => {
        set((state) => ({
          compressionOptions: { ...state.compressionOptions, ...options },
        }));
      },
      
      watermarkOptions: {
        text: '',
        fontSize: 48,
        opacity: 50,
        position: 'center',
        color: '#000000',
      },
      setWatermarkOptions: (options) => {
        set((state) => ({
          watermarkOptions: { ...state.watermarkOptions, ...options },
        }));
      },
      
      ocrOptions: {
        language: 'eng',
        outputFormat: 'text',
      },
      setOcrOptions: (options) => {
        set((state) => ({
          ocrOptions: { ...state.ocrOptions, ...options },
        }));
      },
      
      // UI State
      isProcessing: false,
      setIsProcessing: (value) => set({ isProcessing: value }),
      
      showPreview: false,
      setShowPreview: (value) => set({ showPreview: value }),
      
      activeTool: null,
      setActiveTool: (tool) => set({ activeTool: tool }),
    }),
    {
      name: 'editfile-storage',
      partialize: (state) => ({
        darkMode: state.darkMode,
        compressionOptions: state.compressionOptions,
        watermarkOptions: state.watermarkOptions,
        ocrOptions: state.ocrOptions,
      }),
    }
  )
);
