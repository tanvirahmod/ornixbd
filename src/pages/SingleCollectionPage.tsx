import { useState, useEffect } from 'react';
import { ArrowLeft, ChevronDown, Package } from 'lucide-react';
import { useParams, Link } from 'react-router-dom';
import { supabase, Product } from '../lib/supabase';
import { useLanguage } from '../lib/LanguageContext';
import { slugify, splitWatermarkedTitle } from '../lib/utils';
import ProductCard from '../components/ProductCard';
import { setSEO, setJsonLd, SITE_URL, SITE_NAME, DEFAULT_OG_IMAGE } from '../lib/seo';

type SortOption = 'newest' | 'price-low-high' | 'price-high-low';
const PAGE_SIZE = 12;

export default function SingleCollectionPage() {
  const { t } = useLanguage();
  const { slug } = useParams<{ slug: string }>();
  const [categoryName, setCategoryName] = useState<string>('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [sortOpen, setSortOpen] = useState(false);

  useEffect(() => {
    let active = true;

    async function fetchCollection() {
      setLoading(true);
      setCategoryName('');
      setCategoryId(null);
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
      setProducts([]);
      setTotalCount(0);
      setPage(1);
    }

    fetchCollection();
    return () => { active = false; };
  }, [slug]);

  useEffect(() => {
    let active = true;

    async function fetchProducts() {
      if (!categoryId) return;

      setLoading(true);
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const orderBy = sortBy === 'newest' ? 'created_at' : 'price';
      const ascending = sortBy === 'price-low-high';
      const { data, error, count } = await supabase
        .from('products')
        .select('*, product_images(id, image_url, display_order)', { count: 'exact' })
        .eq('category_id', categoryId)
        .order(orderBy, { ascending })
        .range(from, to);

      if (!active) return;
      if (!error && data) {
        setProducts(
          data.map((product) => ({
            ...product,
            product_images: (product.product_images as Product['product_images'])?.sort(
              (a, b) => a.display_order - b.display_order
            ),
          }))
        );
        setTotalCount(count ?? 0);
      } else {
        if (error) console.error('Failed to load collection products:', error);
        setProducts([]);
        setTotalCount(0);
      }
      setLoading(false);
    }

    fetchProducts();
    return () => { active = false; };
  }, [categoryId, page, sortBy]);

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

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

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
                      setSortBy(option);
                      setPage(1);
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
        {totalPages > 1 && (
          <div className="mt-10 flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={safePage === 1 || loading}
              className="rounded-lg border border-stone-200 px-4 py-2 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-sm text-stone-500" aria-live="polite">
              Page {safePage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={safePage === totalPages || loading}
              className="rounded-lg border border-stone-200 px-4 py-2 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
