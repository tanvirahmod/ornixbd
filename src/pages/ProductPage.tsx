import { useState, useEffect } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, ShoppingCart, Package, AlertCircle, Truck, ShieldCheck, Check, Sparkles, BellRing, Download, Loader2, MessageCircle } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { supabase, Product } from '../lib/supabase';
import { useLanguage } from '../lib/LanguageContext';
import { useNavigation } from '../lib/navigation';
import { useCart } from '../lib/CartContext';
import { extractProductCode, productParam } from '../lib/utils';
import { setSEO, setJsonLd, SITE_URL, SITE_NAME, DEFAULT_DESCRIPTION, DEFAULT_OG_IMAGE } from '../lib/seo';

const WHATSAPP_NUMBER = '8801410423299'; // 01410423299 without leading 0, with country code

export default function ProductPage() {
  const { t } = useLanguage();
  const { productId: rawParam } = useParams<{ productId: string }>();
  // Extract product_code from the end of the URL param (e.g. "drop-shoulder-tee-prd-00012")
  const productCode = rawParam ? extractProductCode(rawParam) : null;
  const onNavigate = useNavigation();
  const { addItem } = useCart();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [sizeError, setSizeError] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  const [savingImage, setSavingImage] = useState(false);

  useEffect(() => {
    async function fetchProduct() {
      if (!productCode) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('products')
        .select('*, product_images(id, image_url, display_order), categories(id, name, created_at), product_sizes(id, size, quantity)')
        .eq('product_code', productCode)
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
  }, [productCode]);

  useEffect(() => {
    if (!product) return;
    const image = product.product_images?.[0]?.image_url || DEFAULT_OG_IMAGE;
    const title = `${product.title} — Buy Online at ${SITE_NAME}`;
    const description = product.description
      ? `${product.description.slice(0, 160)}...`
      : `Buy ${product.title} at ${SITE_NAME}. ৳${Number(product.price).toFixed(0)}. ${DEFAULT_DESCRIPTION}`;
    const url = `/product/${productParam(product.title, product.product_code ?? product.id)}`;

    setSEO({ title, description, image, url });
    setJsonLd({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.title,
      description: product.description || `Buy ${product.title} at ${SITE_NAME}.`,
      image: product.product_images?.map((img) => img.image_url) ?? [DEFAULT_OG_IMAGE],
      sku: product.product_code ?? product.id,
      brand: { '@type': 'Brand', name: SITE_NAME },
      offers: {
        '@type': 'Offer',
        price: Number(product.discount_price != null && product.discount_price < product.price
          ? product.discount_price
          : product.price).toFixed(2),
        priceCurrency: 'BDT',
        url: `${SITE_URL}${url}`,
        availability: (product.sizes?.length ?? 0) > 0
          ? (product.product_sizes ?? []).some((ps) => ps.quantity > 0)
            ? 'https://schema.org/InStock'
            : 'https://schema.org/OutOfStock'
          : product.stock_count > 0
            ? 'https://schema.org/InStock'
            : 'https://schema.org/OutOfStock',
        itemCondition: 'https://schema.org/NewCondition',
      },
    });
    setJsonLd({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
        ...(product.categories ? [{
          '@type': 'ListItem', position: 2, name: product.categories.name,
          item: `${SITE_URL}/collections/${product.categories.name.toLowerCase().replace(/\s+/g, '-')}`,
        }] : []),
        { '@type': 'ListItem', position: product.categories ? 3 : 2, name: product.title, item: `${SITE_URL}${url}` },
      ],
    }, 'page-breadcrumb-jsonld');
  }, [product]);

  const images =
    product?.product_images && product.product_images.length > 0
      ? product.product_images
      : [{ id: 'placeholder', image_url: 'https://images.pexels.com/photos/5632398/pexels-photo-5632398.jpeg?auto=compress&cs=tinysrgb&w=800', display_order: 0, product_id: '' }];

  const handleAddToCart = () => {
    if (!product) return;
    if (product.sizes && product.sizes.length > 0 && !selectedSize) {
      setSizeError(true);
      return;
    }
    const limit = selectedSize ? selectedSizeStock : product.stock_count;
    const safeQuantity = Math.max(1, Math.min(quantity, Math.max(1, limit)));
    setQuantity(safeQuantity);
    addItem(product, {
      size: selectedSize,
      quantity: safeQuantity,
      imageUrl: images[0]?.image_url ?? null,
    });
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 2000);
  };

  // Pre-filled WhatsApp order message with product name, code, size and direct link
  const handleWhatsAppOrder = () => {
    if (!product) return;
    const link = `${SITE_URL}/product/${productParam(product.title, product.product_code ?? product.id)}`;
    const lines = [
      `Hi ${SITE_NAME}! 👋 I want to order this product:`,
      ``,
      `📦 ${product.title}`,
      product.product_code ? `🔖 Code: ${product.product_code}` : '',
      selectedSize ? `📏 Size: ${selectedSize}` : '',
      `🔢 Quantity: ${quantity}`,
      `🔗 ${link}`,
    ].filter(Boolean);
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(lines.join('\n'))}`;
    window.open(url, '_blank', 'noopener');
  };

  const handleBuyNow = () => {
    if (!product) return;
    if (product.sizes && product.sizes.length > 0 && !selectedSize) {
      setSizeError(true);
      return;
    }
    const limit = selectedSize ? selectedSizeStock : product.stock_count;
    const safeQuantity = Math.max(1, Math.min(quantity, Math.max(1, limit)));
    setQuantity(safeQuantity);
    onNavigate('checkout', `${product.id}__${selectedSize ?? 'none'}__${safeQuantity}`);
  };

  // Download the currently displayed product image to the customer's device
  const handleSaveImage = async () => {
    const url = images[currentImageIndex]?.image_url;
    if (!url || savingImage) return;
    setSavingImage(true);
    const filename = `${product?.product_code || product?.id || 'ornix-product'}-${currentImageIndex + 1}.${(url.split('?')[0].split('.').pop() || 'jpg').toLowerCase().slice(0, 5)}`;
    try {
      // Fetch as blob so the browser downloads the file instead of navigating
      const res = await fetch(url, { mode: 'cors' });
      if (!res.ok) throw new Error('fetch failed');
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } catch {
      // CDN without CORS headers — open in a new tab so the user can save manually
      window.open(url, '_blank', 'noopener');
    } finally {
      setSavingImage(false);
    }
  };

  const prevImage = () => setCurrentImageIndex((i) => (i === 0 ? images.length - 1 : i - 1));
  const nextImage = () => setCurrentImageIndex((i) => (i === images.length - 1 ? 0 : i + 1));

  const getSizeQuantity = (size: string): number => {
    if (!product?.product_sizes) return product?.stock_count ?? 0;
    const match = product.product_sizes.find((ps) => ps.size === size);
    return match ? match.quantity : 0;
  };

  const selectedSizeStock = selectedSize ? getSizeQuantity(selectedSize) : (product?.stock_count ?? 0);
  const maxQuantity = selectedSize ? Math.max(1, selectedSizeStock) : Math.max(1, product?.stock_count ?? 1);
  // Fully out of stock = no total stock (or every size has 0 for sized products)
  const isFullyOutOfStock =
    !!product &&
    (product.sizes && product.sizes.length > 0
      ? (product.product_sizes ?? []).reduce((sum, ps) => sum + ps.quantity, 0) === 0
      : product.stock_count === 0);

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
            <div className="relative aspect-[4/5] md:aspect-[4/5] bg-white rounded-3xl overflow-hidden shadow-md group">
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
              <button
                onClick={handleSaveImage}
                title="Save this image to your device"
                className="absolute top-4 right-4 flex items-center gap-1.5 bg-white/90 hover:bg-white backdrop-blur-sm shadow-md rounded-full px-3.5 py-2 text-xs font-semibold text-stone-700 hover:text-stone-900 transition-all duration-200 hover:scale-105"
              >
                {savingImage
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Download className="w-4 h-4" />}
                {savingImage ? 'Saving...' : 'Save Image'}
              </button>
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
              <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
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
                  {product.sizes.map((size) => {
                    const remaining = getSizeQuantity(size);
                    const isSelected = selectedSize === size;
                    return (
                      <button
                        key={size}
                        onClick={() => { 
                          setSelectedSize(size); 
                          setSizeError(false); 
                          const remaining = getSizeQuantity(size);
                          setQuantity((q) => Math.min(q, Math.max(1, remaining)));
                        }}
                        className={`min-w-[3rem] px-5 py-2.5 rounded-2xl border-2 font-semibold text-sm transition-all duration-200 relative ${
                          isSelected
                            ? 'border-stone-900 bg-stone-900 text-white shadow-md scale-105'
                            : 'border-stone-200 text-stone-700 hover:border-stone-400 hover:bg-stone-50'
                        }`}
                      >
                        {size}
                        <span className={`block text-[10px] font-normal mt-0.5 ${isSelected ? 'text-stone-300' : 'text-stone-400'}`}>
                          {remaining > 0 ? `${remaining} left` : 'Out of stock'}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {selectedSize && (
                  <p className="mt-2 text-xs text-stone-500">
                    {selectedSizeStock > 0
                      ? `${selectedSizeStock} ${selectedSize} available`
                      : `Selected size (${selectedSize}) is out of stock`}
                  </p>
                )}
              </div>
            )}

            {/* Quantity — hidden when the product is fully out of stock */}
            {!isFullyOutOfStock && (
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
                    onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))}
                    disabled={quantity >= maxQuantity}
                    className="w-8 h-8 flex items-center justify-center rounded-full text-lg font-semibold text-stone-700 disabled:text-stone-300 disabled:cursor-not-allowed hover:bg-stone-100"
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>
              </div>
              <p className="mt-2 text-xs text-stone-500">
                {selectedSize
                  ? `${selectedSizeStock} ${selectedSize} available`
                  : product.stock_count > 0
                    ? `${product.stock_count} available in stock`
                    : 'Out of stock'}
              </p>
            </div>
            )}

            {/* Fully out of stock notice */}
            {isFullyOutOfStock ? (
              <div className="relative overflow-hidden rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 p-6 text-center">
                <div className="absolute -top-8 -right-8 w-28 h-28 bg-amber-200/40 rounded-full blur-2xl" />
                <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-rose-200/40 rounded-full blur-2xl" />
                <div className="relative">
                  <div className="w-14 h-14 mx-auto mb-4 bg-white shadow-md rounded-full flex items-center justify-center">
                    <Sparkles className="w-7 h-7 text-amber-500" />
                  </div>
                  <h3 className="font-display text-xl font-bold text-stone-900 mb-2">
                    {t('productUnavailableTitle')}
                  </h3>
                  <p className="text-sm text-stone-600 leading-relaxed max-w-md mx-auto mb-3">
                    {t('productUnavailableBody')}
                  </p>
                  <p className="text-sm font-semibold text-brand-600 flex items-center justify-center gap-1.5">
                    <BellRing className="w-4 h-4" />
                    {t('productUnavailableThanks')}
                  </p>
                </div>
              </div>
            ) : (
            <>
            {/* Add to Cart / Buy Now */}
            <div className="mt-auto pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={handleAddToCart}
                  disabled={product.stock_count === 0 || (selectedSize !== null && selectedSizeStock === 0)}
                  className={`flex items-center justify-center gap-2 border-2 font-bold py-4 rounded-2xl text-base transition-all duration-200 disabled:border-stone-200 disabled:text-stone-400 disabled:cursor-not-allowed ${
                    justAdded
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                      : 'border-stone-900 text-stone-900 hover:bg-stone-900 hover:text-white'
                  }`}
                >
                  {justAdded ? <Check className="w-5 h-5" /> : <ShoppingCart className="w-5 h-5" />}
                  {justAdded
                    ? t('addedToCart')
                    : product.stock_count === 0 || (selectedSize && selectedSizeStock === 0)
                      ? t('outOfStock')
                      : t('addToCartButton')}
                </button>
                <button
                  onClick={handleBuyNow}
                  disabled={product.stock_count === 0 || (selectedSize !== null && selectedSizeStock === 0)}
                  className="flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-400 disabled:bg-stone-200 disabled:text-stone-400 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl text-base transition-all duration-200 hover:shadow-xl hover:shadow-brand-500/30 hover:-translate-y-0.5 active:translate-y-0"
                >
                  <ShoppingCart className="w-5 h-5" />
                  {product.stock_count === 0 || (selectedSize && selectedSizeStock === 0)
                    ? t('outOfStock')
                    : t('addToCart', {
                        price: (product.discount_price != null && product.discount_price < product.price
                          ? Number(product.discount_price) * quantity
                          : Number(product.price) * quantity).toFixed(0),
                      })}
                </button>
              </div>
              <button
                onClick={handleWhatsAppOrder}
                className="mt-3 w-full flex items-center justify-center gap-2 border-2 border-emerald-600 text-emerald-700 hover:bg-emerald-600 hover:text-white font-bold py-3.5 rounded-2xl text-base transition-all duration-200 hover:shadow-lg hover:shadow-emerald-500/25"
              >
                <MessageCircle className="w-5 h-5" />
                {t('orderOnWhatsApp')}
              </button>
              <div className="flex items-center justify-center gap-6 mt-4 text-xs text-stone-400">
                <span className="flex items-center gap-1.5"><Truck className="w-4 h-4" /> {t('deliveryAcrossBd')}</span>
                <span className="flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" /> {t('qualityAssuredShort')}</span>
              </div>
            </div>
            </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
