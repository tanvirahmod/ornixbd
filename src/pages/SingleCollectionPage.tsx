import { useState, useEffect } from 'react';
import { ArrowLeft, ChevronDown, Package } from 'lucide-react';
import { useParams, Link } from 'react-router-dom';
import { supabase, Product } from '../lib/supabase';
import { useLanguage } from '../lib/LanguageContext';
import { slugify } from '../lib/utils';
import ProductCard from '../components/ProductCard';

type SortOption = 'newest' | 'price-low-high' | 'price-high-low';

export default function SingleCollectionPage() {
  const { t } = useLanguage();
  const { slug } = useParams<{ slug: string }>();
  const [categoryName, setCategoryName] = useState<string>('');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [sortOpen, setSortOpen] = useState(false);

  useEffect(() => {
    async function fetchCollection() {
      if (!slug) {
        setLoading(false);
        return;
      }

      const { data: categories, error: catError } = await supabase
        .from('categories')
        .select('*')
        .order('priority', { ascending: true, nullsFirst: false })
        .order('name');

      if (catError || !categories) {
        setLoading(false);
        return;
      }

      const matchedCategory = categories.find(
        (cat) => slugify(cat.name) === slug
      );

      if (!matchedCategory) {
        setLoading(false);
        return;
      }

      setCategoryName(matchedCategory.name);

      const { data, error } = await supabase
        .from('products')
        .select('*, product_images(id, image_url, display_order)')
        .eq('category_id', matchedCategory.id)
        .order('created_at', { ascending: false })
        .limit(48);

      if (!error && data) {
        const sorted = data.map((product) => ({
          ...product,
          product_images: (product.product_images as Product['product_images'])?.sort(
            (a, b) => a.display_order - b.display_order
          ),
        }));
        setProducts(sorted);
      }
      setLoading(false);
    }

    fetchCollection();
  }, [slug]);

  const sortedProducts = [...products].sort((a, b) => {
    if (sortBy === 'price-low-high') {
      return Number(a.price) - Number(b.price);
    }
    if (sortBy === 'price-high-low') {
      return Number(b.price) - Number(a.price);
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const sortLabels: Record<SortOption, string> = {
    newest: t('newestArrivals'),
    'price-low-high': t('priceLowToHigh'),
    'price-high-low': t('priceHighToLow'),
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="animate-spin w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!categoryName) {
    return (
      <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center gap-4">
        <Package className="w-16 h-16 text-stone-300" />
        <p className="text-stone-500">{t('categoryNotFound')}</p>
        <Link
          to="/collections"
          className="text-brand-600 hover:underline font-medium flex items-center gap-1"
        >
          <ArrowLeft className="w-4 h-4" /> {t('backToCollections')}
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 md:py-14">
        <nav className="flex items-center gap-2 text-sm text-stone-500 mb-6">
          <Link to="/" className="hover:text-stone-900 transition-colors">
            {t('homeBreadcrumb') || 'Home'}
          </Link>
          <span className="text-stone-300">/</span>
          <Link to="/collections" className="hover:text-stone-900 transition-colors">
            {t('collections')}
          </Link>
          <span className="text-stone-300">/</span>
          <span className="text-stone-700 font-medium">{categoryName}</span>
        </nav>

        <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold text-stone-900 uppercase tracking-tight mb-8">
          {categoryName}
        </h1>

        <div className="flex items-center justify-between mb-8">
          <div className="relative">
            <button
              onClick={() => setSortOpen(!sortOpen)}
              className="flex items-center gap-2 bg-white border border-stone-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50 transition-colors"
            >
              {sortLabels[sortBy]}
              <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${sortOpen ? 'rotate-180' : ''}`} />
            </button>
            {sortOpen && (
              <div className="absolute top-full left-0 mt-1 w-52 bg-white border border-stone-200 rounded-xl shadow-xl z-50">
                {(['newest', 'price-low-high', 'price-high-low'] as SortOption[]).map((option) => (
                  <button
                    key={option}
                    onClick={() => {
                      setSortBy(option);
                      setSortOpen(false);
                    }}
                    className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-colors ${
                      sortBy === option
                        ? 'bg-brand-50 text-brand-600'
                        : 'text-stone-700 hover:bg-stone-50'
                    }`}
                  >
                    {sortLabels[option]}
                  </button>
                ))}
              </div>
            )}
          </div>

          <span className="text-sm text-stone-500">
            {sortedProducts.length} {sortedProducts.length === 1 ? 'product' : 'products'}
          </span>
        </div>

        {sortedProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Package className="w-16 h-16 text-stone-300 mb-4" />
            <p className="text-stone-500">{t('noProductsInCategory') || 'No products in this category yet.'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {sortedProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
