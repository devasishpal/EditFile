import { useRef } from 'react';
import { motion } from 'framer-motion';
import { Star, Quote } from 'lucide-react';
import { testimonials } from '@/lib/data';

export default function TestimonialsSection() {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <section className="relative bg-violet py-20 lg:py-32 z-50 overflow-hidden">
      <div className="w-full px-6 lg:px-12">
        {/* Header */}
        <div className="text-center mb-12 lg:mb-16">
          <h2 className="font-display font-bold text-4xl lg:text-5xl text-white uppercase tracking-tight">
            Loved by <span className="text-pink">Thousands</span>
          </h2>
          <p className="text-white/70 text-lg mt-4 max-w-2xl mx-auto">
            See what our users say about EditFile.
          </p>
        </div>

        {/* Testimonials Grid */}
        <div
          ref={scrollRef}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto"
        >
          {testimonials.map((testimonial, index) => (
            <motion.div
              key={testimonial.id}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              className="sticker-card p-6 relative"
              style={{ transform: `rotate(${index % 2 === 0 ? -1 : 1}deg)` }}
            >
              {/* Quote Icon */}
              <div className="absolute -top-3 -left-2 w-8 h-8 bg-pink rounded-full border-[2px] border-black flex items-center justify-center">
                <Quote className="w-4 h-4 text-white" />
              </div>

              {/* Rating */}
              <div className="flex items-center gap-1 mb-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={`w-4 h-4 ${
                      i < testimonial.rating
                        ? 'text-pink fill-pink'
                        : 'text-gray-300'
                    }`}
                  />
                ))}
              </div>

              {/* Content */}
              <p className="text-dark leading-relaxed mb-6">
                "{testimonial.content}"
              </p>

              {/* Author */}
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-violet rounded-full border-[2px] border-black flex items-center justify-center">
                  <span className="font-display font-bold text-white text-sm">
                    {testimonial.avatar}
                  </span>
                </div>
                <div>
                  <p className="font-display font-bold text-dark text-sm">
                    {testimonial.name}
                  </p>
                  <p className="text-gray text-xs">
                    {testimonial.role}, {testimonial.company}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Trust Badges */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="flex flex-wrap items-center justify-center gap-4 mt-12"
        >
          {['No signup required', 'Free forever', 'No watermarks', 'Bank-level security'].map(
            (badge) => (
              <span key={badge} className="sticker-label text-xs">
                <Star className="w-3 h-3 mr-1 text-pink" />
                {badge}
              </span>
            )
          )}
        </motion.div>
      </div>
    </section>
  );
}
