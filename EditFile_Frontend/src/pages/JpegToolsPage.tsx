import CategoryToolsPage from '@/components/CategoryToolsPage';
import { availableImageTools } from '@/lib/data';

export default function JpegToolsPage() {
  return (
    <CategoryToolsPage
      title="Edit Image Tools"
      description="Open dedicated image editing tools for compression, resize, conversion, and cleanup."
      tools={availableImageTools}
      activeCategory="image"
    />
  );
}
