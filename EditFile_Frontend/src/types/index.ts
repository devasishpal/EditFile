export interface Tool {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'pdf' | 'image';
  href: string;
  popular?: boolean;
  new?: boolean;
}

export interface FileUpload {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  progress: number;
  status: 'uploading' | 'processing' | 'completed' | 'error';
  resultUrl?: string;
  originalSize: number;
  compressedSize?: number;
}

export interface CompressionOptions {
  quality: number;
  targetSize?: number;
  maintainResolution: boolean;
}

export interface MergeOptions {
  files: FileUpload[];
  pageOrder: number[];
}

export interface SplitOptions {
  pageRange: string;
  splitMethod: 'range' | 'every' | 'extract';
}

export interface WatermarkOptions {
  text: string;
  fontSize: number;
  opacity: number;
  position: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  color: string;
}

export interface OcrOptions {
  language: string;
  outputFormat: 'text' | 'word' | 'searchable-pdf';
}

export interface ResizeOptions {
  width: number;
  height: number;
  maintainAspectRatio: boolean;
  unit: 'px' | 'percent';
}

export interface CropOptions {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ConversionOptions {
  targetFormat: string;
  quality: number;
}

export interface Testimonial {
  id: string;
  name: string;
  role: string;
  company: string;
  content: string;
  avatar: string;
  rating: number;
}

export interface Faq {
  id: string;
  question: string;
  answer: string;
}

export interface Integration {
  id: string;
  name: string;
  icon: string;
  description: string;
}
