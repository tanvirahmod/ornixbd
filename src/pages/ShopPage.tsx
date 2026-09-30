import { useState, useEffect } from 'react';
import { supabase, Product, Category } from '../lib/supabase';
import { useLanguage } from '../lib/LanguageContext';
import { Sparkles } from 'lucide-react';
import CategoryGrid from '../components/CategoryGrid';
import AllProductsSection from '../components/AllProductsSection';
import { setSEO, SITE_NAME, DEFAULT_DESCRIPTION, DEFAULT_OG_IMAGE } from '../lib/seo';

export default function ShopPage() {
  const { t } = useLanguage();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setSEO({
      title: `${t('shopCollection')} — ${SITE_NAME}`,
      description: DEFAULT_DESCRIPTION,
      image: DEFAULT_OG_IMAGE,
      url: '/collections',
    });
  }, [t]);

  useEffect(() => {
    async function fetchData() {
      const [prodRes, catRes] = await Promise.all([
        supabase
          .from('products')
          .select('*, product_images(id, image_url, display_order), categories(id, name, created_at)')
          .order('created_at', { ascending: false })
          .limit(48),
        supabase.from('categories').select('*').eq('is_hidden', false).order('priority', { ascending: true, nullsFirst: false }).order('name'),
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

  return (
    <div className="store-page store-page--shop min-h-screen bg-stone-50">
      <section className="store-collection-intro relative overflow-hidden bg-black text-white">
        <div className="store-collection-intro__glow store-collection-intro__glow--top" />
        <div className="store-collection-intro__glow store-collection-intro__glow--bottom" />
        <div className="store-collection-intro__content relative max-w-4xl mx-auto px-4 sm:px-6 py-16 md:py-24 text-center">
          <span className="store-collection-intro__eyebrow inline-flex items-center gap-2 uppercase">
            <Sparkles aria-hidden="true" />
            {t('shop')} · ORNIX COLLECTIONS
          </span>
          <h1 className="font-display uppercase">{t('shopCollection')}</h1>
          <p>{t('premiumFashion')}</p>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-10 md:py-14">
        {loading ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="aspect-[3/4] bg-stone-200 rounded-3xl skeleton" />
              ))}
            </div>
            <div className="space-y-10">
              <div className="h-8 skeleton rounded w-48 mb-6" />
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="space-y-3">
                    <div className="aspect-[3/4] bg-stone-200 rounded-3xl skeleton" />
                    <div className="h-4 skeleton rounded w-3/4" />
                    <div className="h-4 skeleton rounded w-1/2" />
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            <CategoryGrid categories={categories} />
            <AllProductsSection products={products} categories={categories} />
          </>
        )}
      </section>
    </div>
  );
}
