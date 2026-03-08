import OfficeToPDFTool from '@/tools/OfficeToPDFTool';
import { queueExcelToPdf } from '@/lib/compressionApi';

const isExcelFile = (file: File) => {
  const lowerName = file.name.toLowerCase();
  return (
    lowerName.endsWith('.xls') ||
    lowerName.endsWith('.xlsx') ||
    file.type === 'application/vnd.ms-excel' ||
    file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    file.type === 'application/vnd.ms-excel.sheet.macroenabled.12' ||
    file.type === 'application/vnd.oasis.opendocument.spreadsheet'
  );
};

export default function ExcelToPDF() {
  return (
    <OfficeToPDFTool
      emptyDropLabel="Drop Excel files here"
      emptySelectLabel="Select Excel Files"
      accept=".xls,.xlsx"
      zipPrefix="excel-to-pdf"
      isValidFile={isExcelFile}
      invalidTypeMessage="Only Excel files are allowed (.xls, .xlsx)."
      queueConversion={queueExcelToPdf}
    />
  );
}
