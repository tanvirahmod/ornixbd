import { useState, useEffect } from 'react';
import {
  Check, ChevronRight, CheckCircle, Loader2, User, Phone, MapPin, Wallet, Hash,
  ShieldCheck, ShoppingBag, Truck, Tag, X, Pencil, Store, Banknote, AlertTriangle,
} from 'lucide-react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase, Product, Coupon } from '../lib/supabase';
import { useLanguage } from '../lib/LanguageContext';
import ZoneSelect, { zoneForDistrict } from '../components/ZoneSelect';
import { useNavigation } from '../lib/navigation';
import { useCart, CartItem } from '../lib/CartContext';
import { COVER_FALLBACK } from '../lib/utils';
import { setSEO, SITE_NAME } from '../lib/seo';

/* ────────────────────────────────────────────────────────────
   CHECKOUT CONSTANTS — tweak numbers here
   ──────────────────────────────────────────────────────────── */
const DELIVERY_FEE = 150;
const FREE_DELIVERY_THRESHOLD = 1000;
/** Orders at/above this total must be paid fully in advance. */
const FULL_ADVANCE_THRESHOLD = 1500;
const BKASH_NUMBER = '01700-000000';

type DeliveryChoice = 'courier' | 'pickup';
type PaymentChoice = 'advance' | 'full';
type CheckoutStep = 1 | 2 | 3;
type DeliveryZone = 'dhaka_city' | 'dhaka_suburban' | 'outside_dhaka';

const round2 = (n: number) => Math.round(n * 100) / 100;

const CHECKOUT_STORAGE_KEY = 'ornix_checkout_v2';

function loadPersistedCheckout(): { name: string; phone: string; address: string; deliveryDistrict: string; deliveryChoice: DeliveryChoice; paymentChoice: PaymentChoice; bkashNumber: string; trxId: string } | null {
  try {
    const raw = window.sessionStorage.getItem(CHECKOUT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      name: typeof parsed.name === 'string' ? parsed.name : '',
      phone: typeof parsed.phone === 'string' ? parsed.phone : '',
      deliveryDistrict: typeof parsed.deliveryDistrict === 'string' ? parsed.deliveryDistrict : '',
      address: typeof parsed.address === 'string' ? parsed.address : '',
      deliveryChoice: parsed.deliveryChoice === 'pickup' ? 'pickup' : 'courier',
      paymentChoice: parsed.paymentChoice === 'full' ? 'full' : 'advance',
      bkashNumber: typeof parsed.bkashNumber === 'string' ? parsed.bkashNumber : '',
      trxId: typeof parsed.trxId === 'string' ? parsed.trxId : '',
    };
  } catch {
    return null;
  }
}

/** Normalizes a BD mobile number: keeps digits and a single leading + */
function normalizeBdPhone(raw: string): string {
  const trimmed = raw.replace(/[\s\-()]/g, '');
  return trimmed.startsWith('+') ? `+${trimmed.slice(1).replace(/\D/g, '')}` : trimmed.replace(/\D/g, '');
}

