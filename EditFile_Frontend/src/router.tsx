import type { ReactElement } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import App from '@/App';
import ToolLayout from '@/components/ToolLayout';
import CompressPDF from '@/tools/CompressPDF';
import MergePDF from '@/tools/MergePDF';
import SplitPDF from '@/tools/SplitPDF';
import PDFToWord from '@/tools/PDFToWord';
import WordToPDF from '@/tools/WordToPDF';
import ExcelToPDF from '@/tools/ExcelToPDF';
import PDFToExcel from '@/tools/PDFToExcel';
import PowerPointToPDF from '@/tools/PowerPointToPDF';
import PDFToPowerPoint from '@/tools/PDFToPowerPoint';
import PDFToJPG from '@/tools/PDFToJPG';
import JPGToPDF from '@/tools/JPGToPDF';
import AddWatermark from '@/tools/AddWatermark';
import RotatePDF from '@/tools/RotatePDF';
import DeletePDFPages from '@/tools/DeletePDFPages';
import AddPageNumbers from '@/tools/AddPageNumbers';
import ProtectPDF from '@/tools/ProtectPDF';
import UnlockPDF from '@/tools/UnlockPDF';
import OCRPDF from '@/tools/OCRPDF';
import RepairPDF from '@/tools/RepairPDF';
import OrganizePDF from '@/tools/OrganizePDF';
import CompressJPEG from '@/tools/CompressJPEG';
import ResizeImage from '@/tools/ResizeImage';
import CropImage from '@/tools/CropImage';
import RotateImage from '@/tools/RotateImage';
import ConvertImage from '@/tools/ConvertImage';
import ImageToPDF from '@/tools/ImageToPDF';
import RemoveBackground from '@/tools/RemoveBackground';
import ImageWatermark from '@/tools/ImageWatermark';
import PassportSizePhotoMaker from '@/tools/PassportSizePhotoMaker';
import ComingSoonTool from '@/tools/ComingSoonTool';
import PdfToolsPage from '@/pages/PdfToolsPage';
import JpegToolsPage from '@/pages/JpegToolsPage';
import AboutPage from '@/pages/AboutPage';
import BlogPage from '@/pages/BlogPage';
import CareersPage from '@/pages/CareersPage';
import ContactPage from '@/pages/ContactPage';
import PrivacyPolicyPage from '@/pages/PrivacyPolicyPage';
import TermsOfServicePage from '@/pages/TermsOfServicePage';
import CookiePolicyPage from '@/pages/CookiePolicyPage';
import GdprPage from '@/pages/GdprPage';

const toolPage = (
  toolName: string,
  toolDescription: string,
  icon: string,
  child: ReactElement
) => (
  <ToolLayout toolName={toolName} toolDescription={toolDescription} icon={icon}>
    {child}
  </ToolLayout>
);

