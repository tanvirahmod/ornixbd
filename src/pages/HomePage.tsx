import { useState, useEffect } from 'react';
import { ArrowRight, Package, Search, Sparkles, Truck, ShieldCheck, MessageSquare } from 'lucide-react';
import { supabase, Product, Category } from '../lib/supabase';
import { useLanguage } from '../lib/LanguageContext';

interface HomePageProps {
  onNavigate: (page: string, productId?: string) => void;
}

export default function HomePage({ onNavigate }: HomePageProps) {
  const { t } = useLanguage();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    async function fetchData() {
      const [prodRes, catRes] = await Promise.all([
        supabase
          .from('products')
          .select('*, product_images(id, image_url, display_order), categories(id, name, created_at)')
          .order('created_at', { ascending: false })
          .limit(48),
        supabase.from('categories').select('*').order('name'),
      ]);

      if (prodRes.data) {
        setProducts(
          prodRes.data.map((p) => ({
            ...p,
            product_images: (p.product_images as Product['product_images'])?.sort(
              (a, b) => a.display_order - b.display_order
            ),
          }))
        );
      }
      if (catRes.data) setCategories(catRes.data);
      setLoading(false);
    }
    fetchData();
  }, []);

  const filteredProducts = products.filter((p) => {
    const inCategory = activeCategory === null || p.category_id === activeCategory;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return inCategory;
    return inCategory && (
      p.title.toLowerCase().includes(q) ||
      (p.product_code ?? '').toLowerCase().includes(q) ||
      (p.categories?.name ?? '').toLowerCase().includes(q)
    );
  });

  const getCoverImage = (product: Product) => {
    if (product.product_images && product.product_images.length > 0) {
      return product.product_images[0].image_url;
    }
    return 'https://images.pexels.com/photos/5632398/pexels-photo-5632398.jpeg?auto=compress&cs=tinysrgb&w=800';
  };

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Hero */}
      <section className="relative overflow-hidden bg-stone-900">
        {/* Background gradient mesh */}
        <div className="absolute inset-0">
          <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-brand-600/20 rounded-full blur-[120px]" />
          <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-amber-500/10 rounded-full blur-[100px]" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-20 md:py-32">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/15 rounded-full px-4 py-1.5 text-sm text-white/90 mb-6 animate-fade-in-up">
              <Sparkles className="w-4 h-4 text-brand-400" />
              <span>{t('madeInBangladesh')}</span>
            </div>
            <h1 className="font-display text-4xl sm:text-5xl md:text-7xl font-bold text-white tracking-tight leading-[1.05] mb-6 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
              {t('wearYourStory')}
            </h1>
            <p className="text-lg text-stone-300 max-w-xl mb-8 leading-relaxed animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
              {t('premiumFashion')}
            </p>
            <div className="flex flex-wrap gap-4 animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
              <button
                onClick={() => document.getElementById('products-section')?.scrollIntoView({ behavior: 'smooth' })}
                className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-400 text-white font-semibold px-7 py-3.5 rounded-2xl transition-all duration-200 hover:shadow-lg hover:shadow-brand-500/30 hover:-translate-y-0.5"
              >
                {t('shopCollection')} <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => document.getElementById('products-section')?.scrollIntoView({ behavior: 'smooth' })}
                className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/15 backdrop-blur-sm border border-white/15 text-white font-semibold px-7 py-3.5 rounded-2xl transition-all duration-200"
              >
                {t('explore')}
              </button>
            </div>
          </div>
        </div>

        {/* Trust badges */}
        <div className="relative border-t border-white/10 bg-stone-900/50 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 flex flex-wrap items-center justify-center gap-6 sm:gap-12 text-sm text-stone-400">
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-brand-400" />
              <span>{t('freeDelivery')}</span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-brand-400" />
              <span>{t('qualityGuaranteed')}</span>
            </div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-brand-400" />
              <span>{t('bkashPayment')}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Products section */}
      <section id="products-section" className="max-w-7xl mx-auto px-4 sm:px-6 py-12 md:py-16">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <h2 className="font-display text-2xl md:text-4xl font-bold text-stone-900 tracking-tight">
              {activeCategory === null
                ? t('allProducts')
                : categories.find((c) => c.id === activeCategory)?.name ?? t('shop')}
            </h2>
            <p className="text-stone-500 mt-1.5 text-sm">
              {filteredProducts.length === 1
                ? t('itemsCountOne')
                : t('itemsCountMany', { count: filteredProducts.length })}
            </p>
          </div>
        </div>

        {/* Search bar */}
        <div className="relative mb-5">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-full border border-stone-200 rounded-2xl pl-12 pr-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white shadow-sm transition-all"
          />
        </div>

        {/* Category filter pills */}
        {categories.length > 0 && (
          <div className="flex gap-2 flex-wrap mb-8">
            <button
              onClick={() => setActiveCategory(null)}
              className={`px-4 py-2 rounded-full text-sm font-semibold border transition-all duration-200 ${
                activeCategory === null
                  ? 'bg-stone-900 text-white border-stone-900 shadow-md'
                  : 'bg-white text-stone-600 border-stone-200 hover:border-stone-400 hover:text-stone-900'
              }`}
            >
              {t('all')}
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`px-4 py-2 rounded-full text-sm font-semibold border transition-all duration-200 ${
                  activeCategory === cat.id
                    ? 'bg-brand-500 text-white border-brand-500 shadow-md'
                    : 'bg-white text-stone-600 border-stone-200 hover:border-brand-300 hover:text-brand-700'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        )}

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl overflow-hidden shadow-sm">
                <div className="aspect-[4/5] skeleton" />
                <div className="p-4 space-y-2">
                  <div className="h-4 skeleton rounded w-3/4" />
                  <div className="h-4 skeleton rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Package className="w-16 h-16 text-stone-300 mb-4" />
            <h3 className="text-xl font-semibold text-stone-600 mb-2">{t('noProductsFound')}</h3>
            <p className="text-stone-400">
              {searchQuery
                ? t('noProductsMatchSearch')
                : activeCategory
                ? t('noProductsInCategory')
                : t('checkBackSoon')}
            </p>
            {(activeCategory || searchQuery) && (
              <button
                onClick={() => { setActiveCategory(null); setSearchQuery(''); }}
                className="mt-4 text-brand-600 font-medium hover:underline text-sm"
              >
                {t('viewAllProducts')}
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {filteredProducts.map((product, idx) => (
              <button
                key={product.id}
                onClick={() => onNavigate('product', product.id)}
                className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 text-left group animate-fade-in-up"
                style={{ animationDelay: `${Math.min(idx * 0.04, 0.4)}s` }}
              >
                <div className="aspect-[4/5] overflow-hidden bg-stone-100 relative">
                  <img
                    src={getCoverImage(product)}
                    alt={product.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src =
                        'https://images.pexels.com/photos/5632398/pexels-photo-5632398.jpeg?auto=compress&cs=tinysrgb&w=800';
                    }}
                  />
                  {product.categories && (
                    <span className="absolute top-2.5 left-2.5 bg-white/90 backdrop-blur-sm text-stone-700 text-xs font-semibold px-2.5 py-1 rounded-full shadow-sm">
                      {product.categories.name}
                    </span>
                  )}
                  {product.product_code && (
                    <span className="absolute top-2.5 right-2.5 bg-stone-900/85 backdrop-blur-sm text-white text-[10px] font-mono font-semibold px-2 py-1 rounded-full shadow-sm">
                      {product.product_code}
                    </span>
                  )}
                  {product.discount_price != null && product.discount_price < product.price && (
                    <span className="absolute bottom-2.5 left-2.5 bg-brand-500 text-white text-[10px] font-bold px-2.5 py-1 rounded-full shadow-sm">
                      {Math.round((1 - Number(product.discount_price) / Number(product.price)) * 100)}% OFF
                    </span>
                  )}
                  {product.stock_count === 0 && (
                    <div className="absolute inset-0 bg-stone-900/40 flex items-center justify-center">
                      <span className="bg-white text-stone-900 text-xs font-bold px-3 py-1.5 rounded-full">
                        {t('outOfStock')}
                      </span>
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-stone-900 text-sm md:text-base leading-snug line-clamp-2 mb-2">
                    {product.title}
                  </h3>
                  <div className="flex items-center gap-2 flex-wrap">
                    {product.discount_price != null && product.discount_price < product.price ? (
                      <>
                        <span className="font-display font-bold text-brand-600 text-base md:text-lg">
                          ৳{Number(product.discount_price).toFixed(0)}
                        </span>
                        <span className="text-xs md:text-sm text-stone-400 line-through">
                          ৳{Number(product.price).toFixed(0)}
                        </span>
                      </>
                    ) : (
                      <span className="font-display font-bold text-stone-900 text-base md:text-lg">
                        ৳{Number(product.price).toFixed(0)}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <footer className="border-t border-stone-200 bg-stone-900 mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center">
                <Package className="w-4 h-4 text-white" />
              </div>
              <span className="font-display font-bold text-white text-lg">Ornix</span>
            </div>
            <div className="flex items-center gap-6">
              <button
                onClick={() => onNavigate('feedback')}
                className="flex items-center gap-2 text-stone-400 hover:text-white text-sm transition-colors"
              >
                <MessageSquare className="w-4 h-4" /> {t('feedback')}
              </button>
              <p className="text-stone-400 text-sm text-center sm:text-right">
                © {new Date().getFullYear()} Ornix. A Bangladeshi brand. All rights reserved.
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
