import { useState, useEffect } from 'react';
import { ArrowLeft, ChevronDown, Loader2, Package } from 'lucide-react';
import { useLocation, useParams, Link } from 'react-router-dom';
import { supabase, Product } from '../lib/supabase';
import { useLanguage } from '../lib/LanguageContext';
import { slugify, splitWatermarkedTitle } from '../lib/utils';
import ProductCard from '../components/ProductCard';
import { setSEO, setJsonLd, SITE_URL, SITE_NAME, DEFAULT_OG_IMAGE } from '../lib/seo';
import {
  getProductListingSnapshot,
  removeProductListingSnapshot,
  setProductListingSnapshot,
} from '../lib/productListingCache';
import { useProductListingScroll } from '../lib/useProductListingScroll';

type SortOption = 'newest' | 'price-low-high' | 'price-high-low';
const PAGE_SIZE = 12;

export default function SingleCollectionPage() {
  const { t } = useLanguage();
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const cacheKey = `collection:${location.key}:${slug ?? ''}`;
  const cachedListing = getProductListingSnapshot(cacheKey);
  useProductListingScroll(cacheKey, cachedListing?.scrollY);
  const [categoryName, setCategoryName] = useState<string>(cachedListing?.categoryName ?? '');
  const [categoryId, setCategoryId] = useState<string | null>(cachedListing?.categoryId ?? null);
  const [products, setProducts] = useState<Product[]>(cachedListing?.products ?? []);
  const [totalCount, setTotalCount] = useState(cachedListing?.totalCount ?? 0);
  const [loadedPages, setLoadedPages] = useState(cachedListing?.loadedPages ?? 0);
  const [loading, setLoading] = useState(!cachedListing);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>(
    cachedListing?.sortBy === 'price-low-high' || cachedListing?.sortBy === 'price-high-low'
      ? cachedListing.sortBy
      : 'newest'
  );
  const [sortOpen, setSortOpen] = useState(false);

  useEffect(() => {
    let active = true;

    async function fetchCollection() {
      const cached = getProductListingSnapshot(cacheKey);
      if (cached) {
        setCategoryName(cached.categoryName ?? '');
        setCategoryId(cached.categoryId ?? null);
        setProducts(cached.products);
        setTotalCount(cached.totalCount);
        setLoadedPages(cached.loadedPages);
        if (cached.sortBy === 'newest' || cached.sortBy === 'price-low-high' || cached.sortBy === 'price-high-low') {
          setSortBy(cached.sortBy);
        }
        setLoading(false);
      } else {
        setCategoryName('');
        setCategoryId(null);
        setLoading(true);
        setProducts([]);
        setTotalCount(0);
        setLoadedPages(0);
      }
      if (!slug) {
        setLoading(false);
        return;
      }

      const { data: categories, error: catError } = await supabase
        .from('categories')
        .select('*')
        .order('priority', { ascending: true, nullsFirst: false })
        .order('name');

      if (!active) return;
      if (catError || !categories) {
        if (catError) console.error('Failed to load collection categories:', catError);
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
      setCategoryId(matchedCategory.id);
    }

    fetchCollection();
    return () => { active = false; };
  }, [slug, cacheKey]);

  useEffect(() => {
    let active = true;

    async function fetchProducts() {
      if (!categoryId) return;

      const cached = getProductListingSnapshot(cacheKey);
      if (cached && cached.sortBy !== sortBy &&
        (cached.sortBy === 'newest' || cached.sortBy === 'price-low-high' || cached.sortBy === 'price-high-low')) {
        setSortBy(cached.sortBy);
        return;
      }
      if (cached && cached.sortBy === sortBy) {
        setProducts(cached.products);
        setTotalCount(cached.totalCount);
        setLoadedPages(cached.loadedPages);
        setLoading(false);
        return;
      }

      setLoading(true);
      const orderBy = sortBy === 'newest' ? 'created_at' : 'price';
      const ascending = sortBy === 'price-low-high';
      const { data, error, count } = await supabase
        .from('products')
        .select('*, product_images(id, image_url, display_order)', { count: 'exact' })
        .eq('category_id', categoryId)
        .order(orderBy, { ascending })
        .range(0, PAGE_SIZE - 1);

      if (!active) return;
      if (!error && data) {
        const firstPage = data.map((product) => ({
          ...product,
          product_images: (product.product_images as Product['product_images'])?.sort(
            (a, b) => a.display_order - b.display_order
          ),
        }));
        const countOfProducts = count ?? 0;
        const firstLoadedPages = firstPage.length > 0 ? 1 : 0;
        setProducts(firstPage);
        setLoadedPages(firstLoadedPages);
        setProductListingSnapshot(cacheKey, {
          products: firstPage,
          totalCount: countOfProducts,
          loadedPages: firstLoadedPages,
          sortBy,
          categoryId,
          categoryName,
        });
        setTotalCount(countOfProducts);
      } else {
        if (error) console.error('Failed to load collection products:', error);
        setProducts([]);
        setTotalCount(0);
      }
      setLoading(false);
    }

    fetchProducts();
    return () => { active = false; };
  }, [categoryId, cacheKey, categoryName, sortBy]);

  useEffect(() => {
    if (!categoryName) return;
    // Use the category's cover image (first product image) as the social preview
    const cover = products[0]?.product_images?.[0]?.image_url || DEFAULT_OG_IMAGE;
    setSEO({
      title: `${categoryName} — ${SITE_NAME}`,
      description: `Shop ${categoryName} at ${SITE_NAME}. Premium quality, nationwide delivery across Bangladesh. ${totalCount} product${totalCount !== 1 ? 's' : ''} available.`,
      image: cover,
      url: `/collections/${slug}`,
    });
    setJsonLd({
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: categoryName,
      url: `${SITE_URL}/collections/${slug}`,
    });
    setJsonLd({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: 'Collections', item: `${SITE_URL}/collections` },
        { '@type': 'ListItem', position: 3, name: categoryName, item: `${SITE_URL}/collections/${slug}` },
      ],
    }, 'page-breadcrumb-jsonld');
  }, [categoryName, slug, products, totalCount]);

  async function loadMore() {
    if (!categoryId || loadingMore || products.length >= totalCount) return;

    setLoadingMore(true);
    const from = loadedPages * PAGE_SIZE;
    const orderBy = sortBy === 'newest' ? 'created_at' : 'price';
    const ascending = sortBy === 'price-low-high';
    const { data, error } = await supabase
      .from('products')
      .select('*, product_images(id, image_url, display_order)')
      .eq('category_id', categoryId)
      .order(orderBy, { ascending })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error('Failed to load more collection products:', error);
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
      sortBy,
      categoryId,
      categoryName,
    });
    setLoadingMore(false);
  }

  const sortLabels: Record<SortOption, string> = {
    newest: t('newestArrivals'),
    'price-low-high': t('priceLowToHigh'),
    'price-high-low': t('priceHighToLow'),
  };
  const [titleFirstWord, titleRemainingWords] = splitWatermarkedTitle(categoryName);

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
    <div className="store-page store-page--listing min-h-screen bg-stone-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 md:py-14">
        <nav aria-label="Breadcrumb" className="mb-6 text-sm text-stone-500">
          <ol className="flex items-center gap-2">
            <li>
              <Link to="/" className="hover:text-stone-900 transition-colors">
                {t('homeBreadcrumb') || 'Home'}
              </Link>
            </li>
            <li aria-hidden="true" className="text-stone-300">/</li>
            <li>
              <Link to="/collections" className="hover:text-stone-900 transition-colors">
                {t('collections')}
              </Link>
            </li>
            <li aria-hidden="true" className="text-stone-300">/</li>
            <li aria-current="page" className="font-medium text-stone-700">{categoryName}</li>
          </ol>
        </nav>

        <div className="store-watermark mb-8" data-watermark={categoryName}>
          <h1 className="store-page-title font-display text-5xl sm:text-6xl md:text-8xl font-bold text-stone-900 uppercase tracking-tight">
            {titleFirstWord}
            {titleRemainingWords && <> <span>{titleRemainingWords}</span></>}
          </h1>
        </div>

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
                      removeProductListingSnapshot(cacheKey);
                      setSortBy(option);
                      setProducts([]);
                      setTotalCount(0);
                      setLoadedPages(0);
                      setLoading(true);
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
            {totalCount} {totalCount === 1 ? 'product' : 'products'}
          </span>
        </div>

        {totalCount === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Package className="w-16 h-16 text-stone-300 mb-4" />
            <p className="text-stone-500">{t('noProductsInCategory') || 'No products in this category yet.'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
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
              className="inline-flex min-w-40 items-center justify-center gap-2 rounded-lg border-2 border-stone-900 bg-stone-900 px-6 py-3 text-sm font-bold uppercase tracking-wider text-white transition-colors hover:bg-stone-700 disabled:cursor-wait disabled:opacity-70"
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
