import { useSiteSettings, getHeroBgImage } from '../lib/siteConfig';

interface HeroBannerProps {
  onNavigate: (page: string) => void;
}

const HERO_KEYS = ['hero_background_image', 'hero_background_image_mobile'];

export default function HeroBanner({ onNavigate }: HeroBannerProps) {
  const { values } = useSiteSettings(HERO_KEYS);

  const desktopBg = getHeroBgImage(values['hero_background_image'] ?? null);
  // Fall back to desktop image if no mobile image is set
  const mobileBg = values['hero_background_image_mobile'] || desktopBg;

  return (
    <section
      className="relative w-full overflow-hidden bg-black"
      style={{ height: 'min(92vh, 820px)' }}
    >
      {/*
        Two stacked <img> elements — swap visibility via Tailwind responsive classes.
        Mobile image: visible by default, hidden on md+
        Desktop image: hidden by default, visible on md+
      */}
      <img
        src={mobileBg}
        alt=""
        className="absolute inset-0 w-full h-full object-cover object-top md:hidden"
        loading="eager"
      />
      <img
        src={desktopBg}
        alt=""
        className="absolute inset-0 w-full h-full object-cover object-top hidden md:block"
        loading="eager"
      />

      {/* Subtle dark overlay */}
      <div className="absolute inset-0 bg-black/30" />

      {/* Giant background outline text */}
      <div
        className="absolute inset-0 flex items-center justify-end overflow-hidden select-none pointer-events-none"
        aria-hidden="true"
      >
        <span className="hero-outline-text pr-6 opacity-20">COLLECTION</span>
      </div>

      {/* Centered Explore button */}
      <div className="absolute inset-0 flex items-center justify-center">
        <button
          onClick={() => onNavigate('shop')}
          className="border-2 border-black bg-[#D90429] text-white text-xs font-bold uppercase tracking-[0.3em] px-8 py-3 hover:bg-black transition-all duration-200"
        >
          EXPLORE
        </button>
      </div>
    </section>
  );
}
