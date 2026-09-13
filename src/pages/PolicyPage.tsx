import { useState, useEffect } from 'react';
import { Truck, RefreshCcw, ShieldCheck, FileText, ChevronDown, MapPin, Phone, Clock, MessageSquare } from 'lucide-react';
import { useNavigation } from '../lib/navigation';
import { setSEO, setJsonLd, SITE_NAME, SITE_URL } from '../lib/seo';

/* ────────────────────────────────────────────────────────────
   POLICY DATA — edit copy here; layout & tabs pick it up
   ──────────────────────────────────────────────────────────── */

type PolicySection = { heading: string; paragraphs?: string[]; bullets?: string[] };
type Policy = { id: string; label: string; icon: React.ComponentType<{ className?: string }>; intro: string; sections: PolicySection[]; updated?: string };

const CONTACT_LINE = 'Phone / WhatsApp: +880 1305-827996 · Sat–Thu, 10:00 AM – 9:00 PM';

const POLICIES: Policy[] = [
  {
    id: 'shipping',
    label: 'Shipping & Delivery',
    icon: Truck,
    intro: 'We deliver to every corner of Bangladesh through trusted courier partners. Every order is packed by hand, checked twice, and dispatched with a tracking number.',
    updated: 'September 2026',
    sections: [
      {
        heading: 'Delivery Timelines',
        bullets: [
          'Inside Dhaka: 1–2 business days after order confirmation.',
          'Outside Dhaka: 3–5 business days, depending on your area.',
          'Orders are confirmed by phone call before dispatch — please keep your phone reachable.',
          'Fridays and public holidays are non-dispatch days.',
        ],
      },
      {
        heading: 'Delivery Charges',
        bullets: [
          'Delivery fee: ৳150 nationwide (paid in advance via bKash during checkout).',
          'Free delivery on orders over ৳1000 — we cover the courier cost ourselves.',
          'Cash on Delivery (COD) is available for select areas; our team will confirm on the confirmation call.',
        ],
      },
      {
        heading: 'Tracking Your Order',
        paragraphs: [
          'Once your parcel is dispatched, we share the courier tracking number over phone or WhatsApp. You can follow the parcel door-to-door until it reaches you.',
        ],
      },
      {
        heading: 'Delays — The Honest Version',
        paragraphs: [
          'We ship fast, but couriers have their moments. Weather, strikes, and remote-area routes can add a day or two. If your parcel is ever late, call us — we chase it down for you instead of giving you excuses.',
        ],
      },
    ],
  },
  {
    id: 'returns',
    label: 'Returns & Exchange',
    icon: RefreshCcw,
    intro: 'Got the wrong size, or something is defective? We make it right. Read the rules below, then call us — we handle the rest.',
    updated: 'September 2026',
    sections: [
      {
        heading: '7-Day Exchange Window',
        bullets: [
          'Exchanges are accepted within 7 days of receiving your order.',
          'Valid reasons: wrong size delivered, sizing issue on our chart, or a manufacturing defect.',
          'The product must be unworn, unwashed, and in original condition with tags attached.',
          'Include the original invoice or your order confirmation (phone number works).',
        ],
      },
      {
        heading: 'How to Start an Exchange',
        bullets: [
          `Step 1 — Call or WhatsApp us at +880 1305-827996 within 7 days of delivery.`,
          'Step 2 — Tell us your order details and the issue; send a photo if it is a defect.',
          'Step 3 — We confirm the exchange and arrange the pickup/swap through courier.',
          'Step 4 — Your replacement ships as soon as the returned item reaches us and passes a quick check.',
        ],
      },
      {
        heading: 'What We Cannot Accept',
        bullets: [
          'Items that are worn, washed, altered, or missing tags.',
          'Products damaged by misuse after delivery.',
          'Requests made after the 7-day window.',
        ],
      },
      {
        heading: 'Refunds',
        paragraphs: [
          'ORNIX works on an exchange-first policy — we will always try to swap you into the right size or product first. If the exact item is unavailable, we issue a full refund of the product price to your bKash within 3–5 business days. Advance delivery fees are refunded only when the issue is on us (defect or wrong item).',
        ],
      },
    ],
  },
  {
    id: 'privacy',
    label: 'Privacy Policy',
    icon: ShieldCheck,
    intro: 'We ask for the minimum information needed to deliver your order — and we treat it with the same care we put into our fabrics.',
    updated: 'September 2026',
    sections: [
      {
        heading: 'What We Collect',
        bullets: [
          'Your name, phone number, and delivery address — for order confirmation and delivery.',
          'Your bKash number and transaction ID — to verify your advance payment.',
          'Basic device/browser data — to keep the site fast and working properly.',
        ],
      },
      {
        heading: 'What We Never Do',
        bullets: [
          'We never sell, rent, or trade your personal information. Full stop.',
          'We never spam you with promotional calls or messages.',
          'We never keep payment PINs or passwords — we only verify the transaction ID you submit.',
        ],
      },
      {
        heading: 'Who Sees Your Data',
        paragraphs: [
          'Only two parties: our small team (to confirm and pack your order) and our courier partner (to deliver it — they receive your name, address, and phone number, nothing more). Everything is stored securely on Supabase infrastructure with industry-standard encryption.',
        ],
      },
      {
        heading: 'Your Control',
        paragraphs: [
          `Want your data deleted or corrected? Call us at +880 1305-827996 and it's done — no forms, no runaround.`,
        ],
      },
    ],
  },
  {
    id: 'terms',
    label: 'Terms & Conditions',
    icon: FileText,
    intro: 'The plain-language rules of shopping with ORNIX. No hidden clauses, no lawyer-speak traps.',
    updated: 'September 2026',
    sections: [
      {
        heading: 'Orders & Confirmation',
        bullets: [
          'An order is final after our team confirms it by phone and your advance delivery fee is received via bKash.',
          'If we cannot reach you within 3 days of ordering, the order may be cancelled and the slot released.',
          'Prices and stock are subject to change without notice — but never after your order is confirmed.',
        ],
      },
      {
        heading: 'Payments',
        bullets: [
          'Advance delivery fee (৳150) is paid via bKash and verified by transaction ID.',
          'The remaining amount is paid on delivery (or per your confirmation call arrangement).',
          'Only send payments to the bKash number shown during checkout — never to a number shared by anyone else.',
        ],
      },
      {
        heading: 'Product Presentation',
        paragraphs: [
          'We photograph and film every product honestly, but screens vary — a few shades of difference between your display and the fabric is normal and not grounds for exchange. Sizing follows our size chart on each product page; when in doubt, ask us before ordering and we will help you pick.',
        ],
      },
      {
        heading: 'Our Right',
        paragraphs: [
          'We may refuse or cancel orders that appear fraudulent or abusive of our exchange policy. All content on this site — photos, videos, copy, design — belongs to ORNIX and may not be reused commercially without permission.',
        ],
      },
    ],
  },
];

