import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Upload, ArrowRight, FileText, Image as ImageIcon, FileType } from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

export default function HeroSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const headlineRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const microRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const section = sectionRef.current;
    const headline = headlineRef.current;
    const card = cardRef.current;
    const micros = microRefs.current.filter(Boolean);

    if (!section || !headline || !card) return;

    const ctx = gsap.context(() => {
      gsap.set([headline, card, ...micros], {
        force3D: true,
        willChange: 'transform, opacity',
      });

      // Initial load animation
      const loadTl = gsap.timeline({ delay: 0.2 });

      // Headline animation
      loadTl.fromTo(
        headline.querySelectorAll('.headline-line'),
        { x: -40, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.8, stagger: 0.06, ease: 'power2.out' }
      );

      // Subheadline
      loadTl.fromTo(
        headline.querySelector('.subheadline'),
        { y: 20, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.6, ease: 'power2.out' },
        '-=0.4'
      );

      // CTA buttons
      loadTl.fromTo(
        headline.querySelector('.cta-row'),
        { y: 20, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.6, ease: 'power2.out' },
        '-=0.3'
      );

      // Hero card
      loadTl.fromTo(
        card,
        { x: 120, rotate: 6, scale: 0.96, opacity: 0 },
        { x: 0, rotate: -2, scale: 1, opacity: 1, duration: 1, ease: 'power2.out' },
        '-=0.8'
      );

      // Micro stickers
      loadTl.fromTo(
        micros,
        { y: -30, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5, stagger: 0.08, ease: 'back.out(1.7)' },
        '-=0.6'
      );

      // Scroll-driven exit animation
      const scrollTl = gsap.timeline({
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: '+=130%',
          pin: true,
          scrub: 0.6,
          onLeaveBack: () => {
            // Reset all elements when scrolling back to top
            gsap.set(headline.querySelectorAll('.headline-line'), { x: 0, opacity: 1 });
            gsap.set(headline.querySelector('.subheadline'), { y: 0, opacity: 1 });
            gsap.set(headline.querySelector('.cta-row'), { y: 0, opacity: 1 });
            gsap.set(card, { x: 0, rotate: -2, opacity: 1 });
            gsap.set(micros, { x: 0, y: 0, opacity: 1 });
          },
        },
      });

      // ENTRANCE (0-30%): Hold position (already visible from load animation)
      // SETTLE (30-70%): Hold position
      // EXIT (70-100%): Elements exit

      scrollTl.fromTo(
        headline,
        { x: 0, opacity: 1 },
        { x: '-18vw', opacity: 0, ease: 'power2.in' },
        0.7
      );

      scrollTl.fromTo(
        card,
        { x: 0, rotate: -2, opacity: 1 },
        { x: '22vw', rotate: 6, opacity: 0, ease: 'power2.in' },
        0.7
      );

      micros.forEach((micro, i) => {
        const direction = i % 2 === 0 ? -1 : 1;
        scrollTl.fromTo(
          micro,
          { x: 0, opacity: 1 },
          { x: `${direction * 15}vw`, opacity: 0, ease: 'power2.in' },
          0.75
        );
      });
    }, section);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="section-pinned bg-violet z-10 flex items-center"
    >
      <div className="w-full px-6 lg:px-12 pt-20">
        <div className="relative flex flex-col lg:flex-row items-center justify-between gap-8 lg:gap-0">
          {/* Left: Headline */}
          <div ref={headlineRef} className="w-full lg:w-[44vw] lg:pl-[7vw]">
            <h1 className="font-display font-bold uppercase tracking-tight">
              <span className="headline-line block text-pink text-[clamp(48px,8vw,96px)] leading-[0.92]">
                Upload
              </span>
              <span className="headline-line block text-white text-[clamp(48px,8vw,96px)] leading-[0.92]">
                Edit
              </span>
              <span className="headline-line block text-white text-[clamp(48px,8vw,96px)] leading-[0.92]">
                Done
              </span>
            </h1>

            <p className="subheadline mt-6 lg:mt-8 text-white/80 text-lg lg:text-xl max-w-md leading-relaxed">
              PDFs and images, converted, compressed, organized—right in your browser.
            </p>

            <div className="cta-row mt-8 flex flex-wrap items-center gap-4">
              <a href="#tools" className="sticker-button group">
                <span>Start Editing</span>
                <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
              </a>
              <a
                href="#tools"
                className="text-white font-medium underline underline-offset-4 hover:text-pink transition-colors"
              >
                See all tools
              </a>
            </div>
          </div>

          {/* Right: Hero Card */}
          <div
            ref={cardRef}
            className="w-full lg:w-[40vw] lg:h-[56vh] lg:absolute lg:right-[6vw] lg:top-1/2 lg:-translate-y-1/2"
          >
            <div className="sticker-card h-full p-6 lg:p-8 flex flex-col -rotate-2">
              {/* Upload Zone */}
              <div className="flex-1 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center p-8 hover:border-pink hover:bg-pink/5 transition-colors cursor-pointer group">
                <div className="w-16 h-16 bg-violet/10 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-violet/20 transition-colors">
                  <Upload className="w-8 h-8 text-violet" />
                </div>
                <p className="text-dark font-semibold text-lg text-center">
                  Drop files here
                </p>
                <p className="text-gray text-sm text-center mt-1">
                  or click to browse
                </p>
                <div className="flex items-center gap-2 mt-4">
                  <span className="sticker-label text-[10px]">
                    <FileText className="w-3 h-3 mr-1" />
                    PDF
                  </span>
                  <span className="sticker-label text-[10px]">
                    <ImageIcon className="w-3 h-3 mr-1" />
                    JPG
                  </span>
                  <span className="sticker-label text-[10px]">
                    <FileType className="w-3 h-3 mr-1" />
                    Word
                  </span>
                </div>
              </div>

              {/* File Row */}
              <div className="mt-4 p-4 bg-gray-100 rounded-xl border-[2px] border-black flex items-center gap-3">
                <div className="w-10 h-10 bg-pink rounded-lg flex items-center justify-center">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-dark font-medium text-sm truncate">
                    document.pdf
                  </p>
                  <p className="text-gray text-xs">2.4 MB</p>
                </div>
                <span className="sticker-label bg-pink text-white border-pink text-[10px]">
                  NEW
                </span>
              </div>
            </div>
          </div>

          {/* Floating Micro Stickers */}
          <div
            ref={(el) => { microRefs.current[0] = el; }}
            className="hidden lg:block absolute right-[18vw] top-[10vh]"
          >
            <span className="sticker-label -rotate-[10deg]">PNG</span>
          </div>
          <div
            ref={(el) => { microRefs.current[1] = el; }}
            className="hidden lg:block absolute right-[10vw] bottom-[18vh]"
          >
            <span className="sticker-label rotate-[8deg]">PDF</span>
          </div>
          <div
            ref={(el) => { microRefs.current[2] = el; }}
            className="hidden lg:block absolute left-[50vw] top-[14vh]"
          >
            <span className="sticker-label -rotate-[6deg]">JPG</span>
          </div>
        </div>
      </div>
    </section>
  );
}
