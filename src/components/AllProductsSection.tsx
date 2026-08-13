import { Link } from 'react-router-dom';
import { Category, Product } from '../lib/supabase';
import { slugify } from '../lib/utils';
import { useLanguage } from '../lib/LanguageContext';
import ProductCard from './ProductCard';

interface AllProductsSectionProps {
  products: Product[];
  categories: Category[];
}

export default function AllProductsSection({ products, categories }: AllProductsSectionProps) {
  const { t } = useLanguage();
  const productsByCategory = categories
    .map((cat) => ({
      category: cat,
      products: products.filter((p) => p.category_id === cat.id).slice(0, 6),
    }))
    .filter((group) => group.products.length > 0);

  if (productsByCategory.length === 0) return null;

  return (
    <div className="mb-12">
      <h2 className="font-display text-2xl sm:text-3xl font-bold text-stone-900 uppercase tracking-wider mb-8">
        {t('allProducts')}
      </h2>
      <div className="space-y-10">
        {productsByCategory.map(({ category, products: catProducts }) => (
          <div key={category.id}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-display text-xl font-bold text-stone-900 uppercase tracking-wider">
                {category.name}
              </h3>
              <Link
                to={`/collections/${slugify(category.name)}`}
                className="text-sm font-bold text-stone-600 hover:text-sale uppercase tracking-wider transition-colors flex items-center gap-1"
              >
                {t('seeAll')} {category.name}
                <span className="text-xs">→</span>
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
              {catProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
