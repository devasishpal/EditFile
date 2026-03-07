import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

interface InfoPageLayoutProps {
  title: string;
  description: string;
  children: ReactNode;
}

export default function InfoPageLayout({
  title,
  description,
  children,
}: InfoPageLayoutProps) {
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

          <a href="/#tools" className="sticker-button !px-3 sm:!px-4 !py-2 text-xs sm:text-sm">
            All Tools
          </a>
        </div>
      </header>

      <main className="relative z-10 w-full max-w-full px-4 sm:px-6 lg:px-12 py-8 sm:py-10 lg:py-14">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <h1 className="font-display font-bold text-3xl sm:text-4xl lg:text-5xl text-white uppercase tracking-tight">
              {title}
            </h1>
            <p className="text-white/75 text-base sm:text-lg mt-4 max-w-3xl">{description}</p>
          </div>

          <article className="sticker-card p-5 sm:p-6 lg:p-8 text-dark space-y-6 leading-relaxed">
            {children}
          </article>
        </div>
      </main>
    </div>
  );
}