function isValidBdMobile(raw: string): boolean {
  const normalized = normalizeBdPhone(raw);
  return /^(?:(?:\+|00)?880|0)?1[3-9]\d{8}$/.test(normalized);
}

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
  const [productCodeMap, setProductCodeMap] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [placedItems, setPlacedItems] = useState<CartItem[]>([]);
  const [placedOrderCode, setPlacedOrderCode] = useState('');

  const [persisted] = useState(loadPersistedCheckout);

  const [step, setStep] = useState<CheckoutStep>(1);
  const [form, setForm] = useState({
    name: persisted?.name ?? '',
    phone: persisted?.phone ?? '',
    address: persisted?.address ?? '',
    deliveryDistrict: persisted?.deliveryDistrict ?? '',
  });
  const [errors, setErrors] = useState({ name: '', phone: '', address: '', deliveryDistrict: '' });
  const [deliveryChoice, setDeliveryChoice] = useState<DeliveryChoice>(persisted?.deliveryChoice ?? 'courier');
  const [paymentChoice, setPaymentChoice] = useState<PaymentChoice>(persisted?.paymentChoice ?? 'advance');
  const [bkashNumber, setBkashNumber] = useState(persisted?.bkashNumber ?? '');
  const [trxId, setTrxId] = useState(persisted?.trxId ?? '');
  const [paymentErrors, setPaymentErrors] = useState({ bkashNumber: '', trxId: '' });
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreeError, setAgreeError] = useState(false);

  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [couponError, setCouponError] = useState('');
  const [couponBusy, setCouponBusy] = useState(false);
  const [bkashCopied, setBkashCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  useEffect(() => {
    setSEO({
      title: `Checkout — ${SITE_NAME}`,
      url: productId ? `/checkout/${productId}` : '/checkout',
      description: 'Complete your order — cash on delivery available, nationwide shipping across Bangladesh.',
    });
  }, [productId]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(
        CHECKOUT_STORAGE_KEY,
        JSON.stringify({ ...form, deliveryChoice, paymentChoice, bkashNumber, trxId })
      );
    } catch {
      // storage unavailable — the form just won't persist across reloads
    }
  }, [form, deliveryChoice, paymentChoice, bkashNumber, trxId]);

  // ── Steadfast courier charges, editable in Admin → Settings ──
  const [zoneRates, setZoneRates] = useState<Record<DeliveryZone, number> | null>(null);
  useEffect(() => {
    async function fetchZoneRates() {
      const { data } = await supabase.from('site_settings').select('key, value');
      const pick = (key: string, fallback: number): number => {
        const row = (data ?? []).find((s: { key: string }) => s.key === key);
        const num = Number(row?.value);
        return row?.value != null && row.value !== '' && !isNaN(num) && num >= 0 ? num : fallback;
        };
      setZoneRates({
        dhaka_city: pick('steadfast_rate_dhaka_city', 60),
        dhaka_suburban: pick('steadfast_rate_dhaka_suburban', 110),
        outside_dhaka: pick('steadfast_rate_outside_dhaka', 130),
      });
    }
    fetchZoneRates();
  }, []);

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

  // Which cart product codes are "no advance payment" (pure cash on delivery)?
  useEffect(() => {
    async function fetchNoAdvanceFlags() {
      const codes = Array.from(
        new Set(
          cartItems
            .map((item) => item.productCode?.trim().toUpperCase())
            .filter((c): c is string => !!c)
        )
      );
      if (codes.length === 0) {
        setProductCodeMap({});
        return;
      }
      const { data } = await supabase
        .from('products')
        .select('product_code, advance_optional')
        .in('product_code', codes);
      const map: Record<string, boolean> = {};
      for (const code of codes) map[code] = false;
      for (const row of (data ?? []) as Array<{ product_code: string | null; advance_optional: boolean | null }>) {
        if (row.product_code) map[row.product_code.trim().toUpperCase()] = row.advance_optional === true;
      }
      setProductCodeMap(map);
    }
    if (isCartCheckout) {
      fetchNoAdvanceFlags();
    } else if (product) {
      setProductCodeMap({
        [(product.product_code ?? '').trim().toUpperCase()]: product.advance_optional === true,
      });
    }
  }, [isCartCheckout, product, cartItems]);

  /* ── Pricing ── */
  const safeQuantity = Math.max(1, Math.min(Number(selectedQuantity) || 1, Math.max(1, product?.stock_count ?? 1)));
  const unitPrice = product
    ? (product.discount_price != null && product.discount_price < product.price ? Number(product.discount_price) : Number(product.price))
    : 0;
  const cartSubtotal = cartItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

  const coverImage =
    product?.product_images && product.product_images.length > 0
      ? product.product_images.sort((a, b) => a.display_order - b.display_order)[0].image_url
      : 'https://images.pexels.com/photos/5632398/pexels-photo-5632398.jpeg?auto=compress&cs=tinysrgb&w=400';

  const summaryLines: Array<{ key: string; title: string; code: string | null; size: string | null; quantity: number; unitPrice: number; imageUrl: string | null }> =
    isCartCheckout
      ? cartItems.map((item) => ({
          key: `${item.productId}__${item.size ?? 'none'}`,
          title: item.title,
          code: item.productCode,
          size: item.size,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
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
              unitPrice,
              imageUrl: coverImage,
            },
          ]
        : [];

  // Product codes in the current order (for product-specific coupons + no-advance detection)
  const orderProductCodes = Array.from(
    new Set(
      summaryLines
        .map((l) => l.code?.trim().toUpperCase())
        .filter((c): c is string => !!c)
    )
  );

  const subtotal = isCartCheckout ? cartSubtotal : unitPrice * safeQuantity;

  // Steadfast zone fee (null until the district is chosen or rates load)
  const deliveryDistrict = form.deliveryDistrict;
  const zone = deliveryDistrict ? zoneForDistrict(deliveryDistrict) : null;
  const zoneFee = zone && zoneRates ? zoneRates[zone] : null;

  const deliveryFee =
    deliveryChoice === 'pickup'
      ? 0
      : subtotal >= FREE_DELIVERY_THRESHOLD
        ? 0
        : zoneFee ?? DELIVERY_FEE;

  const discountAmount = coupon
    ? Math.min(
        round2(coupon.discount_type === 'percent' ? (subtotal * Number(coupon.value)) / 100 : Number(coupon.value)),
        subtotal
      )
    : 0;
  const total = round2(Math.max(0, subtotal - discountAmount + deliveryFee));

  // Orders at/above the threshold are always fully prepaid
  const fullAdvanceRequired = total >= FULL_ADVANCE_THRESHOLD;

  // Every item in this order is a no-advance product → pure cash on delivery,
  // no bKash number / TrxID required.
  const noAdvanceRequired = isCartCheckout
    ? summaryLines.length > 0 &&
      summaryLines.every((line) => {
        const code = line.code?.trim().toUpperCase();
        return !!code && productCodeMap[code] === true;
      })
    : product?.advance_optional === true;
  useEffect(() => {
    if (fullAdvanceRequired && paymentChoice !== 'full') setPaymentChoice('full');
  }, [fullAdvanceRequired, paymentChoice]);

  const advanceAmount = noAdvanceRequired ? 0 : paymentChoice === 'full' ? total : deliveryFee;
  const dueAmount = round2(total - advanceAmount);

  // No-advance order: force the COD option and drop any stored bKash details
  useEffect(() => {
    if (noAdvanceRequired && paymentChoice !== 'advance') setPaymentChoice('advance');
  }, [noAdvanceRequired, paymentChoice]);

  const goToStep = (next: CheckoutStep) => {
    setStep(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /* ── Step 1 validation ── */
  const validateAddress = () => {
    const next = { name: '', phone: '', address: '', deliveryDistrict: '' };
    if (!form.name.trim()) next.name = t('fullNameRequired');
    if (!form.phone.trim()) next.phone = t('phoneRequired');
    else if (!isValidBdMobile(form.phone)) next.phone = t('phoneInvalidBd');
    if (!form.address.trim()) next.address = t('addressRequired');
    else if (form.address.trim().length < 10) next.address = t('addressTooShort');
    // Steadfast delivers by district — require it so the courier charge matches the destination
    if (!form.deliveryDistrict) next.deliveryDistrict = t('districtRequired');
    setErrors(next);
    return !Object.values(next).some(Boolean);
  };

  /* ── Coupon ── */
  const applyCoupon = async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    setCouponBusy(true);
    setCouponError('');
    const { data, error } = await supabase.from('coupons').select('*').eq('code', code).maybeSingle();
    if (error || !data || !data.is_active) {
      setCouponError(t('couponInvalid'));
      setCouponBusy(false);
      return;
    }
    if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
      setCouponError(t('couponExpired'));
      setCouponBusy(false);
      return;
    }
    if (data.min_order_amount != null && subtotal < Number(data.min_order_amount)) {
      setCouponError(t('couponMinOrder', { amount: Number(data.min_order_amount).toFixed(0) }));
      setCouponBusy(false);
      return;
    }
    // Product restriction: every ordered product code must be in the coupon's list
    if ((data.product_codes?.length ?? 0) > 0) {
      const allowed = data.product_codes!.map((c: string) => c.trim().toUpperCase());
      if (orderProductCodes.length === 0 || !orderProductCodes.every((c) => allowed.includes(c))) {
        setCouponError(t('couponProductsOnly', { codes: data.product_codes!.join(', ') }));
        setCouponBusy(false);
        return;
      }
    }
    setCoupon(data);
    setCouponInput('');
    setCouponBusy(false);
  };

  const removeCoupon = () => {
    setCoupon(null);
    setCouponError('');
    setCouponInput('');
  };

  /* ── Step 3 validation + submit ── */
  const validatePayment = () => {
    const next = { bkashNumber: '', trxId: '' };
    if (advanceAmount > 0 && !noAdvanceRequired) {
      if (!bkashNumber.trim()) next.bkashNumber = t('bkashNumberRequired');
      else if (!isValidBdMobile(bkashNumber)) next.bkashNumber = t('bkashNumberInvalid');
      if (!trxId.trim()) next.trxId = t('trxIdRequired');
      else if (!/^[A-Za-z0-9]{6,20}$/.test(trxId.trim())) next.trxId = t('trxIdInvalid');
    }
    setPaymentErrors(next);
    const agreed = agreeTerms || fullAdvanceRequired;
    if (!agreeTerms) setAgreeError(true);
    return !Object.values(next).some(Boolean) && agreed;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step !== 3) return;
    if (!validatePayment()) return;
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
    };

    // Customer-facing tracking code (shared by every line item of this purchase)
    const orderCode = `ORN-${Array.from(crypto.getRandomValues(new Uint8Array(4)))
      .map((b) => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'.charAt(b % 32))
      .join('')}`;

    const pricing = {
      subtotal: round2(subtotal),
      delivery_fee: round2(deliveryFee),
      discount_amount: round2(discountAmount),
      total_amount: total,
      coupon_code: coupon?.code ?? null,
    };
    setPlacedOrderCode(orderCode);
    const payment = {
      payment_method: noAdvanceRequired ? 'cash_on_delivery' : paymentChoice === 'full' ? 'full_advance' : 'advance_partial',
      advance_amount: noAdvanceRequired ? 0 : round2(advanceAmount),
      due_amount: noAdvanceRequired ? total : round2(dueAmount),
      courier_name: deliveryChoice === 'courier' ? `Steadfast Courier · ${deliveryDistrict || 'Bangladesh'}` : 'Store Pickup',
      delivery_zone: form.deliveryDistrict || null,
      bkash_number: advanceAmount > 0 && !noAdvanceRequired ? bkashNumber.trim() : null,
      trx_id: advanceAmount > 0 && !noAdvanceRequired ? trxId.trim() : null,
    };

    // Fall back to progressively fewer columns for older schemas
    const payloadCandidates: Array<Record<string, string | number | null>>[] = lineItems.map((item) => [
      {
        product_id: item.productId,
        product_title: item.title,
        product_code: item.code,
        selected_size: item.size,
        quantity: item.quantity,
        order_code: orderCode,
        ...customer,
        ...pricing,
        ...payment,
      },
      {
        product_id: item.productId,
        product_title: item.title,
        product_code: item.code,
        selected_size: item.size,
        quantity: item.quantity,
        order_code: orderCode,
        ...customer,
        ...pricing,
        bkash_number: payment.bkash_number,
        trx_id: payment.trx_id,
      },
      {
        product_id: item.productId,
        product_title: item.title,
        product_code: item.code,
        selected_size: item.size,
        quantity: item.quantity,
        order_code: orderCode,
        ...customer,
        subtotal: pricing.subtotal,
        delivery_fee: pricing.delivery_fee,
        total_amount: pricing.total_amount,
      },
      {
        product_id: item.productId,
        product_title: item.title,
        product_code: item.code,
        selected_size: item.size,
        quantity: item.quantity,
        order_code: orderCode,
        ...customer,
      },
      {
        product_id: item.productId,
        product_title: item.title,
        selected_size: item.size,
        order_code: orderCode,
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

    // Best-effort coupon usage counter
    if (coupon) {
      try {
        await supabase
          .from('coupons')
          .update({ times_used: (coupon.times_used ?? 0) + 1 })
          .eq('id', coupon.id);
      } catch {
        // counter is cosmetic — never block the order
      }
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
    window.sessionStorage.removeItem(CHECKOUT_STORAGE_KEY);
  };  /* ── Early exits ── */
  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="animate-spin w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (isCartCheckout && cartItems.length === 0 && !success) {
    return (
      <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center gap-4 px-4">
        <div className="w-20 h-20 bg-stone-100 rounded-full flex items-center justify-center">
          <ShoppingBag className="w-10 h-10 text-stone-300" />
        </div>
        <h1 className="font-display text-2xl font-bold text-stone-900">{t('cartEmpty')}</h1>
        <button
          onClick={() => onNavigate('shop')}
          className="mt-2 bg-stone-900 hover:bg-stone-800 text-white font-bold py-3.5 px-8 rounded-2xl transition-all hover:shadow-lg"
        >
          {t('continueShopping')}
        </button>
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
          <p className="text-stone-400 text-sm mb-4">{t('weWillContact', { phone: form.phone })}</p>

          {/* Order code — the customer's tracking key */}
          {placedOrderCode && (
            <div className="bg-brand-50 border border-brand-200 rounded-2xl px-4 py-3.5 mb-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-600 mb-1">{t('orderCodeLabel')}</p>
              <div className="flex items-center justify-center gap-2">
                <span className="font-mono font-bold text-xl text-stone-900 tracking-wider">{placedOrderCode}</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(placedOrderCode).then(() => {
                      setCodeCopied(true);
                      window.setTimeout(() => setCodeCopied(false), 2000);
                    }).catch(() => { /* clipboard unavailable */ });
                  }}
                  className="text-[11px] font-bold text-brand-600 hover:text-brand-700 bg-white border border-brand-200 px-2 py-1 rounded-lg transition-colors"
                >
                  {codeCopied ? t('copiedShort') : t('copyShort')}
                </button>
              </div>
              <p className="text-[11px] text-brand-600/80 mt-1.5">{t('orderCodeSaveNote')}</p>
            </div>
          )}
          <div className="bg-stone-50 rounded-2xl px-4 py-3 mb-3 space-y-1.5 text-sm">
            {placedItems.length > 0 ? (
              placedItems.map((item) => (
                <div key={`${item.productId}-${item.size ?? 'na'}`} className="flex items-center justify-between gap-2">
                  <span className="text-stone-600 truncate">
                    {item.title}
                    {item.size ? ` · ${item.size}` : ''}
                    <span className="text-stone-400"> ×{item.quantity}</span>
                  </span>
                  <span className="font-medium text-stone-800 whitespace-nowrap">৳{(item.unitPrice * item.quantity).toFixed(0)}</span>
                </div>
              ))
            ) : (
              <div className="flex items-center justify-between gap-2">
                <span className="text-stone-600 truncate">{product?.title}</span>
                <span className="font-medium text-stone-800 whitespace-nowrap">৳{subtotal.toFixed(0)}</span>
              </div>
            )}
          </div>
          <div className="flex justify-between text-sm bg-stone-50 rounded-2xl px-4 py-3 mb-4">
            <span className="text-stone-500">{t('totalToPay')}</span>
            <span className="font-display font-bold text-stone-900">৳{total.toFixed(0)}</span>
          </div>
          <p className="text-xs text-stone-400 mb-8 flex items-center justify-center gap-1.5 text-left">
            {noAdvanceRequired ? (
              <><Banknote className="w-3.5 h-3.5 flex-shrink-0 text-emerald-500" /> {t('codOnlyDesc', { total: total.toFixed(0) })}</>
            ) : paymentChoice === 'full' ? (
              <><ShieldCheck className="w-3.5 h-3.5 flex-shrink-0 text-emerald-500" /> {t('payFullNowDesc', { total: total.toFixed(0) })}</>
            ) : (
              <><Wallet className="w-3.5 h-3.5 flex-shrink-0 text-pink-500" /> {t('payDeliveryNowDesc', { advance: round2(advanceAmount).toFixed(0), due: dueAmount.toFixed(0) })}</>
            )}
          </p>
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

  /* ── Stepper ── */
  const steps: Array<{ n: CheckoutStep; label: string }> = [
    { n: 1, label: t('stepAddress') },
    { n: 2, label: t('stepDelivery') },
    { n: 3, label: t('stepPayment') },
  ];

  const stepState = (n: CheckoutStep): 'done' | 'active' | 'todo' => (step > n ? 'done' : step === n ? 'active' : 'todo');

  const inputCls = (hasError: boolean) =>
    `w-full border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 transition-all ${
      hasError ? 'border-red-400 bg-red-50 focus:ring-red-200' : 'border-stone-200 focus:ring-brand-400'
    }`;

  const optionCardCls = (selected: boolean, disabled = false) =>
    `w-full text-left rounded-2xl border-2 p-4 transition-all ${
      disabled
        ? 'border-stone-100 bg-stone-50 opacity-60 cursor-not-allowed'
        : selected
          ? 'border-brand-500 bg-brand-50/60 shadow-sm'
          : 'border-stone-200 bg-white hover:border-stone-300'
    }`;

  const deliveryOptions = [
    {
      id: 'courier' as DeliveryChoice,
      icon: <Truck className="w-5 h-5" />,
      name: t('homeDeliveryName'),
      desc: t('homeDeliveryDesc'),
      eta: t('courierEta'),
      fee: deliveryChoice === 'courier' ? deliveryFee : subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_FEE,
    },
    {
      id: 'pickup' as DeliveryChoice,
      icon: <Store className="w-5 h-5" />,
      name: t('pickupName'),
      desc: t('pickupDesc'),
      eta: t('pickupEta'),
      fee: 0,
    },
  ];

  const paymentOptions = [
    {
      id: 'advance' as PaymentChoice,
      icon: noAdvanceRequired ? <Banknote className="w-5 h-5" /> : <Wallet className="w-5 h-5" />,
      title: noAdvanceRequired
        ? t('codOnlyTitle')
        : deliveryChoice === 'pickup'
          ? t('pickupPayTitle')
          : t('payDeliveryNowTitle'),
      desc: noAdvanceRequired
        ? t('codOnlyDesc', { total: total.toFixed(0) })
        : deliveryChoice === 'pickup'
          ? t('pickupPayDesc', { amount: total.toFixed(0) })
          : deliveryFee === 0
            ? t('payNothingNowDesc', { due: total.toFixed(0) })
            : t('payDeliveryNowDesc', { advance: deliveryFee.toFixed(0), due: round2(total - deliveryFee).toFixed(0) }),
      disabled: fullAdvanceRequired,
      advance: noAdvanceRequired ? 0 : deliveryFee,
      due: noAdvanceRequired ? total : round2(total - deliveryFee),
    },
    {
      id: 'full' as PaymentChoice,
      icon: <ShieldCheck className="w-5 h-5" />,
      title: t('payFullNowTitle'),
      desc: t('payFullNowDesc', { total: total.toFixed(0) }),
      disabled: noAdvanceRequired,
      advance: total,
      due: 0,
    },
  ];

  // Hint when courier delivery is chosen but the zone fee isn't known yet
  const zonePendingHint =
    deliveryChoice === 'courier' && subtotal < FREE_DELIVERY_THRESHOLD && zoneFee == null
      ? t('districtFeeHint')
      : '';

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Page header: clean breadcrumb + big centered title below */}
      <div className="bg-white border-b border-stone-100">
        <div className="max-w-5xl mx-auto px-4 pt-5 pb-6 text-center">
          <div className="flex items-center justify-center gap-2 text-sm text-stone-400">
            <button onClick={() => onNavigate('home')} className="hover:text-stone-700 transition-colors">
              {t('home')}
            </button>
            <span className="text-stone-300">/</span>
            <span className="text-stone-600 font-medium">{t('checkoutTitle')}</span>
          </div>
          <h1 className="mt-1.5 font-display text-3xl sm:text-4xl font-bold text-stone-900">{t('checkoutTitle')}</h1>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 md:py-8">
        <div className="grid md:grid-cols-5 gap-6 lg:gap-10">
          {/* ── Sidebar: summary + coupon ── */}
          <div className="md:col-span-2 space-y-4 min-w-0">
            <div className="bg-white rounded-3xl shadow-sm border border-stone-100 p-5 md:sticky md:top-20">
              <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-4">{t('orderSummary')}</h2>
              <div className="space-y-4">
                {summaryLines.map((line) => (
                  <div key={line.key} className="flex gap-3">
                    <div className="w-16 h-16 rounded-2xl overflow-hidden bg-stone-100 flex-shrink-0">
                      <img src={line.imageUrl ?? COVER_FALLBACK} alt={line.title} className="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).src = COVER_FALLBACK; }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-stone-900 text-sm leading-snug line-clamp-2">{line.title}</p>
                        <p className="font-semibold text-stone-900 text-sm whitespace-nowrap">৳{(line.unitPrice * line.quantity).toFixed(0)}</p>
                      </div>
                      {line.code && <p className="text-[11px] font-mono text-stone-400 mt-0.5">{line.code}</p>}
                      {productCodeMap[(line.code ?? '').trim().toUpperCase()] === true && (
                        <p className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0.5 mt-1 inline-flex items-center gap-1">
                          <Banknote className="w-3 h-3" /> {t('codBadge')}
                        </p>
                      )}
                      <p className="text-xs text-stone-500 mt-1">
                        {line.size && <>{t('sizeLabel')}: <span className="font-medium text-stone-700">{line.size}</span> · </>}
                        {t('qtyLabel')}: <span className="font-medium text-stone-700">{line.quantity}</span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-stone-100 mt-5 pt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-stone-500">{t('subtotal')}</span>
                  <span className="font-medium text-stone-700">৳{subtotal.toFixed(0)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-stone-500 flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-emerald-500" /> {t('discount')}
                    </span>
                    <span className="font-medium text-emerald-600">−৳{discountAmount.toFixed(0)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-stone-500">{t('shippingRowLabel')}</span>
                  <span className={`font-medium ${deliveryFee === 0 ? 'text-emerald-600' : 'text-stone-700'}`}>
                    {deliveryFee === 0 ? t('freeDeliveryShort') : `৳${deliveryFee.toFixed(0)}`}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t border-stone-100">
                  <span className="font-semibold text-stone-900">{t('totalToPay')}</span>
                  <span className="font-display font-bold text-stone-900 text-lg">৳{total.toFixed(0)}</span>
                </div>
              </div>

              <p className="mt-4 text-[11px] text-stone-400 text-center">{t('stepOf', { current: step, total: 3 })}</p>
            </div>

            {/* Coupon card */}
            <div className="bg-white rounded-3xl shadow-sm border border-stone-100 p-5">
              <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5" /> {t('couponCode')}
              </h2>
              {coupon ? (
                <div className="flex items-center justify-between gap-2 bg-emerald-50 border border-emerald-200 rounded-2xl px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-emerald-700 font-mono">{coupon.code}</p>
                    <p className="text-xs text-emerald-600 truncate">{t('couponAppliedMsg', { code: coupon.code, amount: discountAmount.toFixed(0) })}</p>
                    {(coupon.product_codes?.length ?? 0) > 0 && (
                      <p className="text-[10px] text-emerald-500/80 font-mono truncate">{t('couponProductsOnly', { codes: coupon.product_codes!.join(', ') })}</p>
                    )}
                  </div>
                  <button onClick={removeCoupon} className="p-1.5 text-emerald-500 hover:text-emerald-700 transition-colors flex-shrink-0" aria-label={t('couponRemove')}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={couponInput}
                      onChange={(e) => { setCouponInput(e.target.value); setCouponError(''); }}
                      placeholder={t('couponPlaceholder')}
                      className="flex-1 min-w-0 border border-stone-200 rounded-xl px-3.5 py-2.5 text-sm uppercase tracking-wide focus:outline-none focus:ring-2 focus:ring-brand-400 transition-all"
                    />
                    <button
                      type="button"
                      onClick={applyCoupon}
                      disabled={couponBusy || !couponInput.trim()}
                      className="px-4 rounded-xl bg-stone-900 hover:bg-stone-800 disabled:opacity-40 text-white text-sm font-bold transition-all flex-shrink-0"
                    >
                      {couponBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : t('couponApply')}
                    </button>
                  </div>
                  {couponError && <p className="text-xs text-red-500 mt-2">{couponError}</p>}
                </>
              )}
            </div>
          </div>

          {/* ── Main column: steps ── */}
          <div className="md:col-span-3 min-w-0">
            {/* Step bar sits directly above the form container — underlined steps */}
            <div className="bg-white rounded-2xl shadow-sm border border-stone-100 px-2 sm:px-4 mb-4 flex items-center">
              {steps.map((s) => {
                const state = stepState(s.n);
                return (
                  <div key={s.n} className="flex-1 flex items-stretch min-w-0">
                    <button
                      type="button"
                      onClick={() => state === 'done' && goToStep(s.n)}
                      disabled={state === 'todo'}
                      className={`flex-1 flex items-center justify-center gap-2 py-3.5 border-b-2 transition-all ${
                        state === 'active'
                          ? 'border-brand-500'
                          : state === 'done'
                            ? 'border-emerald-500 hover:opacity-80'
                            : 'border-transparent'
                      }`}
                    >
                      <span
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 transition-all ${
                          state === 'done'
                            ? 'bg-emerald-500 text-white'
                            : state === 'active'
                              ? 'bg-brand-500 text-white shadow-md shadow-brand-500/30'
                              : 'bg-stone-100 text-stone-400'
                        }`}
                      >
                        {state === 'done' ? <Check className="w-3 h-3" /> : s.n}
                      </span>
                      <span className={`text-xs sm:text-sm font-semibold whitespace-nowrap truncate ${state === 'todo' ? 'text-stone-400' : 'text-stone-900'}`}>
                        {s.label}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>

            <form onSubmit={handleSubmit}>
              {/* ════ STEP 1 — ADDRESS ════ */}
              {step === 1 && (
                <div className="bg-white rounded-3xl shadow-sm border border-stone-100 p-6 space-y-5 animate-fade-in-up">
                  <div>
                    <p className="text-[11px] font-bold text-brand-600 uppercase tracking-widest mb-1">{t('stepOf', { current: 1, total: 3 })}</p>
                    <h2 className="font-display text-xl font-bold text-stone-900">{t('addressHeading')}</h2>
                    <p className="text-sm text-stone-500 mt-1">{t('addressSubtitle')}</p>
                  </div>

                  {/* BD-only shipping caution */}
                  <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
                    <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700 leading-relaxed">
                      {t('bdOnlyCaution')}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1.5">
                      <span className="flex items-center gap-1.5"><User className="w-4 h-4" /> {t('fullName')}</span>
                    </label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => { setForm({ ...form, name: e.target.value }); setErrors({ ...errors, name: '' }); }}
                      placeholder={t('enterYourFullName')}
                      autoComplete="name"
                      className={inputCls(!!errors.name)}
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
                      placeholder={t('phonePlaceholder')}
                      autoComplete="tel"
                      className={inputCls(!!errors.phone)}
                    />
                    {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone}</p>}
                  </div>

                  <ZoneSelect
                    value={form.deliveryDistrict}
                    onChange={(district) => { setForm({ ...form, deliveryDistrict: district }); setErrors({ ...errors, deliveryDistrict: '' }); }}
                    error={errors.deliveryDistrict}
                    required
                  />

                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1.5">
                      <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4" /> {t('deliveryAddress')}</span>
                    </label>
                    <textarea
                      value={form.address}
                      onChange={(e) => { setForm({ ...form, address: e.target.value }); setErrors({ ...errors, address: '' }); }}
                      placeholder={t('fullAddressPlaceholder')}
                      rows={3}
                      className={`${inputCls(!!errors.address)} resize-none`}
                    />
                    {errors.address && <p className="text-xs text-red-500 mt-1">{errors.address}</p>}
                  </div>

                  <button
                    type="button"
                    onClick={() => { if (validateAddress()) goToStep(2); }}
                    className="w-full flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-400 text-white font-bold py-4 rounded-2xl transition-all hover:shadow-xl hover:shadow-brand-500/30 hover:-translate-y-0.5"
                  >
                    {t('continueToDelivery')} <ChevronRight className="w-4 h-4" />
                  </button>
                  <p className="text-center text-[11px] text-stone-400">{t('deliveryAcrossBangladesh')}</p>
                </div>
              )}

              {/* ════ STEP 2 — DELIVERY ════ */}
              {step === 2 && (
                <div className="bg-white rounded-3xl shadow-sm border border-stone-100 p-6 space-y-5 animate-fade-in-up">
                  <div>
                    <p className="text-[11px] font-bold text-brand-600 uppercase tracking-widest mb-1">{t('stepOf', { current: 2, total: 3 })}</p>
                    <h2 className="font-display text-xl font-bold text-stone-900">{t('deliveryHeading')}</h2>
                    <p className="text-sm text-stone-500 mt-1">{t('deliverySubtitle')}</p>
                  </div>

                  {/* Address recap */}
                  <button
                    type="button"
                    onClick={() => goToStep(1)}
                    className="w-full flex items-start justify-between gap-3 bg-stone-50 border border-stone-100 rounded-2xl px-4 py-3 text-left hover:border-stone-300 transition-all"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider">{t('recapAddress')}</p>
                      <p className="text-sm text-stone-800 font-medium truncate">{form.name} · {form.phone}</p>
                      <p className="text-xs text-stone-500 truncate">{form.address}</p>
                    </div>
                    <span className="flex items-center gap-1 text-xs font-bold text-brand-600 flex-shrink-0 mt-0.5">
                      <Pencil className="w-3 h-3" /> {t('editRecap')}
                    </span>
                  </button>

                  <div className="space-y-3">
                    {deliveryOptions.map((option) => {
                      const selected = deliveryChoice === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setDeliveryChoice(option.id)}
                          className={optionCardCls(selected)}
                        >
                          <div className="flex items-start gap-3">
                            <span
                              className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                                selected ? 'border-brand-500 bg-brand-500' : 'border-stone-300 bg-white'
                              }`}
                            >
                              {selected && <Check className="w-3 h-3 text-white" />}
                            </span>
                            <span className={`flex-shrink-0 mt-0.5 ${selected ? 'text-brand-600' : 'text-stone-400'}`}>{option.icon}</span>
                            <span className="flex-1 min-w-0">
                              <span className="flex items-center justify-between gap-2">
                                <span className="font-bold text-stone-900 text-sm">{option.name}</span>
                                <span className={`text-sm font-bold whitespace-nowrap ${option.fee === 0 ? 'text-emerald-600' : 'text-stone-900'}`}>
                                  {option.fee === 0 ? t('freeDeliveryShort') : `৳${option.fee.toFixed(0)}`}
                                </span>
                              </span>
                              <span className="block text-xs text-stone-500 mt-0.5">{option.desc}</span>
                              <span className="block text-[11px] text-stone-400 mt-1">{option.eta}</span>
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <p className="flex items-start gap-2 text-xs text-stone-500 bg-stone-50 border border-stone-100 rounded-2xl px-4 py-3">
                    <Phone className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> {t('deliveryCallNote')}
                  </p>

                  {zonePendingHint && (
                    <p className="flex items-start gap-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> {zonePendingHint}
                    </p>
                  )}

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => goToStep(1)}
                      className="px-6 py-4 rounded-2xl border-2 border-stone-200 hover:border-stone-400 text-stone-700 font-bold text-sm transition-all"
                    >
                      {t('back')}
                    </button>
                    <button
                      type="button"
                      onClick={() => goToStep(3)}
                      className="flex-1 bg-brand-500 hover:bg-brand-400 text-white font-bold py-4 rounded-2xl transition-all hover:shadow-xl hover:shadow-brand-500/30 hover:-translate-y-0.5"
                    >
                      {t('continueToPayment')}
                    </button>
                  </div>
                </div>
              )}

              {/* ════ STEP 3 — PAYMENT ════ */}
              {step === 3 && (
                <div className="bg-white rounded-3xl shadow-sm border border-stone-100 p-6 space-y-5 animate-fade-in-up">
                  <div>
                    <p className="text-[11px] font-bold text-brand-600 uppercase tracking-widest mb-1">{t('stepOf', { current: 3, total: 3 })}</p>
                    <h2 className="font-display text-xl font-bold text-stone-900">{t('paymentHeading')}</h2>
                  </div>

                  {/* Recaps */}
                  <div className="grid sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => goToStep(1)}
                      className="flex items-start justify-between gap-3 bg-stone-50 border border-stone-100 rounded-2xl px-4 py-3 text-left hover:border-stone-300 transition-all"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider">{t('recapAddress')}</p>
                        <p className="text-sm text-stone-800 font-medium truncate">{form.name}</p>
                        <p className="text-xs text-stone-500 truncate">{form.address}</p>
                      </div>
                      <span className="flex items-center gap-1 text-xs font-bold text-brand-600 flex-shrink-0 mt-0.5">
                        <Pencil className="w-3 h-3" /> {t('editRecap')}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => goToStep(2)}
                      className="flex items-start justify-between gap-3 bg-stone-50 border border-stone-100 rounded-2xl px-4 py-3 text-left hover:border-stone-300 transition-all"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider">{t('recapDelivery')}</p>
                        <p className="text-sm text-stone-800 font-medium truncate">
                          {deliveryChoice === 'courier' ? t('homeDeliveryName') : t('pickupName')}
                        </p>
                        <p className="text-xs text-stone-500">
                          {t('shippingRowLabel')}: {deliveryFee === 0 ? t('freeDeliveryShort') : `৳${deliveryFee.toFixed(0)}`}
                        </p>
                      </div>
                      <Pencil className="w-3.5 h-3.5 text-brand-600 flex-shrink-0 mt-1" />
                    </button>
                  </div>

                  {/* Payment options */}
                  <div className="space-y-3">
                    {paymentOptions.map((option) => {
                      const selected = paymentChoice === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          disabled={option.disabled}
                          onClick={() => setPaymentChoice(option.id)}
                          className={optionCardCls(selected, option.disabled)}
                        >
                          <div className="flex items-start gap-3">
                            <span
                              className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                                selected ? 'border-brand-500 bg-brand-500' : 'border-stone-300 bg-white'
                              }`}
                            >
                              {selected && <Check className="w-3 h-3 text-white" />}
                            </span>
                            <span className={`flex-shrink-0 mt-0.5 ${selected ? 'text-brand-600' : 'text-stone-400'}`}>{option.icon}</span>
                            <span className="flex-1 min-w-0">
                              <span className="block font-bold text-stone-900 text-sm">{option.title}</span>
                              <span className="block text-xs text-stone-500 mt-0.5">{option.desc}</span>
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {fullAdvanceRequired && !noAdvanceRequired && (
                    <p className="text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
                      {t('fullAdvanceRequiredNote', { threshold: FULL_ADVANCE_THRESHOLD.toFixed(0) })}
                    </p>
                  )}

                  {/* Advance instructions (only when something must be sent now) */}
                  {advanceAmount > 0 ? (
                    <div className="bg-gradient-to-br from-pink-50 to-rose-50 border border-pink-200 rounded-2xl p-4 space-y-3">
                      <h3 className="font-bold text-stone-800 text-sm flex items-center gap-2">
                        <Wallet className="w-4 h-4 text-pink-600" /> {t('paymentInstructionsTitle')}
                      </h3>
                      <p className="text-sm text-stone-600 leading-relaxed">{t('sendMoneyInstruction')}</p>
                      <div className="flex items-center justify-between gap-3 bg-white/80 border border-pink-100 rounded-xl px-4 py-3">
                        <span className="text-xs font-semibold text-stone-500">{t('bkashPersonalLabel')}</span>
                        <span className="flex items-center gap-2">
                          <span className="font-mono font-bold text-pink-600">{BKASH_NUMBER}</span>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard?.writeText(BKASH_NUMBER.replace(/[^0-9]/g, '')).then(() => {
                                setBkashCopied(true);
                                window.setTimeout(() => setBkashCopied(false), 2000);
                              }).catch(() => { /* clipboard unavailable */ });
                            }}
                            className="text-[11px] font-bold text-pink-600 hover:text-pink-700 bg-pink-100 hover:bg-pink-200 px-2 py-1 rounded-lg transition-colors"
                          >
                            {bkashCopied ? t('copiedShort') : t('copyShort')}
                          </button>
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="bg-white/80 border border-pink-100 rounded-xl px-4 py-2.5">
                          <p className="text-[11px] font-semibold text-stone-400 uppercase tracking-wide">{t('advanceAmountLabel')}</p>
                          <p className="font-bold text-stone-900">৳{advanceAmount.toFixed(0)}</p>
                        </div>
                        <div className="bg-white/80 border border-pink-100 rounded-xl px-4 py-2.5">
                          <p className="text-[11px] font-semibold text-stone-400 uppercase tracking-wide">{t('dueOnDeliveryLabel')}</p>
                          <p className="font-bold text-stone-900">{dueAmount === 0 ? '৳0' : `৳${dueAmount.toFixed(0)}`}</p>
                        </div>
                      </div>
                    </div>
                  ) : noAdvanceRequired ? (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-4 space-y-2">
                      <p className="flex items-center gap-2 text-sm text-emerald-700 font-bold">
                        <Banknote className="w-4 h-4" /> {t('codOnlyTitle')}
                      </p>
                      <p className="text-sm text-emerald-700/90">{t('codOnlyDesc', { total: total.toFixed(0) })}</p>
                      <p className="text-xs text-emerald-600/80">{t('codNote')}</p>
                    </div>
                  ) : deliveryChoice === 'pickup' ? (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 text-sm text-emerald-700 font-medium">
                      {t('pickupPayDesc', { amount: dueAmount.toFixed(0) })}
                    </div>
                  ) : (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 text-sm text-emerald-700 font-medium">
                      {t('payNothingNowDesc', { due: dueAmount.toFixed(0) })}
                    </div>
                  )}

                  {/* Sender details (only when an advance is due) */}
                  {advanceAmount > 0 && !noAdvanceRequired && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-stone-700 mb-1.5">
                          <span className="flex items-center gap-1.5"><Phone className="w-4 h-4" /> {t('senderBkashLabel')}</span>
                        </label>
                        <input
                          type="tel"
                          value={bkashNumber}
                          onChange={(e) => { setBkashNumber(e.target.value); setPaymentErrors({ ...paymentErrors, bkashNumber: '' }); }}
                          placeholder={t('senderBkashPlaceholder')}
                          className={`${inputCls(!!paymentErrors.bkashNumber)} focus:ring-pink-400`}
                        />
                        {paymentErrors.bkashNumber && <p className="text-xs text-red-500 mt-1">{paymentErrors.bkashNumber}</p>}
                        <p className="text-xs text-stone-400 mt-1.5">{t('senderBkashHint')}</p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-stone-700 mb-1.5">
                          <span className="flex items-center gap-1.5"><Hash className="w-4 h-4" /> TrxID</span>
                        </label>
                        <input
                          type="text"
                          value={trxId}
                          onChange={(e) => { setTrxId(e.target.value); setPaymentErrors({ ...paymentErrors, trxId: '' }); }}
                          placeholder="9F2XQ1ABCD"
                          className={`${inputCls(!!paymentErrors.trxId)} focus:ring-pink-400 uppercase`}
                        />
                        {paymentErrors.trxId && <p className="text-xs text-red-500 mt-1">{paymentErrors.trxId}</p>}
                      </div>
                    </>
                  )}

                  {/* Terms */}
                  <div>
                    <label className="flex items-start gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={agreeTerms}
                        onChange={(e) => { setAgreeTerms(e.target.checked); setAgreeError(false); }}
                        className="mt-0.5 w-4 h-4 rounded border-stone-300 text-brand-500 focus:ring-brand-400 accent-brand-500"
                      />
                      <span className="text-xs text-stone-600 leading-relaxed">
                        {t('agreePrefix')}{' '}
                        <a href="/policies" target="_blank" rel="noreferrer" className="font-semibold text-brand-600 underline underline-offset-2 hover:text-brand-700">{t('agreeTermsLink')}</a>
                        {' '}{t('agreeAnd')}{' '}
                        <a href="/policies" target="_blank" rel="noreferrer" className="font-semibold text-brand-600 underline underline-offset-2 hover:text-brand-700">{t('agreePrivacyLink')}</a>.
                      </span>
                    </label>
                    {agreeError && !agreeTerms && <p className="text-xs text-red-500 mt-1.5">{t('mustAgreeTerms')}</p>}
                  </div>

                  {error && (
                    <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-2xl px-4 py-3">
                      {error}
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => goToStep(2)}
                      disabled={submitting}
                      className="px-6 py-4 rounded-2xl border-2 border-stone-200 hover:border-stone-400 text-stone-700 font-bold text-sm transition-all disabled:opacity-50"
                    >
                      {t('back')}
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex-1 flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-400 disabled:opacity-70 text-white font-bold py-4 rounded-2xl transition-all hover:shadow-xl hover:shadow-brand-500/30 hover:-translate-y-0.5"
                    >
                      {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                      {submitting ? t('placingOrder') : t('placeOrder')}
                    </button>
                  </div>
                  <p className="flex items-center justify-center gap-1.5 text-xs text-stone-400">
                    <ShieldCheck className="w-3.5 h-3.5" /> {t('infoSecure')}
                  </p>
                </div>
              )}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
