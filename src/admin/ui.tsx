// ── Shared admin UI atoms ──
// First slice of splitting up AdminPage.tsx: the small, dependency-light
// pieces every admin tab reuses (money formatting, cards, toasts, pills).
import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, X } from 'lucide-react';

// Bengali taka formatter: “৳12,450”
export const formatBDT = (n: number) => `৳${Math.round(n).toLocaleString('en-IN')}`;

// Small uppercase field label used inside order detail cards
export const ORD_LBL = 'text-[11px] font-semibold uppercase tracking-wider text-stone-400 mb-0.5';

// Pill colors per order status (used on order cards)
export const ORDER_STATUS_PILL: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-600 border border-amber-200',
  delivered: 'bg-emerald-50 text-emerald-600 border border-emerald-200',
  canceled: 'bg-red-50 text-red-600 border border-red-200',
};

// Tone palette for the finance summary cards
export const FIN_TONES: Record<string, { bg: string; text: string }> = {
  emerald: { bg: 'bg-emerald-100', text: 'text-emerald-600' },
  amber: { bg: 'bg-amber-100', text: 'text-amber-600' },
  sky: { bg: 'bg-sky-100', text: 'text-sky-600' },
  brand: { bg: 'bg-brand-100', text: 'text-brand-600' },
  red: { bg: 'bg-red-100', text: 'text-red-600' },
  stone: { bg: 'bg-stone-100', text: 'text-stone-500' },
};

// Small finance summary card (icon + label + big number + hint)
export function FinCard({ label, value, sub, tone, icon: Icon }: {
  label: string;
  value: string;
  sub: string;
  tone: keyof typeof FIN_TONES;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const t = FIN_TONES[tone] ?? FIN_TONES.stone;
  return (
    <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4">
      <div className={`w-8 h-8 rounded-xl ${t.bg} flex items-center justify-center mb-2`}>
        <Icon className={`w-4 h-4 ${t.text}`} />
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">{label}</p>
      <p className="font-display text-lg font-bold text-stone-900 mt-0.5 leading-tight">{value}</p>
      <p className="text-[11px] text-stone-400 mt-0.5">{sub}</p>
    </div>
  );
}

// Trend delta pill: ▲/▼ x% vs the previous period, hidden when there's no baseline
export function FinDelta({ current, previous }: { current: number; previous: number | null }) {
  if (previous == null || previous === 0 || current === 0) return null;
  const pct = Math.round(((current - previous) / Math.abs(previous)) * 100);
  if (!isFinite(pct) || pct === 0) return <span className="text-[11px] font-semibold text-stone-400">· flat vs previous</span>;
  const up = pct > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold ${up ? 'text-emerald-600' : 'text-red-500'}`}>
      {up ? '▲' : '▼'} {Math.abs(pct)}% vs previous
    </span>
  );
}

// Tiny daily revenue bars for the selected range (pure CSS, no chart lib)
export function DailyBars({ buckets, tone = 'brand' }: { buckets: Array<{ label: string; amount: number }>; tone?: 'brand' | 'emerald' }) {
  if (buckets.length === 0) return null;
  const max = Math.max(...buckets.map((b) => b.amount), 1);
  const barCls = tone === 'emerald' ? 'bg-emerald-400' : 'bg-brand-400';
  return (
    <div className="flex items-end gap-1 h-14">
      {buckets.map((b, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${b.label}: ${formatBDT(b.amount)}`}>
          <div className={`w-full rounded-t ${barCls} transition-all`} style={{ height: `${Math.max(3, (b.amount / max) * 100)}%`, opacity: b.amount > 0 ? 1 : 0.25 }} />
          <span className="text-[9px] text-stone-400 truncate w-full text-center">{b.label}</span>
        </div>
      ))}
    </div>
  );
}

// Consistent empty state used across tabs
export function EmptyState({ icon, title, hint }: { icon: React.ReactNode; title: string; hint?: string }) {
  return (
    <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-stone-200">
      <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-stone-50 text-stone-300 flex items-center justify-center">{icon}</div>
      <p className="text-stone-500 font-medium">{title}</p>
      {hint && <p className="text-stone-400 text-sm mt-1">{hint}</p>}
    </div>
  );
}

// ── Toast system (replaces window.alert) ──
export type Toast = { id: number; kind: 'success' | 'error' | 'info'; text: string };
let toastSeq = 0;

export function ToastStack({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="fixed bottom-5 right-5 z-[60] flex flex-col gap-2 items-end pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`pointer-events-auto flex items-start gap-2.5 max-w-sm w-full sm:w-96 bg-white rounded-xl shadow-lg border px-4 py-3 animate-fade-in-up ${
            t.kind === 'success'
              ? 'border-emerald-200'
              : t.kind === 'error'
                ? 'border-red-200'
                : 'border-stone-200'
          }`}
        >
          <span
            className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5 ${
              t.kind === 'success'
                ? 'bg-emerald-100 text-emerald-600'
                : t.kind === 'error'
                  ? 'bg-red-100 text-red-500'
                  : 'bg-stone-100 text-stone-500'
            }`}
          >
            {t.kind === 'success' ? (
              <CheckCircle2 className="w-3.5 h-3.5" />
            ) : t.kind === 'error' ? (
              <AlertCircle className="w-3.5 h-3.5" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5" />
            )}
          </span>
          <p className="flex-1 text-sm text-stone-700 leading-snug break-words">{t.text}</p>
          <button
            onClick={() => onDismiss(t.id)}
            className="flex-shrink-0 text-stone-300 hover:text-stone-500 transition-colors"
            aria-label="Dismiss notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

export const nextToastId = () => ++toastSeq;
