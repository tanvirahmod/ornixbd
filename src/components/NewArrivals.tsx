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

  const soldOut = Number(product.stock_count) <= 0;

  const discountPct = hasDiscount
    ? Math.round((1 - Number(product.discount_price) / Number(product.price)) * 100)
    : 0;

  return (
    <div className="editorial-product product-card group flex flex-col">
      {/* Image area */}
      <button
        onClick={() => onNavigate('product', productParam(product.title, product.product_code ?? product.id))}
        aria-label={`View ${product.title}`}
        className="editorial-product__media relative overflow-hidden flex-shrink-0"
        style={{ aspectRatio: '3/4' }}
      >
        <img
          src={getCoverImage(product)}
          alt={product.title}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
          loading="lazy"
          onError={(e) => {
            (e.target as HTMLImageElement).src =
              'https://images.pexels.com/photos/5632398/pexels-photo-5632398.jpeg?auto=compress&cs=tinysrgb&w=800';
          }}
        />
        {hasDiscount && (
          <span className="editorial-product__badge absolute top-3 left-3">
            {discountPct}% OFF
          </span>
        )}
        {soldOut && (
          <span className="absolute top-3 right-3 bg-stone-900/85 text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full">
            Sold Out
          </span>
        )}
      </button>

      {/* Info area */}
      <div className="editorial-product__details flex flex-col flex-1">
        {/* Title */}
        <button
          onClick={() => onNavigate('product', productParam(product.title, product.product_code ?? product.id))}
          className="text-left"
        >
          <h3 className="editorial-product__name text-sm font-semibold leading-snug line-clamp-2 transition-colors">
            {product.title}
          </h3>
        </button>

        {/* Pricing */}
        <div className="editorial-product__price flex items-baseline gap-2">
          <span className="font-bold text-base">
            ৳{displayPrice.toFixed(0)}
          </span>
          {hasDiscount && (
            <span className="text-xs text-black/35 line-through">
              ৳{Number(product.price).toFixed(0)}
            </span>
          )}
        </div>

        {/* ADD TO CART button */}
        {soldOut ? (
          <div
            aria-disabled="true"
            className="editorial-product__button editorial-product__button--sold-out mt-auto w-full flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-[0.18em] py-3.5 cursor-not-allowed select-none"
          >
            Sold Out
          </div>
        ) : (
          <button
            onClick={() => onNavigate('product', productParam(product.title, product.product_code ?? product.id))}
            className="editorial-product__button mt-auto w-full flex items-center justify-between gap-2 text-xs font-bold uppercase tracking-[0.18em] transition-all duration-200"
          >
            <span>BUY NOW</span>
            <span className="editorial-product__button-icon">
              <ArrowRight aria-hidden="true" size={14} />
            </span>
          </button>
        )}
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
    <section
      id={!showDiscount && title === 'NEW ARRIVALS' ? 'new-arrivals' : undefined}
      className={`editorial-products py-16 md:py-24 px-4 sm:px-6 ${showDiscount ? 'editorial-products--sale' : ''}`}
      data-watermark={showDiscount ? 'LAST CALL' : 'NEW ARRIVALS'}
    >
      <div className="max-w-7xl mx-auto">
        <div className="editorial-section-heading editorial-products__heading flex items-end justify-between mb-8 md:mb-12">
          <div className="editorial-section-heading__title">
            <p className="editorial-eyebrow mb-3">
              <span>{showDiscount ? '03' : '02'}</span> / {showDiscount ? 'THE LAST CALL' : 'FRESH OFF THE PRESS'}
            </p>
            <h2 className="font-display text-5xl sm:text-6xl md:text-8xl uppercase leading-[0.88]">
              {title}
            </h2>
            <p className="editorial-section-note mt-4">{subtitle}</p>
          </div>
          <button
            onClick={() => onNavigate(viewAllTarget)}
            className="editorial-round-link hidden sm:inline-flex items-center gap-3"
          >
            VIEW ALL <ArrowRight aria-hidden="true" size={16} />
          </button>
        </div>

        {/* Product grid: 4-col desktop, 2-col mobile */}
        <div className="editorial-product-grid grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
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
            className="editorial-round-link mx-auto inline-flex items-center gap-3"
          >
            {showDiscount ? 'VIEW ALL DEALS' : 'VIEW ALL PRODUCTS'} <ArrowRight aria-hidden="true" size={16} />
          </button>
        </div>
      </div>
    </section>
  );
}
