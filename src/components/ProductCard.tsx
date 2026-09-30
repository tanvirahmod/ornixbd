import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Product } from '../lib/supabase';
import { productParam, getCoverImage, COVER_FALLBACK } from '../lib/utils';

interface ProductCardProps {
  product: Product;
}

export default function ProductCard({ product }: ProductCardProps) {
  const hasDiscount = product.discount_price != null && Number(product.discount_price) < Number(product.price);
  const price = hasDiscount ? Number(product.discount_price) : Number(product.price);
  const soldOut = Number(product.stock_count) <= 0;
  const href = `/product/${productParam(product.title, product.product_code ?? product.id)}`;

  return (
    <article className="store-product-card product-card group bg-white overflow-hidden">
      <Link to={href} className="block">
        <div className="store-product-card__media aspect-[3/4] bg-stone-100 overflow-hidden relative">
          <img
            src={getCoverImage(product)}
            alt={product.title}
            className={`w-full h-full object-cover hover:scale-105 transition-transform duration-500 ${soldOut ? 'opacity-60' : ''}`}
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).src = COVER_FALLBACK;
            }}
          />
          {hasDiscount && (
            <span className="absolute top-3 left-3 bg-sale text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-1">
              {Math.round((1 - Number(product.discount_price) / Number(product.price)) * 100)}% OFF
            </span>
          )}
          {soldOut && (
            <span className={`absolute top-3 ${hasDiscount ? 'right-3' : 'left-3'} bg-stone-900/85 text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full`}>
              Sold Out
            </span>
          )}
        </div>
      </Link>
      <div className="store-product-card__details p-4">
        <Link to={href} className="block mb-3">
          <h3 className="store-product-card__title text-sm font-semibold text-stone-900 leading-tight line-clamp-2 hover:text-sale transition-colors">
            {product.title}
          </h3>
        </Link>
        <div className="store-product-card__price flex items-center gap-3 mb-4">
          {hasDiscount ? (
            <>
              <span className="text-sm text-stone-400 line-through">
                ৳{Number(product.price).toFixed(0)}
              </span>
              <span className="font-display font-bold text-sale text-xl">
                ৳{price.toFixed(0)}
              </span>
            </>
          ) : (
            <span className="font-display font-bold text-stone-900 text-xl">
              ৳{price.toFixed(0)}
            </span>
          )}
        </div>
        {soldOut ? (
          <div
            aria-disabled="true"
            className="store-product-card__action w-full flex items-center justify-center bg-stone-200 text-stone-500 font-bold py-3 rounded-xl text-xs uppercase tracking-[0.2em] cursor-not-allowed select-none"
          >
            Sold Out
          </div>
        ) : (
          <Link
            to={href}
            className="store-product-card__action w-full flex items-center justify-between bg-black text-white font-bold py-3 rounded-xl text-xs uppercase tracking-[0.2em] hover:bg-stone-800 transition-colors"
          >
            <span>BUY NOW</span>
            <span className="editorial-product__button-icon">
              <ArrowRight aria-hidden="true" size={14} />
            </span>
          </Link>
        )}
      </div>
      </article>
  );
}