/* ────────────────────────────────────────────────────────────
   PAGE
   ──────────────────────────────────────────────────────────── */

export default function PolicyPage() {
  const onNavigate = useNavigation();
  const [active, setActive] = useState<string>(POLICIES[0].id);
  const [openMobile, setOpenMobile] = useState<string | null>(POLICIES[0].id);

  const current = POLICIES.find((p) => p.id === active) ?? POLICIES[0];

  useEffect(() => {
    setSEO({
      title: `Policies — ${SITE_NAME}`,
      description: 'Shipping & delivery, returns & exchange, privacy, and terms — everything you need to know before ordering from ORNIX, in plain language.',
      url: '/policies',
    });
    setJsonLd({
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: `Policies — ${SITE_NAME}`,
      url: `${SITE_URL}/policies`,
    });
  }, []);

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <section className="relative overflow-hidden bg-black text-white">
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-sale/20 rounded-full blur-3xl" />
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-14 md:py-20 text-center">
          <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold uppercase tracking-tight mb-4">
            Policies, <span className="text-sale-light">no fine print.</span>
          </h1>
          <p className="text-white/60 text-sm md:text-base max-w-xl mx-auto">
            Everything you need to know before you order — written the way we'd want to read it. Plain, honest, complete.
          </p>
        </div>
      </section>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 md:py-14">
        {/* ── Desktop tabs ── */}
        <div className="hidden md:flex justify-center gap-2 mb-10">
          {POLICIES.map((p) => (
            <button
              key={p.id}
              onClick={() => setActive(p.id)}
              className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-bold transition-all ${
                active === p.id
                  ? 'bg-stone-900 text-white shadow-md'
                  : 'bg-white text-stone-600 border border-stone-200 hover:border-stone-400'
              }`}
            >
              <p.icon className="w-4 h-4" /> {p.label}
            </button>
          ))}
        </div>

        {/* ── Mobile accordion ── */}
        <div className="md:hidden space-y-3 mb-8">
          {POLICIES.map((p) => (
            <div key={p.id} className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
              <button
                onClick={() => setOpenMobile(openMobile === p.id ? null : p.id)}
                className="w-full flex items-center justify-between px-5 py-4 text-left"
              >
                <span className="flex items-center gap-2.5 font-bold text-stone-900 text-sm">
                  <p.icon className="w-4 h-4 text-sale" /> {p.label}
                </span>
                <ChevronDown className={`w-4 h-4 text-stone-400 transition-transform ${openMobile === p.id ? 'rotate-180' : ''}`} />
              </button>
              {openMobile === p.id && (
                <div className="px-5 pb-5">
                  <PolicyBody policy={p} />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── Desktop content ── */}
        <div className="hidden md:block bg-white rounded-3xl shadow-sm border border-stone-100 p-8 lg:p-10">
          <PolicyBody policy={current} />
        </div>

        {/* Still need help? */}
        <div className="mt-10 bg-white rounded-3xl shadow-sm border border-stone-100 p-6 md:p-8 flex flex-col sm:flex-row items-center gap-5 justify-between">
          <div className="text-center sm:text-left">
            <h3 className="font-display text-lg font-bold text-stone-900 mb-1">Still have a question?</h3>
            <p className="text-stone-500 text-sm">Our team answers fast — usually within minutes during shop hours.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <a
              href="tel:+8801305827996"
              className="flex items-center justify-center gap-2 bg-stone-900 hover:bg-stone-800 text-white font-bold px-6 py-3.5 rounded-2xl text-sm transition-all"
            >
              <Phone className="w-4 h-4" /> Call Us
            </a>
            <button
              onClick={() => onNavigate('feedback')}
              className="flex items-center justify-center gap-2 border-2 border-stone-200 hover:border-stone-400 text-stone-700 font-bold px-6 py-3.5 rounded-2xl text-sm transition-all"
            >
              <MessageSquare className="w-4 h-4" /> Send Feedback
            </button>
          </div>
        </div>

        {/* Contact strip */}
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div className="flex items-start gap-3 bg-white rounded-2xl border border-stone-100 p-4">
            <Phone className="w-4 h-4 text-sale flex-shrink-0 mt-0.5" />
            <p className="text-stone-600">+880 1305-827996<br /><span className="text-xs text-stone-400">Call or WhatsApp</span></p>
          </div>
          <div className="flex items-start gap-3 bg-white rounded-2xl border border-stone-100 p-4">
            <Clock className="w-4 h-4 text-sale flex-shrink-0 mt-0.5" />
            <p className="text-stone-600">Sat–Thu: 10 AM – 9 PM<br /><span className="text-xs text-stone-400">Friday: Closed</span></p>
          </div>
          <div className="flex items-start gap-3 bg-white rounded-2xl border border-stone-100 p-4">
            <MapPin className="w-4 h-4 text-sale flex-shrink-0 mt-0.5" />
            <p className="text-stone-600">Baniachong, Habiganj, Sylhet<br /><span className="text-xs text-stone-400">Delivering nationwide</span></p>
          </div>
        </div>
      </div>
    </div>
  );
}

function PolicyBody({ policy }: { policy: Policy }) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-11 h-11 bg-red-100 rounded-2xl flex items-center justify-center">
          <policy.icon className="w-5.5 h-5.5 text-sale" />
        </div>
        <div>
          <h2 className="font-display text-xl md:text-2xl font-bold text-stone-900">{policy.label}</h2>
          {policy.updated && <p className="text-xs text-stone-400">Last updated: {policy.updated}</p>}
        </div>
      </div>
      <p className="text-stone-600 text-sm md:text-base leading-relaxed mb-7 border-l-2 border-red-200 pl-4 italic">
        {policy.intro}
      </p>

      <div className="space-y-7">
        {policy.sections.map((section) => (
          <div key={section.heading}>
            <h3 className="font-bold text-stone-900 text-sm md:text-base mb-3">{section.heading}</h3>
            {section.paragraphs?.map((para, i) => (
              <p key={i} className="text-stone-600 text-sm leading-relaxed mb-2">{para}</p>
            ))}
            {section.bullets && (
              <ul className="space-y-2">
                {section.bullets.map((b, i) => (
                  <li key={i} className="flex gap-2.5 text-sm text-stone-600 leading-relaxed">
                    <span className="text-sale font-bold mt-0.5">•</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      <p className="mt-8 pt-5 border-t border-stone-100 text-xs text-stone-400">{CONTACT_LINE}</p>
    </div>
  );
}
