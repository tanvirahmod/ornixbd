import { useEffect } from 'react';
import { Laptop, Scissors, HeartHandshake, Eye, Feather, Globe, ArrowRight, Instagram, Music2, Sparkles, Play } from 'lucide-react';
import { useNavigation } from '../lib/navigation';
import { setSEO, setJsonLd, SITE_NAME, SITE_URL } from '../lib/seo';

/* ────────────────────────────────────────────────────────────
   STORY PAGE DATA — edit copy here, layout picks it up
   ──────────────────────────────────────────────────────────── */

const TIMELINE = [
  {
    phase: 'Day 01',
    title: 'The Laptop & The Laptop Room',
    icon: Laptop,
    accent: 'bg-red-100 text-sale',
    body: [
      'One laptop. One small room. One blank screen that asked a terrifying question: are you actually going to do this?',
      'We wanted to change what men in Bangladesh wear — not with imported logos, but with fits designed right here, for here. No factory, no budget, no clue. Just a dream and a "Day 01" we were brave enough to post.',
    ],
  },
  {
    phase: 'The Struggle',
    title: 'Hunting for Fabric Comfort',
    icon: Scissors,
    accent: 'bg-amber-100 text-amber-600',
    body: [
      'Then came the fabric hunt. Rolls that looked premium in photos fell apart in our hands. We rejected roll after roll of average cloth — because "good enough" is how brands die.',
      'We kept hunting until we found it: heavy GSM drops, 100% cotton twill, that soft, dense, drapes-perfectly feel our community now calls makhan comfort. Rejection after rejection, one thing never changed — never give up, man.',
    ],
  },
  {
    phase: 'The Breakthrough',
    title: 'Going Viral & Community First',
    icon: HeartHandshake,
    accent: 'bg-emerald-100 text-emerald-600',
    body: [
      'You found us before the products were even finished. You watched the fails, the slow days, the re-sews — and you stayed. Every drop-shoulder, every boxy stripe, every fit exists because you said it in the comments first.',
      "That's why our slogan is what it is: OUR ORNIX < YOUR OPINION. The brand belongs to us, but the direction belongs to you.",
    ],
  },
];

/* Featured TikTok reels.
 * Paste each reel's full URL from the TikTok share sheet (Share → Copy link).
 * Leave REELS empty [] to show the profile fallback card instead.
 */
const TIKTOK_PROFILE = 'https://www.tiktok.com/@ornix24';

const REELS: { url: string; caption: string }[] = [
  // { url: 'https://www.tiktok.com/@ornix24/video/7301234567890123456', caption: 'Day 06 of building my own clothing brand' },
  // { url: 'https://www.tiktok.com/@ornix24/video/7301234567890123457', caption: 'The fabric hunt that gave us makhan comfort' },
  // { url: 'https://www.tiktok.com/@ornix24/video/7301234567890123458', caption: 'Never give up, man' },
];

const VALUES = [
  {
    icon: Eye,
    title: 'Radical Transparency',
    body: "We film the failures with the same energy as the wins. Bad batches, sold-out mistakes, fabric that didn't make the cut — you see all of it. When you buy ORNIX, you know exactly who made it and what it took.",
  },
  {
    icon: Feather,
    title: 'Makhan Comfort',
    body: 'Premium 100% cotton twill checks, boxy stripe shirts, heavy GSM drops — every fabric is chosen by hand, not by margin. If it does not feel like makhan against your skin, it never carries our label.',
  },
  {
    icon: Globe,
    title: 'Global Grade, Local Pride',
    body: 'International-quality streetwear, stitched by Bangladeshi hands for Bangladeshi streets. The world copies our craft — we are here to wear it first, with our own name on the tag. #StreetwearBangladesh',
  },
];

/* ────────────────────────────────────────────────────────────
   PAGE
   ──────────────────────────────────────────────────────────── */

