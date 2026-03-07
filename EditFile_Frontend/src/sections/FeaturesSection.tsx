import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Zap, Shield, Gift, Cloud } from 'lucide-react';
import { features } from '@/lib/data';

gsap.registerPlugin(ScrollTrigger);

const iconMap: Record<string, React.ElementType> = {
  Zap, Shield, Gift, Cloud
};

export default function FeaturesSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const cardsRef = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const section = sectionRef.current;
    const cards = cardsRef.current.filter(Boolean);

    if (!section || cards.length === 0) return;

    const ctx = gsap.context(() => {
      gsap.set(cards, {
        force3D: true,
        willChange: 'transform, opacity',
      });

      cards.forEach((card, i) => {
        gsap.fromTo(
          card,
          { y: 60, opacity: 0, rotate: i % 2 === 0 ? -3 : 3 },
          {
            y: 0,
            opacity: 1,
            rotate: i % 2 === 0 ? -1 : 1,
            duration: 0.8,
            ease: 'power2.out',
            scrollTrigger: {
              trigger: card,
              start: 'top 85%',
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
      id="features"
      className="relative bg-violet py-20 lg:py-32 z-30"
    >
      <div className="w-full px-6 lg:px-12">
        {/* Header */}
        <div className="text-center mb-12 lg:mb-16">
          <h2 className="font-display font-bold text-4xl lg:text-5xl text-white uppercase tracking-tight">
            Why Choose <span className="text-pink">Us</span>
          </h2>
          <p className="text-white/70 text-lg mt-4 max-w-2xl mx-auto">
            The fastest, most secure way to edit your files. No signup required.
          </p>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, index) => {
            const Icon = iconMap[feature.icon] || Zap;
            return (
              <div
                key={feature.id}
                ref={(el) => { cardsRef.current[index] = el; }}
                className="sticker-card p-6 lg:p-8"
                style={{ transform: `rotate(${index % 2 === 0 ? -1 : 1}deg)` }}
              >
                <div className="w-14 h-14 bg-violet rounded-xl border-[3px] border-black flex items-center justify-center mb-5 shadow-sticker">
                  <Icon className="w-7 h-7 text-white" />
                </div>
                <h3 className="font-display font-bold text-xl text-dark mb-3">
                  {feature.title}
                </h3>
                <p className="text-gray leading-relaxed">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>

        {/* Stats Row */}
        <div className="mt-16 grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { value: '10M+', label: 'Files Processed' },
            { value: '25+', label: 'Powerful Tools' },
            { value: '99.9%', label: 'Uptime' },
            { value: '0', label: 'Files Stored' },
          ].map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="accent-block p-6 text-center"
            >
              <p className="font-display font-bold text-3xl lg:text-4xl text-white">
                {stat.value}
              </p>
              <p className="text-white/80 text-sm mt-1">{stat.label}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