const pdfToolRoutes = [
  {
    path: '/pdf-tools/compress-pdf',
    element: toolPage(
      'Compress PDF',
      'Reduce PDF file size while maintaining quality',
      'Minimize2',
      <CompressPDF />
    ),
  },
  {
    path: '/pdf-tools/merge-pdf',
    element: toolPage(
      'Merge PDF',
      'Combine multiple PDFs into one document',
      'Combine',
      <MergePDF />
    ),
  },
  {
    path: '/pdf-tools/split-pdf',
    element: toolPage(
      'Split PDF',
      'Extract pages or split by range',
      'Scissors',
      <SplitPDF />
    ),
  },
  {
    path: '/pdf-tools/extract-pages',
    element: toolPage(
      'Extract Pages',
      'Save specific pages as new PDF',
      'FileOutput',
      <SplitPDF />
    ),
  },
  {
    path: '/pdf-tools/pdf-to-word',
    element: toolPage(
      'PDF to Word',
      'Convert PDF to editable DOCX',
      'FileText',
      <PDFToWord />
    ),
  },
  {
    path: '/pdf-tools/word-to-pdf',
    element: toolPage(
      'Word to PDF',
      'Convert DOCX to PDF',
      'FileType',
      <WordToPDF />
    ),
  },
  {
    path: '/pdf-tools/pdf-to-jpg',
    element: toolPage(
      'PDF to JPG',
      'Convert PDF pages to images',
      'Image',
      <PDFToJPG />
    ),
  },
  {
    path: '/pdf-tools/jpg-to-pdf',
    element: toolPage(
      'JPG to PDF',
      'Convert JPG images into a PDF',
      'Images',
      <JPGToPDF />
    ),
  },
  {
    path: '/pdf-tools/scan-to-pdf',
    element: toolPage(
      'Scan to PDF',
      'Convert scanned images into a PDF',
      'ScanText',
      <JPGToPDF />
    ),
  },
  {
    path: '/pdf-tools/powerpoint-to-pdf',
    element: toolPage(
      'PowerPoint to PDF',
      'Convert PPT/PPTX slides into PDF',
      'FileType',
      <PowerPointToPDF />
    ),
  },
  {
    path: '/pdf-tools/excel-to-pdf',
    element: toolPage(
      'Excel to PDF',
      'Convert XLS/XLSX spreadsheets into PDF',
      'FileType',
      <ExcelToPDF />
    ),
  },
  {
    path: '/pdf-tools/html-to-pdf',
    element: toolPage(
      'HTML to PDF',
      'Convert HTML files into PDF',
      'FileType',
      <ComingSoonTool
        title="HTML to PDF is added"
        message="The tool page and route are ready. Backend conversion wiring can be enabled next."
        suggestedToolHref="/pdf-tools/word-to-pdf"
        suggestedToolLabel="Word to PDF"
      />
    ),
  },
  {
    path: '/pdf-tools/pdf-to-powerpoint',
    element: toolPage(
      'PDF to PowerPoint',
      'Convert PDF pages into PPT slides',
      'FileText',
      <PDFToPowerPoint />
    ),
  },
  {
    path: '/pdf-tools/pdf-to-excel',
    element: toolPage(
      'PDF to Excel',
      'Extract PDF tables into spreadsheet format',
      'FileText',
      <PDFToExcel />
    ),
  },
  {
    path: '/pdf-tools/pdf-to-pdfa',
    element: toolPage(
      'PDF to PDF/A',
      'Convert PDF files into archival PDF/A format',
      'FileOutput',
      <ComingSoonTool
        title="PDF to PDF/A is added"
        message="The tool page and route are ready. PDF/A conversion processing is pending."
        suggestedToolHref="/pdf-tools/repair-pdf"
        suggestedToolLabel="Repair PDF"
      />
    ),
  },
  {
    path: '/pdf-tools/edit-pdf',
    element: toolPage(
      'Edit PDF',
      'Edit text, images, and page layout in PDF files',
      'FileText',
      <ComingSoonTool
        title="Edit PDF is added"
        message="The tool page and route are ready. Rich content editing controls are pending."
        suggestedToolHref="/pdf-tools/organize-pdf"
        suggestedToolLabel="Organize PDF"
      />
    ),
  },
  {
    path: '/pdf-tools/crop-pdf',
    element: toolPage(
      'Crop PDF',
      'Crop PDF pages to remove unwanted margins',
      'Crop',
      <ComingSoonTool
        title="Crop PDF is added"
        message="The tool page and route are ready. Crop rectangle processing is pending."
        suggestedToolHref="/pdf-tools/organize-pdf"
        suggestedToolLabel="Organize PDF"
      />
    ),
  },
  {
    path: '/pdf-tools/sign-pdf',
    element: toolPage(
      'Sign PDF',
      'Add signatures to PDF files',
      'FileText',
      <ComingSoonTool
        title="Sign PDF is added"
        message="The tool page and route are ready. Signature workflow integration is pending."
        suggestedToolHref="/pdf-tools/add-watermark"
        suggestedToolLabel="Add Watermark"
      />
    ),
  },
  {
    path: '/pdf-tools/redact-pdf',
    element: toolPage(
      'Redact PDF',
      'Hide sensitive information permanently',
      'Trash2',
      <ComingSoonTool
        title="Redact PDF is added"
        message="The tool page and route are ready. Permanent redaction processing is pending."
        suggestedToolHref="/pdf-tools/delete-pages"
        suggestedToolLabel="Remove Pages"
      />
    ),
  },
  {
    path: '/pdf-tools/compare-pdf',
    element: toolPage(
      'Compare PDF',
      'Compare documents and inspect differences',
      'LayoutGrid',
      <ComingSoonTool
        title="Compare PDF is added"
        message="The tool page and route are ready. Diff analysis processing is pending."
      />
    ),
  },
  {
    path: '/pdf-tools/translate-pdf',
    element: toolPage(
      'Translate PDF',
      'Translate PDF content to another language',
      'RefreshCw',
      <ComingSoonTool
        title="Translate PDF is added"
        message="The tool page and route are ready. Translation engine integration is pending."
        suggestedToolHref="/pdf-tools/ocr-pdf"
        suggestedToolLabel="OCR PDF"
      />
    ),
  },
  {
    path: '/pdf-tools/rotate-pdf',
    element: toolPage(
      'Rotate PDF',
      'Rotate all pages or selected pages',
      'RotateCw',
      <RotatePDF />
    ),
  },
  {
    path: '/pdf-tools/delete-pages',
    element: toolPage(
      'Delete Pages',
      'Remove selected pages from your PDF',
      'Trash2',
      <DeletePDFPages />
    ),
  },
  {
    path: '/pdf-tools/add-page-numbers',
    element: toolPage(
      'Add Page Numbers',
      'Insert page numbers in your preferred position',
      'Hash',
      <AddPageNumbers />
    ),
  },
  {
    path: '/pdf-tools/add-watermark',
    element: toolPage(
      'Add Watermark',
      'Add text or image watermarks',
      'Droplets',
      <AddWatermark />
    ),
  },
  {
    path: '/pdf-tools/protect-pdf',
    element: toolPage(
      'Protect PDF',
      'Password protect your PDF files',
      'Lock',
      <ProtectPDF />
    ),
  },
  {
    path: '/pdf-tools/unlock-pdf',
    element: toolPage(
      'Unlock PDF',
      'Remove password from protected PDFs',
      'Unlock',
      <UnlockPDF />
    ),
  },
  {
    path: '/pdf-tools/ocr-pdf',
    element: toolPage(
      'OCR PDF',
      'Extract text from scanned PDFs',
      'ScanText',
      <OCRPDF />
    ),
  },
  {
    path: '/pdf-tools/repair-pdf',
    element: toolPage(
      'Repair PDF',
      'Fix corrupted PDF files',
      'Wrench',
      <RepairPDF />
    ),
  },
  {
    path: '/pdf-tools/organize-pdf',
    element: toolPage(
      'Organize PDF',
      'Drag and reorder pages visually',
      'LayoutGrid',
      <OrganizePDF />
    ),
  },
];

