import { ArrowRight } from 'lucide-react';
import { Product } from '../lib/supabase';
import { productParam } from '../lib/utils';

interface NewArrivalsProps {
  products: Product[];
  loading: boolean;
  onNavigate: (page: string, productId?: string) => void;
  title?: string;
  subtitle?: string;
  showDiscount?: boolean;
}

function getCoverImage(product: Product): string {
  if (product.product_images && product.product_images.length > 0) {
    return product.product_images[0].image_url;
  }
  return 'https://images.pexels.com/photos/5632398/pexels-photo-5632398.jpeg?auto=compress&cs=tinysrgb&w=800';
}

function ProductCard({
  product,
  onNavigate,
}: {
  product: Product;
  onNavigate: (page: string, id?: string) => void;
}) {
  const hasDiscount =
    product.discount_price != null &&
    Number(product.discount_price) < Number(product.price);

  const displayPrice = hasDiscount
    ? Number(product.discount_price)
    : Number(product.price);

  const discountPct = hasDiscount
    ? Math.round((1 - Number(product.discount_price) / Number(product.price)) * 100)
    : 0;

  return (
    <div className="product-card group flex flex-col bg-white">
      {/* Image area */}
      <button
      onClick={() => onNavigate('product', productParam(product.title, product.product_code ?? product.id))}
      className="relative overflow-hidden bg-street-beige flex-shrink-0"
        style={{ aspectRatio: '3/4' }}
      >
        <img
          src={getCoverImage(product)}
          alt={product.title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
          onError={(e) => {
            (e.target as HTMLImageElement).src =
              'https://images.pexels.com/photos/5632398/pexels-photo-5632398.jpeg?auto=compress&cs=tinysrgb&w=800';
          }}
        />
        {hasDiscount && (
          <span className="absolute top-3 left-3 bg-[#D90429] text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-1">
            {discountPct}% OFF
          </span>
        )}
      </button>

      {/* Info area */}
      <div className="p-4 flex flex-col flex-1">
        {/* Title */}
        <button
      onClick={() => onNavigate('product', productParam(product.title, product.product_code ?? product.id))}
      className="text-left"
        >
          <h3 className="text-sm font-semibold text-black leading-snug line-clamp-2 mb-3 hover:text-[#D90429] transition-colors">
            {product.title}
          </h3>
        </button>

        {/* Pricing */}
        <div className="flex items-baseline gap-2 mb-4">
          <span className="text-[#D90429] font-bold text-base">
            ৳{displayPrice.toFixed(0)}{' '}
            <span className="text-xs font-semibold text-black/40">BDT</span>
          </span>
          {hasDiscount && (
            <span className="text-xs text-black/35 line-through">
              ৳{Number(product.price).toFixed(0)}
            </span>
          )}
        </div>

        {/* ADD TO CART button */}
        <button
        onClick={() => onNavigate('product', productParam(product.title, product.product_code ?? product.id))}
        className="mt-auto w-full flex items-center justify-center gap-2 bg-black text-white text-xs font-bold uppercase tracking-[0.18em] py-3.5 hover:bg-[#D90429] transition-all duration-200"
        >
            BUY NOW
        </button>
      </div>
    </div>
  );
}

export default function NewArrivals({
  products,
  loading,
  onNavigate,
  title = 'NEW ARRIVALS',
  subtitle = 'Fresh drops updated weekly — get yours before they sell out.',
  showDiscount = false,
}: NewArrivalsProps) {
  const viewAllTarget = showDiscount ? 'hot-deals' : 'new-arrivals';

  return (
    <section className="bg-white py-14 md:py-20 px-4 sm:px-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-end justify-between mb-8 md:mb-10">
          <div>
            {showDiscount && (
              <p className="text-xs font-bold tracking-[0.3em] uppercase text-[#D90429] mb-2">
                Limited time offers
              </p>
            )}
            {!showDiscount && (
              <p className="text-xs font-bold tracking-[0.3em] uppercase text-[#D90429] mb-2">
                Just dropped
              </p>
            )}
            <h2 className="font-display text-4xl sm:text-5xl md:text-6xl text-black uppercase tracking-wide leading-none">
              {title}
            </h2>
            <p className="text-sm text-black/50 mt-2 font-medium">{subtitle}</p>
          </div>
          <button
            onClick={() => onNavigate(viewAllTarget)}
            className="hidden sm:inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.15em] text-black hover:text-[#D90429] transition-colors border-b-2 border-black hover:border-[#D90429] pb-0.5"
          >
            VIEW ALL <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Product grid: 4-col desktop, 2-col mobile */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="aspect-[3/4] skeleton" />
              ))
            : products.length > 0
            ? products.slice(0, 8).map((product, index) => (
                <ProductCard
                  key={`${product.id}-${index}`}
                  product={product}
                  onNavigate={onNavigate}
                />
              ))
            : (
              <div className="col-span-full py-12 text-center text-black/40 font-medium">
                No products available yet. Check back soon.
              </div>
            )}
        </div>

        {/* Mobile view all */}
        <div className="sm:hidden mt-8 text-center">
          <button
            onClick={() => onNavigate(viewAllTarget)}
            className="btn-black px-10 py-4"
          >
            {showDiscount ? 'VIEW ALL DEALS' : 'VIEW ALL PRODUCTS'}
          </button>
        </div>
      </div>
    </section>
  );
}
