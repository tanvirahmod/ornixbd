import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search, Package, Truck, CheckCheck, XCircle, Clock, Loader2, PackageSearch,
  MapPin, Phone, ExternalLink, Copy, CheckCircle2,
} from 'lucide-react';
import { supabase, Order } from '../lib/supabase';
import { setSEO, SITE_NAME } from '../lib/seo';
import { steadfastStageBadge, steadfastStatusMeta, checkSteadfastStatus } from '../lib/steadfast';

type Stage = 'booked' | 'in_review' | 'picked_up' | 'in_transit' | 'delivered';

const STAGES: Array<{ key: Stage; label: string; desc: string }> = [
  { key: 'booked', label: 'Order confirmed', desc: 'We received your order' },
  { key: 'in_review', label: 'Being processed', desc: 'Steadfast approved your parcel' },
  { key: 'picked_up', label: 'Picked up', desc: 'The courier has your parcel' },
  { key: 'in_transit', label: 'On the way', desc: 'Heading to your district' },
  { key: 'delivered', label: 'Delivered', desc: 'Parcel received — thank you!' },
];

const STAGE_INDEX: Record<Stage, number> = {
  booked: 0, in_review: 1, picked_up: 2, in_transit: 3, delivered: 4,
};

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
  const [copied, setCopied] = useState(false);

  setSEO({
    title: `Track Order — ${SITE_NAME}`,
    url: '/track',
    description: 'Track your ORNIX order with your order code.',
  });

  const stage: Stage | 'cancelled' | null = rows.length > 0
    ? rows[0].status === 'canceled'
      ? 'cancelled'
      : (() => {
          const badge = steadfastStageBadge(sfStatus);
          return badge ? badge.stage : 'booked';
        })()
    : null;

  const stageIdx = stage && stage !== 'cancelled' ? STAGE_INDEX[stage] : -1;

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

    setLoading(false);

    if (dbError) {
      const missing = dbError.includes('Could not find the function') || dbError.includes('schema cache');
      setError(
        missing
          ? 'Tracking is temporarily unavailable on our side — please try again shortly or contact us on WhatsApp.'
          : 'No order found with that code. Double-check the code from your confirmation screen.'
      );
      return;
    }
    if (found.length === 0) {
      setError('No order found with that code. Double-check the code from your confirmation screen.');
      return;
    }

    // Phone check: the RPC hides customer_phone on mismatch — treat null as mismatch.
    if (phoneLast.trim()) {
      const digits = (found[0].customer_phone ?? '').replace(/\D/g, '');
      if (!digits.endsWith(phoneLast.trim())) {
        setError('The last 4 digits don\u2019t match this order code.');
        return;
      }
    }

    setRows(found);

    // Live courier status (best effort — page still works if this fails).
    // All rows of a purchase share one tracking code.
    const tracking = found.map((r) => r.tracking_code).find(Boolean);
    if (tracking) {
      const res = await checkSteadfastStatus(tracking);
      if (res.ok && res.status) setSfStatus(res.status);
    }
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
                    <Clock className="w-3.5 h-3.5" /> Courier booking coming soon — we'll confirm your order first
                  </span>
                )}
              </div>
            </div>

            {/* Cancelled banner */}
            {stage === 'cancelled' && (
              <div className="px-6 py-5 bg-red-50 border-b border-red-100 flex items-start gap-3">
                <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-red-700 text-sm">This order was cancelled</p>
                  <p className="text-xs text-red-600/90 mt-0.5">If this is a mistake, contact us on WhatsApp with your order code.</p>
                </div>
              </div>
            )}

            {/* Timeline */}
            {stage !== 'cancelled' && (
              <div className="p-6">
                <div className="relative">
                  {STAGES.map((s, i) => {
                    const done = stageIdx > i;
                    const active = stageIdx === i;
                    const isLast = i === STAGES.length - 1;
                    return (
                      <div key={s.key} className="flex gap-4">
                        {/* Rail + dot */}
                        <div className="flex flex-col items-center">
                          <span
                            className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                              done
                                ? 'bg-emerald-500 text-white'
                                : active
                                  ? 'bg-brand-500 text-white shadow-md shadow-brand-500/30'
                                  : 'bg-stone-100 text-stone-400'
                            } ${active && s.key !== 'delivered' ? 'animate-pulse' : ''}`}
                          >
                            {done ? <CheckCheck className="w-4 h-4" /> : active ? <Package className="w-4 h-4" /> : <span className="w-2 h-2 rounded-full bg-stone-300" />}
                          </span>
                          {!isLast && (
                            <span className={`w-0.5 flex-1 min-h-[34px] ${done ? 'bg-emerald-400' : 'bg-stone-200'}`} />
                          )}
                        </div>
                        {/* Label */}
                        <div className={`pb-6 ${isLast ? 'pb-0' : ''}`}>
                          <p className={`text-sm font-bold ${done || active ? 'text-stone-900' : 'text-stone-400'}`}>
                            {s.label}
                            {active && <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-brand-600 bg-brand-50 border border-brand-200 px-1.5 py-0.5 rounded-full">Current</span>}
                          </p>
                          <p className={`text-xs mt-0.5 ${done || active ? 'text-stone-500' : 'text-stone-300'}`}>{s.desc}</p>
                          {active && sfStatus && steadfastStatusMeta(sfStatus) && (
                            <p className="text-[11px] text-stone-400 mt-1">Courier says: {steadfastStatusMeta(sfStatus)!.label.replace('Steadfast: ', '')}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Delivery info */}
                <div className="mt-6 pt-5 border-t border-stone-100 space-y-1.5">
                  <p className="flex items-start gap-2 text-sm text-stone-600">
                    <MapPin className="w-4 h-4 text-stone-400 flex-shrink-0 mt-0.5" />
                    <span className="break-words">{order.customer_address}{order.delivery_zone ? ` · ${order.delivery_zone}` : ''}</span>
                  </p>
                  <p className="flex items-center gap-2 text-sm text-stone-600">
                    <Phone className="w-4 h-4 text-stone-400 flex-shrink-0" /> {order.customer_phone || '—'}
                  </p>
                  {order.courier_name && (
                    <p className="flex items-center gap-2 text-sm text-stone-600">
                      <Truck className="w-4 h-4 text-stone-400 flex-shrink-0" /> {order.courier_name}
                    </p>
                  )}
                </div>
              </div>
            )}
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
