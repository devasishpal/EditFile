import { useState } from 'react';
import ToolTemplate from './ToolTemplate';

export default function WordToPDF() {
  const [quality, setQuality] = useState('standard');

  const settingsComponent = (
    <div>
      <label className="font-display font-bold text-dark block mb-3">
        PDF Quality
      </label>
      <div className="flex flex-wrap gap-2">
        {[
          { value: 'low', label: 'Low (Smaller file)' },
          { value: 'standard', label: 'Standard (Recommended)' },
          { value: 'high', label: 'High (Better quality)' },
        ].map((q) => (
          <button
            key={q.value}
            onClick={() => setQuality(q.value)}
            className={`px-4 py-2 rounded-xl border-2 font-medium transition-colors ${
              quality === q.value
                ? 'bg-violet text-white border-violet'
                : 'bg-white text-dark border-gray-200 hover:border-violet'
            }`}
          >
            {q.label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <ToolTemplate
      acceptedFileTypes=".doc,.docx,.rtf,.odt"
      fileTypeLabel="Word"
      showSettings={true}
      settingsComponent={settingsComponent}
    />
  );
}
