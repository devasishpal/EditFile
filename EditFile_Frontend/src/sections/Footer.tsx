import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Twitter, Github, Linkedin, Mail } from 'lucide-react';

const footerLinks = {
  product: [
    { name: 'All Tools', href: '/#tools' },
    { name: 'PDF Tools', href: '/pdf-tools' },
    { name: 'Image Tools', href: '/image-tools' },
    { name: 'API Access', href: '#' },
  ],
  company: [
    { name: 'About Us', href: '/about' },
    { name: 'Blog', href: '/blog' },
    { name: 'Careers', href: '/careers' },
    { name: 'Contact', href: '/contact' },
  ],
  legal: [
    { name: 'Privacy Policy', href: '/privacy-policy' },
    { name: 'Terms of Service', href: '/terms-of-service' },
    { name: 'Cookie Policy', href: '/cookie-policy' },
    { name: 'GDPR', href: '/gdpr' },
  ],
};

const socialLinks = [
  { name: 'Twitter', icon: Twitter, href: '#' },
  { name: 'GitHub', icon: Github, href: 'https://github.com/devasishpal' },
  { name: 'LinkedIn', icon: Linkedin, href: '#' },
  { name: 'Email', icon: Mail, href: 'mailto:support@typely.in' },
];

interface FooterProps {
  disableMotion?: boolean;
}

export default function Footer({ disableMotion = false }: FooterProps) {
  const bottomBarClassName =
    'mt-12 pt-8 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-4';

  return (
    <footer className="relative w-full max-w-full bg-white z-[80] border-t-[3px] border-black overflow-x-clip">
      <div className="w-full px-4 sm:px-6 lg:px-12 py-12 lg:py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-10 lg:gap-8">
          {/* Brand */}
          <div className="sm:col-span-2 lg:col-span-2">
            <a href="/" className="flex items-center gap-2 group mb-4">
              <div className="w-10 h-10 bg-white rounded-xl border-[3px] border-black flex items-center justify-center transition-transform duration-200 group-hover:scale-105 shadow-sticker">
                <img
                  src="/favicon/favicon-32x32.png?v=20260305"
                  alt="EditFile logo"
                  className="w-6 h-6 object-contain"
                />
              </div>
              <span className="font-display font-bold text-xl text-dark tracking-tight">
                EditFile
              </span>
            </a>
            <p className="text-gray leading-relaxed max-w-sm mb-6">
              Edit files like you're arranging stickers. Fast, free, and secure PDF & image tools for everyone.
            </p>
            {/* Social Links */}
            <div className="flex items-center gap-3">
              {socialLinks.map((social) => {
                const Icon = social.icon;
                return (
                  <a
                    key={social.name}
                    href={social.href}
                    className="w-10 h-10 bg-white rounded-xl border-[2px] border-black flex items-center justify-center hover:bg-violet hover:border-violet group transition-colors shadow-sticker"
                    aria-label={social.name}
                  >
                    <Icon className="w-4 h-4 text-dark group-hover:text-white transition-colors" />
                  </a>
                );
              })}
            </div>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-display font-bold text-dark mb-4">Product</h4>
            <ul className="space-y-3">
              {footerLinks.product.map((link) => (
                <li key={link.name}>
                  <a
                    href={link.href}
                    className="text-gray hover:text-violet transition-colors"
                  >
                    {link.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-display font-bold text-dark mb-4">Company</h4>
            <ul className="space-y-3">
              {footerLinks.company.map((link) => (
                <li key={link.name}>
                  <Link
                    to={link.href}
                    className="text-gray hover:text-violet transition-colors"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-display font-bold text-dark mb-4">Legal</h4>
            <ul className="space-y-3">
              {footerLinks.legal.map((link) => (
                <li key={link.name}>
                  <Link
                    to={link.href}
                    className="text-gray hover:text-violet transition-colors"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        {disableMotion ? (
          <div className={bottomBarClassName}>
            <p className="text-gray text-sm text-center sm:text-left">
              (c) 2026 EditFile. All rights reserved.
            </p>
            <div className="flex items-center gap-4">
              <span className="sticker-label text-[10px] bg-violet text-white border-violet">
                Made with love worldwide
              </span>
            </div>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className={bottomBarClassName}
          >
            <p className="text-gray text-sm text-center sm:text-left">
              (c) 2026 EditFile. All rights reserved.
            </p>
            <div className="flex items-center gap-4">
              <span className="sticker-label text-[10px] bg-violet text-white border-violet">
                Made with love worldwide
              </span>
            </div>
          </motion.div>
        )}
      </div>
    </footer>
  );
}

