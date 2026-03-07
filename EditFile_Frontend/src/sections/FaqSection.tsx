import { useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { HelpCircle } from 'lucide-react';
import { faqs } from '@/lib/data';

export default function FaqSection() {
  const sectionRef = useRef<HTMLElement>(null);

  return (
    <section
      ref={sectionRef}
      id="faq"
      className="relative bg-violet py-16 sm:py-20 lg:py-32 z-[60]"
    >
      <div className="w-full px-4 sm:px-6 lg:px-12">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <h2 className="font-display font-bold text-3xl sm:text-4xl lg:text-5xl text-white uppercase tracking-tight">
              Frequently <span className="text-pink">Asked</span>
            </h2>
            <p className="text-white/70 text-base sm:text-lg mt-4">
              Got questions? We've got answers.
            </p>
          </div>

          {/* FAQ Accordion */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <Accordion type="single" collapsible className="space-y-4">
              {faqs.map((faq, index) => (
                <AccordionItem
                  key={faq.id}
                  value={faq.id}
                  className="sticker-card border-[3px] border-black overflow-hidden data-[state=open]:shadow-sticker-lg"
                  style={{ transform: `rotate(${index % 2 === 0 ? -0.5 : 0.5}deg)` }}
                >
                  <AccordionTrigger className="px-4 sm:px-6 py-4 sm:py-5 hover:no-underline group">
                    <div className="flex items-center gap-3 text-left">
                      <div className="w-8 h-8 bg-violet/10 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-violet/20 transition-colors">
                        <HelpCircle className="w-4 h-4 text-violet" />
                      </div>
                      <span className="font-display font-bold text-dark text-sm sm:text-base lg:text-lg">
                        {faq.question}
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 sm:px-6 pb-5">
                    <p className="text-gray leading-relaxed pl-0 sm:pl-11">
                      {faq.answer}
                    </p>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </motion.div>

          {/* Contact CTA */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-12 text-center"
          >
            <p className="text-white/70 mb-4">
              Still have questions?
            </p>
            <a
              href="mailto:support@editfile.io"
              className="sticker-button-secondary inline-flex"
            >
              Contact Support
            </a>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
