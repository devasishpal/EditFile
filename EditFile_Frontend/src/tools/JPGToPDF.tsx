import { useEffect, useState } from 'react';
import ToolTemplate from './ToolTemplate';
import {
  convertImagesToPdf,
  downloadProcessedAsset,
  isSupportedToolImage,
  revokePreviewUrl,
  type ProcessedAsset,
} from '@/lib/imageToolApi';

export default function JPGToPDF() {
  const [pageSize, setPageSize] = useState('a4');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [margin, setMargin] = useState(0);
  const [result, setResult] = useState<ProcessedAsset | null>(null);

  useEffect(() => {
    return () => {
      revokePreviewUrl(result?.previewUrl);
    };
  }, [result]);

  const handleManualProcess = async (files: File[]) => {
    if (files.length === 0) {
      throw new Error('Please upload at least one image.');
    }

    const supportedFiles = files.filter(isSupportedToolImage);
    if (supportedFiles.length !== files.length) {
      throw new Error('Only JPG, JPEG, PNG, and WEBP images are supported.');
    }

    const processed = await convertImagesToPdf(supportedFiles);
    if (result) {
      revokePreviewUrl(result.previewUrl);
    }
    setResult(processed);
  };

  const handleManualDownload = () => {
    if (!result) {
      throw new Error('No converted PDF available yet.');
    }
    downloadProcessedAsset(result);
  };

  const settingsComponent = (
    <div className="space-y-4">
      <div>
        <label className="font-display font-bold text-dark block mb-3">
          Page Size
        </label>
        <div className="flex flex-wrap gap-2">
          {[
            { value: 'a4', label: 'A4' },
            { value: 'letter', label: 'Letter' },
            { value: 'legal', label: 'Legal' },
            { value: 'original', label: 'Original Size' },
          ].map((size) => (
            <button
              key={size.value}
              onClick={() => setPageSize(size.value)}
              className={`px-4 py-2 rounded-xl border-2 font-medium transition-colors ${
                pageSize === size.value
                  ? 'bg-violet text-white border-violet'
                  : 'bg-white text-dark border-gray-200 hover:border-violet'
              }`}
            >
              {size.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="font-display font-bold text-dark block mb-3">
          Orientation
        </label>
        <div className="flex flex-wrap gap-2">
          {[
            { value: 'portrait', label: 'Portrait' },
            { value: 'landscape', label: 'Landscape' },
          ].map((o) => (
            <button
              key={o.value}
              onClick={() => setOrientation(o.value as any)}
              className={`px-4 py-2 rounded-xl border-2 font-medium transition-colors ${
                orientation === o.value
                  ? 'bg-violet text-white border-violet'
                  : 'bg-white text-dark border-gray-200 hover:border-violet'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <label className="font-display font-bold text-dark">
            Margin
          </label>
          <span className="sticker-label bg-violet text-white border-violet">
            {margin}mm
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="50"
          value={margin}
          onChange={(e) => setMargin(Number(e.target.value))}
          className="w-full h-3 bg-gray-200 rounded-full appearance-none cursor-pointer accent-violet"
        />
      </div>
    </div>
  );

  return (
    <ToolTemplate
      acceptedFileTypes=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
      fileTypeLabel="Image"
      allowMultiple={true}
      showSettings={true}
      showSettingsToggle={false}
      settingsComponent={settingsComponent}
      autoOpenSettingsOnUpload={true}
      manualProcessing={true}
      convertButtonLabel="Convert"
      downloadButtonLabel="Download"
      onManualProcess={handleManualProcess}
      onManualDownload={handleManualDownload}
    />
  );
}
