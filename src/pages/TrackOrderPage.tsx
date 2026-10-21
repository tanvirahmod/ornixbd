import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search, Package, Truck, XCircle, Clock, Loader2, PackageSearch,
  MapPin, Phone, ExternalLink, Copy, CheckCircle2,
} from 'lucide-react';
import { supabase, Order } from '../lib/supabase';
import { setSEO, SITE_NAME } from '../lib/seo';
import { checkSteadfastStatus } from '../lib/steadfast';

type CourierUpdate = {
  title: string;
  description: string;
  tone: 'neutral' | 'progress' | 'success' | 'warning' | 'error';
};

function courierUpdateFor(status: string): CourierUpdate {
  switch (status) {
    case 'pending':
      return { title: 'Courier booking received', description: 'Steadfast has received the parcel booking and is preparing it for delivery.', tone: 'neutral' };
    case 'in_review':
      return { title: 'Being processed by the courier', description: 'Steadfast is reviewing the parcel before it moves to delivery.', tone: 'progress' };
    case 'hold':
      return { title: 'Courier status on hold', description: 'Steadfast has put this parcel on hold. Contact us if this status does not change.', tone: 'warning' };
    case 'with_a_rider':
    case 'with_rider':
    case 'picked_up':
      return { title: 'With the courier', description: 'The courier has picked up the parcel.', tone: 'progress' };
    case 'in_transit':
      return { title: 'On the way', description: 'The parcel is moving through the courier network toward you.', tone: 'progress' };
    case 'delivered_approval_pending':
      return { title: 'Marked delivered — confirmation pending', description: 'Steadfast reports delivery, but its final confirmation is still pending.', tone: 'warning' };
    case 'partial_delivered_approval_pending':
      return { title: 'Partially delivered — confirmation pending', description: 'Steadfast reports a partial delivery; final confirmation is still pending.', tone: 'warning' };
    case 'delivered':
      return { title: 'Delivered', description: 'Steadfast confirms that the parcel was delivered.', tone: 'success' };
    case 'partial_delivered':
      return { title: 'Partially delivered', description: 'Steadfast confirms that only part of the parcel was delivered. Contact us for help.', tone: 'warning' };
    case 'cancelled_approval_pending':
      return { title: 'Cancellation pending confirmation', description: 'Steadfast reports a cancellation that is awaiting final confirmation.', tone: 'warning' };
    case 'cancelled':
      return { title: 'Courier delivery cancelled', description: 'Steadfast confirms that this parcel was cancelled or returned.', tone: 'error' };
    case 'unknown_approval_pending':
      return { title: 'Courier update needs attention', description: 'Steadfast could not confirm the parcel status. Please contact us for help.', tone: 'warning' };
    default:
      return { title: 'Courier status updated', description: `Latest courier update: ${status.replace(/_/g, ' ')}.`, tone: 'neutral' };
  }
}

function normalizeCode(raw: string): string {
  const cleaned = raw.trim().toUpperCase().replace(/\s+/g, '');
  // Accept "ORN-XXXXXX", "ORNXXXXXX" and "XXXXXX" alike — insert the ORN-
  // prefix when it's missing, never mangle what the customer typed.
  if (/^ORN-/.test(cleaned)) return cleaned;
  if (/^ORN/.test(cleaned)) return `ORN-${cleaned.slice(3)}`;
  return `ORN-${cleaned}`;
}

