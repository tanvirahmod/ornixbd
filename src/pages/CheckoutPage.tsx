import { useState, useEffect } from 'react';
import { ArrowLeft, CheckCircle, Loader2, User, Phone, MapPin, Wallet, Hash, ShieldCheck, ShoppingBag } from 'lucide-react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase, Product } from '../lib/supabase';
import { useLanguage } from '../lib/LanguageContext';
import { useNavigation } from '../lib/navigation';
import { useCart, CartItem } from '../lib/CartContext';
import { productParam, COVER_FALLBACK } from '../lib/utils';
import { setSEO, SITE_NAME } from '../lib/seo';

export default function CheckoutPage() {
  const { t } = useLanguage();
  const { productId } = useParams<{ productId: string }>();
  const [searchParams] = useSearchParams();
  const isCartCheckout = productId === 'cart';
  const selectedSize = searchParams.get('size');
  const selectedQuantity = Number(searchParams.get('qty') ?? 1);
  const onNavigate = useNavigation();
  const { items: cartItems, clearCart } = useCart();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [placedItems, setPlacedItems] = useState<CartItem[]>([]);

  const [form, setForm] = useState({
    name: '',
    phone: '',
    address: '',
    bkashNumber: '',
    trxId: '',
  });
  const [errors, setErrors] = useState({ name: '', phone: '', address: '', bkashNumber: '', trxId: '' });

  useEffect(() => {
    setSEO({
      title: `Checkout — ${SITE_NAME}`,
      url: productId ? `/checkout/${productId}` : '/checkout',
      description: 'Complete your order — cash on delivery available, nationwide shipping across Bangladesh.',
    });
  }, [productId]);

  const safeQuantity = Math.max(1, Math.min(Number(selectedQuantity) || 1, Math.max(1, product?.stock_count ?? 1)));
  const unitPrice = product
    ? (product.discount_price != null && product.discount_price < product.price ? Number(product.discount_price) : Number(product.price))
    : 0;
  const cartSubtotal = cartItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const subtotal = isCartCheckout ? cartSubtotal : unitPrice * safeQuantity;
  const deliveryFee = 150;
  const total = subtotal + deliveryFee;

  useEffect(() => {
    async function fetchProduct() {
      if (isCartCheckout) {
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from('products')
        .select('*, product_images(id, image_url, display_order)')
        .eq('id', productId)
        .maybeSingle();
      if (!error && data) setProduct(data);
      setLoading(false);
    }
    fetchProduct();
  }, [productId, isCartCheckout]);

  const validate = () => {
    const next = { name: '', phone: '', address: '', bkashNumber: '', trxId: '' };
    const phonePattern = /^[\p{Nd}\s+\-()]{7,}$/u;
    const bkashPattern = /^[\p{Nd}\s+\-()]{10,}$/u;

    if (!form.name.trim()) next.name = t('fullNameRequired');
    if (!form.phone.trim()) next.phone = t('phoneRequired');
    else if (!phonePattern.test(form.phone.trim())) next.phone = t('phoneInvalid');
    if (!form.address.trim()) next.address = t('addressRequired');
    if (!form.bkashNumber.trim()) next.bkashNumber = t('bkashNumberRequired');
    else if (!bkashPattern.test(form.bkashNumber.trim())) next.bkashNumber = t('bkashNumberInvalid');
    if (!form.trxId.trim()) next.trxId = t('trxIdRequired');
    setErrors(next);
    return !Object.values(next).some(Boolean);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setError('');

    const finalQuantity = Math.max(1, Math.min(Number(selectedQuantity) || 1, Math.max(1, product?.stock_count ?? 1)));

    // Build one order row per line item (cart checkout inserts all items; single-product inserts one)
    const lineItems: Array<{
      productId: string;
      title: string;
      code: string | null;
      size: string | null;
      quantity: number;
    }> = isCartCheckout
      ? cartItems.map((item) => ({
          productId: item.productId,
          title: item.title,
          code: item.productCode,
          size: item.size,
          quantity: item.quantity,
        }))
      : [
          {
            productId: productId!,
            title: product?.title ?? '',
            code: product?.product_code ?? null,
            size: selectedSize && selectedSize !== 'none' ? selectedSize : null,
            quantity: finalQuantity,
          },
        ];

    const customer = {
      customer_name: form.name.trim(),
      customer_phone: form.phone.trim(),
      customer_address: form.address.trim(),
      bkash_number: form.bkashNumber.trim(),
      trx_id: form.trxId.trim(),
    };

    // Fall back to progressively fewer columns for older schemas
    const payloadCandidates = lineItems.map((item) => [
      {
        product_id: item.productId,
        product_title: item.title,
        product_code: item.code,
        selected_size: item.size,
        quantity: item.quantity,
        ...customer,
      },
      {
        product_id: item.productId,
        product_title: item.title,
        product_code: item.code,
        selected_size: item.size,
        ...customer,
      },
      {
        product_id: item.productId,
        product_title: item.title,
        selected_size: item.size,
        ...customer,
      },
      {
        product_id: item.productId,
        product_title: item.title,
        ...customer,
      },
    ]);

    let submitError: { message: string } | null = null;
    for (let i = 0; i < lineItems.length; i++) {
      let itemError: { message: string } | null = null;
      for (const payload of payloadCandidates[i]) {
        const response = await supabase.from('orders').insert(payload);
        if (!response.error) {
          itemError = null;
          break;
        }
        itemError = response.error;
        const message = response.error.message.toLowerCase();
        const isSchemaMismatch = message.includes('does not exist') || message.includes('column') || message.includes('not found') || message.includes('unknown');
        if (!isSchemaMismatch) break;
      }
      if (itemError) {
        submitError = itemError;
        break;
      }
    }

    if (submitError) {
      setError(t('somethingWentWrong'));
      setSubmitting(false);
      return;
    }

    // Decrement stock for each ordered line item
    for (const item of lineItems) {
      const { data: currentProduct } = await supabase
        .from('products')
        .select('stock_count')
        .eq('id', item.productId)
        .maybeSingle();
      const newStock = Math.max(0, (currentProduct?.stock_count ?? 0) - item.quantity);
      await supabase.from('products').update({ stock_count: newStock }).eq('id', item.productId);

      if (item.size) {
        const { data: currentSize } = await supabase
          .from('product_sizes')
          .select('quantity')
          .eq('product_id', item.productId)
          .eq('size', item.size)
          .maybeSingle();
        const newSizeQty = Math.max(0, (currentSize?.quantity ?? 0) - item.quantity);
        await supabase.from('product_sizes').update({ quantity: newSizeQty }).eq('product_id', item.productId).eq('size', item.size);
      }
    }

    setPlacedItems(isCartCheckout ? [...cartItems] : []);
    if (isCartCheckout) clearCart();
    setSuccess(true);
    setSubmitting(false);
  };

  const coverImage =
    product?.product_images && product.product_images.length > 0
      ? product.product_images.sort((a, b) => a.display_order - b.display_order)[0].image_url
      : 'https://images.pexels.com/photos/5632398/pexels-photo-5632398.jpeg?auto=compress&cs=tinysrgb&w=400';

  const summaryLines: Array<{ key: string; title: string; code: string | null; size: string | null; quantity: number; imageUrl: string | null }> =
    isCartCheckout
      ? cartItems.map((item) => ({
          key: `${item.productId}__${item.size ?? 'none'}`,
          title: item.title,
          code: item.productCode,
          size: item.size,
          quantity: item.quantity,
          imageUrl: item.imageUrl,
        }))
      : product
        ? [
            {
              key: product.id,
              title: product.title,
              code: product.product_code ?? null,
              size: selectedSize && selectedSize !== 'none' ? selectedSize : null,
              quantity: safeQuantity,
              imageUrl: coverImage,
            },
          ]
        : [];

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="animate-spin w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-3xl shadow-xl p-10 max-w-md w-full text-center animate-fade-in-up">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-emerald-500" />
          </div>
          <h2 className="font-display text-2xl font-bold text-stone-900 mb-2">{t('orderPlaced')}</h2>
          {placedItems.length > 0 && (
            <p className="text-stone-500 text-sm mb-2">
              {t('itemsCountMany', { count: placedItems.reduce((sum, item) => sum + item.quantity, 0) })} {t('orderPlacedSuffix')}
            </p>
          )}
          <p className="text-stone-500 mb-2">{t('thankYou', { name: form.name })}</p>
          <p className="text-stone-400 text-sm mb-8">{t('weWillContact', { phone: form.phone })}</p>
          <button
            onClick={() => onNavigate('home')}
            className="w-full bg-stone-900 hover:bg-stone-800 text-white font-bold py-3.5 rounded-2xl transition-all hover:shadow-lg"
          >
            {t('continueShopping')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="max-w-3xl mx-auto px-4 pt-6 flex items-center gap-2 text-sm text-stone-500">
        <button onClick={() => onNavigate('product', product ? productParam(product.title, product.product_code ?? product.id) : '')} className="flex items-center gap-1 hover:text-stone-900 transition-colors">
          <ArrowLeft className="w-4 h-4" /> {t('backToProduct')}
        </button>
        <span className="text-stone-300">/</span>
        <span className="text-stone-700 font-medium">{t('checkout')}</span>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 md:py-10">
        <h1 className="font-display text-2xl md:text-3xl font-bold text-stone-900 mb-8 tracking-tight">{t('completeYourOrder')}</h1>

        <div className="grid md:grid-cols-5 gap-6 lg:gap-10">
          {/* Order Summary */}
          <div className="md:col-span-2">
            <div className="bg-white rounded-3xl shadow-sm border border-stone-100 p-5 sticky top-20">
              <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-4">{t('orderSummary')}</h2>
              {isCartCheckout && summaryLines.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-stone-400">
                  <ShoppingBag className="w-8 h-8" />
                  <p className="text-sm">{t('cartEmpty')}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {summaryLines.map((line) => (
                    <div key={line.key} className="flex gap-3">
                      <div className="w-16 h-16 rounded-2xl overflow-hidden bg-stone-100 flex-shrink-0">
                        <img src={line.imageUrl ?? COVER_FALLBACK} alt={line.title} className="w-full h-full object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).src = COVER_FALLBACK; }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-stone-900 text-sm leading-snug line-clamp-2">{line.title}</p>
                        {line.code && (
                          <p className="text-[11px] font-mono text-stone-400 mt-0.5">{line.code}</p>
                        )}
                        {line.size && (
                          <p className="text-xs text-stone-500 mt-1">{t('sizeLabel')}: <span className="font-medium text-stone-700">{line.size}</span></p>
                        )}
                        <p className="text-xs text-stone-500 mt-1">{t('qtyLabel')}: <span className="font-medium text-stone-700">{line.quantity}</span></p>
                      </div>
                    </div>
                  ))}
                </div>
              )}              <div className="border-t border-stone-100 mt-5 pt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-stone-500">{t('productPrice')}</span>
                  <span className="font-medium text-stone-700">
                    ৳{unitPrice.toFixed(0)} × {safeQuantity}
                  </span>
                </div>
                {product?.discount_price != null && product.discount_price < product.price && (
                  <div className="flex justify-between text-sm">
                    <span className="text-stone-500">{t('discount')}</span>
                    <span className="font-medium text-brand-600">−৳{(Number(product.price) - Number(product.discount_price)).toFixed(0)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-stone-500">{t('deliveryFee')}</span>
                  <span className="font-medium text-stone-700">৳{deliveryFee}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-stone-100">
                  <span className="font-semibold text-stone-900">{t('totalToPay')}</span>
                  <span className="font-display font-bold text-stone-900 text-lg">
                    ৳{total.toFixed(0)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Form */}
          <div className="md:col-span-3">
            <form onSubmit={handleSubmit} className="bg-white rounded-3xl shadow-sm border border-stone-100 p-6 space-y-5">
              <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-2">{t('yourDetails')}</h2>

              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">
                  <span className="flex items-center gap-1.5"><User className="w-4 h-4" /> {t('fullName')}</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => { setForm({ ...form, name: e.target.value }); setErrors({ ...errors, name: '' }); }}
                  placeholder={t('fullName')}
                  className={`w-full border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 transition-all ${errors.name ? 'border-red-400 bg-red-50' : 'border-stone-200'}`}
                />
                {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">
                  <span className="flex items-center gap-1.5"><Phone className="w-4 h-4" /> {t('phoneNumber')}</span>
                </label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => { setForm({ ...form, phone: e.target.value }); setErrors({ ...errors, phone: '' }); }}
                  placeholder="01XXXXXXXXX"
                  className={`w-full border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 transition-all ${errors.phone ? 'border-red-400 bg-red-50' : 'border-stone-200'}`}
                />
                {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">
                  <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4" /> {t('deliveryAddress')}</span>
                </label>
                <textarea
                  value={form.address}
                  onChange={(e) => { setForm({ ...form, address: e.target.value }); setErrors({ ...errors, address: '' }); }}
                  placeholder={t('deliveryAddress')}
                  rows={3}
                  className={`w-full border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 transition-all resize-none ${errors.address ? 'border-red-400 bg-red-50' : 'border-stone-200'}`}
                />
                {errors.address && <p className="text-xs text-red-500 mt-1">{errors.address}</p>}
              </div>

              {/* bKash Payment Section */}
              <div className="pt-2">
                <div className="bg-gradient-to-br from-pink-50 to-rose-50 border border-pink-200 rounded-2xl p-4 mb-5">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 bg-pink-500 rounded-lg flex items-center justify-center">
                      <Wallet className="w-4 h-4 text-white" />
                    </div>
                    <h3 className="font-bold text-stone-800 text-sm">{t('bkashPaymentHeading')}</h3>
                  </div>
                  <p className="text-sm text-stone-600 leading-relaxed">
                    {t('bkashPaymentInstruction', { bkashNumber: '01700-000000' })}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">
                  <span className="flex items-center gap-1.5"><Wallet className="w-4 h-4" /> {t('yourBkashNumber')}</span>
                </label>
                <input
                  type="tel"
                  value={form.bkashNumber}
                  onChange={(e) => { setForm({ ...form, bkashNumber: e.target.value }); setErrors({ ...errors, bkashNumber: '' }); }}
                  placeholder="01XXXXXXXXX"
                  className={`w-full border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 transition-all ${errors.bkashNumber ? 'border-red-400 bg-red-50' : 'border-stone-200'}`}
                />
                {errors.bkashNumber && <p className="text-xs text-red-500 mt-1">{errors.bkashNumber}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">
                  <span className="flex items-center gap-1.5"><Hash className="w-4 h-4" /> {t('transactionId')}</span>
                </label>
                <input
                  type="text"
                  value={form.trxId}
                  onChange={(e) => { setForm({ ...form, trxId: e.target.value }); setErrors({ ...errors, trxId: '' }); }}
                  placeholder="e.g. 9F2XQ1ABCD"
                  className={`w-full border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 transition-all ${errors.trxId ? 'border-red-400 bg-red-50' : 'border-stone-200'}`}
                />
                {errors.trxId && <p className="text-xs text-red-500 mt-1">{errors.trxId}</p>}
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-2xl px-4 py-3">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-400 disabled:opacity-70 text-white font-bold py-4 rounded-2xl transition-all hover:shadow-xl hover:shadow-brand-500/30 hover:-translate-y-0.5"
              >
                {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                {submitting ? t('placingOrder') : t('confirmOrder')}
              </button>
              <p className="flex items-center justify-center gap-1.5 text-xs text-stone-400">
                <ShieldCheck className="w-3.5 h-3.5" /> {t('infoSecure')}
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
