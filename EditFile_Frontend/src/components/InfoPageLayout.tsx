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
    <div className="min-h-screen bg-violet relative">
      <div className="grain-overlay" />

      <header className="sticky top-0 z-40 bg-violet/95 backdrop-blur-md border-b border-white/10">
        <div className="w-full px-6 lg:px-12 py-4 flex items-center justify-between gap-4">
          <Link to="/" className="sticker-button-secondary !px-4 !py-2">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Home
          </Link>

          <a href="/#tools" className="sticker-button !px-4 !py-2 text-sm">
            All Tools
          </a>
        </div>
      </header>

      <main className="relative z-10 px-6 lg:px-12 py-10 lg:py-14">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <h1 className="font-display font-bold text-4xl lg:text-5xl text-white uppercase tracking-tight">
              {title}
            </h1>
            <p className="text-white/75 text-lg mt-4 max-w-3xl">{description}</p>
          </div>

          <article className="sticker-card p-6 lg:p-8 text-dark space-y-6 leading-relaxed">
            {children}
          </article>
        </div>
      </main>
    </div>
  );
}
