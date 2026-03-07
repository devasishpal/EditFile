import type { Tool, Testimonial, Faq, Integration } from '@/types';

export const pdfTools: Tool[] = [
  {
    id: 'compress-pdf',
    name: 'Compress PDF',
    description: 'Reduce PDF file size while maintaining quality',
    icon: 'Minimize2',
    category: 'pdf',
    href: '/tools/compress-pdf',
    popular: true,
  },
  {
    id: 'merge-pdf',
    name: 'Merge PDF',
    description: 'Combine multiple PDFs into one document',
    icon: 'Combine',
    category: 'pdf',
    href: '/tools/merge-pdf',
    popular: true,
  },
  {
    id: 'split-pdf',
    name: 'Split PDF',
    description: 'Extract pages or split by range',
    icon: 'Scissors',
    category: 'pdf',
    href: '/tools/split-pdf',
  },
  {
    id: 'extract-pages',
    name: 'Extract Pages',
    description: 'Save specific pages as new PDF',
    icon: 'FileOutput',
    category: 'pdf',
    href: '/tools/extract-pages',
  },
  {
    id: 'rotate-pdf',
    name: 'Rotate PDF',
    description: 'Rotate pages to the correct orientation',
    icon: 'RotateCw',
    category: 'pdf',
    href: '/rotate-pdf',
  },
  {
    id: 'delete-pages',
    name: 'Delete Pages',
    description: 'Remove unwanted pages from PDF',
    icon: 'Trash2',
    category: 'pdf',
    href: '/delete-pages',
  },
  {
    id: 'add-page-numbers',
    name: 'Add Page Numbers',
    description: 'Number pages with custom formatting',
    icon: 'Hash',
    category: 'pdf',
    href: '/add-page-numbers',
  },
  {
    id: 'add-watermark',
    name: 'Add Watermark',
    description: 'Add text or image watermarks',
    icon: 'Droplets',
    category: 'pdf',
    href: '/add-watermark',
  },
  {
    id: 'protect-pdf',
    name: 'Protect PDF',
    description: 'Password protect your PDF files',
    icon: 'Lock',
    category: 'pdf',
    href: '/tools/protect-pdf',
  },
  {
    id: 'unlock-pdf',
    name: 'Unlock PDF',
    description: 'Remove password protection',
    icon: 'Unlock',
    category: 'pdf',
    href: '/tools/unlock-pdf',
  },
  {
    id: 'pdf-to-word',
    name: 'PDF to Word',
    description: 'Convert PDF to editable DOCX',
    icon: 'FileText',
    category: 'pdf',
    href: '/tools/pdf-to-word',
    popular: true,
  },
  {
    id: 'word-to-pdf',
    name: 'Word to PDF',
    description: 'Convert DOCX to PDF',
    icon: 'FileType',
    category: 'pdf',
    href: '/tools/word-to-pdf',
  },
  {
    id: 'pdf-to-jpg',
    name: 'PDF to JPG',
    description: 'Convert PDF pages to images',
    icon: 'Image',
    category: 'pdf',
    href: '/tools/pdf-to-jpg',
  },
  {
    id: 'jpg-to-pdf',
    name: 'Image to PDF',
    description: 'Combine images into PDF',
    icon: 'Images',
    category: 'pdf',
    href: '/tools/jpg-to-pdf',
  },
  {
    id: 'ocr-pdf',
    name: 'OCR PDF',
    description: 'Extract text from scanned PDFs',
    icon: 'ScanText',
    category: 'pdf',
    href: '/tools/ocr-pdf',
    new: true,
  },
  {
    id: 'repair-pdf',
    name: 'Repair PDF',
    description: 'Fix corrupted PDF files',
    icon: 'Wrench',
    category: 'pdf',
    href: '/tools/repair-pdf',
  },
  {
    id: 'organize-pdf',
    name: 'Organize PDF',
    description: 'Drag and reorder pages visually',
    icon: 'LayoutGrid',
    category: 'pdf',
    href: '/tools/organize-pdf',
    new: true,
  },
];