export default function StoryPage() {
  const onNavigate = useNavigation();

  useEffect(() => {
    setSEO({
      title: `Our Story — ${SITE_NAME}`,
      description: 'From one laptop and a small room in Bangladesh to a streetwear brand the internet rallied behind. This is the ORNIX journey — raw, documented, and still being written.',
      url: '/story',
    });
    setJsonLd({
      '@context': 'https://schema.org',
      '@type': 'AboutPage',
      name: `Our Story — ${SITE_NAME}`,
      url: `${SITE_URL}/story`,
    });
  }, []);

  // Load TikTok's embed script once and (re)render any blockquote embeds
  useEffect(() => {
    if (REELS.length === 0) return;
    const w = window as unknown as {
      tiktokEmbed?: { lib?: { render: (el: HTMLElement) => void } };
    };
    const render = () => {
      document.querySelectorAll<HTMLElement>('.tiktok-embed').forEach((el) => {
        w.tiktokEmbed?.lib?.render(el);
      });
    };
    if (w.tiktokEmbed?.lib) {
      render();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://www.tiktok.com/embed.js';
    script.async = true;
    script.onload = render;
    document.body.appendChild(script);
  }, []);

  return (
    <div className="min-h-screen bg-stone-50">
      {/* ── 1. HERO ── */}
      <section className="relative overflow-hidden bg-black text-white">
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-sale/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -left-24 w-96 h-96 bg-sale/10 rounded-full blur-3xl" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 py-20 md:py-28 text-center">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-[0.3em] uppercase text-sale-light border border-sale/40 rounded-full px-4 py-1.5 mb-8">
            <Sparkles className="w-3.5 h-3.5" /> #StartupChallenge · Building in public
          </span>
          <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-bold uppercase tracking-tight leading-[1.05] mb-6">
            It started with a laptop,
            <br />
            <span className="text-sale-light">a room, and a</span>
            <br />
            massive dream.
          </h1>
          <p className="text-white/60 text-base sm:text-lg leading-relaxed max-w-2xl mx-auto mb-4">
            ORNIX didn't begin in a boardroom. It began on <span className="text-white font-semibold">Day 01</span> — a blank
            screen, a stubborn idea, and one mission: give Bangladeshi men streetwear that finally feels
            <span className="text-white font-semibold"> worth wearing</span>.
          </p>
          <p className="text-white/40 text-sm max-w-xl mx-auto mb-10">
            We documented every step on TikTok — the wins, the fails, the fabric hunts — and thousands of you grew with us.
            This is our story. Honestly, it's yours too.
          </p>
          <p className="font-display text-xl sm:text-2xl tracking-[0.15em] uppercase text-white/90">
            OUR ORNIX <span className="text-sale-light">&lt;</span> YOUR OPINION
          </p>
        </div>
      </section>

      {/* ── 2. TIMELINE ── */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-16 md:py-24">
        <div className="text-center mb-14">
          <p className="text-xs font-bold tracking-[0.3em] uppercase text-sale mb-2">The Reel Narrative</p>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-stone-900 tracking-tight">
            Day 01 vs. Now
          </h2>
        </div>

        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-[27px] top-2 bottom-2 w-px bg-stone-200 hidden sm:block" />

          <div className="space-y-10 sm:space-y-14">
            {TIMELINE.map((item) => (
              <div key={item.phase} className="relative sm:pl-20">
                {/* Icon node */}
                <div className={`hidden sm:flex absolute left-0 top-1 w-14 h-14 rounded-2xl items-center justify-center shadow-sm ${item.accent}`}>
                  <item.icon className="w-7 h-7" />
                </div>
                <div className="bg-white rounded-3xl shadow-sm border border-stone-100 p-6 md:p-8">
                  <span className="inline-block text-[11px] font-bold tracking-[0.25em] uppercase text-sale bg-red-50 border border-red-100 rounded-full px-3 py-1 mb-3">
                    {item.phase}
                  </span>
                  <h3 className="font-display text-xl md:text-2xl font-bold text-stone-900 mb-4">{item.title}</h3>
                  <div className="space-y-3">
                    {item.body.map((para, i) => (
                      <p key={i} className="text-stone-600 leading-relaxed text-sm md:text-base">{para}</p>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 2.5 FEATURED REELS ── */}
      <section className="bg-black text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 md:py-24">
          <div className="text-center mb-12">
            <p className="text-xs font-bold tracking-[0.3em] uppercase text-sale-light mb-2">Straight from the feed</p>
            <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">Watch the Journey</h2>
            <p className="text-white/50 text-sm max-w-lg mx-auto mt-3">
              The real, unfiltered footage — fabric hunts, Day-01 doubts, and every win you made happen.
            </p>
          </div>

          {REELS.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              {REELS.map((reel) => {
                const videoId = reel.url.split('/video/')[1]?.split('?')[0];
                return (
                  <figure key={reel.url} className="flex flex-col items-center">
                    <div className="w-full max-w-[270px] rounded-3xl overflow-hidden border border-white/10 shadow-xl">
                      <blockquote
                        className="tiktok-embed"
                        cite={reel.url}
                        data-video-id={videoId}
                        style={{ maxWidth: '270px', minWidth: '200px' }}
                      >
                        <section>
                          <a href={reel.url} target="_blank" rel="noopener noreferrer">@ornix24</a>
                        </section>
                      </blockquote>
                    </div>
                    <figcaption className="mt-3 text-xs text-white/50 font-medium text-center px-2">{reel.caption}</figcaption>
                  </figure>
                );
              })}
            </div>
          ) : (
            <a
              href={TIKTOK_PROFILE}
              target="_blank"
              rel="noopener noreferrer"
              className="block max-w-md mx-auto group"
            >
              <div className="relative rounded-3xl overflow-hidden border border-white/10 bg-gradient-to-br from-stone-900 to-stone-800 p-8 text-center transition-all group-hover:border-sale/50 group-hover:-translate-y-1">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-sale/10 rounded-full blur-3xl" />
                <div className="relative">
                  <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-sale flex items-center justify-center shadow-lg shadow-sale/40">
                    <Play className="w-8 h-8 text-white fill-white" />
                  </div>
                  <p className="font-display text-xl font-bold tracking-wide mb-2">@ornix24 on TikTok</p>
                  <p className="text-white/50 text-sm mb-5">Documenting the whole journey — every win, every fail, every drop.</p>
                  <span className="inline-flex items-center gap-2 text-sm font-bold text-sale-light group-hover:text-sale-light transition-colors">
                    Follow the build <ArrowRight className="w-4 h-4" />
                  </span>
                </div>
              </div>
            </a>
          )}

          <div className="text-center mt-10">
            <a
              href={TIKTOK_PROFILE}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-bold text-white/60 hover:text-sale-light transition-colors uppercase tracking-wider"
            >
              <Music2 className="w-4 h-4" /> More on @ornix24
            </a>
          </div>
        </div>
      </section>

      {/* ── 3. CORE VALUES ── */}
      <section className="bg-stone-100/60 border-y border-stone-200/60">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 md:py-24">
          <div className="text-center mb-12">
            <p className="text-xs font-bold tracking-[0.3em] uppercase text-sale mb-2">What we refuse to compromise</p>
            <h2 className="font-display text-3xl md:text-4xl font-bold text-stone-900 tracking-tight">
              Built on Three Promises
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {VALUES.map((v) => (
              <div
                key={v.title}
                className="bg-white rounded-3xl shadow-sm border border-stone-100 p-7 hover:shadow-md hover:-translate-y-1 transition-all duration-300"
              >
                <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center mb-5">
                  <v.icon className="w-6 h-6 text-sale" />
                </div>
                <h3 className="font-display text-lg font-bold text-stone-900 mb-3">{v.title}</h3>
                <p className="text-stone-600 text-sm leading-relaxed">{v.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 4. MOTIVATIONAL OUTRO / CTA ── */}
      <section className="relative overflow-hidden bg-stone-900 text-white">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-sale/15 rounded-full blur-3xl" />
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 py-20 md:py-28 text-center">
          <p className="text-xs font-bold tracking-[0.3em] uppercase text-sale-light mb-6">Never give up, man</p>
          <h2 className="font-display text-3xl md:text-5xl font-bold uppercase tracking-tight leading-tight mb-6">
            When you wear ORNIX,
            <br />
            <span className="text-sale-light">you wear the grind.</span>
          </h2>
          <p className="text-white/60 text-base md:text-lg leading-relaxed max-w-xl mx-auto mb-10">
            Every shirt carries the rejections, the re-sews, the 2 AM doubts — and the refusal to settle. You're not just
            buying a fit. You're wearing a story of relentless grit, stitched in Bangladesh.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => onNavigate('new-arrivals')}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-sale hover:bg-sale-light text-white font-bold px-8 py-4 rounded-2xl transition-all hover:shadow-xl hover:shadow-sale/30 hover:-translate-y-0.5"
            >
              View the Latest Collection <ArrowRight className="w-5 h-5" />
            </button>
            <a
              href="https://www.tiktok.com/@ornix24"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto flex items-center justify-center gap-2 border-2 border-white/25 hover:border-white/60 text-white font-bold px-8 py-4 rounded-2xl transition-all"
            >
              <Music2 className="w-5 h-5" /> Watch the Journey
            </a>
          </div>
          <div className="flex items-center justify-center gap-6 mt-10 text-white/40 text-xs font-semibold uppercase tracking-wider">
            <span className="flex items-center gap-1.5"><Music2 className="w-4 h-4" /> TikTok</span>
            <span className="flex items-center gap-1.5"><Instagram className="w-4 h-4" /> Instagram</span>
            <span className="flex items-center gap-1.5">#StreetwearBangladesh</span>
          </div>
        </div>
      </section>
    </div>
  );
}
