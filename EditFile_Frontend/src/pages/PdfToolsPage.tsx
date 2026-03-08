import CategoryToolsPage, { type ToolSection } from '@/components/CategoryToolsPage';
import { availablePdfTools } from '@/lib/data';

const pdfToolSections: ToolSection[] = [
  {
    title: 'OPTIMIZE PDF',
    toolIds: ['compress-pdf', 'repair-pdf', 'ocr-pdf'],
  },
  {
    title: 'ORGANIZE PDF',
    toolIds: ['organize-pdf', 'merge-pdf', 'split-pdf', 'extract-pages', 'delete-pages'],
  },
  {
    title: 'EDIT PDF',
    toolIds: ['rotate-pdf', 'add-page-numbers', 'add-watermark'],
  },
  {
    title: 'PDF SECURITY',
    toolIds: ['protect-pdf', 'unlock-pdf'],
  },
  {
    title: 'CONVERT PDF',
    toolIds: ['pdf-to-word', 'word-to-pdf', 'pdf-to-jpg', 'jpg-to-pdf'],
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
