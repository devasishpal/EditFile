import CategoryToolsPage, { type ToolSection } from '@/components/CategoryToolsPage';
import { availableImageTools } from '@/lib/data';

const imageToolSections: ToolSection[] = [
  {
    title: 'AI TOOLS',
    toolIds: ['remove-background', 'passport-photo-maker'],
  },
  {
    title: 'OPTIMIZE IMAGE',
    toolIds: ['compress-image', 'resize-image'],
  },
  {
    title: 'IMAGE CONVERSION',
    toolIds: ['convert-image', 'image-to-pdf'],
  },
  {
    title: 'IMAGE EDITING',
    toolIds: ['crop-image', 'rotate-image', 'image-watermark'],
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
