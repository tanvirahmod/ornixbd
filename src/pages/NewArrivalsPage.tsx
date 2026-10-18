import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Loader2, Package } from 'lucide-react';
import { supabase, Product } from '../lib/supabase';
import { splitWatermarkedTitle } from '../lib/utils';
import ProductCard from '../components/ProductCard';
import { setSEO, SITE_NAME, DEFAULT_DESCRIPTION, DEFAULT_OG_IMAGE } from '../lib/seo';
import { getProductListingSnapshot, setProductListingSnapshot } from '../lib/productListingCache';
import { useProductListingScroll } from '../lib/useProductListingScroll';

const PAGE_SIZE = 12;

export default function NewArrivalsPage() {
  const location = useLocation();
  const cacheKey = `new-arrivals:${location.key}`;
  const cachedListing = getProductListingSnapshot(cacheKey);
  useProductListingScroll(cacheKey, cachedListing?.scrollY);
  const [titleFirstWord, titleRemainingWords] = splitWatermarkedTitle('NEW ARRIVALS');
  const [products, setProducts] = useState<Product[]>(cachedListing?.products ?? []);
  const [totalCount, setTotalCount] = useState(cachedListing?.totalCount ?? 0);
  const [loadedPages, setLoadedPages] = useState(cachedListing?.loadedPages ?? 0);
  const [loading, setLoading] = useState(!cachedListing);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    setSEO({
      title: `New Arrivals — ${SITE_NAME}`,
      description: `Shop the latest streetwear drops at ${SITE_NAME}. Fresh designs added weekly — premium cotton tees, shirts and more. ${DEFAULT_DESCRIPTION}`,
      image: DEFAULT_OG_IMAGE,
      url: '/new-arrivals',
    });
  }, []);

  useEffect(() => {
    let active = true;

    async function fetchFirstPage() {
      const cached = getProductListingSnapshot(cacheKey);
      if (cached) {
        setProducts(cached.products);
        setTotalCount(cached.totalCount);
        setLoadedPages(cached.loadedPages);
        setLoading(false);
        return;
      }

      setLoading(true);
      const { data, error, count } = await supabase
        .from('products')
        .select('*, product_images(id, image_url, display_order)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(0, PAGE_SIZE - 1);

      if (!active) return;
      if (error) {
        console.error('Failed to load new arrivals:', error);
        setLoading(false);
        return;
      }

      const firstPage = (data ?? []).map((product) => ({
        ...product,
        product_images: (product.product_images as Product['product_images'])?.sort(
          (a, b) => a.display_order - b.display_order
        ),
      }));
      const countOfProducts = count ?? 0;
      const firstLoadedPages = firstPage.length > 0 ? 1 : 0;
      setProducts(firstPage);
      setTotalCount(countOfProducts);
      setLoadedPages(firstLoadedPages);
      setProductListingSnapshot(cacheKey, {
        products: firstPage,
        totalCount: countOfProducts,
        loadedPages: firstLoadedPages,
      });
      setLoading(false);
    }

    fetchFirstPage();
    return () => { active = false; };
  }, [cacheKey]);

  async function loadMore() {
    if (loadingMore || products.length >= totalCount) return;

    setLoadingMore(true);
    const from = loadedPages * PAGE_SIZE;
    const { data, error } = await supabase
      .from('products')
      .select('*, product_images(id, image_url, display_order)')
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error('Failed to load more new arrivals:', error);
      setLoadingMore(false);
      return;
    }

    const nextPage = (data ?? []).map((product) => ({
      ...product,
      product_images: (product.product_images as Product['product_images'])?.sort(
        (a, b) => a.display_order - b.display_order
      ),
    }));
    const nextProducts = [...products, ...nextPage];
    const nextLoadedPages = loadedPages + 1;
    setProducts(nextProducts);
    setLoadedPages(nextLoadedPages);
    setProductListingSnapshot(cacheKey, {
      products: nextProducts,
      totalCount,
      loadedPages: nextLoadedPages,
    });
    setLoadingMore(false);
  }

  return (
    <div className="store-page store-page--listing min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 md:py-14">

        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="mb-6 text-sm text-stone-500">
          <ol className="flex items-center gap-2">
            <li><Link to="/" className="hover:text-stone-900 transition-colors">Home</Link></li>
            <li aria-hidden="true" className="text-stone-300">/</li>
            <li aria-current="page" className="font-medium text-stone-700">New Arrivals</li>
          </ol>
        </nav>

        {/* Header */}
        <div className="store-page-heading store-watermark mb-10" data-watermark="NEW ARRIVALS">
          <p className="store-page-heading__eyebrow text-xs font-bold tracking-[0.3em] uppercase text-[#D90429] mb-2">
            02 / JUST DROPPED
          </p>
          <h1 className="font-display text-5xl sm:text-6xl md:text-8xl text-black uppercase tracking-wide leading-none">
            {titleFirstWord} <span>{titleRemainingWords}</span>
          </h1>
          <p className="store-page-heading__description text-sm text-black/50 mt-3 font-medium">
            Fresh drops updated weekly — get yours before they sell out.
          </p>
          {!loading && totalCount > 0 && (
            <p className="text-sm text-stone-400 mt-1">
              {totalCount} product{totalCount !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
            {Array.from({ length: PAGE_SIZE }).map((_, i) => (
              <div key={i} className="aspect-[3/4] bg-stone-100 animate-pulse rounded-3xl" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Package className="w-16 h-16 text-stone-300 mb-4" />
            <p className="text-stone-500">No products available yet. Check back soon.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}

        {products.length > 0 && (
          <p className="mt-6 text-center text-sm text-stone-600" aria-live="polite">
            Showing {products.length} of {totalCount} products
          </p>
        )}
        {products.length < totalCount && (
          <div className="mt-5 flex justify-center">
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore || loading}
              className="inline-flex min-w-40 items-center justify-center gap-2 border-2 border-black bg-black px-6 py-3 text-sm font-bold uppercase tracking-wider text-white transition-colors hover:bg-stone-800 disabled:cursor-wait disabled:opacity-70"
            >
              {loadingMore && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {loadingMore ? 'Loading...' : 'Load More'}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
