import OfficeToPDFTool from '@/tools/OfficeToPDFTool';
import { queuePowerPointToPdf } from '@/lib/compressionApi';

const isPowerPointFile = (file: File) => {
  const lowerName = file.name.toLowerCase();
  return (
    lowerName.endsWith('.ppt') ||
    lowerName.endsWith('.pptx') ||
    file.type === 'application/vnd.ms-powerpoint' ||
    file.type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
    file.type === 'application/vnd.openxmlformats-officedocument.presentationml.slideshow' ||
    file.type === 'application/vnd.ms-powerpoint.presentation.macroenabled.12' ||
    file.type === 'application/vnd.oasis.opendocument.presentation'
  );
};

export default function PowerPointToPDF() {
  return (
    <OfficeToPDFTool
      emptyDropLabel="Drop PowerPoint files here"
      emptySelectLabel="Select PowerPoint Files"
      accept=".ppt,.pptx"
      zipPrefix="powerpoint-to-pdf"
      isValidFile={isPowerPointFile}
      invalidTypeMessage="Only PowerPoint files are allowed (.ppt, .pptx)."
      queueConversion={queuePowerPointToPdf}
    />
  );
}
