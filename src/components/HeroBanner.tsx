import { ArrowDown, ArrowRight, Sparkles } from 'lucide-react';
import { useSiteSettings, getHeroBgImage } from '../lib/siteConfig';

interface HeroBannerProps {
  onNavigate: (page: string) => void;
}

const HERO_KEYS = ['hero_background_image', 'hero_background_image_mobile'];
const HERO_FALLBACK =
  'https://images.pexels.com/photos/5632398/pexels-photo-5632398.jpeg?auto=compress&cs=tinysrgb&w=1200';

export default function HeroBanner({ onNavigate }: HeroBannerProps) {
  const { values } = useSiteSettings(HERO_KEYS);
  const desktopBg = getHeroBgImage(values['hero_background_image'] ?? null) || HERO_FALLBACK;
  const mobileBg = values['hero_background_image_mobile'] || desktopBg;

  return (
    <section className="editorial-hero">
      <div className="editorial-hero__inner">
        <div className="editorial-hero__copy">
          <p className="editorial-hero__eyebrow">
            <span className="editorial-hero__eyebrow-line" />
            ORNIX / THE NEW EDIT
          </p>

          <h1>
            Style that
            <br />
            <span>moves</span> with you.
          </h1>

          <p className="editorial-hero__description">
            Everyday essentials, reimagined with a little more intention.
            Designed in Bangladesh. Made for wherever life takes you.
          </p>

          <button
            onClick={() => onNavigate('shop')}
            className="editorial-hero__cta"
          >
            Explore the collection
            <ArrowRight aria-hidden="true" size={17} />
          </button>

          <div className="editorial-hero__season">
            <span>01 — 26</span>
            <span className="editorial-hero__season-rule" />
            <span>NEW SEASON / NEW PERSPECTIVE</span>
          </div>
        </div>

        <div className="editorial-hero__visual">
          <div className="editorial-hero__image-wrap">
            <picture>
              <source media="(max-width: 767px)" srcSet={mobileBg} />
              <img src={desktopBg} alt="Discover the latest ORNIX collection" loading="eager" />
            </picture>
          </div>
          <p className="editorial-hero__vertical" aria-hidden="true">
            NEW COLLECTION
          </p>
          <Sparkles className="editorial-hero__sparkle" aria-hidden="true" />
          <a className="editorial-hero__scroll" href="#new-arrivals" aria-label="Scroll to new arrivals">
            <ArrowDown aria-hidden="true" size={17} />
          </a>
        </div>
      </div>
      <span className="editorial-hero__index" aria-hidden="true">ORNIX® / 2026</span>
    </section>
  );
}
