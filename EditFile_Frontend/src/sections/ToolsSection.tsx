import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import {
  Minimize2, Combine, Scissors, FileOutput, RotateCw, Trash2,
  Hash, Droplets, Lock, Unlock, FileText, FileType, Image, Images,
  ScanText, Wrench, LayoutGrid, Maximize2, Crop, RefreshCw,
  FileImage, Wand2, Star, Sparkles, ArrowRight
} from 'lucide-react';
import { commonTools, availablePdfTools, availableImageTools } from '@/lib/data';

gsap.registerPlugin(ScrollTrigger);
const MotionLink = motion(Link);

const iconMap: Record<string, React.ElementType> = {
  Minimize2, Combine, Scissors, FileOutput, RotateCw, Trash2,
  Hash, Droplets, Lock, Unlock, FileText, FileType, Image, Images,
  ScanText, Wrench, LayoutGrid, Maximize2, Crop, RefreshCw,
  FileImage, Wand2, Star, Sparkles
};

interface ToolCardProps {
  tool: typeof commonTools[0];
  index: number;
}

function ToolCard({ tool, index }: ToolCardProps) {
  const Icon = iconMap[tool.icon] || FileText;

  return (
    <MotionLink
      to={tool.href}
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.5, delay: index * 0.05 }}
      whileHover={{ y: -4, scale: 1.02 }}
      className="sticker-card p-5 group cursor-pointer transition-all duration-200 hover:shadow-sticker-lg"
    >
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 bg-violet/10 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-violet/20 transition-colors">
          <Icon className="w-6 h-6 text-violet" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-display font-bold text-dark text-base">
              {tool.name}
            </h3>
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
          <p className="text-gray text-sm mt-1 leading-relaxed">
            {tool.description}
          </p>
        </div>
      </div>
    </MotionLink>
  );
}

interface CategoryBlockProps {
  to: string;
  title: string;
  description: string;
  count: number;
  icon: React.ElementType;
  index: number;
}

function CategoryBlock({ to, title, description, count, icon: Icon, index }: CategoryBlockProps) {
  return (
    <MotionLink
      to={to}
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      whileHover={{ y: -4, scale: 1.02 }}
      className="sticker-card p-5 sm:p-6 md:p-8 flex flex-col sm:flex-row items-start justify-between gap-4 group"
    >
      <div>
        <span className="sticker-label bg-pink text-white border-pink text-[10px]">
          {count} TOOLS
        </span>
        <h3 className="font-display font-bold text-dark text-xl sm:text-2xl mt-4">{title}</h3>
        <p className="text-gray mt-2 max-w-xs text-sm sm:text-base">{description}</p>
      </div>
      <div className="flex flex-row sm:flex-col items-center sm:items-end gap-4">
        <div className="w-14 h-14 bg-violet rounded-2xl border-[3px] border-black flex items-center justify-center shadow-sticker">
          <Icon className="w-6 h-6 text-white" />
        </div>
        <ArrowRight className="w-5 h-5 text-violet transition-transform group-hover:translate-x-1" />
      </div>
    </MotionLink>
  );
}

export default function ToolsSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const header = headerRef.current;

    if (!section || !header) return;

    const ctx = gsap.context(() => {
      gsap.set(header, {
        force3D: true,
        willChange: 'transform, opacity',
      });

      gsap.fromTo(
        header,
        { y: 40, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.8,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: header,
            start: 'top 80%',
            toggleActions: 'play none none reverse',
          },
        }
      );
    }, section);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      id="tools"
      className="relative bg-violet py-16 sm:py-20 lg:py-32 z-20"
    >
      <div className="w-full px-4 sm:px-6 lg:px-12">
        {/* Header */}
        <div ref={headerRef} className="text-center mb-12 lg:mb-16">
          <h2 className="font-display font-bold text-3xl sm:text-4xl lg:text-5xl text-white uppercase tracking-tight">
            Start With <span className="text-pink">Common Tools</span>
          </h2>
          <p className="text-white/70 text-base sm:text-lg mt-4 max-w-2xl mx-auto">
            Quick access to the most used editing tools. Open full tool lists for PDF and image files from the blocks below.
          </p>
        </div>

        {/* Category Blocks */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-12">
          <CategoryBlock
            to="/pdf-tools"
            title="Edit PDF"
            description="Merge, split, protect, convert, and organize your PDF files."
            count={availablePdfTools.length}
            icon={FileText}
            index={0}
          />
          <CategoryBlock
            to="/image-tools"
            title="Edit Image"
            description="Compress, resize, convert, and remove background from images."
            count={availableImageTools.length}
            icon={Image}
            index={1}
          />
        </div>

        {/* Common Tools */}
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-pink rounded-xl border-[3px] border-black flex items-center justify-center shadow-accent">
              <Star className="w-5 h-5 text-white" />
            </div>
            <h3 className="font-display font-bold text-xl sm:text-2xl text-white">Common Tools</h3>
            <span className="text-white/50 text-sm">({commonTools.length} tools)</span>
          </div>
          <div className="tool-cards-grid">
            {commonTools.map((tool, index) => (
              <ToolCard key={tool.id} tool={tool} index={index} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
