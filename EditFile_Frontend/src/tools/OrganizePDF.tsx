import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Download, ArrowUp, ArrowDown, RotateCw, Trash2, Check } from 'lucide-react';

interface Page {
  id: string;
  pageNumber: number;
  preview: string;
  rotation: number;
}

export default function OrganizePDF() {
  const [pages, setPages] = useState<Page[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedPages, setSelectedPages] = useState<string[]>([]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    // Simulate loading pages from PDF
    const mockPages: Page[] = Array.from({ length: 8 }, (_, i) => ({
      id: `page-${i}`,
      pageNumber: i + 1,
      preview: `https://placehold.co/150x200/violet/white?text=Page+${i + 1}`,
      rotation: 0,
    }));
    setPages(mockPages);
  }, []);

  const handleFileInput = useCallback(() => {
    const mockPages: Page[] = Array.from({ length: 8 }, (_, i) => ({
      id: `page-${i}`,
      pageNumber: i + 1,
      preview: `https://placehold.co/150x200/violet/white?text=Page+${i + 1}`,
      rotation: 0,
    }));
    setPages(mockPages);
  }, []);

  const movePage = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= pages.length) return;

    const newPages = [...pages];
    const [moved] = newPages.splice(index, 1);
    newPages.splice(newIndex, 0, moved);
    setPages(newPages);
  };

  const rotatePage = (id: string) => {
    setPages((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, rotation: (p.rotation + 90) % 360 } : p
      )
    );
  };

  const deletePage = (id: string) => {
    setPages((prev) => prev.filter((p) => p.id !== id));
    setSelectedPages((prev) => prev.filter((pid) => pid !== id));
  };

  const toggleSelection = (id: string) => {
    setSelectedPages((prev) =>
      prev.includes(id) ? prev.filter((pid) => pid !== id) : [...prev, id]
    );
  };

  const deleteSelected = () => {
    setPages((prev) => prev.filter((p) => !selectedPages.includes(p.id)));
    setSelectedPages([]);
  };

  return (
    <div className="w-full px-3 sm:px-4 lg:px-6 py-8 overflow-x-clip">
      <div className="max-w-6xl mx-auto">
        {/* Upload Area */}
        {pages.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="sticker-card p-5 sm:p-8 lg:p-12"
          >
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-3 border-dashed rounded-2xl p-6 sm:p-10 lg:p-16 flex flex-col items-center justify-center transition-all cursor-pointer ${
                isDragging
                  ? 'border-pink bg-pink/5'
                  : 'border-gray-300 hover:border-violet hover:bg-violet/5'
              }`}
            >
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-violet/10 rounded-2xl flex items-center justify-center mb-6">
                <Upload className="w-8 h-8 sm:w-10 sm:h-10 text-violet" />
              </div>
              <h3 className="font-display font-bold text-xl sm:text-2xl text-dark text-center mb-2">
                Drop a PDF to organize
              </h3>
              <p className="text-gray text-center mb-6">
                Reorder, rotate, and delete pages visually
              </p>
              <label className="sticker-button cursor-pointer">
                <span>Select PDF File</span>
                <input
                  type="file"
                  accept=".pdf"
                  onChange={handleFileInput}
                  className="hidden"
                />
              </label>
            </div>
          </motion.div>
        )}

        {/* Page Grid */}
        <AnimatePresence>
          {pages.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              {/* Toolbar */}
              <div className="sticker-card p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-4">
                  <span className="sticker-label bg-violet text-white border-violet">
                    {pages.length} pages
                  </span>
                  {selectedPages.length > 0 && (
                    <span className="sticker-label bg-pink text-white border-pink">
                      {selectedPages.length} selected
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {selectedPages.length > 0 && (
                    <button
                      onClick={deleteSelected}
                      className="px-4 py-2 bg-red-500 text-white rounded-xl border-2 border-black font-medium hover:bg-red-600 transition-colors"
                    >
                      <Trash2 className="w-4 h-4 inline mr-2" />
                      Delete Selected
                    </button>
                  )}
                  <button className="sticker-button">
                    <Download className="w-4 h-4 mr-2" />
                    Save PDF
                  </button>
                </div>
              </div>

              {/* Pages Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {pages.map((page, index) => (
                  <motion.div
                    key={page.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className={`sticker-card p-3 ${
                      selectedPages.includes(page.id)
                        ? 'ring-2 ring-pink ring-offset-2'
                        : ''
                    }`}
                  >
                    {/* Page Preview */}
                    <div
                      onClick={() => toggleSelection(page.id)}
                      className="relative aspect-[3/4] bg-gray-100 rounded-lg overflow-hidden cursor-pointer mb-3"
                    >
                      <img
                        src={page.preview}
                        alt={`Page ${page.pageNumber}`}
                        className="w-full h-full object-cover transition-transform"
                        style={{ transform: `rotate(${page.rotation}deg)` }}
                      />
                      <div className="absolute top-2 left-2">
                        <span className="sticker-label text-[10px] py-0.5">
                          {index + 1}
                        </span>
                      </div>
                      {selectedPages.includes(page.id) && (
                        <div className="absolute inset-0 bg-pink/20 flex items-center justify-center">
                          <div className="w-8 h-8 bg-pink rounded-full flex items-center justify-center">
                            <Check className="w-5 h-5 text-white" />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => movePage(index, 'up')}
                        disabled={index === 0}
                        className="w-8 h-8 bg-gray-100 hover:bg-violet/20 disabled:opacity-30 rounded-lg flex items-center justify-center transition-colors"
                      >
                        <ArrowUp className="w-4 h-4 text-gray" />
                      </button>
                      <button
                        onClick={() => movePage(index, 'down')}
                        disabled={index === pages.length - 1}
                        className="w-8 h-8 bg-gray-100 hover:bg-violet/20 disabled:opacity-30 rounded-lg flex items-center justify-center transition-colors"
                      >
                        <ArrowDown className="w-4 h-4 text-gray" />
                      </button>
                      <button
                        onClick={() => rotatePage(page.id)}
                        className="w-8 h-8 bg-gray-100 hover:bg-violet/20 rounded-lg flex items-center justify-center transition-colors"
                      >
                        <RotateCw className="w-4 h-4 text-gray" />
                      </button>
                      <button
                        onClick={() => deletePage(page.id)}
                        className="w-8 h-8 bg-gray-100 hover:bg-red-100 rounded-lg flex items-center justify-center transition-colors"
                      >
                        <Trash2 className="w-4 h-4 text-gray hover:text-red-500" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

