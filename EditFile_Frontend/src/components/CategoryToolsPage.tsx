import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Minimize2,
  Combine,
  Scissors,
  FileOutput,
  RotateCw,
  Trash2,
  Hash,
  Droplets,
  Lock,
  Unlock,
  FileText,
  FileType,
  Image,
  Images,
  ScanText,
  Wrench,
  LayoutGrid,
  Maximize2,
  Crop,
  RefreshCw,
  FileImage,
  Wand2,
  Star,
  Sparkles,
  Clock3,
} from 'lucide-react';
import type { Tool } from '@/types';
import Footer from '@/sections/Footer';

const iconMap: Record<string, React.ElementType> = {
  Minimize2,
  Combine,
  Scissors,
  FileOutput,
  RotateCw,
  Trash2,
  Hash,
  Droplets,
  Lock,
  Unlock,
  FileText,
  FileType,
  Image,
  Images,
  ScanText,
  Wrench,
  LayoutGrid,
  Maximize2,
  Crop,
  RefreshCw,
  FileImage,
  Wand2,
  Star,
  Sparkles,
  Clock3,
};

interface CategoryToolsPageProps {
  title: string;
  description: string;
  tools: Tool[];
  activeCategory: 'pdf' | 'image';
  sections?: ToolSection[];
}

export interface ToolSection {
  title: string;
  toolIds: string[];
}

interface ToolCardProps {
  tool: Tool;
}

function ToolCard({ tool }: ToolCardProps) {
  const Icon = iconMap[tool.icon] || FileText;
  const hasTag = tool.popular || tool.new || tool.comingSoon;

  return (
    <Link
      to={tool.href}
      className="sticker-card h-[176px] sm:h-[184px] p-4 sm:p-5 cursor-pointer transition-transform duration-200 ease-out hover:-translate-y-1 hover:shadow-sticker-lg"
    >
      <div className="flex h-full items-start gap-3">
        <div className="w-11 h-11 bg-violet/10 rounded-xl flex items-center justify-center flex-shrink-0">
          <Icon className="w-5 h-5 text-violet" />
        </div>
        <div className="flex-1 min-w-0 pt-1">
          <h3 className="font-display font-bold text-dark text-base leading-tight [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical] overflow-hidden">
            {tool.name}
          </h3>
          <div className="mt-2 h-6">
            {hasTag && (
              <div className="flex items-center gap-2">
                {tool.popular && (
                  <span className="sticker-label bg-pink text-white border-pink text-[9px] py-0.5">
                    <Star className="w-3 h-3 mr-1" />
                    POPULAR
                  </span>
                )}
                {tool.new && (
                  <span className="sticker-label bg-violet text-white border-violet text-[9px] py-0.5">
                    <Sparkles className="w-3 h-3 mr-1" />
                    NEW
                  </span>
                )}
                {tool.comingSoon && (
                  <span className="sticker-label bg-amber-500 text-white border-amber-500 text-[9px] py-0.5">
                    <Clock3 className="w-3 h-3 mr-1" />
                    COMING SOON
                  </span>
                )}
              </div>
            )}
          </div>
          <p className="text-gray text-sm mt-2 leading-relaxed [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical] overflow-hidden">
            {tool.description}
          </p>
        </div>
      </div>
    </Link>
  );
}

export default function CategoryToolsPage({
  title,
  description,
  tools,
  activeCategory,
  sections,
}: CategoryToolsPageProps) {
  const hasSections = Boolean(sections?.length);
  const toolById = new Map(tools.map((tool) => [tool.id, tool]));
  const categorizedSections =
    sections?.map((section) => ({
      title: section.title,
      tools: section.toolIds
        .map((toolId) => toolById.get(toolId))
        .filter((tool): tool is Tool => Boolean(tool)),
    })) ?? [];

  return (
    <div className="min-h-screen w-full max-w-full bg-violet relative overflow-x-clip">
      <div className="grain-overlay" />

      <header
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingLeft: 'env(safe-area-inset-left)',
          paddingRight: 'env(safe-area-inset-right)',
        }}
        className="sticky top-0 z-40 bg-violet/95 backdrop-blur-md border-b border-white/10"
      >
        <div className="w-full px-4 sm:px-6 lg:px-12 py-3 sm:py-4 flex flex-wrap items-center justify-between gap-3">
          <Link to="/" className="sticker-button-secondary !px-3 sm:!px-4 !py-2 text-xs sm:text-sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Home
          </Link>
          <div className="w-full sm:w-auto grid grid-cols-2 sm:flex items-center gap-2">
            <Link
              to="/pdf-tools"
              className={`px-3 sm:px-4 py-2 rounded-xl border-[2px] font-semibold text-xs sm:text-sm text-center ${
                activeCategory === 'pdf'
                  ? 'bg-pink text-white border-black'
                  : 'bg-white text-dark border-black hover:bg-pink/10'
              }`}
            >
              PDF Tools
            </Link>
            <Link
              to="/image-tools"
              className={`px-3 sm:px-4 py-2 rounded-xl border-[2px] font-semibold text-xs sm:text-sm text-center ${
                activeCategory === 'image'
                  ? 'bg-pink text-white border-black'
                  : 'bg-white text-dark border-black hover:bg-pink/10'
              }`}
            >
              Image Tools
            </Link>
          </div>
        </div>
      </header>

      <main className="relative z-10 w-full max-w-full px-4 sm:px-6 lg:px-12 py-8 sm:py-10 lg:py-14">
        <div className="max-w-7xl mx-auto">
          <div className="mb-10">
            <h1 className="font-display font-bold text-3xl sm:text-4xl lg:text-5xl text-white uppercase tracking-tight">
              {title}
            </h1>
            <p className="text-white/70 text-base sm:text-lg mt-4 max-w-3xl">{description}</p>
          </div>

          {hasSections ? (
            <div className="space-y-10">
              {categorizedSections.map((section) => (
                <section key={section.title}>
                  <h2 className="font-display font-bold text-2xl sm:text-3xl text-white uppercase tracking-tight mb-5">
                    {section.title}
                  </h2>
                  <div className="tool-cards-grid">
                    {section.tools.map((tool) => (
                      <ToolCard key={tool.id} tool={tool} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="tool-cards-grid">
              {tools.map((tool) => (
                <ToolCard key={tool.id} tool={tool} />
              ))}
            </div>
          )}

          <div className="text-center mt-12">
            <Link to="/" className="sticker-button">
              Back to Landing
              <ArrowRight className="w-4 h-4 ml-2" />
            </Link>
          </div>
        </div>
      </main>

      <Footer disableMotion />
    </div>
  );
}
