import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Menu, X, Minimize2, Combine, Scissors, Crop, RotateCw,
  FileText, FileType, FileOutput, FileImage, Image, Images, Droplets, Lock, ScanText, Trash2,
  Hash,
  LayoutGrid, Maximize2, RefreshCw, Wand2, ChevronDown
} from 'lucide-react';
import { availablePdfTools, availableImageTools } from '@/lib/data';

const iconMap: Record<string, React.ElementType> = {
  Minimize2, Combine, Scissors, Crop, RotateCw, FileText, FileType, FileOutput, FileImage, Image, Images,
  Droplets, Lock, ScanText, Trash2, Hash, LayoutGrid, Maximize2, RefreshCw, Wand2,
};

interface ToolLayoutProps {
  children: React.ReactNode;
  toolName: string;
  toolDescription: string;
  icon: string;
}

export default function ToolLayout({ children, toolName, toolDescription, icon }: ToolLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isToolsDropdownOpen, setIsToolsDropdownOpen] = useState(false);
  const navigate = useNavigate();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const ToolIcon = iconMap[icon] || FileText;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsToolsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // const allTools = [...availablePdfTools, ...availableImageTools];

  return (
    <div className="min-h-screen bg-violet">
      {/* Grain Overlay */}
      <div className="grain-overlay" />

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-violet/95 backdrop-blur-md border-b border-white/10">
        <div className="flex items-center justify-between h-16 px-4 lg:px-6">
          {/* Left: Logo & Back */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="w-10 h-10 bg-white rounded-xl border-[3px] border-black flex items-center justify-center hover:scale-105 transition-transform shadow-sticker"
            >
              <ArrowLeft className="w-5 h-5 text-dark" />
            </button>
            <Link to="/" className="flex items-center gap-2 group">
              <div className="w-10 h-10 bg-white rounded-xl border-[3px] border-black flex items-center justify-center transition-transform duration-200 group-hover:scale-105 shadow-sticker">
                <img
                  src="/favicon/favicon-32x32.png?v=20260305"
                  alt="EditFile logo"
                  className="w-6 h-6 object-contain"
                />
              </div>
              <span className="font-display font-bold text-xl text-white tracking-tight hidden sm:block">
                EditFile
              </span>
            </Link>
          </div>

          {/* Center: Tool Info */}
          <div className="hidden md:flex items-center gap-3">
            <div className="w-10 h-10 bg-pink rounded-xl border-[3px] border-black flex items-center justify-center shadow-accent">
              <ToolIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-display font-bold text-white text-sm lg:text-base">
                {toolName}
              </h1>
              <p className="text-white/60 text-xs hidden lg:block">
                {toolDescription}
              </p>
            </div>
          </div>

          {/* Right: Tools Dropdown & Sidebar Toggle */}
          <div className="flex items-center gap-2">
            {/* Tools Dropdown */}
            <div className="relative hidden lg:block" ref={dropdownRef}>
              <button
                onClick={() => setIsToolsDropdownOpen(!isToolsDropdownOpen)}
                className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl border border-white/20 transition-colors"
              >
                <span className="text-white text-sm font-medium">All Tools</span>
                <ChevronDown className={`w-4 h-4 text-white transition-transform ${isToolsDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {isToolsDropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    transition={{ duration: 0.2 }}
                    className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl border-[3px] border-black shadow-sticker-lg overflow-hidden"
                  >
                    <div className="max-h-96 overflow-y-auto p-4">
                      <p className="font-display font-bold text-dark text-sm mb-3">PDF Tools</p>
                      <div className="space-y-1 mb-4">
                        {availablePdfTools.slice(0, 6).map((tool) => {
                          const ToolIcon = iconMap[tool.icon] || FileText;
                          return (
                            <Link
                              key={tool.id}
                              to={tool.href}
                              onClick={() => setIsToolsDropdownOpen(false)}
                              className="flex items-center gap-3 p-2 hover:bg-violet/10 rounded-lg transition-colors"
                            >
                              <ToolIcon className="w-4 h-4 text-violet" />
                              <span className="text-dark text-sm">{tool.name}</span>
                            </Link>
                          );
                        })}
                      </div>
                      <p className="font-display font-bold text-dark text-sm mb-3">Image Tools</p>
                      <div className="space-y-1">
                        {availableImageTools.slice(0, 4).map((tool) => {
                          const ToolIcon = iconMap[tool.icon] || FileText;
                          return (
                            <Link
                              key={tool.id}
                              to={tool.href}
                              onClick={() => setIsToolsDropdownOpen(false)}
                              className="flex items-center gap-3 p-2 hover:bg-violet/10 rounded-lg transition-colors"
                            >
                              <ToolIcon className="w-4 h-4 text-violet" />
                              <span className="text-dark text-sm">{tool.name}</span>
                            </Link>
                          );
                        })}
                      </div>
                      <div className="mt-4 pt-3 border-t border-gray-200 grid grid-cols-2 gap-2">
                        <Link
                          to="/pdf-tools"
                          onClick={() => setIsToolsDropdownOpen(false)}
                          className="text-center text-pink text-sm font-medium hover:underline"
                        >
                          PDF Page
                        </Link>
                        <Link
                          to="/image-tools"
                          onClick={() => setIsToolsDropdownOpen(false)}
                          className="text-center text-pink text-sm font-medium hover:underline"
                        >
                          Image Page
                        </Link>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="lg:hidden w-10 h-10 bg-white rounded-xl border-[3px] border-black flex items-center justify-center shadow-sticker"
            >
              {isSidebarOpen ? (
                <X className="w-5 h-5 text-dark" />
              ) : (
                <Menu className="w-5 h-5 text-dark" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Sidebar */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 lg:hidden"
          >
            <div
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setIsSidebarOpen(false)}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="absolute right-0 top-16 bottom-0 w-80 bg-white border-l-[3px] border-black overflow-y-auto"
            >
              <div className="p-4">
                <p className="font-display font-bold text-dark text-sm mb-3">PDF Tools</p>
                <div className="space-y-1 mb-6">
                  {availablePdfTools.map((tool) => {
                    const ToolIcon = iconMap[tool.icon] || FileText;
                    const isActive = tool.name === toolName;
                    return (
                      <Link
                        key={tool.id}
                        to={tool.href}
                        onClick={() => setIsSidebarOpen(false)}
                        className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${
                          isActive
                            ? 'bg-violet/10 border-[2px] border-violet'
                            : 'hover:bg-gray-100 border-[2px] border-transparent'
                        }`}
                      >
                        <ToolIcon className={`w-5 h-5 ${isActive ? 'text-violet' : 'text-gray'}`} />
                        <span className={`text-sm ${isActive ? 'text-violet font-medium' : 'text-dark'}`}>
                          {tool.name}
                        </span>
                      </Link>
                    );
                  })}
                </div>
                <p className="font-display font-bold text-dark text-sm mb-3">Image Tools</p>
                <div className="space-y-1">
                  {availableImageTools.map((tool) => {
                    const ToolIcon = iconMap[tool.icon] || FileText;
                    const isActive = tool.name === toolName;
                    return (
                      <Link
                        key={tool.id}
                        to={tool.href}
                        onClick={() => setIsSidebarOpen(false)}
                        className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${
                          isActive
                            ? 'bg-violet/10 border-[2px] border-violet'
                            : 'hover:bg-gray-100 border-[2px] border-transparent'
                        }`}
                      >
                        <ToolIcon className={`w-5 h-5 ${isActive ? 'text-violet' : 'text-gray'}`} />
                        <span className={`text-sm ${isActive ? 'text-violet font-medium' : 'text-dark'}`}>
                          {tool.name}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="pt-16 min-h-screen">
        {children}
      </main>
    </div>
  );
}


