import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ArrowRight, Upload, FileText, Image as ImageIcon, FileType } from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

export default function FinalCTASection() {
  const sectionRef = useRef<HTMLElement>(null);
  const headlineRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const headline = headlineRef.current;
    const card = cardRef.current;

    if (!section || !headline || !card) return;

    const ctx = gsap.context(() => {
      const shouldPin = window.matchMedia('(min-width: 1024px)').matches;
      if (!shouldPin) {
        return;
      }

      gsap.set([headline, card], {
        force3D: true,
        willChange: 'transform, opacity',
      });

      const scrollTl = gsap.timeline({
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: '+=130%',
          pin: true,
          scrub: 0.6,
        },
      });

      // ENTRANCE (0-30%)
      scrollTl.fromTo(
        headline,
        { x: '-50vw', opacity: 0 },
        { x: 0, opacity: 1, ease: 'none' },
        0
      );

      scrollTl.fromTo(
        card,
        { x: '60vw', rotate: 6, opacity: 0 },
        { x: 0, rotate: 1, opacity: 1, ease: 'none' },
        0
      );

      // SETTLE (30-70%): Hold position

      // EXIT (70-100%)
      scrollTl.fromTo(
        headline,
        { x: 0, opacity: 1 },
        { x: '-18vw', opacity: 0, ease: 'power2.in' },
        0.7
      );

      scrollTl.fromTo(
        card,
        { x: 0, rotate: 1, opacity: 1 },
        { x: '22vw', rotate: 6, opacity: 0, ease: 'power2.in' },
        0.7
      );
    }, section);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="section-pinned bg-white z-[70] flex items-start lg:items-center"
    >
      <div className="w-full px-4 sm:px-6 lg:px-12 pt-20 sm:pt-24 lg:pt-0 pb-8 sm:pb-12 lg:pb-0">
        <div className="relative flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8 lg:gap-0">
          {/* Left: Headline */}
          <div
            ref={headlineRef}
            className="w-full lg:w-[46vw] lg:pl-[7vw]"
          >
            <h2 className="font-display font-bold uppercase tracking-tight">
              <span className="block text-dark text-[clamp(32px,10vw,72px)] leading-[0.95]">
                Ready
              </span>
              <span className="block text-dark text-[clamp(32px,10vw,72px)] leading-[0.95]">
                When You
              </span>
              <span className="block text-pink text-[clamp(32px,10vw,72px)] leading-[0.95]">
                Are
              </span>
            </h2>

            <p className="mt-5 sm:mt-6 lg:mt-8 text-gray text-base sm:text-lg lg:text-xl max-w-md leading-relaxed">
              No signup. No watermarks. Just results.
            </p>

            <div className="mt-7 sm:mt-8 flex flex-wrap items-start sm:items-center gap-3 sm:gap-4">
              <a
                href="#tools"
                className="sticker-button group animate-pulse-soft"
              >
                <span>Start Editing</span>
                <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
              </a>
              <p className="text-gray text-sm">
                Free forever. No credit card required.
              </p>
            </div>
          </div>

          {/* Right: Card */}
          <div
            ref={cardRef}
            className="w-full lg:w-[40vw] lg:h-[56vh] lg:absolute lg:right-[6vw] lg:top-1/2 lg:-translate-y-1/2"
          >
            <div className="sticker-card h-full p-4 sm:p-6 lg:p-8 flex flex-col rotate-1">
              {/* Upload Zone */}
              <div className="flex-1 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center p-5 sm:p-8 hover:border-pink hover:bg-pink/5 transition-colors cursor-pointer group">
                <div className="w-16 h-16 bg-violet/10 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-violet/20 transition-colors">
                  <Upload className="w-8 h-8 text-violet" />
                </div>
                <p className="text-dark font-semibold text-lg text-center">
                  Drop files here
                </p>
                <p className="text-gray text-sm text-center mt-1">
                  or click to browse
                </p>
              </div>

              {/* Format Chips */}
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <span className="sticker-label">
                  <FileText className="w-3 h-3 mr-1" />
                  PDF
                </span>
                <span className="sticker-label">
                  <ImageIcon className="w-3 h-3 mr-1" />
                  JPG
                </span>
                <span className="sticker-label">
                  <ImageIcon className="w-3 h-3 mr-1" />
                  PNG
                </span>
                <span className="sticker-label">
                  <FileType className="w-3 h-3 mr-1" />
                  Word
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
