import { useState } from 'react';
import { Plus, Minus, Instagram, Facebook, MapPin, Phone, Clock } from 'lucide-react';
import { useLanguage } from '../lib/LanguageContext';

interface HelpFooterProps {
  onNavigate: (page: string) => void;
}

const FAQ_ITEMS = [
  {
    icon: '📍',
    question: 'How do I track my order?',
    answer:
      'Once your order is confirmed, our team will contact you via the phone number you provided. You will receive updates on your delivery status directly. Orders are typically delivered within 2–5 business days across Bangladesh.',
  },
  {
    icon: '🔄',
    question: 'What is your return & exchange policy?',
    answer:
      'We accept exchanges within 7 days of delivery for sizing issues or manufacturing defects. The item must be unworn, unwashed, and in original condition with tags attached. Contact us via phone or Facebook to initiate a return.',
  },
  {
    icon: '👥',
    question: 'Who are we?',
    answer:
      'ORNIX is a Bangladeshi streetwear brand dedicated to delivering bold, quality fashion at fair prices. We are a small passionate team building a local brand for the streets. Follow us on Instagram and Facebook for the latest drops.',
  },
  {
    icon: '💳',
    question: 'What payment methods do you accept?',
    answer:
      'We accept bKash payments. After placing your order, send the advance delivery fee (Tk 150) to our bKash Personal number and submit the TrxID. Cash on delivery is available for select areas.',
  },
  {
    icon: '📦',
    question: 'How long does delivery take?',
    answer:
      'Dhaka: 1–2 business days. Outside Dhaka: 3–5 business days. We ship nationwide through trusted courier partners. You will be notified when your package is dispatched.',
  },
];

function AccordionItem({
  icon,
  question,
  answer,
}: {
  icon: string;
  question: string;
  answer: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-black/10">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-4 py-5 text-left group"
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">{icon}</span>
          <span className="font-bold text-sm sm:text-base uppercase tracking-[0.08em] text-black group-hover:text-[#D90429] transition-colors">
            {question}
          </span>
        </div>
        <span className="flex-shrink-0 text-black group-hover:text-[#D90429] transition-colors">
          {open ? <Minus className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
        </span>
      </button>
      <div
        className={`accordion-content ${open ? 'open' : ''}`}
      >
        <p className="pb-5 pl-9 text-sm text-black/60 leading-relaxed font-medium">
          {answer}
        </p>
      </div>
    </div>
  );
}

// Tiktok icon (not in lucide)
function TiktokIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34l-.01-8.84a8.22 8.22 0 0 0 4.8 1.52V4.54a4.85 4.85 0 0 1-1.02-.15z" />
    </svg>
  );
}

