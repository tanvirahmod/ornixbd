import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Ruler, Package, Loader2 } from 'lucide-react';
import { supabase, Product } from '../lib/supabase';
import { useCategories } from '../lib/siteConfig';
import { getCoverImage, COVER_FALLBACK, productParam } from '../lib/utils';
import { setSEO, setJsonLd, SITE_NAME, DEFAULT_DESCRIPTION } from '../lib/seo';

export default function ShopBySizePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const { categories } = useCategories();

  useEffect(() => {
    async function fetchProducts() {
      setLoading(true);
      const { data, error } = await supabase
        .from('products')
        .select('*, product_images(id, image_url, display_order), categories(id, name, created_at), product_sizes(id, size, quantity)')
        .gt('stock_count', 0);
      if (!error && data) {
        setProducts(
          data.map((p) => ({
            ...p,
            product_images: (p.product_images as Product['product_images'])?.sort(
              (a, b) => a.display_order - b.display_order
            ),
          }))
        );
      }
      setLoading(false);
    }
    fetchProducts();
  }, []);

  useEffect(() => {
    const title = selectedSize
      ? `Size ${selectedSize} Products — ${SITE_NAME}`
      : `Shop by Size — ${SITE_NAME}`;
    setSEO({
      title,
      description: selectedSize
        ? `Browse all products available in size ${selectedSize} at ${SITE_NAME}.`
        : `Find your size. Browse every in-stock product by size at ${SITE_NAME}. ${DEFAULT_DESCRIPTION}`,
    });
    setJsonLd({
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: title,
    });
  }, [selectedSize]);

  // Normalize sizes so "s", "s " and "S" are treated as the same size
  const normSize = (s: string) => s.trim().toUpperCase();

  // All sizes offered across in-stock products, most common first
  const allSizes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of products) {
      for (const size of p.sizes ?? []) {
        const key = normSize(size);
        if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([size]) => size);
  }, [products]);

  const matching = useMemo(() => {
    if (!selectedSize) return [];
    return products.filter((p) =>
      (selectedCategory === '' || p.category_id === selectedCategory) &&
      (p.product_sizes ?? []).some((ps) => normSize(ps.size) === selectedSize && ps.quantity > 0)
    );
  }, [products, selectedSize, selectedCategory]);

  const totalUnits = useMemo(
    () => matching.reduce((sum, p) => {
      const ps = (p.product_sizes ?? []).find((s) => normSize(s.size) === selectedSize);
      return sum + (ps?.quantity ?? 0);
    }, 0),
    [matching, selectedSize]
  );

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 md:py-12">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-brand-100 rounded-2xl mb-4">
            <Ruler className="w-7 h-7 text-brand-600" />
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-bold text-stone-900 tracking-tight mb-2">
            Shop by Size
          </h1>
          <p className="text-stone-500 text-sm max-w-lg mx-auto">
            Pick your size and see every product we have in stock for it right now.
          </p>
        </div>

        {/* Size selector */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap justify-center gap-2.5 mb-10">
              {allSizes.length === 0 ? (
                <p className="text-stone-400 text-sm">No sized products in stock right now.</p>
              ) : (
                allSizes.map((size) => (
                  <button
                    key={size}
                    onClick={() => setSelectedSize(selectedSize === size ? null : size)}
                    className={`min-w-[3.5rem] px-5 py-2.5 rounded-2xl border-2 font-bold text-sm transition-all duration-200 ${
                      selectedSize === size
                        ? 'border-stone-900 bg-stone-900 text-white shadow-md scale-105'
                        : 'border-stone-200 bg-white text-stone-700 hover:border-stone-400 hover:bg-stone-50'
                    }`}
                  >
                    {size}
                  </button>
                ))
              )}
            </div>

            {/* Results */}
            {selectedSize && (
              <>
                <div className="flex flex-wrap items-center justify-between mb-5 gap-3">
                  <h2 className="font-display text-lg sm:text-xl font-bold text-stone-900 min-w-0">
                    Size {selectedSize} — {matching.length} product{matching.length !== 1 ? 's' : ''} available
                  </h2>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-xs text-stone-400">{totalUnits} unit{totalUnits !== 1 ? 's' : ''} in stock</span>
                    <select
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                      className="border border-stone-200 rounded-xl px-3 py-2 text-sm bg-white text-stone-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
                    >
                      <option value="">All Categories</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {matching.length === 0 ? (
                  <div className="text-center py-20 text-stone-400">
                    <Package className="w-12 h-12 mx-auto mb-3 text-stone-300" />
                    <p>Nothing in stock for size {selectedSize} right now. Check back soon!</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {matching.map((product) => {
                      const ps = (product.product_sizes ?? []).find((s) => normSize(s.size) === selectedSize);
                      const hasDiscount =
                        product.discount_price != null && Number(product.discount_price) < Number(product.price);
                      return (
                        <Link
                          key={product.id}
                          to={`/product/${productParam(product.title, product.product_code ?? product.id)}`}
                          className="bg-white rounded-3xl shadow-sm border border-stone-100 overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all"
                        >
                          <div className="aspect-[3/4] bg-stone-100 overflow-hidden relative">
                            <img
                              src={getCoverImage(product)}
                              alt={product.title}
                              className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
                              loading="lazy"
                              onError={(e) => { (e.target as HTMLImageElement).src = COVER_FALLBACK; }}
                            />
                            <span className="absolute top-3 right-3 bg-stone-900/85 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                              {selectedSize} · {ps?.quantity ?? 0} left
                            </span>
                          </div>
                          <div className="p-4">
                            <h3 className="text-sm font-semibold text-stone-900 leading-tight line-clamp-2 mb-2">
                              {product.title}
                            </h3>
                            <div className="flex items-center gap-2">
                              {hasDiscount ? (
                                <>
                                  <span className="text-xs text-stone-400 line-through">৳{Number(product.price).toFixed(0)}</span>
                                  <span className="font-display font-bold text-sale text-lg">৳{Number(product.discount_price).toFixed(0)}</span>
                                </>
                              ) : (
                                <span className="font-display font-bold text-stone-900 text-lg">৳{Number(product.price).toFixed(0)}</span>
                              )}
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {!selectedSize && (
              <div className="text-center py-16 text-stone-400">
                <Package className="w-12 h-12 mx-auto mb-3 text-stone-300" />
                <p>Select a size above to see everything available in it.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