export default function TrackOrderPage() {
  const [params] = useSearchParams();
  // Deep link support: /track?code=ORN-XXXXXX (the checkout success screen
  // links here with the fresh code) pre-fills and auto-tracks once.
  const initialCode = params.get('code') ?? '';
  const [code, setCode] = useState(normalizeCode(initialCode));
  const autoTracked = useRef(false);
  const [phoneLast, setPhoneLast] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // All order rows sharing the looked-up code (a cart checkout inserts one row
  // per item — the page must show the whole purchase, not just the first row).
  const [rows, setRows] = useState<Partial<Order>[]>([]);
  const [sfStatus, setSfStatus] = useState<string | null>(null);
  const [courierLookup, setCourierLookup] = useState<'idle' | 'checking' | 'updated' | 'not_booked' | 'not_found' | 'unavailable'>('idle');
  const [courierMessage, setCourierMessage] = useState('');
  const [copied, setCopied] = useState(false);

  setSEO({
    title: `Track Order — ${SITE_NAME}`,
    url: '/track',
    description: 'Track your ORNIX order with your order code.',
  });

  const handleTrack = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const cleaned = normalizeCode(code);
    if (!cleaned || cleaned.length < 6) {
      setError('Enter the order code from your confirmation (looks like ORN-XXXXXX).');
      return;
    }
    setLoading(true);
    setError('');
    setRows([]);
    setSfStatus(null);
    setCourierLookup('idle');
    setCourierMessage('');

    // Track via the locked-down RPC (public SELECT on orders is revoked by the
    // security lockdown, so a direct-query "fallback" could never succeed —
    // it only produced a misleading "No order found"). A missing RPC is a
    // server-setup problem and gets its own message instead.
    let dbError: string | null = null;
    let found: Partial<Order>[] = [];
    try {
      const rpc = await supabase.rpc('track_order', { p_order_code: cleaned, p_phone_last4: phoneLast.trim() || null });
      if (rpc.error) {
        dbError = rpc.error.message;
      } else {
        found = (rpc.data as Partial<Order>[] | null) ?? [];
      }
    } catch {
      dbError = 'Network error — please try again.';
    }

    if (dbError) {
      setLoading(false);
      const missing = dbError.includes('Could not find the function') || dbError.includes('schema cache');
      setError(
        missing
          ? 'Tracking is temporarily unavailable on our side — please try again shortly or contact us on WhatsApp.'
          : 'No order found with that code. Double-check the code from your confirmation screen.'
      );
      return;
    }
    if (found.length === 0) {
      setLoading(false);
      setError('No order found with that code. Double-check the code from your confirmation screen.');
      return;
    }

    // Phone check: the RPC hides customer_phone on mismatch — treat null as mismatch.
    if (phoneLast.trim()) {
      const digits = (found[0].customer_phone ?? '').replace(/\D/g, '');
      if (!digits.endsWith(phoneLast.trim())) {
        setLoading(false);
        setError('The last 4 digits don\u2019t match this order code.');
        return;
      }
    }

    setRows(found);

    // Live courier status (best effort — page still works if this fails).
    // All rows of a purchase share one tracking code.
    const tracking = found.map((r) => r.tracking_code).find(Boolean);
    if (tracking) {
      setCourierLookup('checking');
      const res = await checkSteadfastStatus(tracking);
      if (res.ok && res.status) {
        setSfStatus(res.status);
        setCourierLookup('updated');
      } else if (res.notFound) {
        setCourierMessage(res.message);
        setCourierLookup('not_found');
      } else {
        setCourierMessage(res.message);
        setCourierLookup('unavailable');
      }
    } else {
      setCourierLookup('not_booked');
    }
    setLoading(false);
  };

  // Auto-track a deep-linked code exactly once (StrictMode double-invokes
  // effects in dev — the ref keeps it to a single lookup).
  const handleTrackRef = useRef(handleTrack);
  handleTrackRef.current = handleTrack;
  useEffect(() => {
    if (initialCode && !autoTracked.current) {
      autoTracked.current = true;
      void handleTrackRef.current();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="store-page store-page--track min-h-screen bg-stone-50">
      {/* Header */}
      <div className="bg-white border-b border-stone-100">
        <div className="max-w-2xl mx-auto px-4 pt-6 pb-6 text-center">
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-1">Delivery tracking</p>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-stone-900">Track Your Order</h1>
          <p className="text-sm text-stone-500 mt-2">
            Enter the order code from your confirmation screen — it looks like <span className="font-mono font-semibold text-stone-700">ORN-XXXXXX</span>
          </p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">
        {/* Lookup form */}
        <form onSubmit={handleTrack} className="bg-white rounded-3xl shadow-sm border border-stone-100 p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Order code</label>
            <div className="relative">
              <PackageSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-stone-400" />
              <input
                type="text"
                value={code}
                onChange={(e) => { setCode(e.target.value); setError(''); }}
                placeholder="ORN-XXXXXX"
                autoComplete="off"
                className="w-full border border-stone-200 rounded-2xl pl-11 pr-4 py-3.5 text-sm font-mono uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-brand-400 transition-all"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">
              Last 4 digits of your phone <span className="text-stone-400 font-normal">(optional, extra security)</span>
              </label>
            <div className="relative">
              <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <input
                type="tel"
                value={phoneLast}
                onChange={(e) => { setPhoneLast(e.target.value.replace(/\D/g, '').slice(0, 4)); setError(''); }}
                placeholder="e.g. 1234"
                autoComplete="off"
                className="w-full border border-stone-200 rounded-2xl pl-11 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 transition-all"
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-stone-900 hover:bg-stone-800 text-white font-bold py-4 rounded-2xl transition-all hover:shadow-lg disabled:opacity-60"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {loading ? 'Searching…' : 'Track my order'}
          </button>
        </form>

        {/* Result */}
        {rows.length > 0 && (() => {
          const order = rows[0];
          const multi = rows.length > 1;
          // Purchase-level totals: per-line amounts are allocated shares, the
          // real totals are the sums across every row of the code.
          const purchaseTotal = rows.reduce((s, r) => s + Number(r.total_amount ?? 0), 0);
          const purchaseDue = rows.reduce((s, r) => s + Number(r.due_amount ?? 0), 0);
          const orderDate = rows.map((r) => r.created_at).sort()[0];
          const courierUpdate = sfStatus ? courierUpdateFor(sfStatus) : null;
          const canceled = order.status === 'canceled' || sfStatus === 'cancelled';
          const courierTone = courierUpdate?.tone === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : courierUpdate?.tone === 'error'
              ? 'bg-red-50 border-red-200 text-red-800'
              : courierUpdate?.tone === 'warning'
                ? 'bg-amber-50 border-amber-200 text-amber-800'
                : courierUpdate?.tone === 'progress'
                  ? 'bg-sky-50 border-sky-200 text-sky-800'
                  : 'bg-stone-50 border-stone-200 text-stone-800';
          return (
          <div className="bg-white rounded-3xl shadow-sm border border-stone-100 overflow-hidden animate-fade-in-up">
            {/* Summary */}
            <div className="p-6 border-b border-stone-100">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Order {order.order_code}</p>
                  <p className="font-display text-xl font-bold text-stone-900 mt-0.5">
                    {multi ? `${rows.length} items` : order.product_title}
                  </p>
                  <p className="text-sm text-stone-500 mt-0.5">
                    {new Date(orderDate ?? Date.now()).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Total</p>
                  <p className="font-display text-xl font-bold text-stone-900">৳{purchaseTotal.toFixed(0)}</p>
                  {purchaseDue > 0 && <p className="text-xs text-stone-400 mt-0.5">Due on delivery ৳{purchaseDue.toFixed(0)}</p>}
                </div>
              </div>

              {/* All items of the purchase */}
              {multi && (
                <div className="mt-3 space-y-1">
                  {rows.map((r, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-stone-600 truncate">
                        {r.product_title}
                        {r.selected_size ? ` · ${r.selected_size}` : ''}
                        <span className="text-stone-400"> ×{r.quantity ?? 1}</span>
                      </span>
                      <span className="font-medium text-stone-800 whitespace-nowrap">৳{Number(r.total_amount ?? 0).toFixed(0)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4 flex items-center gap-2 flex-wrap">
                {order.tracking_code ? (
                  <>
                    <button
                      onClick={() => {
                        navigator.clipboard?.writeText(order.tracking_code!).then(() => {
                          setCopied(true);
                          window.setTimeout(() => setCopied(false), 2000);
                        }).catch(() => { /* clipboard unavailable */ });
                      }}
                      className="flex items-center gap-1.5 text-[11px] font-mono font-bold bg-brand-50 text-brand-700 border border-brand-200 px-2.5 py-1 rounded-full hover:bg-brand-100 transition-colors"
                    >
                      <Truck className="w-3.5 h-3.5" /> {order.tracking_code}
                      {copied ? <CheckCircle2 className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    </button>
                    <a
                      href={`https://steadfast.com.bd/t/${order.tracking_code}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-xs font-semibold text-stone-500 hover:text-brand-600 transition-colors"
                    >
                      Steadfast page <ExternalLink className="w-3 h-3" />
                    </a>
                  </>
                ) : (
                  <span className="text-xs text-stone-400 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" /> Courier tracking will appear after the parcel is booked
                  </span>
                )}
              </div>
            </div>

            <div className="p-6 space-y-4">
              {canceled ? (
                <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800">
                  <XCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-sm">This order was cancelled</p>
                    <p className="text-xs mt-1">If this is a mistake, contact us with your order code.</p>
                  </div>
                </div>
              ) : courierLookup === 'checking' ? (
                <div className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-stone-50 p-4 text-stone-700">
                  <Loader2 className="w-5 h-5 flex-shrink-0 animate-spin" />
                  <div>
                    <p className="font-bold text-sm">Checking courier status</p>
                    <p className="text-xs text-stone-500 mt-1">Getting the latest update from Steadfast…</p>
                  </div>
                </div>
              ) : courierLookup === 'updated' && courierUpdate ? (
                <div className={`flex items-start gap-3 rounded-2xl border p-4 ${courierTone}`}>
                  <Truck className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-sm">{courierUpdate.title}</p>
                    <p className="text-xs mt-1">{courierUpdate.description}</p>
                    <p className="text-[11px] mt-2 opacity-75">Latest update from Steadfast</p>
                  </div>
                </div>
              ) : courierLookup === 'not_found' ? (
                <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
                  <Clock className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-sm">Courier tracking is unavailable</p>
                    <p className="text-xs mt-1">We found your order, but Steadfast has no active record for this tracking code. Contact us with your order code and tracking code.</p>
                    {courierMessage && <p className="text-[11px] mt-2 opacity-75">{courierMessage}</p>}
                  </div>
                </div>
              ) : courierLookup === 'unavailable' ? (
                <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
                  <Clock className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-sm">Could not check the courier status</p>
                    <p className="text-xs mt-1">Your order is still here, but we could not get a fresh delivery update. Please try again later or use the Steadfast tracking link above.</p>
                    {courierMessage && <p className="text-[11px] mt-2 opacity-75">{courierMessage}</p>}
                  </div>
                </div>
              ) : courierLookup === 'not_booked' && order.status === 'delivered' ? (
                <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
                  <Package className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-sm">Our records mark this order as delivered</p>
                    <p className="text-xs mt-1">A courier tracking code is not available, so we cannot verify the delivery status here. Contact us if you need help.</p>
                  </div>
                </div>
              ) : courierLookup === 'not_booked' ? (
                <div className="flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sky-900">
                  <Package className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-sm">Order received</p>
                    <p className="text-xs mt-1">The courier booking has not been added yet. We’ll show delivery updates here after your parcel is booked.</p>
                  </div>
                </div>
              ) : null}

              {order.customer_phone && (
                <div className="pt-4 border-t border-stone-100 space-y-1.5">
                  {order.customer_address && (
                    <p className="flex items-start gap-2 text-sm text-stone-600">
                      <MapPin className="w-4 h-4 text-stone-400 flex-shrink-0 mt-0.5" />
                      <span className="break-words">{order.customer_address}{order.delivery_zone ? ` · ${order.delivery_zone}` : ''}</span>
                    </p>
                  )}
                  <p className="flex items-center gap-2 text-sm text-stone-600">
                    <Phone className="w-4 h-4 text-stone-400 flex-shrink-0" /> {order.customer_phone}
                  </p>
                  {order.courier_name && (
                    <p className="flex items-center gap-2 text-sm text-stone-600">
                      <Truck className="w-4 h-4 text-stone-400 flex-shrink-0" /> {order.courier_name}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
          );
        })()}

        {/* Help card */}
        {rows.length === 0 && (
          <div className="bg-white rounded-3xl shadow-sm border border-stone-100 p-6">
            <h2 className="font-bold text-stone-900 text-sm mb-2">Lost your order code?</h2>
            <p className="text-sm text-stone-500 leading-relaxed">
              Check the confirmation screen you saw right after checkout. Still stuck? Message us on WhatsApp with your phone number and product name — we'll find it for you.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
