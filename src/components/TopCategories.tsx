import { useCategories } from '../lib/siteConfig';
import { slugify } from '../lib/utils';
import { useNavigation } from '../lib/navigation';

interface TopCategoriesProps {
  onNavigate: (page: string, param?: string) => void;
}

const FALLBACK_IMAGE =
  'https://images.pexels.com/photos/5632398/pexels-photo-5632398.jpeg?auto=compress&cs=tinysrgb&w=800';

export default function TopCategories({ onNavigate }: TopCategoriesProps) {
  const { categories, loading } = useCategories();

  // Show skeleton cards while loading
  const skeletonCount = 6;

  return (
    <section className="bg-white py-14 md:py-20 px-4 sm:px-6">
      <div className="max-w-7xl mx-auto">
        {/* Section header */}
        <div className="flex items-end justify-between mb-8 md:mb-10">
          <div>
            <p className="text-xs font-bold tracking-[0.3em] uppercase text-[#D90429] mb-2">
              Browse by category
            </p>
            <h2 className="font-display text-4xl sm:text-5xl md:text-6xl text-black uppercase tracking-wide leading-none">
              TOP CATEGORIES
            </h2>
          </div>
          <button
            onClick={() => onNavigate('shop')}
            className="hidden sm:inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.15em] text-black hover:text-[#D90429] transition-colors border-b-2 border-black hover:border-[#D90429] pb-0.5"
          >
            VIEW ALL
          </button>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-3 gap-3 md:gap-4">
          {loading
            ? Array.from({ length: skeletonCount }).map((_, i) => (
                <div
                  key={i}
                  className="bg-stone-100 animate-pulse"
                  style={{ aspectRatio: '3/4' }}
                />
              ))
            : categories.map((cat) => (
                <CategoryCard
                  key={cat.id}
                  label={cat.name}
                  image={cat.background_image ?? FALLBACK_IMAGE}
                  slug={slugify(cat.name)}
                  onNavigate={onNavigate}
                />
              ))}
        </div>

        {/* Mobile view all */}
        <div className="sm:hidden mt-6 text-center">
          <button
            onClick={() => onNavigate('shop')}
            className="btn-black px-10 py-4"
          >
            VIEW ALL CATEGORIES
          </button>
        </div>
      </div>
    </section>
  );
}

function CategoryCard({
  label,
  image,
  slug,
  onNavigate,
}: {
  label: string;
  image: string;
  slug: string;
  onNavigate: (page: string, param?: string) => void;
}) {
  return (
    <button
      onClick={() => onNavigate('collections', slug)}
      className="group relative overflow-hidden bg-street-beige"
      style={{ aspectRatio: '3/4' }}
    >
      {/* Image */}
      <img
        src={image}
        alt={label}
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        loading="lazy"
        onError={(e) => {
          (e.target as HTMLImageElement).src = FALLBACK_IMAGE;
        }}
      />

      {/* Gradient at bottom */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />

      {/* Red hover overlay */}
      <div className="absolute inset-0 bg-[#D90429]/0 group-hover:bg-[#D90429]/20 transition-all duration-300" />

      {/* Label */}
      <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4">
        <span
          className="block font-display text-white uppercase leading-tight"
          style={{
            fontSize: 'clamp(1.5rem, 5vw, 2.7rem)',
            WebkitTextStroke: '1px #000000',
            paintOrder: 'stroke fill',
            textShadow: '0 1px 6px rgba(0,0,0,0.6)',
            letterSpacing: '0.04em',
          }}
        >
          {label}
        </span>
      </div>
    </button>
  );
}