export default function HelpFooter({ onNavigate }: HelpFooterProps) {
  const { language, setLanguage, availableLanguages } = useLanguage();

  const toggleLanguage = () => {
    const next = language === 'en' ? 'bn' : 'en';
    setLanguage(next);
  };

  return (
    <>
      {/* ── Help / FAQ Section ── */}
      <section className="bg-street-beige py-14 md:py-20 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-xs font-bold tracking-[0.3em] uppercase text-[#D90429] mb-2">
              Got questions?
            </p>
            <h2 className="font-display text-4xl sm:text-5xl text-black uppercase tracking-wide leading-none">
              HELP CENTER
            </h2>
          </div>

          <div className="bg-white px-6 sm:px-8">
            {FAQ_ITEMS.map((item) => (
              <AccordionItem
                key={item.question}
                icon={item.icon}
                question={item.question}
                answer={item.answer}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-black text-white">
        {/* Main footer grid */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14 md:py-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-10">

          {/* Brand column */}
          <div>
            <h3
              className="font-display text-2xl uppercase tracking-widest text-white mb-4"
              style={{ fontFamily: 'Anton, Impact, Arial Black, sans-serif' }}
            >
              <img
                src="https://ik.imagekit.io/oy2vruqkz/images-photoaidcom-cropped.png"
                alt="ORNIX"
                className="h-14 w-auto object-contain"
              />
            </h3>
            <p className="text-white/50 text-sm leading-relaxed mb-6 font-medium">
              Bold streetwear crafted in Bangladesh. Quality you can feel, style
              you can own. Representing the streets, one drop at a time.
            </p>
            {/* Social icons */}
            <div className="flex items-center gap-4">
              <a
                href="#"
                aria-label="Instagram"
                className="w-9 h-9 border border-white/20 flex items-center justify-center text-white/60 hover:text-white hover:border-white hover:bg-white/10 transition-all duration-200"
              >
                <Instagram className="w-4 h-4" />
              </a>
              <a
                href="#"
                aria-label="Facebook"
                className="w-9 h-9 border border-white/20 flex items-center justify-center text-white/60 hover:text-white hover:border-white hover:bg-white/10 transition-all duration-200"
              >
                <Facebook className="w-4 h-4" />
              </a>
              <a
                href="#"
                aria-label="TikTok"
                className="w-9 h-9 border border-white/20 flex items-center justify-center text-white/60 hover:text-white hover:border-white hover:bg-white/10 transition-all duration-200"
              >
                <TiktokIcon className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Contact Us column */}
          <div>
            <h4 className="font-bold uppercase tracking-[0.2em] text-sm text-white mb-5">
              Contact Us
            </h4>
            <ul className="space-y-4">
              <li className="flex gap-3 text-white/55 text-sm font-medium">
                <MapPin className="w-4 h-4 text-[#D90429] flex-shrink-0 mt-0.5" />
                <span>Baniachong, Habiganj, Sylhet<br />Available for nationwide delivery</span>
              </li>
              <li className="flex gap-3 text-white/55 text-sm font-medium">
                <Phone className="w-4 h-4 text-[#D90429] flex-shrink-0 mt-0.5" />
                <span>+880 1305-827996</span>
              </li>
              <li className="flex gap-3 text-white/55 text-sm font-medium">
                <Clock className="w-4 h-4 text-[#D90429] flex-shrink-0 mt-0.5" />
                <span>Sat – Thu: 10:00 AM – 9:00 PM<br />Friday: Closed</span>
              </li>
            </ul>
          </div>

          {/* Quick links */}
          <div>
            <h4 className="font-bold uppercase tracking-[0.2em] text-sm text-white mb-5">
              Quick Links
            </h4>
            <ul className="space-y-3">
              {[
                { label: 'Home', page: 'home' },
                { label: 'Shop All', page: 'shop' },
                { label: 'New Arrivals', page: 'new-arrivals' },
                { label: 'Hot Deals', page: 'hot-deals' },
                { label: 'Feedback', page: 'feedback' },
              ].map((link) => (
                <li key={link.page + link.label}>
                  <button
                    onClick={() => onNavigate(link.page)}
                    className="text-white/55 text-sm font-medium hover:text-[#D90429] transition-colors uppercase tracking-wide"
                  >
                    {link.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-white/10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-4">
            {/* Currency */}
            <div className="flex items-center gap-2">
              <span className="text-white/40 text-xs font-bold uppercase tracking-wider">Currency:</span>
              <span className="text-white text-xs font-bold bg-white/10 px-3 py-1">
                BDT ৳
              </span>
            </div>

            {/* Language toggle */}
            <button
              onClick={toggleLanguage}
              className="text-white/40 text-xs font-bold uppercase tracking-wider hover:text-white transition-colors"
            >
              {availableLanguages[language]}
            </button>

            {/* Copyright */}
            <p className="text-white/35 text-xs text-center">
               © {new Date().getFullYear()} ORNIX. A Bangladeshi Brand. All rights reserved.
            </p>

            {/* Social links text */}
            <div className="flex items-center gap-4">
              {['Instagram', 'Facebook', 'TikTok'].map((s) => (
                <a
                  key={s}
                  href="#"
                  className="text-white/35 text-xs font-semibold uppercase tracking-wider hover:text-[#D90429] transition-colors"
                >
                  {s}
                </a>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
