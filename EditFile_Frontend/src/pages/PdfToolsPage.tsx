import CategoryToolsPage, { type ToolSection } from '@/components/CategoryToolsPage';
import { availablePdfTools } from '@/lib/data';

const pdfToolSections: ToolSection[] = [
  {
    title: 'ORGANIZE PDF',
    toolIds: ['merge-pdf', 'split-pdf', 'delete-pages', 'extract-pages', 'organize-pdf'],
  },
  {
    title: 'OPTIMIZE PDF',
    toolIds: ['compress-pdf', 'repair-pdf', 'ocr-pdf'],
  },
  {
    title: 'CONVERT TO PDF',
    toolIds: ['jpg-to-pdf', 'word-to-pdf', 'powerpoint-to-pdf', 'excel-to-pdf', 'html-to-pdf'],
  },
  {
    title: 'CONVERT FROM PDF',
    toolIds: [
      'pdf-to-jpg',
      'pdf-to-word',
      'pdf-to-powerpoint',
      'pdf-to-excel',
      'pdf-to-html',
      'pdf-to-pdfa',
    ],
  },
  {
    title: 'EDIT PDF',
    toolIds: ['edit-pdf', 'crop-pdf', 'add-watermark', 'add-page-numbers', 'rotate-pdf'],
  },
  {
    title: 'PDF SECURITY',
    toolIds: ['unlock-pdf', 'protect-pdf', 'sign-pdf', 'redact-pdf', 'compare-pdf'],
  },
  {
    title: 'PDF INTELLIGENCE',
    toolIds: ['translate-pdf'],
  },
];

export default function PdfToolsPage() {
  return (
    <CategoryToolsPage
      title="Edit PDF Tools"
      description="Choose from all available PDF utilities for compression, conversion, security, and page management."
      tools={availablePdfTools}
      activeCategory="pdf"
      sections={pdfToolSections}
    />
  );
}
