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
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          isScrolled
            ? 'bg-violet/90 backdrop-blur-md border-b border-white/10'
            : 'bg-transparent'
        }`}
      >
        <div className="w-full px-6 lg:px-12">
          <div className="flex items-center justify-between h-16 lg:h-20">
            {/* Logo */}
            <a href="/" className="flex items-center gap-2 group">
              <div className="w-10 h-10 bg-white rounded-xl border-[3px] border-black flex items-center justify-center transition-transform duration-200 group-hover:scale-105 shadow-sticker">
                <img
                  src="/favicon/favicon-32x32.png?v=20260305"
                  alt="EditFile logo"
                  className="w-6 h-6 object-contain"
                />
              </div>
              <span className="font-display font-bold text-xl text-white tracking-tight">
                EditFile
              </span>
            </a>

            {/* Desktop Navigation */}
            <div className="hidden lg:flex items-center gap-8">
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
            <div className="hidden lg:block">
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
              className="lg:hidden w-10 h-10 bg-white rounded-xl border-[3px] border-black flex items-center justify-center shadow-sticker"
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
            className="fixed inset-0 z-40 lg:hidden"
          >
            <div
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setIsMobileMenuOpen(false)}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="absolute right-0 top-0 h-full w-72 bg-white border-l-[3px] border-black shadow-sticker-lg pt-20"
            >
              <div className="flex flex-col gap-2 p-6">
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
