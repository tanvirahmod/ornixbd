import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Tag } from 'lucide-react';
import { supabase, Product } from '../lib/supabase';
import { splitWatermarkedTitle } from '../lib/utils';
import ProductCard from '../components/ProductCard';
import { setSEO, SITE_NAME, DEFAULT_DESCRIPTION, DEFAULT_OG_IMAGE } from '../lib/seo';
import { getProductListingSnapshot, setProductListingSnapshot } from '../lib/productListingCache';
import { useProductListingScroll } from '../lib/useProductListingScroll';

const PAGE_SIZE = 12;

export default function HotDealsPage() {
  const location = useLocation();
  const cacheKey = `hot-deals:${location.key}`;
  const cachedListing = getProductListingSnapshot(cacheKey);
  useProductListingScroll(cacheKey, cachedListing?.scrollY);
  const [titleFirstWord, titleRemainingWords] = splitWatermarkedTitle('HOT DEALS');
  const [products, setProducts] = useState<Product[]>(cachedListing?.products ?? []);
  const [allDeals, setAllDeals] = useState<Product[]>(cachedListing?.allProducts ?? []);
  const [totalCount, setTotalCount] = useState(cachedListing?.totalCount ?? 0);
  const [loadedPages, setLoadedPages] = useState(cachedListing?.loadedPages ?? 0);
  const [loading, setLoading] = useState(!cachedListing);

  useEffect(() => {
    setSEO({
      title: `Hot Deals — ${SITE_NAME}`,
      description: `Limited-time discounts on premium streetwear at ${SITE_NAME}. Shop discounted tees, shirts and more before the offers end. ${DEFAULT_DESCRIPTION}`,
      image: DEFAULT_OG_IMAGE,
      url: '/hot-deals',
    });
  }, []);

  useEffect(() => {
    let active = true;

    async function fetchPage() {
      const cached = getProductListingSnapshot(cacheKey);
      if (cached) {
        setProducts(cached.products);
        setAllDeals(cached.allProducts ?? []);
        setTotalCount(cached.totalCount);
        setLoadedPages(cached.loadedPages);
        setLoading(false);
        return;
      }

      setLoading(true);

      // Fetch ALL discounted products to filter client-side
      // (Supabase JS v2 can't compare two columns in a WHERE clause)
      const { data, error } = await supabase
        .from('products')
        .select('*, product_images(id, image_url, display_order)')
        .not('discount_price', 'is', null)
        .order('created_at', { ascending: false });

      if (!active) return;
      if (error) {
        console.error('Failed to load hot deals:', error);
        setLoading(false);
        return;
      }

      // Only keep rows where discount_price is genuinely lower than price.
      const deals = (data ?? [])
        .filter((product) => product.discount_price != null && Number(product.discount_price) < Number(product.price))
        .map((product) => ({
          ...product,
          product_images: (product.product_images as Product['product_images'])?.sort(
            (a, b) => a.display_order - b.display_order
          ),
        }));
      const firstPage = deals.slice(0, PAGE_SIZE);
      const firstLoadedPages = firstPage.length > 0 ? 1 : 0;
      setAllDeals(deals);
      setProducts(firstPage);
      setTotalCount(deals.length);
      setLoadedPages(firstLoadedPages);
      setProductListingSnapshot(cacheKey, {
        products: firstPage,
        allProducts: deals,
        totalCount: deals.length,
        loadedPages: firstLoadedPages,
      });
      setLoading(false);
    }
    fetchPage();
    return () => { active = false; };
  }, [cacheKey]);

  function loadMore() {
    if (products.length >= totalCount) return;

    const nextLoadedPages = loadedPages + 1;
    const nextProducts = allDeals.slice(0, nextLoadedPages * PAGE_SIZE);
    setProducts(nextProducts);
    setLoadedPages(nextLoadedPages);
    setProductListingSnapshot(cacheKey, {
      products: nextProducts,
      allProducts: allDeals,
      totalCount,
      loadedPages: nextLoadedPages,
    });
  }

  return (
    <div className="store-page store-page--listing store-page--deals min-h-screen bg-[#F4EFEA]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 md:py-14">

        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="mb-6 text-sm text-stone-500">
          <ol className="flex items-center gap-2">
            <li><Link to="/" className="hover:text-stone-900 transition-colors">Home</Link></li>
            <li aria-hidden="true" className="text-stone-300">/</li>
            <li aria-current="page" className="font-medium text-stone-700">Hot Deals</li>
          </ol>
        </nav>

        {/* Header */}
        <div className="store-page-heading store-watermark mb-10" data-watermark="HOT DEALS">
          <p className="store-page-heading__eyebrow text-xs font-bold tracking-[0.3em] uppercase text-[#D90429] mb-2">
            03 / LIMITED TIME OFFERS
          </p>
          <h1 className="font-display text-5xl sm:text-6xl md:text-8xl text-black uppercase tracking-wide leading-none">
            {titleFirstWord} <span>{titleRemainingWords}</span>
          </h1>
          <p className="store-page-heading__description text-sm text-black/50 mt-3 font-medium">
            Limited-time discounts — updated automatically when offers are live.
          </p>
          {!loading && totalCount > 0 && (
            <p className="text-sm text-stone-400 mt-1">
              {totalCount} discounted product{totalCount !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
            {Array.from({ length: PAGE_SIZE }).map((_, i) => (
              <div key={i} className="aspect-[3/4] bg-stone-200 animate-pulse rounded-3xl" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Tag className="w-16 h-16 text-stone-300 mb-4" />
            <p className="text-stone-500">No deals available right now. Check back soon!</p>
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
              disabled={loading}
              className="inline-flex min-w-40 items-center justify-center gap-2 border-2 border-black bg-black px-6 py-3 text-sm font-bold uppercase tracking-wider text-white transition-colors hover:bg-stone-800 disabled:cursor-wait disabled:opacity-70"
            >
              Load More
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
