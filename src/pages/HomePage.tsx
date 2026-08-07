import { useState, useEffect } from 'react';
import { ArrowRight, Package, MessageSquare, Sparkles, Truck, ShieldCheck } from 'lucide-react';
import { supabase, Product } from '../lib/supabase';
import { useLanguage } from '../lib/LanguageContext';

interface HomePageProps {
  onNavigate: (page: string, productId?: string) => void;
}

export default function HomePage({ onNavigate }: HomePageProps) {
  const { t } = useLanguage();
  const [discountedProducts, setDiscountedProducts] = useState<Product[]>([]);
  const [newArrivals, setNewArrivals] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchProducts() {
      const { data, error } = await supabase
        .from('products')
        .select('*, product_images(id, image_url, display_order)')
        .order('created_at', { ascending: false })
        .limit(24);

      if (!error && data) {
        const normalized = data.map((product) => ({
          ...product,
          product_images: (product.product_images as Product['product_images'])?.sort(
            (a, b) => a.display_order - b.display_order
          ),
        }));

        setDiscountedProducts(
          normalized
            .filter((product) =>
              product.discount_price != null && Number(product.discount_price) < Number(product.price)
            )
            .slice(0, 6)
        );

        setNewArrivals(
          normalized
            .slice(0, 6)
        );
      }

      setLoading(false);
    }

    fetchProducts();
  }, []);

  const getCoverImage = (product: Product) => {
    if (product.product_images && product.product_images.length > 0) {
      return product.product_images[0].image_url;
    }
    return 'https://images.pexels.com/photos/5632398/pexels-photo-5632398.jpeg?auto=compress&cs=tinysrgb&w=800';
  };

  const renderProductCard = (product: Product, index: number) => (
    <button
      key={`${product.id}-${index}`}
      onClick={() => onNavigate('product', product.id)}
      className="bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-0.5 text-left"
    >
      <div className="aspect-[4/5] overflow-hidden bg-stone-100 relative">
        <img
          src={getCoverImage(product)}
          alt={product.title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          onError={(e) => {
            (e.target as HTMLImageElement).src =
              'https://images.pexels.com/photos/5632398/pexels-photo-5632398.jpeg?auto=compress&cs=tinysrgb&w=800';
          }}
        />
        {product.discount_price != null && Number(product.discount_price) < Number(product.price) && (
          <span className="absolute top-3 left-3 bg-brand-500 text-white text-[10px] font-bold uppercase px-2.5 py-1 rounded-full shadow-sm">
            {Math.round((1 - Number(product.discount_price) / Number(product.price)) * 100)}% OFF
          </span>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-semibold text-stone-900 text-sm md:text-base leading-snug line-clamp-2 mb-2">
          {product.title}
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
          {product.discount_price != null && Number(product.discount_price) < Number(product.price) ? (
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
  );

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Hero */}
      <section className="relative overflow-hidden bg-stone-900">
        <div className="absolute inset-0">
          <div className="absolute top-0 left-1/4 w-[420px] h-[420px] bg-brand-600/20 rounded-full blur-[120px]" />
          <div className="absolute bottom-0 right-1/4 w-[360px] h-[360px] bg-amber-500/15 rounded-full blur-[100px]" />
          <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-stone-900/90 to-transparent" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-20 md:py-28">
          <div className="mx-auto max-w-3xl text-center sm:text-left">
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/15 rounded-full px-4 py-1.5 text-sm text-white/90 mb-6 animate-fade-in-up">
              <Sparkles className="w-4 h-4 text-brand-400" />
              <span>{t('madeInBangladesh')}</span>
            </div>
            <h1 className="font-display text-4xl sm:text-5xl md:text-6xl xl:text-7xl font-bold text-white tracking-tight leading-[1.03] mb-6 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
              {t('wearYourStory')}
            </h1>
            <p className="text-base sm:text-lg text-stone-300 max-w-2xl mx-auto sm:mx-0 mb-8 leading-relaxed animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
              {t('premiumFashion')}
            </p>
            <div className="flex flex-col sm:flex-row sm:justify-start items-center gap-4 animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
              <button
                onClick={() => onNavigate('shop')}
                className="inline-flex items-center justify-center gap-2 w-full sm:w-auto bg-brand-500 hover:bg-brand-400 text-white font-semibold px-7 py-3.5 rounded-2xl transition-all duration-200 hover:shadow-lg hover:shadow-brand-500/30 hover:-translate-y-0.5"
              >
                {t('shopCollection')} <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => onNavigate('shop')}
                className="inline-flex items-center justify-center gap-2 w-full sm:w-auto bg-white/10 hover:bg-white/15 backdrop-blur-sm border border-white/15 text-white font-semibold px-7 py-3.5 rounded-2xl transition-all duration-200"
              >
                {t('explore')}
              </button>
            </div>
          </div>
        </div>

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

      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-12 md:py-16 space-y-14">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-brand-600 mb-3">
              {t('discountedProducts')}
            </p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-stone-900 tracking-tight">
              {t('discountedProducts')}
            </h2>
            <p className="text-stone-600 mt-2 max-w-2xl">{t('discountedProductsSubtitle')}</p>
          </div>
          <button
            onClick={() => onNavigate('shop')}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-stone-900 text-white px-6 py-3 text-sm font-semibold transition-all duration-200 hover:bg-brand-500"
          >
            {t('viewAllProducts')} <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {loading
            ? Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-80 rounded-3xl bg-stone-100 animate-pulse" />
              ))
            : discountedProducts.length > 0
            ? discountedProducts.map(renderProductCard)
            : (
              <div className="rounded-3xl bg-white border border-stone-200 p-8 text-center text-stone-500">
                {t('noDiscountedProducts')}
              </div>
            )}
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-brand-600 mb-3">
              {t('newArrivals')}
            </p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-stone-900 tracking-tight">
              {t('newArrivals')}
            </h2>
            <p className="text-stone-600 mt-2 max-w-2xl">{t('newArrivalsSubtitle')}</p>
          </div>
          <button
            onClick={() => onNavigate('shop')}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-stone-900 text-white px-6 py-3 text-sm font-semibold transition-all duration-200 hover:bg-brand-500"
          >
            {t('viewAllProducts')} <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {loading
            ? Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-80 rounded-3xl bg-stone-100 animate-pulse" />
              ))
            : newArrivals.length > 0
            ? newArrivals.map(renderProductCard)
            : (
              <div className="rounded-3xl bg-white border border-stone-200 p-8 text-center text-stone-500">
                {t('noNewArrivals')}
              </div>
            )}
        </div>
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
