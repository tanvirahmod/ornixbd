import { useState, useEffect, useMemo } from 'react';
import {
  Check, ChevronRight, CheckCircle, Loader2, User, Phone, MapPin, Wallet, Hash,
  ShieldCheck, ShoppingBag, Truck, Tag, X, Pencil, Banknote, AlertTriangle, PackageSearch,
} from 'lucide-react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase, Product, Coupon } from '../lib/supabase';
import { useLanguage } from '../lib/LanguageContext';
import ZoneSelect, { zoneForDistrict, parseZoneRates, minZoneRateOf, ZONE_RATE_KEYS, type ZoneRateMap } from '../components/ZoneSelect';
import ThanaSelect from '../components/ThanaSelect';
import { useNavigation } from '../lib/navigation';
import { useCart, CartItem } from '../lib/CartContext';
import { COVER_FALLBACK } from '../lib/utils';
import { setSEO, SITE_NAME } from '../lib/seo';

/* ────────────────────────────────────────────────────────────
   CHECKOUT CONSTANTS — tweak numbers here
   ──────────────────────────────────────────────────────────── */

type PaymentChoice = 'advance' | 'full';
type PayChannel = 'bkash' | 'nagad';

// Brand theming per wallet: bKash pink, Nagad orange.
const CHANNEL_THEME = {
  bkash: {
    box: 'bg-gradient-to-br from-pink-50 to-rose-50 border border-pink-200',
    soft: 'border-pink-100',
    text: 'text-pink-600',
    iconText: 'text-pink-600',
    chip: 'text-pink-600 hover:text-pink-700 bg-pink-100 hover:bg-pink-200',
    hover: 'hover:bg-pink-100',
    focus: 'focus:ring-pink-400',
  },
  nagad: {
    box: 'bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-200',
    soft: 'border-orange-100',
    text: 'text-orange-600',
    iconText: 'text-orange-500',
    chip: 'text-orange-600 hover:text-orange-700 bg-orange-100 hover:bg-orange-200',
    hover: 'hover:bg-orange-100',
    focus: 'focus:ring-orange-400',
  },
} as const;
type CheckoutStep = 1 | 2 | 3;

const round2 = (n: number) => Math.round(n * 100) / 100;

const CHECKOUT_STORAGE_KEY = 'ornix_checkout_v2';

function loadPersistedCheckout(): { name: string; phone: string; address: string; deliveryDistrict: string; deliveryThana: string; paymentChoice: PaymentChoice; payChannel: PayChannel; bkashNumber: string; trxId: string } | null {
  try {
    const raw = window.sessionStorage.getItem(CHECKOUT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      name: typeof parsed.name === 'string' ? parsed.name : '',
      phone: typeof parsed.phone === 'string' ? parsed.phone : '',
      deliveryDistrict: typeof parsed.deliveryDistrict === 'string' ? parsed.deliveryDistrict : '',
      deliveryThana: typeof parsed.deliveryThana === 'string' ? parsed.deliveryThana : '',
      address: typeof parsed.address === 'string' ? parsed.address : '',
      paymentChoice: parsed.paymentChoice === 'full' ? 'full' : 'advance',
      payChannel: parsed.payChannel === 'nagad' ? 'nagad' : 'bkash',
      bkashNumber: typeof parsed.bkashNumber === 'string' ? parsed.bkashNumber : '',
      trxId: typeof parsed.trxId === 'string' ? parsed.trxId : '',
    };
  } catch {
    return null;
  }
}

/** Map Bengali (০-৯) and Arabic-Indic (٠-٩) digits to ASCII so users typing
 *  with a Bangla keyboard still produce valid phone numbers / TrxIDs. */
export function toAsciiDigits(raw: string): string {
  return raw.replace(/[\u09E6-\u09EF\u0660-\u0669]/g, (d) => {
    const code = d.charCodeAt(0);
    return String.fromCharCode(code - (code >= 0x09e6 ? 0x09e6 : 0x0660) + 48);
  });
}

