import CategoryToolsPage from '@/components/CategoryToolsPage';
import { availablePdfTools } from '@/lib/data';

export default function PdfToolsPage() {
  return (
    <CategoryToolsPage
      title="Edit PDF Tools"
      description="Choose from all available PDF utilities for compression, conversion, security, and page management."
      tools={availablePdfTools}
      activeCategory="pdf"
    />
  );
}
