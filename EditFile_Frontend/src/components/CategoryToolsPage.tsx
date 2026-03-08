import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
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
} from 'lucide-react';
import type { Tool } from '@/types';

const MotionLink = motion(Link);

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
  index: number;
}

function ToolCard({ tool, index }: ToolCardProps) {
  const Icon = iconMap[tool.icon] || FileText;

  return (
    <MotionLink
      to={tool.href}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.45, delay: index * 0.04 }}
      whileHover={{ y: -4, scale: 1.02 }}
      className="sticker-card min-h-[160px] sm:min-h-[170px] p-5 group cursor-pointer transition-all duration-200 hover:shadow-sticker-lg"
    >
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 bg-violet/10 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-violet/20 transition-colors">
          <Icon className="w-6 h-6 text-violet" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-display font-bold text-dark text-base">{tool.name}</h3>
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
          </div>
          <p className="text-gray text-sm mt-1 leading-relaxed">{tool.description}</p>
        </div>
      </div>
    </MotionLink>
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

  let animationIndex = 0;

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
              className={`px-3 sm:px-4 py-2 rounded-xl border-[2px] font-semibold text-xs sm:text-sm transition-colors text-center ${
                activeCategory === 'pdf'
                  ? 'bg-pink text-white border-black'
                  : 'bg-white text-dark border-black hover:bg-pink/10'
              }`}
            >
              PDF Tools
            </Link>
            <Link
              to="/image-tools"
              className={`px-3 sm:px-4 py-2 rounded-xl border-[2px] font-semibold text-xs sm:text-sm transition-colors text-center ${
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
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="mb-10"
          >
            <h1 className="font-display font-bold text-3xl sm:text-4xl lg:text-5xl text-white uppercase tracking-tight">
              {title}
            </h1>
            <p className="text-white/70 text-base sm:text-lg mt-4 max-w-3xl">{description}</p>
          </motion.div>

          {hasSections ? (
            <div className="space-y-10">
              {categorizedSections.map((section) => (
                <section key={section.title}>
                  <h2 className="font-display font-bold text-2xl sm:text-3xl text-white uppercase tracking-tight mb-5">
                    {section.title}
                  </h2>
                  <div className="tool-cards-grid">
                    {section.tools.map((tool) => {
                      const cardIndex = animationIndex++;
                      return <ToolCard key={tool.id} tool={tool} index={cardIndex} />;
                    })}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="tool-cards-grid">
              {tools.map((tool, index) => (
                <ToolCard key={tool.id} tool={tool} index={index} />
              ))}
            </div>
          )}

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.15 }}
            className="text-center mt-12"
          >
            <Link to="/" className="sticker-button group">
              Back to Landing
              <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
            </Link>
          </motion.div>
        </div>
      </main>
    </div>
  );
}
