import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X } from 'lucide-react';

const navLinks = [
  { name: 'Tools', href: '#tools' },
  { name: 'Features', href: '#features' },
  { name: 'How It Works', href: '#how-it-works' },
  { name: 'FAQ', href: '#faq' },
];

export default function Navigation() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const rafRef = useRef<number | null>(null);
  const scrolledRef = useRef(false);

  useEffect(() => {
    const updateScrolled = () => {
      rafRef.current = null;
      const nextScrolled = window.scrollY > 50;
      if (nextScrolled !== scrolledRef.current) {
        scrolledRef.current = nextScrolled;
        setIsScrolled(nextScrolled);
      }
    };

    const handleScroll = () => {
      if (rafRef.current !== null) return;
      rafRef.current = window.requestAnimationFrame(updateScrolled);
    };

    updateScrolled();
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  return (
    <>
      <motion.nav
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          width: '100%',
          maxWidth: '100%',
          boxSizing: 'border-box',
        }}
        className={`fixed top-0 inset-x-0 z-[1000] transition-all duration-300 ${
          isScrolled
            ? 'bg-violet/95 backdrop-blur-md border-b border-white/10'
            : 'bg-violet/80 backdrop-blur-sm border-b border-white/10'
        }`}
      >
        <div
          className="w-full max-w-full box-border overflow-x-clip"
          style={{
            paddingLeft: 'env(safe-area-inset-left)',
            paddingRight: 'env(safe-area-inset-right)',
          }}
        >
          <div className="flex w-full max-w-full items-center justify-between gap-3 h-16 lg:h-20 px-2.5 sm:px-6 lg:px-12 box-border min-w-0 overflow-x-clip">
            {/* Logo */}
            <a href="/" className="flex min-w-0 items-center gap-2 group">
              <div className="w-10 h-10 bg-white rounded-xl border-[3px] border-black flex items-center justify-center transition-transform duration-200 group-hover:scale-105 shadow-sticker">
                <img
                  src="/favicon/favicon-32x32.png?v=20260305"
                  alt="EditFile logo"
                  className="w-6 h-6 object-contain"
                />
              </div>
              <span className="hidden sm:block font-display font-bold text-lg xl:text-xl text-white tracking-tight truncate">
                EditFile
              </span>
            </a>

            {/* Desktop Navigation */}
            <div className="hidden xl:flex items-center gap-6 2xl:gap-8">
              {navLinks.map((link) => (
                <a
                  key={link.name}
                  href={link.href}
                  className="nav-link text-sm font-medium"
                >
                  {link.name}
                </a>
              ))}
            </div>

            {/* CTA Button */}
            <div className="hidden xl:block">
              <a
                href="#tools"
                className="sticker-button text-sm"
              >
                Start Editing
              </a>
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="xl:hidden ml-auto w-10 h-10 bg-white rounded-xl border-[3px] border-black flex items-center justify-center shadow-sticker shrink-0 box-border"
            >
              {isMobileMenuOpen ? (
                <X className="w-5 h-5 text-dark" />
              ) : (
                <Menu className="w-5 h-5 text-dark" />
              )}
            </button>
          </div>
        </div>
      </motion.nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[1100] xl:hidden overflow-x-hidden"
          >
            <div
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setIsMobileMenuOpen(false)}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              style={{ right: 'env(safe-area-inset-right)' }}
              className="absolute inset-y-0 right-0 box-border w-full max-w-[20rem] bg-white border-l-[3px] border-black shadow-sticker-lg pt-20 overflow-x-hidden"
            >
              <div className="flex flex-col gap-2 p-4 sm:p-6">
                {navLinks.map((link) => (
                  <a
                    key={link.name}
                    href={link.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="px-4 py-3 text-dark font-medium rounded-xl hover:bg-violet/10 transition-colors border-[2px] border-transparent hover:border-black/10"
                  >
                    {link.name}
                  </a>
                ))}
                <a
                  href="#tools"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="sticker-button mt-4 text-center"
                >
                  Start Editing
                </a>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
