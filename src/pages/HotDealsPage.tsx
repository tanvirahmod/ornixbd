import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Tag } from 'lucide-react';
import { supabase, Product } from '../lib/supabase';
import ProductCard from '../components/ProductCard';

const PAGE_SIZE = 12;

export default function HotDealsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  useEffect(() => {
    async function fetchPage() {
      setLoading(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });

      // Fetch ALL discounted products to filter client-side
      // (Supabase JS v2 can't compare two columns in a WHERE clause)
      const { data, error } = await supabase
        .from('products')
        .select('*, product_images(id, image_url, display_order)')
        .not('discount_price', 'is', null)
        .order('created_at', { ascending: false });

      if (!error && data) {
        // Only keep rows where discount_price is genuinely lower than price
        const deals = data
          .filter(
            (p) => p.discount_price != null && Number(p.discount_price) < Number(p.price)
          )
          .map((p) => ({
            ...p,
            product_images: (p.product_images as Product['product_images'])?.sort(
              (a, b) => a.display_order - b.display_order
            ),
          }));

        setTotalCount(deals.length);

        // Slice the current page
        const from = (page - 1) * PAGE_SIZE;
        setProducts(deals.slice(from, from + PAGE_SIZE));
      }
      setLoading(false);
    }
    fetchPage();
  }, [page]);

  return (
    <div className="min-h-screen bg-[#F4EFEA]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 md:py-14">

        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-stone-500 mb-6">
          <Link to="/" className="hover:text-stone-900 transition-colors">Home</Link>
          <span className="text-stone-300">/</span>
          <span className="text-stone-700 font-medium">Hot Deals</span>
        </nav>

        {/* Header */}
        <div className="mb-10">
          <p className="text-xs font-bold tracking-[0.3em] uppercase text-[#D90429] mb-2">
            Limited time offers
          </p>
          <h1 className="font-display text-4xl sm:text-5xl md:text-6xl text-black uppercase tracking-wide leading-none">
            HOT DEALS
          </h1>
          <p className="text-sm text-black/50 mt-3 font-medium">
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

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-12">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="flex items-center gap-1 px-4 py-2.5 text-sm font-bold uppercase tracking-wide border-2 border-black text-black hover:bg-black hover:text-white transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" /> Prev
            </button>

            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }).map((_, i) => {
                const p = i + 1;
                const show =
                  p === 1 ||
                  p === totalPages ||
                  Math.abs(p - page) <= 1;
                if (!show) {
                  if (p === 2 && page > 3) return <span key={p} className="px-1 text-stone-400">…</span>;
                  if (p === totalPages - 1 && page < totalPages - 2) return <span key={p} className="px-1 text-stone-400">…</span>;
                  return null;
                }
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-10 h-10 text-sm font-bold border-2 transition-all duration-200 ${
                      p === page
                        ? 'bg-black border-black text-white'
                        : 'border-black text-black hover:bg-black hover:text-white'
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="flex items-center gap-1 px-4 py-2.5 text-sm font-bold uppercase tracking-wide border-2 border-black text-black hover:bg-black hover:text-white transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
