import { useState, useEffect } from 'react';
import { supabase, Product } from '../lib/supabase';
import HeroBanner from '../components/HeroBanner';
import TopCategories from '../components/TopCategories';
import NewArrivals from '../components/NewArrivals';
import BrandBio from '../components/BrandBio';
import { useNavigation } from '../lib/navigation';
import { setSEO, setJsonLd, DEFAULT_OG_IMAGE, SITE_NAME, DEFAULT_DESCRIPTION } from '../lib/seo';

export default function HomePage() {
  const onNavigate = useNavigation();
  const [discountedProducts, setDiscountedProducts] = useState<Product[]>([]);
  const [newArrivals, setNewArrivals] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setSEO({
      title: `${SITE_NAME} — Modern Fashion from Bangladesh`,
      description: DEFAULT_DESCRIPTION,
      image: DEFAULT_OG_IMAGE,
      url: '/',
    });
    setJsonLd({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: SITE_NAME,
      url: 'https://ornixbd.com',
      logo: DEFAULT_OG_IMAGE,
      description: DEFAULT_DESCRIPTION,
    });
  }, []);

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
            .filter(
              (p) =>
                p.discount_price != null &&
                Number(p.discount_price) < Number(p.price)
            )
            .slice(0, 8)
        );

        setNewArrivals(normalized.slice(0, 8));
      }

      setLoading(false);
    }

    fetchProducts();
  }, []);

  return (
    <div className="min-h-screen bg-white">
      {/* 1. Hero Banner — full width slider */}
      <HeroBanner onNavigate={onNavigate} />

      {/* 2. Top Categories — masonry/bento grid */}
      <TopCategories onNavigate={onNavigate} />

      {/* 3. New Arrivals — 4-col product grid */}
      <NewArrivals
        products={newArrivals}
        loading={loading}
        onNavigate={onNavigate}
        title="NEW ARRIVALS"
        subtitle="Fresh drops updated weekly — get yours before they sell out."
        showDiscount={false}
      />

      {/* 4. Discounted / Sale section (only if products exist or loading) */}
      {(loading || discountedProducts.length > 0) && (
        <div className="bg-[#F4EFEA]">
          <NewArrivals
            products={discountedProducts}
            loading={loading}
            onNavigate={onNavigate}
            title="HOT DEALS"
            subtitle="Limited-time discounts — updated automatically when offers are live."
            showDiscount
          />
        </div>
      )}

      {/* 5. Brand Bio / Mission Statement */}
      <BrandBio onNavigate={onNavigate} />
    </div>
  );
}
