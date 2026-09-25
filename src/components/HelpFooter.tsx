import { useState } from 'react';
import { Plus, Minus, Instagram, Facebook, MapPin, Phone, Clock } from 'lucide-react';

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

// WhatsApp icon (not in lucide)
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.297-.497.1-.198.05-.371-.025-.52-.074-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

const SOCIAL_LINKS = [
  { label: 'Instagram', href: 'https://www.instagram.com/ornixclothing/', Icon: Instagram },
  { label: 'Facebook', href: 'https://www.facebook.com/ornixclothing', Icon: Facebook },
  { label: 'TikTok', href: 'https://www.tiktok.com/@ornix24', Icon: TiktokIcon },
  { label: 'WhatsApp', href: 'https://wa.me/8801410423299', Icon: WhatsAppIcon },
];

export default function HelpFooter({ onNavigate }: HelpFooterProps) {
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
              {SOCIAL_LINKS.map(({ label, href, Icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  title={label}
                  className="w-9 h-9 border border-white/20 flex items-center justify-center text-white/60 hover:text-white hover:border-white hover:bg-white/10 hover:-translate-y-0.5 transition-all duration-200"
                >
                  <Icon className="w-4 h-4" />
                </a>
              ))}
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
                { label: 'Our Story', page: 'story' },
                { label: 'Shop All', page: 'shop' },
                { label: 'Shop by Size', page: 'shop-by-size' },
                { label: 'New Arrivals', page: 'new-arrivals' },
                { label: 'Hot Deals', page: 'hot-deals' },
                { label: 'Feedback', page: 'feedback' },
                { label: 'Policies', page: 'policies' },
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
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 flex flex-col md:flex-row items-center justify-between gap-3 md:gap-4">
            {/* Currency */}
            <div className="flex items-center gap-2">
              <span className="text-white/40 text-xs font-bold uppercase tracking-wider">Currency:</span>
              <span className="text-white text-xs font-bold bg-white/10 px-3 py-1">
                BDT ৳
              </span>
            </div>

            {/* Copyright */}
            <p className="text-white/35 text-xs text-center">
               © {new Date().getFullYear()} ORNIX. A Bangladeshi Brand. All rights reserved.
            </p>

            {/* Social links text */}
            <div className="flex items-center gap-4">
              {SOCIAL_LINKS.map(({ label, href }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white/35 text-xs font-semibold uppercase tracking-wider hover:text-[#D90429] transition-colors"
                >
                  {label}
                </a>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
