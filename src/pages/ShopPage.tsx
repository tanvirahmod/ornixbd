import { useState, useEffect } from 'react';
import { supabase, Product, Category } from '../lib/supabase';
import { useLanguage } from '../lib/LanguageContext';
import { useNavigation } from '../lib/navigation';
import CategoryGrid from '../components/CategoryGrid';
import AllProductsSection from '../components/AllProductsSection';
import HelpFooter from '../components/HelpFooter';

export default function ShopPage() {
  const onNavigate = useNavigation();
  const { t } = useLanguage();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      const [prodRes, catRes] = await Promise.all([
        supabase
          .from('products')
          .select('*, product_images(id, image_url, display_order), categories(id, name, created_at)')
          .order('created_at', { ascending: false })
          .limit(48),
        supabase.from('categories').select('*').order('priority', { ascending: true, nullsFirst: false }).order('name'),
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
    <div className="min-h-screen bg-stone-50">
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-10 md:py-14">
        {/* ── Heading section (kept intact) ── */}
        <div className="text-center mx-auto max-w-2xl mb-10">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-brand-600 mb-3">
            {t('shop')}
          </p>
          <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold text-stone-900 tracking-tight mb-4">
            {t('shopCollection')}
          </h1>
          <p className="text-stone-600 leading-relaxed">
            {t('premiumFashion')}
          </p>
        </div>

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

      <HelpFooter onNavigate={onNavigate} />
    </div>
  );
}
