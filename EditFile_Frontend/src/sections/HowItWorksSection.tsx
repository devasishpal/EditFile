import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Upload, Settings, Download, ArrowRight } from 'lucide-react';
import { howItWorks } from '@/lib/data';

gsap.registerPlugin(ScrollTrigger);

const iconMap: Record<string, React.ElementType> = {
  Upload, Settings, Download
};

export default function HowItWorksSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const stepsRef = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const section = sectionRef.current;
    const steps = stepsRef.current.filter(Boolean);

    if (!section || steps.length === 0) return;

    const ctx = gsap.context(() => {
      gsap.set(steps, {
        force3D: true,
        willChange: 'transform, opacity',
      });

      steps.forEach((step, i) => {
        gsap.fromTo(
          step,
          { x: i % 2 === 0 ? -60 : 60, opacity: 0 },
          {
            x: 0,
            opacity: 1,
            duration: 0.8,
            ease: 'power2.out',
            scrollTrigger: {
              trigger: step,
              start: 'top 80%',
              toggleActions: 'play none none reverse',
            },
          }
        );
      });
    }, section);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      id="how-it-works"
      className="relative bg-violet py-16 sm:py-20 lg:py-32 z-40"
    >
      <div className="w-full px-4 sm:px-6 lg:px-12">
        {/* Header */}
        <div className="text-center mb-12 lg:mb-16">
          <h2 className="font-display font-bold text-3xl sm:text-4xl lg:text-5xl text-white uppercase tracking-tight">
            How It <span className="text-pink">Works</span>
          </h2>
          <p className="text-white/70 text-base sm:text-lg mt-4 max-w-2xl mx-auto">
            Three simple steps to transform your files. No technical knowledge needed.
          </p>
        </div>

        {/* Steps */}
        <div className="relative max-w-5xl mx-auto">
          {/* Connection Line (Desktop) */}
          <div className="hidden lg:block absolute top-24 left-[16.67%] right-[16.67%] h-0.5 bg-white/20">
            <motion.div
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1.5, ease: 'easeInOut' }}
              className="h-full bg-pink origin-left"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12">
            {howItWorks.map((step, index) => {
              const Icon = iconMap[step.icon] || Upload;
              return (
                <div
                  key={step.step}
                  ref={(el) => { stepsRef.current[index] = el; }}
                  className="relative"
                >
                  <div className="sticker-card p-6 sm:p-8 text-center h-full">
                    {/* Step Number */}
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                      <span className="sticker-label bg-pink text-white border-pink font-mono text-sm">
                        STEP 0{step.step}
                      </span>
                    </div>

                    {/* Icon */}
                    <div className="w-16 h-16 sm:w-20 sm:h-20 bg-violet/10 rounded-2xl flex items-center justify-center mx-auto mt-4 mb-6">
                      <Icon className="w-8 h-8 sm:w-10 sm:h-10 text-violet" />
                    </div>

                    {/* Content */}
                    <h3 className="font-display font-bold text-xl text-dark mb-3">
                      {step.title}
                    </h3>
                    <p className="text-gray leading-relaxed">
                      {step.description}
                    </p>
                  </div>

                  {/* Arrow (Mobile) */}
                  {index < howItWorks.length - 1 && (
                    <div className="flex justify-center my-4 lg:hidden">
                      <ArrowRight className="w-6 h-6 text-pink rotate-90" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="text-center mt-12"
        >
          <a href="#tools" className="sticker-button inline-flex">
            <span>Try It Now</span>
            <ArrowRight className="w-4 h-4 ml-2" />
          </a>
        </motion.div>
      </div>
    </section>
  );
}