/** Normalizes a BD mobile number: transliterates Bangla digits, keeps digits and a single leading + */
function normalizeBdPhone(raw: string): string {
  const trimmed = toAsciiDigits(raw).replace(/[\s\-()]/g, '');
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
    deliveryThana: persisted?.deliveryThana ?? '',
  });
  const [errors, setErrors] = useState({ name: '', phone: '', address: '', deliveryDistrict: '', deliveryThana: '' });
  const [paymentChoice, setPaymentChoice] = useState<PaymentChoice>(persisted?.paymentChoice ?? 'advance');
  const [payChannel, setPayChannel] = useState<PayChannel>(persisted?.payChannel ?? 'bkash');
  const [wallets, setWallets] = useState<{ bkash: string; nagad: string }>({ bkash: '', nagad: '' });
  const [bkashNumber, setBkashNumber] = useState(persisted?.bkashNumber ?? '');
  const [trxId, setTrxId] = useState(persisted?.trxId ?? '');
  const [paymentErrors, setPaymentErrors] = useState({ bkashNumber: '', trxId: '' });
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreeError, setAgreeError] = useState(false);

  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  // Out-of-stock report from the atomic stock RPC, shown on the payment step.
  const [stockError, setStockError] = useState('');
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
        JSON.stringify({ ...form, paymentChoice, payChannel, bkashNumber, trxId })
      );
    } catch {
      // storage unavailable — the form just won't persist across reloads
    }
  }, [form, paymentChoice, payChannel, bkashNumber, trxId]);

  // ── Steadfast courier charges + the bKash/Nagad numbers to pay the advance to, editable in Admin → Settings ──
  const [zoneRates, setZoneRates] = useState<ZoneRateMap | null>(null);
  useEffect(() => {
    async function fetchZoneRates() {
      // Rates come ONLY from the admin panel (site_settings). No hardcoded
      // fallback: if any zone rate is missing/blank, ordering pauses with a
      // clear notice instead of silently charging an invented fee.
      const { data } = await supabase.from('site_settings').select('key, value').in('key', [...ZONE_RATE_KEYS, 'checkout_bkash_number', 'checkout_nagad_number']);
      const values: Record<string, string | null> = {};
      for (const s of data ?? []) values[s.key] = s.value;
      setZoneRates(parseZoneRates(values));
      const bkashRow = (data ?? []).find((s: { key: string }) => s.key === 'checkout_bkash_number');
      const nagadRow = (data ?? []).find((s: { key: string }) => s.key === 'checkout_nagad_number');
      // NEVER fall back to a placeholder number — customers would send real
      // money to a dead wallet. An empty number means "temporarily
      // unavailable" and the payment step shows a clear notice instead.
      setWallets({
        bkash: bkashRow?.value?.trim() ?? '',
        nagad: nagadRow?.value?.trim() ?? '',
      });
    }
    fetchZoneRates();
  }, []);
  // bKash is always available; Nagad appears once the admin saves a Nagad number.
  const payChannels = useMemo(() => {
    const out: PayChannel[] = wallets.bkash ? ['bkash'] : [];
    if (wallets.nagad) out.push('nagad');
    return out;
  }, [wallets.nagad, wallets.bkash]);
  const effectiveChannel: PayChannel = payChannels.includes(payChannel) ? payChannel : 'bkash';
  const payToWallet = effectiveChannel === 'nagad' ? wallets.nagad : wallets.bkash;
  const channelLabel = effectiveChannel === 'nagad' ? t('payChannelNagad') : t('payChannelBkash');

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

  // Delivery charge — always the ADMIN-SET zone rate (Settings → Delivery &
  // Payments) for the chosen district. Before a district is picked, the
  // CHEAPEST zone rate stands in as an honest "from" amount. When rates
  // aren't configured, ordering pauses (ratesMissing) — no invented fee.
  const minZoneRate = zoneRates ? minZoneRateOf(zoneRates) : null;
  const deliveryFee = zoneFee ?? minZoneRate ?? 0;
  const ratesMissing = zoneRates === null;

  const discountAmount = coupon
    ? Math.min(
        round2(coupon.discount_type === 'percent' ? (subtotal * Number(coupon.value)) / 100 : Number(coupon.value)),
        subtotal
      )
    : 0;
  const total = round2(Math.max(0, subtotal - discountAmount + deliveryFee));

  // Every item in this order is a no-advance product → pure cash on delivery,
  // no bKash number / TrxID required.
  const noAdvanceRequired = isCartCheckout
    ? summaryLines.length > 0 &&
      summaryLines.every((line) => {
        const code = line.code?.trim().toUpperCase();
        return !!code && productCodeMap[code] === true;
      })
    : product?.advance_optional === true;

  const advanceAmount = noAdvanceRequired ? 0 : paymentChoice === 'full' ? total : deliveryFee;
  const dueAmount = round2(total - advanceAmount);

  // No-advance order: force the COD option and drop any stored bKash details
  useEffect(() => {
    if (noAdvanceRequired && paymentChoice !== 'advance') setPaymentChoice('advance');
  }, [noAdvanceRequired, paymentChoice]);

  const goToStep = (next: CheckoutStep) => {
    setStep(next);
  };

  // After a step change — and after the order-confirmation screen appears —
  // the new content is much shorter than the old one, so the viewport would
  // stay scrolled far below it. Wait for React to commit the new layout
  // (double requestAnimationFrame), then animate back to the top. Starting a
  // fresh smooth scroll here also cancels any smooth-scroll animation still
  // running from the previous state (html has scroll-behavior: smooth in
  // index.css), so the scroll always lands exactly on top.
  useEffect(() => {
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [step, success]);

  /* ── Step 1 validation ── */
  const validateAddress = () => {
    const next = { name: '', phone: '', address: '', deliveryDistrict: '', deliveryThana: '' };
    if (!form.name.trim()) next.name = t('fullNameRequired');
    if (!form.phone.trim()) next.phone = t('phoneRequired');
    else if (!isValidBdMobile(form.phone)) next.phone = t('phoneInvalidBd');
    if (!form.address.trim()) next.address = t('addressRequired');
    else if (form.address.trim().length < 10) next.address = t('addressTooShort');
    // Steadfast delivers by district — require it so the courier charge matches the destination
    if (!form.deliveryDistrict) next.deliveryDistrict = t('districtRequired');
    if (!form.deliveryThana) next.deliveryThana = t('thanaRequired');
    setErrors(next);
    return !Object.values(next).some(Boolean);
  };

  /* ── Coupon ── */
  // Validation AND redemption happen server-side via checkout_redeem_coupon —
  // the coupons table is no longer publicly readable, so the client can neither
  // bypass the rules nor enumerate codes. Redeeming here reserves one use; if
  // the order later fails to save, handleSubmit restores it.
  const applyCoupon = async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    setCouponBusy(true);
    setCouponError('');

    const { data, error } = await supabase.rpc('checkout_redeem_coupon', {
      p_code: code,
      p_subtotal: subtotal,
      p_product_codes: orderProductCodes,
      p_commit: false, // validation only — the use is committed at final submit
    });
    const result = (Array.isArray(data) ? data[0] : data) as
      | { ok: boolean; error?: string; min_order_amount?: number; product_codes?: string[]; code?: string; discount_type?: 'percent' | 'fixed'; value?: number; discount?: number }
      | null;

    if (error || !result || !result.ok) {
      const err = result?.error;
      if (err === 'expired') setCouponError(t('couponExpired'));
      else if (err === 'min_order') setCouponError(t('couponMinOrder', { amount: Number(result?.min_order_amount ?? 0).toFixed(0) }));
      else if (err === 'usage_limit') setCouponError(t('couponUsageLimit'));
      else if (err === 'products') setCouponError(t('couponProductsOnly', { codes: (result?.product_codes ?? []).join(', ') }));
      else setCouponError(t('couponInvalid'));
      setCouponBusy(false);
      return;
    }

    // Trust the server's discount math (the client previously computed its own).
    setCoupon({
      id: result.code ?? code,
      code: result.code ?? code,
      discount_type: result.discount_type ?? 'fixed',
      value: Number(result.value ?? 0),
      min_order_amount: null,
      max_uses: null,
      times_used: null,
      is_active: true,
      product_codes: null,
      expires_at: null,
      created_at: '',
    });
    setCouponInput('');
    setCouponBusy(false);
  };

  const removeCoupon = () => {
    // Applying only validated the code — nothing was reserved, so no restore
    // is needed here. The single commit happens in handleSubmit.
    setCoupon(null);
    setCouponError('');
    setCouponInput('');
  };

  /* ── Step 3 validation + submit ── */
  const validatePayment = () => {
    const next = { bkashNumber: '', trxId: '' };
    if (advanceAmount > 0 && !payToWallet) {
      // Wallet number missing — the amber notice above explains it. Never
      // let the customer "pay" into a placeholder number.
      setError(t('paymentUnavailableTitle'));
      return false;
    }
    if (advanceAmount > 0 && !noAdvanceRequired) {
      if (!bkashNumber.trim()) next.bkashNumber = t('bkashNumberRequired');
      else if (!isValidBdMobile(bkashNumber)) next.bkashNumber = t('bkashNumberInvalid');
      if (!trxId.trim()) next.trxId = t('trxIdRequired', { channel: channelLabel });
      else if (!/^[A-Za-z0-9]{6,20}$/.test(toAsciiDigits(trxId.trim()))) next.trxId = t('trxIdInvalid', { channel: channelLabel });
    }
    setPaymentErrors(next);
    if (!agreeTerms) setAgreeError(true);
    return !Object.values(next).some(Boolean) && agreeTerms;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step !== 3) return;
    // Belt-and-braces: never place an order when the admin hasn't configured
    // the delivery rates (the buttons are already disabled).
    if (ratesMissing) return;
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
      unitPrice: number;
    }> = isCartCheckout
      ? cartItems.map((item) => ({
          productId: item.productId,
          title: item.title,
          code: item.productCode,
          size: item.size,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        }))
      : [
          {
            productId: productId!,
            title: product?.title ?? '',
            code: product?.product_code ?? null,
            size: selectedSize && selectedSize !== 'none' ? selectedSize : null,
            quantity: finalQuantity,
            unitPrice,
          },
        ];

    // Full address line: street details + thana + district
    const addressParts = [form.address.trim(), form.deliveryThana.trim(), form.deliveryDistrict].filter(Boolean);
    const customer = {
      customer_name: form.name.trim(),
      customer_phone: form.phone.trim(),
      customer_address: addressParts.join(', '),
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

    // Per-line money allocation — every order row carries ONLY its own share of
    // the purchase (each row previously stored the whole cart's totals, which
    // multiplied revenue when rows were summed). Cart-wide charges are spread
    // proportionally to each line's value; rounding leftovers land on the first
    // line so per-line sums always equal the purchase totals exactly.
    const lineGross = lineItems.map((item) => round2(item.unitPrice * item.quantity));
    const grossSum = round2(lineGross.reduce((s, v) => s + v, 0)) || 1;
    const alloc = (charge: number, i: number) =>
      i === 0
        ? round2(charge - lineGross.slice(1).reduce((s, g) => s + (charge * g) / grossSum, 0))
        : round2((charge * lineGross[i]) / grossSum);
    const linePricing = lineItems.map((_item, i) => ({
      lineSubtotal: lineGross[i],
      lineFee: alloc(deliveryFee, i),
      lineDiscount: alloc(discountAmount, i),
      lineTotal: round2(lineGross[i] + alloc(deliveryFee, i) - alloc(discountAmount, i)),
      lineAdvance: alloc(noAdvanceRequired ? 0 : round2(advanceAmount), i),
      lineDue: round2(lineGross[i] + alloc(deliveryFee, i) - alloc(discountAmount, i) - alloc(noAdvanceRequired ? 0 : round2(advanceAmount), i)),
    }));
    setPlacedOrderCode(orderCode);
    const payment = {
      payment_method: noAdvanceRequired ? 'cash_on_delivery' : paymentChoice === 'full' ? 'full_advance' : 'advance_partial',
      advance_amount: noAdvanceRequired ? 0 : round2(advanceAmount),
      due_amount: noAdvanceRequired ? total : round2(dueAmount),
      courier_name: `Steadfast Courier · ${deliveryDistrict || 'Bangladesh'}`,
      delivery_zone: form.deliveryDistrict || null,
      bkash_number: advanceAmount > 0 && !noAdvanceRequired ? bkashNumber.trim() : null,
      trx_id: advanceAmount > 0 && !noAdvanceRequired ? trxId.trim() : null,
      // Which mobile wallet the advance was sent through (bKash or Nagad).
      // Column may not exist yet — the payload fallback chain below handles that.
      payment_channel: advanceAmount > 0 && !noAdvanceRequired ? effectiveChannel : null,
    };

    // Fall back to progressively fewer columns for older schemas
    const payloadCandidates: Array<Record<string, string | number | null>>[] = lineItems.map((item, i) => [
      {
        product_id: item.productId,
        product_title: item.title,
        product_code: item.code,
        selected_size: item.size,
        quantity: item.quantity,
        order_code: orderCode,
        ...customer,
        subtotal: linePricing[i].lineSubtotal,
        delivery_fee: linePricing[i].lineFee,
        discount_amount: linePricing[i].lineDiscount,
        total_amount: linePricing[i].lineTotal,
        coupon_code: pricing.coupon_code,
        ...payment,
        // Payment amounts are allocated per line too — the row's advance/due
        // must be its own share, not the purchase-wide values.
        advance_amount: linePricing[i].lineAdvance,
        due_amount: linePricing[i].lineDue,
      },
      {
        product_id: item.productId,
        product_title: item.title,
        product_code: item.code,
        selected_size: item.size,
        quantity: item.quantity,
        order_code: orderCode,
        ...customer,
        subtotal: linePricing[i].lineSubtotal,
        delivery_fee: linePricing[i].lineFee,
        discount_amount: linePricing[i].lineDiscount,
        total_amount: linePricing[i].lineTotal,
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
        subtotal: linePricing[i].lineSubtotal,
        delivery_fee: linePricing[i].lineFee,
        total_amount: linePricing[i].lineTotal,
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

    // Stock guard FIRST — all-or-nothing via the locked-down RPC. It verifies
    // every line under row locks before touching anything; a shortage returns
    // the report and changes nothing, so the customer gets a clear message
    // instead of an oversold order.
    const stockPayload = lineItems.map((item) => ({ product_id: item.productId, size: item.size ?? null, quantity: item.quantity }));
    let shortages: Array<{ product_id: string; size: string | null; requested: number; available: number }> = [];
    let stockFailed = false;
    try {
      const rpc = await supabase.rpc('checkout_decrement_stock', { p_items: stockPayload });
      const rows = (Array.isArray(rpc.data) ? rpc.data : null) as typeof shortages | null;
      if (rpc.error || rows === null) stockFailed = true;
      else shortages = rows;
    } catch {
      stockFailed = true;
    }

    if (shortages.length > 0) {
      const titleFor = (pid: string) => lineItems.find((li) => li.productId === pid)?.title ?? 'An item';
      const missing = shortages
        .map((s) => `${titleFor(s.product_id)}${s.size ? ` (size ${s.size})` : ''}: only ${s.available} left, you asked for ${s.requested}`)
        .join('; ');
      setStockError(missing);
      setSubmitting(false);
      return;
    }
    if (stockFailed) {
      // Migration not applied yet — proceed without the guard (old behavior)
      // rather than blocking every checkout. Nothing was decremented.
      console.warn('checkout_decrement_stock unavailable — skipping stock guard.');
    }

    // Commit the coupon's single use atomically server-side, right before the
    // order insert. If the insert fails below, we give it back.
    let committedCoupon = false;
    if (coupon) {
      try {
        const redeem = await supabase.rpc('checkout_redeem_coupon', {
          p_code: coupon.code,
          p_subtotal: subtotal,
          p_product_codes: orderProductCodes,
          p_commit: true,
        });
        const result = (Array.isArray(redeem.data) ? redeem.data[0] : redeem.data) as { ok?: boolean } | null;
        if (redeem.error || !result?.ok) {
          setCouponError(t('couponUsageLimit'));
          setSubmitting(false);
          return;
        }
        committedCoupon = true;
      } catch {
        // redeem RPC missing (legacy DB) — keep the order going; the counter
        // stays best-effort as before.
      }
    }

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
        // Last resort: the SECURITY DEFINER RPC bypasses RLS entirely — it
        // covers databases where policy changes never reach the API layer
        // (42501 despite confirmed permissive INSERT policies).
        try {
          const rpc = await supabase.rpc('insert_order_rpc', { p_row: payloadCandidates[i][0] });
          const res = rpc.data as { ok?: boolean } | null;
          if (!rpc.error && res?.ok) itemError = null;
        } catch {
          // RPC not applied yet (legacy DB) — surface the original error
        }
      }
      if (itemError) {
        submitError = itemError;
        break;
      }
    }

    if (submitError) {
      // Give the reserved stock and the committed coupon use back (nothing was saved).
      if (committedCoupon) {
        try { await supabase.rpc('checkout_restore_coupon', { p_code: coupon!.code }); } catch { /* best effort */ }
      }
      try { await supabase.rpc('checkout_restore_stock', { p_items: stockPayload }); } catch { /* best effort */ }
      setError(t('somethingWentWrong'));
      setSubmitting(false);
      return;
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
      <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4 py-8">
        <div className="bg-white rounded-3xl shadow-xl p-6 sm:p-10 max-w-md w-full text-center animate-fade-in-up">
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
              {/* The tracking link itself — one tap to the live status page,
                  with the code prefilled and auto-tracked. */}
              <a
                href={`/track?code=${encodeURIComponent(placedOrderCode)}`}
                onClick={(e) => { e.preventDefault(); onNavigate('track'); }}
                className="mt-2.5 w-full flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-400 text-white font-bold text-sm py-2.5 rounded-xl transition-all"
              >
                <PackageSearch className="w-4 h-4" /> {t('trackYourOrderCta')}
              </a>
            </div>
          )}
          {!placedOrderCode && (
            <a
              href="/track"
              onClick={(e) => { e.preventDefault(); onNavigate('track'); }}
              className="text-sm font-semibold text-brand-600 hover:text-brand-700 underline underline-offset-2 mb-4 inline-block"
            >
              {t('trackYourOrderCta')}
            </a>
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
          <p className="text-xs text-stone-400 mb-4 flex items-center justify-center gap-1.5 text-left">
            <PackageSearch className="w-3.5 h-3.5 flex-shrink-0 text-brand-400" />
            {t('trackYourOrderNote')}
          </p>
          <p className="text-xs text-stone-400 mb-8 flex items-center justify-center gap-1.5 text-left">
            {noAdvanceRequired ? (
              <><Banknote className="w-3.5 h-3.5 flex-shrink-0 text-emerald-500" /> {t('codOnlyDesc', { total: total.toFixed(0), channel: channelLabel })}</>
            ) : paymentChoice === 'full' ? (
              <><ShieldCheck className="w-3.5 h-3.5 flex-shrink-0 text-emerald-500" /> {t('payFullNowDesc', { total: total.toFixed(0), channel: channelLabel })}</>
            ) : (
              <><Wallet className={`w-3.5 h-3.5 flex-shrink-0 ${CHANNEL_THEME[effectiveChannel].iconText}`} /> {t('payDeliveryNowDesc', { advance: round2(advanceAmount).toFixed(0), due: dueAmount.toFixed(0), channel: channelLabel })}</>
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

  const paymentOptions = (channelName: string) => [
    {
      id: 'advance' as PaymentChoice,
      icon: noAdvanceRequired ? <Banknote className="w-5 h-5" /> : <Wallet className="w-5 h-5" />,
      title: noAdvanceRequired
        ? t('codOnlyTitle')
        : t('payDeliveryNowTitle'),
      desc: noAdvanceRequired
        ? t('codOnlyDesc', { total: total.toFixed(0), channel: channelName })
        : deliveryFee === 0
          ? t('payNothingNowDesc', { due: total.toFixed(0), channel: channelName })
          : t('payDeliveryNowDesc', { advance: deliveryFee.toFixed(0), due: round2(total - deliveryFee).toFixed(0), channel: channelName }),
      disabled: noAdvanceRequired,
      advance: noAdvanceRequired ? 0 : deliveryFee,
      due: noAdvanceRequired ? total : round2(total - deliveryFee),
    },
    {
      id: 'full' as PaymentChoice,
      icon: <ShieldCheck className="w-5 h-5" />,
      title: t('payFullNowTitle'),
      desc: t('payFullNowDesc', { total: total.toFixed(0), channel: channelName }),
      disabled: noAdvanceRequired,
      advance: total,
      due: 0,
    },
  ];

  // Hint when the zone fee isn't known yet for the chosen district
  const zonePendingHint =
    zoneFee == null
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
          {/* ── Sidebar: summary + coupon ──
              Code order: sidebar first, form second. The order-* classes put
              the FORM on top for phones (order-1) so a step change or the
              success screen is what the customer sees — no scrolling — while
              desktop keeps summary-left / steps-right. */}
          <div className="order-2 md:order-1 md:col-span-2 space-y-4 min-w-0">
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
                  {zoneFee != null ? (
                    <span className="font-medium text-stone-700">৳{deliveryFee.toFixed(0)}</span>
                  ) : minZoneRate != null ? (
                    <span className="font-medium text-stone-700">{t('deliveryFeeFrom', { amount: minZoneRate })}</span>
                  ) : (
                    <span className="text-xs text-stone-400 italic">{t('deliveryFeeAtCheckout')}</span>
                  )}
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
          <div className="order-1 md:order-2 md:col-span-3 min-w-0">
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
                      onChange={(e) => { setForm({ ...form, phone: toAsciiDigits(e.target.value) }); setErrors({ ...errors, phone: '' }); }}
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
                      <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4" /> {t('thanaLabel')} <span className="text-red-400">*</span></span>
                    </label>
                    <ThanaSelect
                      district={form.deliveryDistrict}
                      value={form.deliveryThana}
                      onChange={(thana) => { setForm({ ...form, deliveryThana: thana }); setErrors({ ...errors, deliveryThana: '' }); }}
                      error={errors.deliveryThana}
                      required
                    />
                  </div>

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

                  {/* Home delivery is the only method — show a static summary instead of a chooser */}
                  <div className="flex items-start gap-3 rounded-2xl border-2 border-brand-500 bg-brand-50/60 shadow-sm p-4">
                    <span className="flex-shrink-0 mt-0.5 text-brand-600"><Truck className="w-5 h-5" /></span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-bold text-stone-900 text-sm">{t('homeDeliveryName')}</span>
                        <span className="text-sm font-bold whitespace-nowrap text-stone-900">
                          ৳{deliveryFee.toFixed(0)}
                        </span>
                      </span>
                      <span className="block text-xs text-stone-500 mt-0.5">{t('homeDeliveryDesc')}</span>
                      <span className="block text-[11px] text-stone-400 mt-1">{t('courierEta')}</span>
                    </span>
                  </div>

                  <p className="flex items-start gap-2 text-xs text-stone-500 bg-stone-50 border border-stone-100 rounded-2xl px-4 py-3">
                    <Phone className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> {t('deliveryCallNote')}
                  </p>

                  {zonePendingHint && (
                    <p className="flex items-start gap-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> {zonePendingHint}
                    </p>
                  )}

                  {/* Delivery rates not configured in the admin panel — pause
                      ordering rather than charging an invented fee. */}
                  {ratesMissing && (
                    <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-4">
                      <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-amber-800 font-medium">{t('deliveryFeeNotSet')}</p>
                    </div>
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
                      disabled={ratesMissing}
                      className="flex-1 bg-brand-500 hover:bg-brand-400 disabled:opacity-60 disabled:hover:shadow-none text-white font-bold py-4 rounded-2xl transition-all hover:shadow-xl hover:shadow-brand-500/30 hover:-translate-y-0.5"
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
                          {t('homeDeliveryName')}
                        </p>
                        <p className="text-xs text-stone-500">
                          {t('shippingRowLabel')}: ৳{deliveryFee.toFixed(0)}
                        </p>
                      </div>
                      <Pencil className="w-3.5 h-3.5 text-brand-600 flex-shrink-0 mt-1" />
                    </button>
                  </div>

                  {/* Payment options */}
                  <div className="space-y-3">
                    {paymentOptions(channelLabel).map((option) => {
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

                  {/* Advance instructions (only when something must be sent now) */}
                  {advanceAmount > 0 && !payToWallet ? (
                    // No wallet number configured (or settings failed to load).
                    // Never show a placeholder number — customers would send real
                    // money to a dead account. Block the step with a clear notice.
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-4 space-y-2">
                      <p className="flex items-center gap-2 text-sm text-amber-800 font-bold">
                        <AlertTriangle className="w-4 h-4" /> {t('paymentUnavailableTitle')}
                      </p>
                      <p className="text-sm text-amber-700/90">{t('paymentUnavailableDesc', { channel: channelLabel })}</p>
                    </div>
                  ) : advanceAmount > 0 ? (
                    <div className={`${CHANNEL_THEME[effectiveChannel].box} rounded-2xl p-4 space-y-3`}>
                      <h3 className="font-bold text-stone-800 text-sm flex items-center gap-2">
                        <Wallet className={`w-4 h-4 ${CHANNEL_THEME[effectiveChannel].iconText}`} /> {t('paymentInstructionsTitle')}
                      </h3>
                      {payChannels.length > 1 && (
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-xs font-semibold text-stone-500">{t('payChannelLabel')}</span>
                          <div className={`flex gap-1 bg-white/80 ${CHANNEL_THEME[effectiveChannel].soft} rounded-xl p-1`}>
                            {payChannels.map((c) => (
                              <button
                                key={c}
                                type="button"
                                onClick={() => setPayChannel(c)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                  effectiveChannel === c
                                    ? 'bg-brand-500 text-white shadow-sm'
                                    : `text-stone-500 ${CHANNEL_THEME[effectiveChannel].hover}`
                                }`}
                              >
                                {c === 'nagad' ? t('payChannelNagad') : t('payChannelBkash')}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <p className="text-sm text-stone-600 leading-relaxed">{t('sendMoneyInstruction', { channel: channelLabel })}</p>
                      <div className={`flex items-center justify-between gap-3 bg-white/80 ${CHANNEL_THEME[effectiveChannel].soft} rounded-xl px-4 py-3`}>
                        <span className="text-xs font-semibold text-stone-500">
                          {effectiveChannel === 'nagad' ? t('nagadPersonalLabel') : t('bkashPersonalLabel')}
                        </span>
                        <span className="flex items-center gap-2">
                          <span className={`font-mono font-bold ${CHANNEL_THEME[effectiveChannel].text}`}>{payToWallet}</span>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard?.writeText(payToWallet.replace(/[^0-9]/g, '')).then(() => {
                                setBkashCopied(true);
                                window.setTimeout(() => setBkashCopied(false), 2000);
                              }).catch(() => { /* clipboard unavailable */ });
                            }}
                            className={`text-[11px] font-bold ${CHANNEL_THEME[effectiveChannel].chip} px-2 py-1 rounded-lg transition-colors`}
                          >
                            {bkashCopied ? t('copiedShort') : t('copyShort')}
                          </button>
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className={`bg-white/80 ${CHANNEL_THEME[effectiveChannel].soft} rounded-xl px-4 py-2.5`}>
                          <p className="text-[11px] font-semibold text-stone-400 uppercase tracking-wide">{t('advanceAmountLabel')}</p>
                          <p className="font-bold text-stone-900">৳{advanceAmount.toFixed(0)}</p>
                        </div>
                        <div className={`bg-white/80 ${CHANNEL_THEME[effectiveChannel].soft} rounded-xl px-4 py-2.5`}>
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
                      <p className="text-sm text-emerald-700/90">{t('codOnlyDesc', { total: total.toFixed(0), channel: channelLabel })}</p>
                      <p className="text-xs text-emerald-600/80">{t('codNote')}</p>
                    </div>
                  ) : (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 text-sm text-emerald-700 font-medium">
                      {t('payNothingNowDesc', { due: dueAmount.toFixed(0), channel: channelLabel })}
                    </div>
                  )}

                  {/* Sender details (only when an advance is due) */}
                  {advanceAmount > 0 && !noAdvanceRequired && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-stone-700 mb-1.5">
                          <span className="flex items-center gap-1.5"><Phone className="w-4 h-4" /> {t('senderBkashLabel', { channel: channelLabel })}</span>
                        </label>
                        <input
                          type="tel"
                          value={bkashNumber}
                          onChange={(e) => { setBkashNumber(toAsciiDigits(e.target.value)); setPaymentErrors({ ...paymentErrors, bkashNumber: '' }); }}
                          placeholder={t('senderBkashPlaceholder')}
                          className={`${inputCls(!!paymentErrors.bkashNumber)} ${CHANNEL_THEME[effectiveChannel].focus}`}
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
                          onChange={(e) => { setTrxId(toAsciiDigits(e.target.value)); setPaymentErrors({ ...paymentErrors, trxId: '' }); }}
                          placeholder="9F2XQ1ABCD"
                          className={`${inputCls(!!paymentErrors.trxId)} ${CHANNEL_THEME[effectiveChannel].focus} uppercase`}
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

                  {stockError && (
                    <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-2xl px-4 py-3">
                      <p className="font-semibold mb-0.5">Out of stock</p>
                      {stockError}
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
                      disabled={submitting || ratesMissing || (advanceAmount > 0 && !payToWallet)}
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