const imageToolRoutes = [
  {
    path: '/image-tools/compress-image',
    element: toolPage(
      'Compress Image',
      'Reduce image size with quality control',
      'Minimize2',
      <CompressJPEG />
    ),
  },
  {
    path: '/image-tools/resize-image',
    element: toolPage(
      'Resize Image',
      'Change dimensions with aspect lock',
      'Maximize2',
      <ResizeImage />
    ),
  },
  {
    path: '/image-tools/crop-image',
    element: toolPage(
      'Crop Image',
      'Crop to exact dimensions',
      'Crop',
      <CropImage />
    ),
  },
  {
    path: '/image-tools/rotate-image',
    element: toolPage(
      'Rotate Image',
      'Rotate and flip images',
      'RotateCw',
      <RotateImage />
    ),
  },
  {
    path: '/image-tools/convert-image',
    element: toolPage(
      'Convert Image',
      'PNG <-> JPG <-> WEBP conversion',
      'RefreshCw',
      <ConvertImage />
    ),
  },
  {
    path: '/image-tools/image-to-pdf',
    element: toolPage(
      'Image to PDF',
      'Convert images to PDF document',
      'FileImage',
      <ImageToPDF />
    ),
  },
  {
    path: '/image-tools/remove-background',
    element: toolPage(
      'Remove Background',
      'AI-powered background removal',
      'Wand2',
      <RemoveBackground />
    ),
  },
  {
    path: '/image-tools/passport-photo-maker',
    element: toolPage(
      'Passport Size Photo Maker',
      'Crop, remove background, and export passport-size photo',
      'Wand2',
      <PassportSizePhotoMaker />
    ),
  },
  {
    path: '/image-tools/image-watermark',
    element: toolPage(
      'Image Watermark',
      'Add text or image watermark to your image',
      'Droplets',
      <ImageWatermark />
    ),
  },
  {
    path: '/image-tools/compress-jpeg',
    element: <Navigate to="/image-tools/compress-image" replace />,
  },
];