export const imageTools: Tool[] = [
  {
    id: 'compress-image',
    name: 'Compress Image',
    description: 'Reduce image size with quality control',
    icon: 'Minimize2',
    category: 'image',
    href: '/tools/compress-image',
    popular: true,
  },
  {
    id: 'resize-image',
    name: 'Resize Image',
    description: 'Change dimensions with aspect lock',
    icon: 'Maximize2',
    category: 'image',
    href: '/tools/resize-image',
  },
  {
    id: 'crop-image',
    name: 'Crop Image',
    description: 'Crop to exact dimensions',
    icon: 'Crop',
    category: 'image',
    href: '/tools/crop-image',
  },
  {
    id: 'rotate-image',
    name: 'Rotate Image',
    description: 'Rotate and flip images',
    icon: 'RotateCw',
    category: 'image',
    href: '/tools/rotate-image',
  },
  {
    id: 'convert-image',
    name: 'Convert Image',
    description: 'PNG ↔ JPG ↔ WEBP conversion',
    icon: 'RefreshCw',
    category: 'image',
    href: '/tools/convert-image',
  },
  {
    id: 'image-to-pdf',
    name: 'Image to PDF',
    description: 'Convert images to PDF document',
    icon: 'FileImage',
    category: 'image',
    href: '/tools/image-to-pdf',
  },
  {
    id: 'remove-background',
    name: 'Remove Background',
    description: 'AI-powered background removal',
    icon: 'Wand2',
    category: 'image',
    href: '/tools/remove-background',
    new: true,
  },
  {
    id: 'image-watermark',
    name: 'Image Watermark',
    description: 'Add watermark to images',
    icon: 'Droplets',
    category: 'image',
    href: '/tools/image-watermark',
  },
];

export const allTools = [...pdfTools, ...imageTools];
export const availablePdfTools = pdfTools;
export const availableImageTools = imageTools;

const commonToolIds = [
  'compress-pdf',
  'merge-pdf',
  'split-pdf',
  'pdf-to-word',
  'compress-image',
  'resize-image',
  'convert-image',
  'remove-background',
];

const toolById = new Map(allTools.map((tool) => [tool.id, tool]));

export const commonTools = commonToolIds
  .map((id) => toolById.get(id))
  .filter((tool): tool is Tool => Boolean(tool));

export const testimonials: Testimonial[] = [
  {
    id: '1',
    name: 'Sarah Chen',
    role: 'Marketing Director',
    company: 'TechFlow Inc.',
    content: 'EditFile has completely transformed how we handle PDFs. The compression is incredible - we reduced our document sizes by 70% without any quality loss.',
    avatar: 'SC',
    rating: 5,
  },
  {
    id: '2',
    name: 'Marcus Johnson',
    role: 'Freelance Designer',
    company: 'Self-employed',
    content: 'The image tools are fantastic! I use the background removal and compression daily. Fast, reliable, and the quality is always spot on.',
    avatar: 'MJ',
    rating: 5,
  },
  {
    id: '3',
    name: 'Emily Rodriguez',
    role: 'Operations Manager',
    company: 'GlobalDocs Ltd.',
    content: 'We process thousands of PDFs monthly. EditFile\'s batch processing and merge tools save us hours every week. Highly recommended!',
    avatar: 'ER',
    rating: 5,
  },
  {
    id: '4',
    name: 'David Kim',
    role: 'Software Engineer',
    company: 'DevStudio',
    content: 'The OCR feature is a game-changer. Extracting text from scanned documents used to be a pain - now it\'s just drag, drop, done.',
    avatar: 'DK',
    rating: 5,
  },
  {
    id: '5',
    name: 'Lisa Thompson',
    role: 'Content Creator',
    company: 'CreativeHub',
    content: 'I love how intuitive the interface is. No learning curve - just upload and edit. The watermark feature is perfect for protecting my work.',
    avatar: 'LT',
    rating: 5,
  },
];

