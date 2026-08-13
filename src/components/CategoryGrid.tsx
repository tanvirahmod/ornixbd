import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Category } from '../lib/supabase';
import { slugify, COVER_FALLBACK } from '../lib/utils';

interface CategoryGridProps {
  categories: Category[];
}

export default function CategoryGrid({ categories }: CategoryGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
      {categories.map((cat) => (
        <div key={cat.id} className="group">
          <Link
            to={`/collections/${slugify(cat.name)}`}
            className="block"
          >
            <div className="relative aspect-[3/4] bg-street-beige rounded-3xl overflow-hidden shadow-sm">
              <img
                src={cat.background_image || COVER_FALLBACK}
                alt={cat.name}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                loading="lazy"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = COVER_FALLBACK;
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-6">
                <span
                  className="block font-display font-bold text-white text-3xl uppercase tracking-wider"
                  style={{
                    textShadow: '0 2px 4px rgba(0,0,0,0.8)',
                  }}
                >
                  {cat.name.toUpperCase()}
                </span>
              </div>
            </div>
          </Link>
          <div className="flex items-center gap-2 mt-4 group-hover:text-sale transition-colors">
            <span className="font-bold text-stone-900 text-sm uppercase tracking-wider">
              {cat.name}
            </span>
            <ChevronRight className="w-4 h-4 text-stone-400 group-hover:text-sale transition-colors" />
          </div>
        </div>
      ))}
    </div>
  );
}
