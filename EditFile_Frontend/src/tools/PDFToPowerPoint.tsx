import PDFToOfficeTool from '@/tools/PDFToOfficeTool';
import { queuePdfToPowerPoint, type PdfToPowerPointOutputFormat } from '@/lib/compressionApi';

const OUTPUT_FORMATS: { value: PdfToPowerPointOutputFormat; label: string }[] = [
  { value: 'pptx', label: 'PPTX (Recommended)' },
  { value: 'ppt', label: 'PPT (Legacy)' },
];

export default function PDFToPowerPoint() {
  return (
    <PDFToOfficeTool<PdfToPowerPointOutputFormat>
      outputFormatLabel="Output Format"
      defaultOutputFormat="pptx"
      outputFormats={OUTPUT_FORMATS}
      zipPrefix="pdf-to-powerpoint"
      queueConversion={queuePdfToPowerPoint}
    />
  );
}