const pdfToolSlugs = [
  'compress-pdf',
  'merge-pdf',
  'split-pdf',
  'extract-pages',
  'pdf-to-word',
  'word-to-pdf',
  'pdf-to-jpg',
  'jpg-to-pdf',
  'scan-to-pdf',
  'powerpoint-to-pdf',
  'excel-to-pdf',
  'html-to-pdf',
  'pdf-to-powerpoint',
  'pdf-to-excel',
  'pdf-to-pdfa',
  'edit-pdf',
  'crop-pdf',
  'sign-pdf',
  'redact-pdf',
  'compare-pdf',
  'translate-pdf',
  'rotate-pdf',
  'delete-pages',
  'add-page-numbers',
  'add-watermark',
  'protect-pdf',
  'unlock-pdf',
  'ocr-pdf',
  'repair-pdf',
  'organize-pdf',
];

const imageToolSlugs = [
  'compress-image',
  'resize-image',
  'crop-image',
  'rotate-image',
  'convert-image',
  'image-to-pdf',
  'remove-background',
  'passport-photo-maker',
  'image-watermark',
];

const legacyStandaloneRedirects = [
  {
    path: '/rotate-pdf',
    element: <Navigate to="/pdf-tools/rotate-pdf" replace />,
  },
  {
    path: '/delete-pages',
    element: <Navigate to="/pdf-tools/delete-pages" replace />,
  },
  {
    path: '/add-page-numbers',
    element: <Navigate to="/pdf-tools/add-page-numbers" replace />,
  },
  {
    path: '/add-watermark',
    element: <Navigate to="/pdf-tools/add-watermark" replace />,
  },
];

const legacyToolsRedirectRoutes = [
  {
    path: '/tools',
    element: <Navigate to="/pdf-tools" replace />,
  },
  {
    path: '/tools/pdf',
    element: <Navigate to="/pdf-tools" replace />,
  },
  {
    path: '/tools/jpeg',
    element: <Navigate to="/image-tools" replace />,
  },
  {
    path: '/tools/image',
    element: <Navigate to="/image-tools" replace />,
  },
  ...pdfToolSlugs.map((slug) => ({
    path: `/tools/${slug}`,
    element: <Navigate to={`/pdf-tools/${slug}`} replace />,
  })),
  ...imageToolSlugs.map((slug) => ({
    path: `/tools/${slug}`,
    element: <Navigate to={`/image-tools/${slug}`} replace />,
  })),
  {
    path: '/tools/compress-jpeg',
    element: <Navigate to="/image-tools/compress-image" replace />,
  },
  {
    path: '/tools/*',
    element: <Navigate to="/pdf-tools" replace />,
  },
];

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
  },
  {
    path: '/pdf-tools',
    element: <PdfToolsPage />,
  },
  {
    path: '/image-tools',
    element: <JpegToolsPage />,
  },
  {
    path: '/jpeg-tools',
    element: <Navigate to="/image-tools" replace />,
  },
  {
    path: '/about',
    element: <AboutPage />,
  },
  {
    path: '/blog',
    element: <BlogPage />,
  },
  {
    path: '/careers',
    element: <CareersPage />,
  },
  {
    path: '/contact',
    element: <ContactPage />,
  },
  {
    path: '/privacy-policy',
    element: <PrivacyPolicyPage />,
  },
  {
    path: '/terms-of-service',
    element: <TermsOfServicePage />,
  },
  {
    path: '/cookie-policy',
    element: <CookiePolicyPage />,
  },
  {
    path: '/gdpr',
    element: <GdprPage />,
  },
  ...pdfToolRoutes,
  ...imageToolRoutes,
  ...legacyStandaloneRedirects,
  ...legacyToolsRedirectRoutes,
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
]);
