import { Link } from 'react-router-dom';
import { Product } from '../lib/supabase';
import { productParam, getCoverImage, COVER_FALLBACK } from '../lib/utils';

interface ProductCardProps {
  product: Product;
}

export default function ProductCard({ product }: ProductCardProps) {
  const hasDiscount = product.discount_price != null && Number(product.discount_price) < Number(product.price);
  const price = hasDiscount ? Number(product.discount_price) : Number(product.price);
  const href = `/product/${productParam(product.title, product.product_code ?? product.id)}`;

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-stone-100 overflow-hidden">
      <Link to={href} className="block">
        <div className="aspect-[3/4] bg-stone-100 overflow-hidden">
          <img
            src={getCoverImage(product)}
            alt={product.title}
            className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).src = COVER_FALLBACK;
            }}
          />
        </div>
      </Link>
      <div className="p-4">
        <h3 className="text-sm font-semibold text-stone-900 leading-tight line-clamp-2 mb-3 h-10">
          {product.title}
        </h3>
        <div className="flex items-center gap-3 mb-4">
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
        <Link
          to={href}
          className="w-full flex items-center justify-center bg-black text-white font-bold py-3 rounded-xl text-xs uppercase tracking-[0.2em] hover:bg-stone-800 transition-colors"
        >
          ADD TO CART
        </Link>
      </div>
    </div>
  );
}
