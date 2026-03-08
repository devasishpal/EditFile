import { createBrowserRouter, Navigate } from 'react-router-dom';
import App from '@/App';
import ToolLayout from '@/components/ToolLayout';
import CompressPDF from '@/tools/CompressPDF';
import MergePDF from '@/tools/MergePDF';
import SplitPDF from '@/tools/SplitPDF';
import PDFToWord from '@/tools/PDFToWord';
import WordToPDF from '@/tools/WordToPDF';
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
  {
    path: '/rotate-pdf',
    element: (
      <ToolLayout
        toolName="Rotate PDF"
        toolDescription="Rotate all pages or selected pages"
        icon="RotateCw"
      >
        <RotatePDF />
      </ToolLayout>
    ),
  },
  {
    path: '/delete-pages',
    element: (
      <ToolLayout
        toolName="Delete Pages"
        toolDescription="Remove selected pages from your PDF"
        icon="Trash2"
      >
        <DeletePDFPages />
      </ToolLayout>
    ),
  },
  {
    path: '/add-page-numbers',
    element: (
      <ToolLayout
        toolName="Add Page Numbers"
        toolDescription="Insert page numbers in your preferred position"
        icon="Hash"
      >
        <AddPageNumbers />
      </ToolLayout>
    ),
  },
  {
    path: '/add-watermark',
    element: (
      <ToolLayout
        toolName="Add Watermark"
        toolDescription="Add text or image watermarks"
        icon="Droplets"
      >
        <AddWatermark />
      </ToolLayout>
    ),
  },
  {
    path: '/tools',
    children: [
      {
        index: true,
        element: <Navigate to="/pdf-tools" replace />,
      },
      {
        path: 'pdf',
        element: <Navigate to="/pdf-tools" replace />,
      },
      {
        path: 'jpeg',
        element: <Navigate to="/image-tools" replace />,
      },
      {
        path: 'image',
        element: <Navigate to="/image-tools" replace />,
      },
      {
        path: 'compress-pdf',
        element: (
          <ToolLayout
            toolName="Compress PDF"
            toolDescription="Reduce PDF file size while maintaining quality"
            icon="Minimize2"
          >
            <CompressPDF />
          </ToolLayout>
        ),
      },
      {
        path: 'merge-pdf',
        element: (
          <ToolLayout
            toolName="Merge PDF"
            toolDescription="Combine multiple PDFs into one document"
            icon="Combine"
          >
            <MergePDF />
          </ToolLayout>
        ),
      },
      {
        path: 'split-pdf',
        element: (
          <ToolLayout
            toolName="Split PDF"
            toolDescription="Extract pages or split by range"
            icon="Scissors"
          >
            <SplitPDF />
          </ToolLayout>
        ),
      },
      {
        path: 'extract-pages',
        element: (
          <ToolLayout
            toolName="Extract Pages"
            toolDescription="Save specific pages as new PDF"
            icon="FileOutput"
          >
            <SplitPDF />
          </ToolLayout>
        ),
      },
      {
        path: 'pdf-to-word',
        element: (
          <ToolLayout
            toolName="PDF to Word"
            toolDescription="Convert PDF to editable DOCX"
            icon="FileText"
          >
            <PDFToWord />
          </ToolLayout>
        ),
      },
      {
        path: 'word-to-pdf',
        element: (
          <ToolLayout
            toolName="Word to PDF"
            toolDescription="Convert DOCX to PDF"
            icon="FileType"
          >
            <WordToPDF />
          </ToolLayout>
        ),
      },
      {
        path: 'pdf-to-jpg',
        element: (
          <ToolLayout
            toolName="PDF to JPG"
            toolDescription="Convert PDF pages to images"
            icon="Image"
          >
            <PDFToJPG />
          </ToolLayout>
        ),
      },
      {
        path: 'jpg-to-pdf',
        element: (
          <ToolLayout
            toolName="JPG to PDF"
            toolDescription="Convert JPG images into a PDF"
            icon="Images"
          >
            <JPGToPDF />
          </ToolLayout>
        ),
      },
      {
        path: 'scan-to-pdf',
        element: (
          <ToolLayout
            toolName="Scan to PDF"
            toolDescription="Convert scanned images into a PDF"
            icon="ScanText"
          >
            <JPGToPDF />
          </ToolLayout>
        ),
      },
      {
        path: 'powerpoint-to-pdf',
        element: (
          <ToolLayout
            toolName="PowerPoint to PDF"
            toolDescription="Convert PPT/PPTX slides into PDF"
            icon="FileType"
          >
            <ComingSoonTool
              title="PowerPoint to PDF is added"
              message="The tool page and route are ready. Backend conversion wiring can be enabled next."
              suggestedToolHref="/tools/word-to-pdf"
              suggestedToolLabel="Word to PDF"
            />
          </ToolLayout>
        ),
      },
      {
        path: 'excel-to-pdf',
        element: (
          <ToolLayout
            toolName="Excel to PDF"
            toolDescription="Convert XLS/XLSX spreadsheets into PDF"
            icon="FileType"
          >
            <ComingSoonTool
              title="Excel to PDF is added"
              message="The tool page and route are ready. Backend conversion wiring can be enabled next."
              suggestedToolHref="/tools/word-to-pdf"
              suggestedToolLabel="Word to PDF"
            />
          </ToolLayout>
        ),
      },
      {
        path: 'html-to-pdf',
        element: (
          <ToolLayout
            toolName="HTML to PDF"
            toolDescription="Convert HTML files into PDF"
            icon="FileType"
          >
            <ComingSoonTool
              title="HTML to PDF is added"
              message="The tool page and route are ready. Backend conversion wiring can be enabled next."
              suggestedToolHref="/tools/word-to-pdf"
              suggestedToolLabel="Word to PDF"
            />
          </ToolLayout>
        ),
      },
      {
        path: 'pdf-to-powerpoint',
        element: (
          <ToolLayout
            toolName="PDF to PowerPoint"
            toolDescription="Convert PDF pages into PPT slides"
            icon="FileText"
          >
            <ComingSoonTool
              title="PDF to PowerPoint is added"
              message="The tool page and route are ready. Conversion pipeline setup is pending."
              suggestedToolHref="/tools/pdf-to-word"
              suggestedToolLabel="PDF to Word"
            />
          </ToolLayout>
        ),
      },
      {
        path: 'pdf-to-excel',
        element: (
          <ToolLayout
            toolName="PDF to Excel"
            toolDescription="Extract PDF tables into spreadsheet format"
            icon="FileText"
          >
            <ComingSoonTool
              title="PDF to Excel is added"
              message="The tool page and route are ready. Conversion pipeline setup is pending."
              suggestedToolHref="/tools/pdf-to-word"
              suggestedToolLabel="PDF to Word"
            />
          </ToolLayout>
        ),
      },
      {
        path: 'pdf-to-pdfa',
        element: (
          <ToolLayout
            toolName="PDF to PDF/A"
            toolDescription="Convert PDF files into archival PDF/A format"
            icon="FileOutput"
          >
            <ComingSoonTool
              title="PDF to PDF/A is added"
              message="The tool page and route are ready. PDF/A conversion processing is pending."
              suggestedToolHref="/tools/repair-pdf"
              suggestedToolLabel="Repair PDF"
            />
          </ToolLayout>
        ),
      },
      {
        path: 'edit-pdf',
        element: (
          <ToolLayout
            toolName="Edit PDF"
            toolDescription="Edit text, images, and page layout in PDF files"
            icon="FileText"
          >
            <ComingSoonTool
              title="Edit PDF is added"
              message="The tool page and route are ready. Rich content editing controls are pending."
              suggestedToolHref="/tools/organize-pdf"
              suggestedToolLabel="Organize PDF"
            />
          </ToolLayout>
        ),
      },
      {
        path: 'crop-pdf',
        element: (
          <ToolLayout
            toolName="Crop PDF"
            toolDescription="Crop PDF pages to remove unwanted margins"
            icon="Crop"
          >
            <ComingSoonTool
              title="Crop PDF is added"
              message="The tool page and route are ready. Crop rectangle processing is pending."
              suggestedToolHref="/tools/organize-pdf"
              suggestedToolLabel="Organize PDF"
            />
          </ToolLayout>
        ),
      },
      {
        path: 'sign-pdf',
        element: (
          <ToolLayout
            toolName="Sign PDF"
            toolDescription="Add signatures to PDF files"
            icon="FileText"
          >
            <ComingSoonTool
              title="Sign PDF is added"
              message="The tool page and route are ready. Signature workflow integration is pending."
              suggestedToolHref="/add-watermark"
              suggestedToolLabel="Add Watermark"
            />
          </ToolLayout>
        ),
      },
      {
        path: 'redact-pdf',
        element: (
          <ToolLayout
            toolName="Redact PDF"
            toolDescription="Hide sensitive information permanently"
            icon="Trash2"
          >
            <ComingSoonTool
              title="Redact PDF is added"
              message="The tool page and route are ready. Permanent redaction processing is pending."
              suggestedToolHref="/delete-pages"
              suggestedToolLabel="Remove Pages"
            />
          </ToolLayout>
        ),
      },
      {
        path: 'compare-pdf',
        element: (
          <ToolLayout
            toolName="Compare PDF"
            toolDescription="Compare documents and inspect differences"
            icon="LayoutGrid"
          >
            <ComingSoonTool
              title="Compare PDF is added"
              message="The tool page and route are ready. Diff analysis processing is pending."
            />
          </ToolLayout>
        ),
      },
      {
        path: 'translate-pdf',
        element: (
          <ToolLayout
            toolName="Translate PDF"
            toolDescription="Translate PDF content to another language"
            icon="RefreshCw"
          >
            <ComingSoonTool
              title="Translate PDF is added"
              message="The tool page and route are ready. Translation engine integration is pending."
              suggestedToolHref="/tools/ocr-pdf"
              suggestedToolLabel="OCR PDF"
            />
          </ToolLayout>
        ),
      },
      {
        path: 'rotate-pdf',
        element: <Navigate to="/rotate-pdf" replace />,
      },
      {
        path: 'delete-pages',
        element: <Navigate to="/delete-pages" replace />,
      },
      {
        path: 'add-page-numbers',
        element: <Navigate to="/add-page-numbers" replace />,
      },
      {
        path: 'add-watermark',
        element: <Navigate to="/add-watermark" replace />,
      },
      {
        path: 'protect-pdf',
        element: (
          <ToolLayout
            toolName="Protect PDF"
            toolDescription="Password protect your PDF files"
            icon="Lock"
          >
            <ProtectPDF />
          </ToolLayout>
        ),
      },
      {
        path: 'unlock-pdf',
        element: (
          <ToolLayout
            toolName="Unlock PDF"
            toolDescription="Remove password from protected PDFs"
            icon="Unlock"
          >
            <UnlockPDF />
          </ToolLayout>
        ),
      },
      {
        path: 'ocr-pdf',
        element: (
          <ToolLayout
            toolName="OCR PDF"
            toolDescription="Extract text from scanned PDFs"
            icon="ScanText"
          >
            <OCRPDF />
          </ToolLayout>
        ),
      },
      {
        path: 'repair-pdf',
        element: (
          <ToolLayout
            toolName="Repair PDF"
            toolDescription="Fix corrupted PDF files"
            icon="Wrench"
          >
            <RepairPDF />
          </ToolLayout>
        ),
      },
      {
        path: 'organize-pdf',
        element: (
          <ToolLayout
            toolName="Organize PDF"
            toolDescription="Drag and reorder pages visually"
            icon="LayoutGrid"
          >
            <OrganizePDF />
          </ToolLayout>
        ),
      },
      {
        path: 'compress-jpeg',
        element: <Navigate to="/tools/compress-image" replace />,
      },
      {
        path: 'compress-image',
        element: (
          <ToolLayout
            toolName="Compress Image"
            toolDescription="Reduce image size with quality control"
            icon="Minimize2"
          >
            <CompressJPEG />
          </ToolLayout>
        ),
      },
      {
        path: 'resize-image',
        element: (
          <ToolLayout
            toolName="Resize Image"
            toolDescription="Change dimensions with aspect lock"
            icon="Maximize2"
          >
            <ResizeImage />
          </ToolLayout>
        ),
      },
      {
        path: 'crop-image',
        element: (
          <ToolLayout
            toolName="Crop Image"
            toolDescription="Crop to exact dimensions"
            icon="Crop"
          >
            <CropImage />
          </ToolLayout>
        ),
      },
      {
        path: 'rotate-image',
        element: (
          <ToolLayout
            toolName="Rotate Image"
            toolDescription="Rotate and flip images"
            icon="RotateCw"
          >
            <RotateImage />
          </ToolLayout>
        ),
      },
      {
        path: 'convert-image',
        element: (
          <ToolLayout
            toolName="Convert Image"
            toolDescription="PNG <-> JPG <-> WEBP conversion"
            icon="RefreshCw"
          >
            <ConvertImage />
          </ToolLayout>
        ),
      },
      {
        path: 'image-to-pdf',
        element: (
          <ToolLayout
            toolName="Image to PDF"
            toolDescription="Convert images to PDF document"
            icon="FileImage"
          >
            <ImageToPDF />
          </ToolLayout>
        ),
      },
      {
        path: 'remove-background',
        element: (
          <ToolLayout
            toolName="Remove Background"
            toolDescription="AI-powered background removal"
            icon="Wand2"
          >
            <RemoveBackground />
          </ToolLayout>
        ),
      },
      {
        path: 'passport-photo-maker',
        element: (
          <ToolLayout
            toolName="Passport Size Photo Maker"
            toolDescription="Crop, remove background, and export passport-size photo"
            icon="Wand2"
          >
            <PassportSizePhotoMaker />
          </ToolLayout>
        ),
      },
      {
        path: 'image-watermark',
        element: (
          <ToolLayout
            toolName="Image Watermark"
            toolDescription="Add text or image watermark to your image"
            icon="Droplets"
          >
            <ImageWatermark />
          </ToolLayout>
        ),
      },
      {
        path: '*',
        element: <Navigate to="/" replace />,
      },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
]);