export const faqs: Faq[] = [
  {
    id: '1',
    question: 'Is EditFile free to use?',
    answer: 'Yes! EditFile offers a generous free tier with essential features. You can compress, convert, merge, and edit files without any cost.',
  },
  {
    id: '2',
    question: 'Are my files secure?',
    answer: 'Absolutely. We use bank-level encryption (AES-256) for all file transfers. Your files are automatically deleted from our servers after 1 hour, and we never access or share your content with third parties.',
  },
  {
    id: '3',
    question: 'What file formats are supported?',
    answer: 'We support all major formats including PDF, Word (DOCX), Excel (XLSX), PowerPoint (PPTX), JPG, PNG, WEBP, HEIC, and TIFF. Our conversion tools maintain formatting and quality whenever possible.',
  },
  {
    id: '4',
    question: 'Is there a file size limit?',
    answer: 'No strict upload size cap is enforced by the app. Large files can still depend on browser and server memory availability.',
  },
  {
    id: '5',
    question: 'Can I process multiple files at once?',
    answer: 'Yes! Our batch processing feature allows you to upload and process multiple files simultaneously. You can also merge multiple PDFs or images into a single document.',
  },
  {
    id: '6',
    question: 'Do I need to install any software?',
    answer: 'Not at all. EditFile is completely web-based and works in any modern browser. No downloads, no installations, no updates - just open the website and start editing.',
  },
  {
    id: '7',
    question: 'How accurate is the OCR feature?',
    answer: 'Our OCR supports 100+ languages with 95%+ accuracy for clear, high-quality scans. For best results, ensure your documents have good contrast and minimal skew.',
  },
  {
    id: '8',
    question: 'Can I use EditFile on mobile?',
    answer: 'Yes! EditFile is fully responsive and works great on smartphones and tablets. You can process files on the go from any device with a web browser.',
  },
];

export const integrations: Integration[] = [
  {
    id: '1',
    name: 'Google Drive',
    icon: 'Drive',
    description: 'Import and export directly from Google Drive',
  },
  {
    id: '2',
    name: 'Dropbox',
    icon: 'Box',
    description: 'Seamless Dropbox integration',
  },
  {
    id: '3',
    name: 'OneDrive',
    icon: 'Cloud',
    description: 'Connect with Microsoft OneDrive',
  },
  {
    id: '4',
    name: 'iCloud',
    icon: 'Cloud',
    description: 'Import from Apple iCloud',
  },
  {
    id: '5',
    name: 'Box',
    icon: 'Box',
    description: 'Enterprise Box integration',
  },
  {
    id: '6',
    name: 'Notion',
    icon: 'FileText',
    description: 'Export to Notion pages',
  },
  {
    id: '7',
    name: 'Slack',
    icon: 'MessageSquare',
    description: 'Share files directly to Slack',
  },
  {
    id: '8',
    name: 'Figma',
    icon: 'Figma',
    description: 'Export images for Figma',
  },
];

export const features = [
  {
    id: 'speed',
    title: 'Lightning Fast',
    description: 'Process files in seconds with our optimized cloud infrastructure',
    icon: 'Zap',
  },
  {
    id: 'security',
    title: 'Bank-Level Security',
    description: 'AES-256 encryption with automatic file deletion after 1 hour',
    icon: 'Shield',
  },
  {
    id: 'free',
    title: 'Free Forever',
    description: 'All essential features available at no cost, no credit card required',
    icon: 'Gift',
  },
  {
    id: 'cloud',
    title: 'Cloud Processing',
    description: 'No local resources used - everything happens in the cloud',
    icon: 'Cloud',
  },
];

export const howItWorks = [
  {
    step: 1,
    title: 'Upload',
    description: 'Drag and drop your files or click to browse. We support PDF, images, and documents.',
    icon: 'Upload',
  },
  {
    step: 2,
    title: 'Process',
    description: 'Choose your tool and settings. Our servers handle the heavy lifting instantly.',
    icon: 'Settings',
  },
  {
    step: 3,
    title: 'Download',
    description: 'Get your processed files immediately. No waiting, no watermarks.',
    icon: 'Download',
  },
];
