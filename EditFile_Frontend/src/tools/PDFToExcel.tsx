import PDFToOfficeTool from '@/tools/PDFToOfficeTool';
import { queuePdfToExcel, type PdfToExcelOutputFormat } from '@/lib/compressionApi';

const OUTPUT_FORMATS: { value: PdfToExcelOutputFormat; label: string }[] = [
  { value: 'xlsx', label: 'XLSX (Recommended)' },
  { value: 'xls', label: 'XLS (Legacy)' },
];

export default function PDFToExcel() {
  return (
    <PDFToOfficeTool<PdfToExcelOutputFormat>
      outputFormatLabel="Output Format"
      defaultOutputFormat="xlsx"
      outputFormats={OUTPUT_FORMATS}
      zipPrefix="pdf-to-excel"
      queueConversion={queuePdfToExcel}
    />
  );
}
