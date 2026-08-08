import { useState, useEffect } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, ShoppingCart, Package, AlertCircle, Truck, ShieldCheck } from 'lucide-react';
import { supabase, Product } from '../lib/supabase';
import { useLanguage } from '../lib/LanguageContext';

interface ProductPageProps {
  productId: string;
  onNavigate: (page: string, productId?: string) => void;
}

export default function ProductPage({ productId, onNavigate }: ProductPageProps) {
  const { t } = useLanguage();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [sizeError, setSizeError] = useState(false);

  useEffect(() => {
    async function fetchProduct() {
      const { data, error } = await supabase
        .from('products')
        .select('*, product_images(id, image_url, display_order)')
        .eq('id', productId)
        .maybeSingle();

      if (!error && data) {
        const sorted = {
          ...data,
          product_images: (data.product_images as Product['product_images'])?.sort(
            (a, b) => a.display_order - b.display_order
          ),
        };
        setProduct(sorted);
      }
      setLoading(false);
    }
    fetchProduct();
  }, [productId]);

  const images =
    product?.product_images && product.product_images.length > 0
      ? product.product_images
      : [{ id: 'placeholder', image_url: 'https://images.pexels.com/photos/5632398/pexels-photo-5632398.jpeg?auto=compress&cs=tinysrgb&w=800', display_order: 0, product_id: '' }];

  const handleBuyNow = () => {
    if (product?.sizes && product.sizes.length > 0 && !selectedSize) {
      setSizeError(true);
      return;
    }
    const safeQuantity = Math.max(1, Math.min(quantity, Math.max(1, product?.stock_count ?? 1)));
    onNavigate('checkout', `${productId}__${selectedSize ?? 'none'}__${safeQuantity}`);
  };

  const prevImage = () => setCurrentImageIndex((i) => (i === 0 ? images.length - 1 : i - 1));
  const nextImage = () => setCurrentImageIndex((i) => (i === images.length - 1 ? 0 : i + 1));

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="animate-spin w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center gap-4">
        <Package className="w-16 h-16 text-stone-300" />
        <p className="text-stone-500">{t('productNotFound')}</p>
        <button onClick={() => onNavigate('home')} className="text-brand-600 hover:underline font-medium">
          {t('backToHome')}
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Breadcrumb */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-0 flex items-center gap-2 text-sm text-stone-500">
        <button onClick={() => onNavigate('home')} className="flex items-center gap-1 hover:text-stone-900 transition-colors">
          <ArrowLeft className="w-4 h-4" /> {t('homeBreadcrumb')}
        </button>
        <span className="text-stone-300">/</span>
        <span className="truncate text-stone-700 font-medium">{product.title}</span>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 md:py-10">
        <div className="grid md:grid-cols-2 gap-8 lg:gap-16">
          {/* Image Gallery */}
          <div className="space-y-4">
            <div className="relative aspect-[4/5] sm:aspect-square bg-white rounded-3xl overflow-hidden shadow-md group">
              <img
                src={images[currentImageIndex].image_url}
                alt={product.title}
                className="w-full h-full object-cover transition-opacity duration-300"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    'https://images.pexels.com/photos/5632398/pexels-photo-5632398.jpeg?auto=compress&cs=tinysrgb&w=800';
                }}
              />
              {product.product_code && (
                <span className="absolute top-4 left-4 bg-stone-900/85 backdrop-blur-sm text-white text-xs font-mono font-semibold px-3 py-1.5 rounded-full shadow-sm">
                  {product.product_code}
                </span>
              )}
              {images.length > 1 && (
                <>
                  <button
                    onClick={prevImage}
                    className="absolute left-3 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white shadow-md rounded-full p-2 opacity-0 group-hover:opacity-100 transition-all duration-200 hover:scale-110"
                  >
                    <ChevronLeft className="w-5 h-5 text-stone-700" />
                  </button>
                  <button
                    onClick={nextImage}
                    className="absolute right-3 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white shadow-md rounded-full p-2 opacity-0 group-hover:opacity-100 transition-all duration-200 hover:scale-110"
                  >
                    <ChevronRight className="w-5 h-5 text-stone-700" />
                  </button>
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
                    {images.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setCurrentImageIndex(i)}
                        className={`h-2 rounded-full transition-all duration-300 ${i === currentImageIndex ? 'bg-white w-6' : 'bg-white/50 w-2'}`}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Thumbnails */}
            {images.length > 1 && (
              <div className="flex gap-3 overflow-x-auto pb-1">
                {images.map((img, i) => (
                  <button
                    key={img.id}
                    onClick={() => setCurrentImageIndex(i)}
                    className={`flex-shrink-0 w-16 h-16 rounded-2xl overflow-hidden border-2 transition-all duration-200 ${
                      i === currentImageIndex ? 'border-brand-500 shadow-md' : 'border-transparent opacity-60 hover:opacity-100'
                    }`}
                  >
                    <img src={img.image_url} alt="" className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src =
                          'https://images.pexels.com/photos/5632398/pexels-photo-5632398.jpeg?auto=compress&cs=tinysrgb&w=400';
                      }}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Product Info */}
          <div className="flex flex-col gap-6">
            <div>
              {product.categories && (
                <span className="inline-block text-brand-600 text-sm font-semibold mb-2">
                  {product.categories.name}
                </span>
              )}
              <h1 className="font-display text-2xl md:text-4xl font-bold text-stone-900 leading-tight mb-4 tracking-tight">
                {product.title}
              </h1>
              <div className="flex items-center gap-4 flex-wrap">
                {product.discount_price != null && product.discount_price < product.price ? (
                  <>
                    <span className="font-display text-2xl md:text-3xl font-bold text-brand-600">
                      ৳{Number(product.discount_price).toFixed(0)}
                    </span>
                    <span className="font-display text-xl md:text-2xl font-medium text-stone-400 line-through">
                      ৳{Number(product.price).toFixed(0)}
                    </span>
                    <span className="text-sm font-bold text-white bg-brand-500 px-2.5 py-1 rounded-full">
                      {Math.round((1 - Number(product.discount_price) / Number(product.price)) * 100)}% OFF
                    </span>
                  </>
                ) : (
                  <span className="font-display text-3xl md:text-4xl font-bold text-stone-900">
                    ৳{Number(product.price).toFixed(0)}
                  </span>
                )}
                {product.stock_count > 0 ? (
                  <span className={`text-sm font-medium px-3 py-1.5 rounded-full ${
                    product.stock_count <= 5
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  }`}>
                    {product.stock_count <= 5
                      ? t('onlyLeft', { count: product.stock_count })
                      : t('inStock', { count: product.stock_count })}
                  </span>
                ) : (
                  <span className="text-sm font-medium px-3 py-1.5 rounded-full bg-red-50 text-red-600 border border-red-200">
                    {t('outOfStock')}
                  </span>
                )}
              </div>
            </div>

            {/* Description */}
            {product.description && (
              <div>
                <h3 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-2">{t('productPageDescriptionTitle')}</h3>
                <p className="text-stone-700 leading-relaxed whitespace-pre-line">{product.description}</p>
              </div>
            )}

            {/* Sizes */}
            {product.sizes && product.sizes.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-stone-400 uppercase tracking-wider">{t('selectSize')}</h3>
                  {sizeError && (
                    <span className="flex items-center gap-1 text-xs text-red-500">
                      <AlertCircle className="w-3 h-3" /> {t('selectSize')}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2.5">
                  {product.sizes.map((size) => (
                    <button
                      key={size}
                      onClick={() => { setSelectedSize(size); setSizeError(false); }}
                      className={`min-w-[3rem] px-5 py-2.5 rounded-2xl border-2 font-semibold text-sm transition-all duration-200 ${
                        selectedSize === size
                          ? 'border-stone-900 bg-stone-900 text-white shadow-md scale-105'
                          : 'border-stone-200 text-stone-700 hover:border-stone-400 hover:bg-stone-50'
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quantity */}
            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-stone-700">Quantity</span>
                <div className="inline-flex items-center gap-3 rounded-full border border-stone-200 bg-white px-2 py-1.5 shadow-sm">
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    disabled={quantity <= 1}
                    className="w-8 h-8 flex items-center justify-center rounded-full text-lg font-semibold text-stone-700 disabled:text-stone-300 disabled:cursor-not-allowed hover:bg-stone-100"
                    aria-label="Decrease quantity"
                  >
                    −
                  </button>
                  <span className="min-w-[2rem] text-center font-semibold text-stone-900">{quantity}</span>
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.min(product.stock_count, q + 1))}
                    disabled={quantity >= product.stock_count}
                    className="w-8 h-8 flex items-center justify-center rounded-full text-lg font-semibold text-stone-700 disabled:text-stone-300 disabled:cursor-not-allowed hover:bg-stone-100"
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>
              </div>
              <p className="mt-2 text-xs text-stone-500">
                {product.stock_count > 0 ? `${product.stock_count} available in stock` : 'Out of stock'}
              </p>
            </div>

            {/* Buy Now */}
            <div className="mt-auto pt-2">
              <button
                onClick={handleBuyNow}
                disabled={product.stock_count === 0}
                className="w-full flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-400 disabled:bg-stone-200 disabled:text-stone-400 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl text-base transition-all duration-200 hover:shadow-xl hover:shadow-brand-500/30 hover:-translate-y-0.5 active:translate-y-0"
              >
                <ShoppingCart className="w-5 h-5" />
                {product.stock_count === 0
                  ? t('outOfStock')
                  : t('addToCart', {
                      price: (product.discount_price != null && product.discount_price < product.price
                        ? Number(product.discount_price) * quantity
                        : Number(product.price) * quantity).toFixed(0),
                    })}
              </button>
              <div className="flex items-center justify-center gap-6 mt-4 text-xs text-stone-400">
                <span className="flex items-center gap-1.5"><Truck className="w-4 h-4" /> {t('deliveryAcrossBd')}</span>
                <span className="flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" /> {t('qualityAssuredShort')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
