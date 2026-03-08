import CategoryToolsPage, { type ToolSection } from '@/components/CategoryToolsPage';
import { availableImageTools } from '@/lib/data';

const imageToolSections: ToolSection[] = [
  {
    title: 'AI TOOLS',
    toolIds: ['remove-background', 'passport-photo-maker'],
  },
  {
    title: 'IMAGE CONVERSION',
    toolIds: ['convert-image', 'image-to-pdf'],
  },
  {
    title: 'IMAGE EDITING',
    toolIds: ['resize-image', 'crop-image', 'compress-image', 'rotate-image', 'image-watermark'],
  },
];

export default function JpegToolsPage() {
  return (
    <CategoryToolsPage
      title="Edit Image Tools"
      description="Open dedicated image editing tools for compression, resize, conversion, and cleanup."
      tools={availableImageTools}
      activeCategory="image"
      sections={imageToolSections}
    />
  );
}
