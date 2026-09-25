import { useState } from 'react';
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
  return raw.trim().toUpperCase().replace(/^ORN-?/, 'ORN-');
}

export default function TrackOrderPage() {
  const [code, setCode] = useState('');
  const [phoneLast, setPhoneLast] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [order, setOrder] = useState<Order | null>(null);
  const [sfStatus, setSfStatus] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  setSEO({
    title: `Track Order — ${SITE_NAME}`,
    url: '/track',
    description: 'Track your ORNIX order with your order code.',
  });

  const stage: Stage | 'cancelled' | null = order
    ? order.status === 'canceled'
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
    setOrder(null);
    setSfStatus(null);

    const { data, error: dbError } = await supabase
      .from('orders')
      .select('*')
      .eq('order_code', cleaned)
      .order('created_at', { ascending: true });

    setLoading(false);

    if (dbError || !data || data.length === 0) {
      setError('No order found with that code. Double-check the code from your confirmation screen.');
      return;
    }

    // Cart checkouts create one row per item — all share the same code
    const found: Order = data[0];
    if (phoneLast.trim()) {
      const digits = found.customer_phone.replace(/\D/g, '');
      if (!digits.endsWith(phoneLast.trim())) {
        setError('The last 4 digits don\u2019t match this order code.');
        return;
      }
    }
    setOrder(found);

    // Live courier status (best effort — page still works if this fails)
    if (found.tracking_code) {
      const res = await checkSteadfastStatus(found.tracking_code);
      if (res.ok && res.status) setSfStatus(res.status);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50">
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
        {order && (
          <div className="bg-white rounded-3xl shadow-sm border border-stone-100 overflow-hidden animate-fade-in-up">
            {/* Summary */}
            <div className="p-6 border-b border-stone-100">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Order {order.order_code}</p>
                  <p className="font-display text-xl font-bold text-stone-900 mt-0.5">{order.product_title}</p>
                  <p className="text-sm text-stone-500 mt-0.5">
                    {order.selected_size && <>Size {order.selected_size} · </>}
                    Qty {order.quantity ?? 1} · {new Date(order.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Total</p>
                  <p className="font-display text-xl font-bold text-stone-900">৳{Number(order.total_amount ?? 0).toFixed(0)}</p>
                </div>
              </div>

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
                    <Phone className="w-4 h-4 text-stone-400 flex-shrink-0" /> {order.customer_phone}
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
        )}

        {/* Help card */}
        {!order && (
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
