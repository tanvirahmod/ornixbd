import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { useCategories } from '../lib/siteConfig';
import { slugify } from '../lib/utils';

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
    <section className="editorial-categories py-16 md:py-28 px-4 sm:px-6" data-watermark="THE EDIT">
      <div className="max-w-7xl mx-auto">
        <div className="editorial-section-heading flex items-end justify-between mb-8 md:mb-12">
          <div className="editorial-section-heading__title">
            <p className="editorial-eyebrow mb-3">
              <span>01</span> / FIND YOUR UNIFORM
            </p>
            <h2 className="font-display text-5xl sm:text-6xl md:text-8xl uppercase leading-[0.88]">
              THE <span>EDIT</span>
            </h2>
            <p className="editorial-section-note mt-4">Pieces for every version of you.</p>
          </div>
          <button
            onClick={() => onNavigate('shop')}
            className="editorial-round-link hidden sm:inline-flex items-center gap-3"
          >
            ALL CATEGORIES <ArrowRight aria-hidden="true" size={16} />
          </button>
        </div>

        <div className="editorial-category-grid">
          {loading
            ? Array.from({ length: skeletonCount }).map((_, i) => (
                <div
                  key={i}
                  className="editorial-category-skeleton animate-pulse"
                />
              ))
            : categories.map((cat, index) => (
                <CategoryCard
                  key={cat.id}
                  label={cat.name}
                  image={cat.background_image ?? FALLBACK_IMAGE}
                  slug={slugify(cat.name)}
                  onNavigate={onNavigate}
                  index={index + 1}
                />
              ))}
        </div>

        {/* Mobile view all */}
        <div className="sm:hidden mt-6 text-center">
          <button
            onClick={() => onNavigate('shop')}
            className="editorial-round-link mx-auto mt-7 inline-flex items-center gap-3"
          >
            VIEW ALL CATEGORIES <ArrowRight aria-hidden="true" size={16} />
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
  index,
}: {
  label: string;
  image: string;
  slug: string;
  onNavigate: (page: string, param?: string) => void;
  index: number;
}) {
  return (
    <button
      onClick={() => onNavigate('collections', slug)}
      className="editorial-category group relative overflow-hidden"
    >
      <img
        src={image}
        alt={label}
        className="editorial-category__image absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
        loading="lazy"
        onError={(e) => {
          (e.target as HTMLImageElement).src = FALLBACK_IMAGE;
        }}
      />
      <span className="editorial-category__shade absolute inset-0" />
      <span className="editorial-category__number absolute top-4 left-4 sm:top-6 sm:left-6">
        0{index}
      </span>
      <span className="editorial-category__label absolute bottom-4 left-4 right-4 sm:bottom-7 sm:left-6 sm:right-6">
        <span>
          {label}
        </span>
        <ArrowUpRight className="editorial-category__arrow" aria-hidden="true" />
      </span>
    </button>
  );
}
