import { useState, useCallback } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Download, Upload, X, FileText } from 'lucide-react';
import { pollJobUntilDone, getJobDownloadInfo, startFileDownload } from '@/lib/compressionApi';
import { API_BASE_URL } from '@/lib/apiConfig';

type UploadResult = { success: boolean; jobId: string; status: string; message: string; };

const queueUpload = (endpoint: string, file: File, options: Record<string, string>, onProgress: (percent: number) => void): Promise<UploadResult> => {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);
    Object.entries(options).forEach(([key, value]) => {
      formData.append(key, value);
    });
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE_URL}${endpoint}`, true);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        try { const errorResponse = JSON.parse(xhr.responseText); reject(new Error(errorResponse.message || 'Upload failed')); } catch { reject(new Error(`Server error: ${xhr.statusText}`)); }
      }
    };
    xhr.onerror = () => reject(new Error('Network error during upload.'));
    xhr.send(formData);
  });
};

const formatSize = (bytes: number) => {
  if (bytes === 0) {
    return '0 B';
  }

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

const pdfOptions = {
  pageSizes: ['A4', 'Letter', 'Legal'],
  orientations: ['Portrait', 'Landscape'],
  margins: ['none', 'small', 'medium', 'large'],
};

const marginValues: { [key: string]: string } = {
  none: '0px',
  small: '10px',
  medium: '20px',
  large: '30px',
};

export default function HtmlToPdf() {
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ downloadUrl: string; fileName: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [htmlContent, setHtmlContent] = useState('');
  const [activeTab, setActiveTab] = useState('upload');
  const [isDragging, setIsDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // PDF options state
  const [pageSize, setPageSize] = useState('A4');
  const [orientation, setOrientation] = useState('Portrait');
  const [margin, setMargin] = useState('medium');
  const [background, setBackground] = useState(false);

  const resetState = () => {
    setFiles([]);
    setHtmlContent('');
    setResult(null);
    setError(null);
    setLocalError(null);
    setIsUploading(false);
    setProgress(0);
  };

  const handleDrop = useCallback((acceptedFiles: File[]) => {
    const htmlFile = acceptedFiles.find(f => f.type.includes('html'));
    if (htmlFile) {
      if (htmlFile.size > 20 * 1024 * 1024) {
        setLocalError('File is too large. Maximum size is 20MB.');
        return;
      }
      setFiles([htmlFile]);
      setLocalError(null);
    } else if (acceptedFiles.length > 0) {
      setLocalError('Invalid file type. Please upload an HTML file.');
    }
  }, []);

  const handleFileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      handleDrop(Array.from(event.target.files));
    }
    event.target.value = '';
  };

  const handleDownload = () => {
    if (result?.downloadUrl) {
      const fileName = result.fileName || (files[0]?.name.replace(/\.html?$/, '') || 'converted') + '.pdf';
      startFileDownload(result.downloadUrl, fileName);
    }
  };

  const handleConvert = async () => {
    let fileToUpload: File | null = null;
    if (activeTab === 'upload' && files.length > 0) {
      fileToUpload = files[0];
    } else if (activeTab === 'paste' && htmlContent.trim()) {
      const blob = new Blob([htmlContent], { type: 'text/html' });
      fileToUpload = new File([blob], 'pasted-content.html', { type: 'text/html' });
    }

    if (!fileToUpload) {
      setError('No file or content to convert.');
      return;
    }

    const options = {
      pageSize,
      orientation,
      margin: marginValues[margin],
      background: String(background),
    };
    
    setIsUploading(true);
    setError(null);
    setLocalError(null);
    setProgress(0);

    try {
      const queueResult = await queueUpload('/api/html-to-pdf', fileToUpload, options, (p) => setProgress(p));
      setProgress(100);
      await pollJobUntilDone(queueResult.jobId);
      const downloadInfo = await getJobDownloadInfo(queueResult.jobId);
      setResult({
        downloadUrl: downloadInfo.downloadUrl,
        fileName: downloadInfo.fileName,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
    } finally {
      setIsUploading(false);
    }
  };

  if (result) {
    return (
      <div className="w-full px-3 sm:px-4 lg:px-6 py-8 overflow-x-clip">
        <div className="max-w-4xl mx-auto">
          <div className="sticker-card p-6 sm:p-8 text-center">
            <div className="w-16 h-16 bg-violet/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <FileText className="w-7 h-7 text-violet" />
            </div>
            <h2 className="font-display font-bold text-2xl text-dark">Conversion Successful!</h2>
            <p className="text-gray">Your HTML has been converted to PDF.</p>
            <div className="mt-6 flex flex-col sm:flex-row justify-center gap-3">
              <button onClick={handleDownload} className="sticker-button">
                <Download className="w-5 h-5 mr-2" />
                Download PDF
              </button>
              <button onClick={resetState} className="sticker-button-secondary">
                Convert Another
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isConvertDisabled =
    isUploading ||
    (activeTab === 'upload' && files.length === 0) ||
    (activeTab === 'paste' && !htmlContent.trim());

  return (
    <div className="w-full px-3 sm:px-4 lg:px-6 py-8 overflow-x-clip">
      <div className="max-w-4xl mx-auto space-y-5">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-4">
          <div className="sticker-card p-2">
            <TabsList className="grid w-full grid-cols-2 bg-gray-100">
              <TabsTrigger value="upload" className="text-dark data-[state=active]:bg-white data-[state=active]:text-dark">Upload HTML File</TabsTrigger>
              <TabsTrigger value="paste" className="text-dark data-[state=active]:bg-white data-[state=active]:text-dark">Paste HTML Code</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="upload" className="mt-0">
            <div className="space-y-4">
              {files.length > 0 ? (
                <div className="sticker-card p-5">
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="w-12 h-12 bg-violet/10 rounded-xl flex items-center justify-center">
                      <FileText className="w-6 h-6 text-violet" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-dark truncate">{files[0].name}</p>
                      <p className="text-gray text-sm">{formatSize(files[0].size)}</p>
                    </div>
                    <button onClick={() => setFiles([])} disabled={isUploading} className="w-10 h-10 bg-gray-100 hover:bg-red-100 rounded-xl flex items-center justify-center transition-colors disabled:opacity-60">
                      <X className="w-5 h-5 text-gray hover:text-red-500" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="sticker-card p-5 sm:p-8 lg:p-12">
                  <div onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }} onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }} onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleDrop(Array.from(e.dataTransfer.files)); }} className={`border-3 border-dashed rounded-2xl p-6 sm:p-10 lg:p-16 flex flex-col items-center justify-center transition-all cursor-pointer ${isDragging ? 'border-pink bg-pink/5' : 'border-gray-300 hover:border-violet hover:bg-violet/5'}`}>
                    <div className="w-16 h-16 bg-violet/10 rounded-2xl flex items-center justify-center mb-6">
                      <Upload className="w-8 h-8 text-violet" />
                    </div>
                    <h3 className="font-display font-bold text-xl text-dark text-center mb-2">
                      Drop HTML file here
                    </h3>
                    <p className="text-gray text-center mb-6">or click to browse</p>
                    <label className="sticker-button cursor-pointer">
                      <span>Select HTML File</span>
                      <input
                        type="file"
                        accept=".html,.htm,text/html"
                        onChange={handleFileInput}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              )}
              {localError && (
                <div className="sticker-card p-4">
                  <p className="text-red-500 text-center text-sm">{localError}</p>
                </div>
              )}
            </div>
          </TabsContent>
          <TabsContent value="paste" className="mt-0">
            <div className="sticker-card p-5">
              <Textarea
                placeholder="Paste your HTML code here..."
                className="min-h-[240px]"
                value={htmlContent}
                onChange={(e) => setHtmlContent(e.target.value)}
              />
            </div>
          </TabsContent>
        </Tabs>

        <div className="sticker-card p-6 space-y-4 text-dark">
          <h3 className="font-display font-bold text-lg text-dark">PDF Options</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-dark">Page Size</Label>
              <Select value={pageSize} onValueChange={setPageSize}>
                <SelectTrigger className="text-dark"><SelectValue placeholder="Select page size" /></SelectTrigger>
                <SelectContent>{pdfOptions.pageSizes.map((size) => (<SelectItem key={size} value={size}>{size}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-dark">Page Orientation</Label>
              <RadioGroup value={orientation} onValueChange={setOrientation} className="flex space-x-4">
                {pdfOptions.orientations.map((o) => (<div key={o} className="flex items-center space-x-2"><RadioGroupItem value={o} id={o.toLowerCase()} /><Label className="text-dark" htmlFor={o.toLowerCase()}>{o}</Label></div>))}
              </RadioGroup>
            </div>
            <div className="space-y-2">
              <Label className="text-dark">Margin</Label>
              <Select value={margin} onValueChange={setMargin}>
                <SelectTrigger className="text-dark"><SelectValue placeholder="Select margin" /></SelectTrigger>
                <SelectContent>{pdfOptions.margins.map((m) => (<SelectItem key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2 pt-6">
              <Checkbox id="background" checked={background} onCheckedChange={(checked) => setBackground(Boolean(checked))} />
              <Label className="text-dark" htmlFor="background">Print background graphics</Label>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            onClick={handleConvert}
            disabled={isConvertDisabled}
            className={`sticker-button w-full sm:w-auto justify-center ${isConvertDisabled ? 'opacity-70 cursor-not-allowed' : ''}`}
          >
            {isUploading ? `Converting... ${progress}%` : 'Convert to PDF'}
          </button>
        </div>

        {error && (
          <div className="sticker-card p-4">
            <p className="text-red-500 text-center text-sm">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
