// ── Manual orders PDF report (via the browser's Save-as-PDF print) ──
// Same trick as parcelLabel.ts: write a styled document into a hidden iframe
// and call print() — the user then picks "Save as PDF" as the destination.
// No PDF library needed, and the output stays selectable/copyable text.
//
// Report layout:
//   • header: ORNIX logo + "Manual Orders Report" + generated-at line
//   • meta block: seller filter, date range, order count, totals (orders, qty, sales)
//   • per-seller subtotal blocks
//   • table: date · code · product (+size) · qty · seller · customer · payment · amount
//     (Amount = fee-inclusive total: the full row's total_amount, or delivery-only
//     rows where total_amount excludes the charge — those get it added back in)
//   • footer

import type { Order } from './supabase';

// Same logo as the storefront navbar / parcel labels (ImageKit CDN).
const LOGO_URL = 'https://ik.imagekit.io/oy2vruqkz/images-photoaidcom-cropped.png';

function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const taka = (n: number) => `৳ ${n.toLocaleString('en-IN')}`;

const p2 = (n: number) => String(n).padStart(2, '0');

export function formatDate(d: Date): string {
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function formatPrintedAt(d = new Date()): string {
  let h = d.getHours();
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return `${formatDate(d)} ${p2(h)}:${p2(d.getMinutes())}${ampm}`;
}

const REPORT_CSS = `
  @page { size: A4 portrait; margin: 12mm 10mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111;
         -webkit-print-color-adjust: exact; print-color-adjust: exact; font-size: 11px; }
  .head { display: flex; align-items: center; gap: 14px; padding-bottom: 10px;
          border-bottom: 3px solid #111; }
  .logo { width: 62px; height: 48px; object-fit: contain; object-position: left center; }
  .title { font-size: 20px; font-weight: 900; letter-spacing: 2px; }
  .sub { font-size: 11px; color: #555; margin-top: 2px; }
  .head-right { margin-left: auto; text-align: right; font-size: 11px; color: #444; }
  .meta { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0 14px; }
  .chip { border: 1px solid #ccc; border-radius: 6px; padding: 5px 10px; font-size: 11px; }
  .chip b { font-size: 13px; }
  .chip-label { color: #666; letter-spacing: 1px; font-size: 9px; display: block; margin-bottom: 2px; }
  .seller-sub { margin: 10px 0 4px; font-size: 12px; font-weight: 700;
                border-bottom: 1px solid #ddd; padding-bottom: 3px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
  th { background: #111; color: #fff; text-align: left; padding: 5px 6px;
       font-size: 9px; letter-spacing: 1px; text-transform: uppercase; }
  td { border-bottom: 1px solid #e5e5e5; padding: 5px 6px; vertical-align: top; }
  tr { page-break-inside: avoid; }
  .num { text-align: right; white-space: nowrap; }
  .amt { font-weight: 700; white-space: nowrap; }
  .muted { color: #777; }
  .foot { margin-top: 18px; padding-top: 8px; border-top: 1px solid #ccc;
          display: flex; justify-content: space-between; font-size: 10px; color: #666; }
  .empty { margin: 20px 0; color: #555; font-size: 12px; }
`;

export type ReportMeta = {
  /** null = all sellers */
  sellerFilter: string | null;
  /** null = no lower bound */
  from: Date | null;
  /** null = no upper bound */
  to: Date | null;
};

/** Row date as a local Date — orders store ISO timestamps. */
const rowDate = (o: Order) => new Date(o.created_at);

export function manualOrderInDateRange(o: Order, from: Date | null, to: Date | null): boolean {
  const d = rowDate(o);
  if (from && d < from) return false;
  if (to && d >= to) return false; // `to` is exclusive end-of-day; caller adds +1 day
  return true;
}

export function reportHtml(orders: Order[], meta: ReportMeta): string {
  const sorted = [...orders].sort((a, b) => (rowDate(a) < rowDate(b) ? -1 : 1));

  // Fee-inclusive row amount: the first row of a sale carries the delivery charge
  // recorded in store (delivery_fee) — legacy delivery-only rows store total without it.
  const rowAmount = (o: Order) =>
    Math.max(Number(o.total_amount ?? 0), Number(o.total_amount ?? 0) + Math.max(0, Number(o.delivery_fee ?? 0)));

  const totalAmount = sorted.reduce((s, o) => s + rowAmount(o), 0);
  const totalCollected = sorted.reduce((s, o) => s + Math.max(0, Number(o.advance_amount ?? 0)), 0);
  const totalQty = sorted.reduce((s, o) => s + (o.quantity ?? 1), 0);

  // Payment label per row — the payment_mode tag first (it is the truth of how
  // the sale settled), with a fallback for pre-migration rows.
  const payLabelFor = (o: Order): string => {
    const mode = (o as Order & { payment_mode?: string | null }).payment_mode;
    if (mode === 'advance_paid') return 'Advance (delivery charge)';
    if (mode === 'full_payment_no_delivery') return 'Full (no delivery)';
    if (mode === 'full_payment') return 'Full + delivery';
    return o.bkash_number ? 'bKash' : 'Cash';
  };

  // Per-seller subtotals
  const bySeller = new Map<string, { count: number; amount: number }>();
  for (const o of sorted) {
    const key = o.seller_name?.trim() || 'Unknown';
    const entry = bySeller.get(key) ?? { count: 0, amount: 0 };
    entry.count += 1;
    entry.amount += rowAmount(o);
    bySeller.set(key, entry);
  }

  const rangeText =
    meta.from && meta.to
      ? `${formatDate(meta.from)} — ${formatDate(new Date(meta.to.getTime() - 24 * 60 * 60 * 1000))}`
      : meta.from
        ? `From ${formatDate(meta.from)}`
        : meta.to
          ? `Up to ${formatDate(new Date(meta.to.getTime() - 24 * 60 * 60 * 1000))}`
          : 'All time';

  const chips = [
    { label: 'SELLER', value: meta.sellerFilter ?? 'All sellers' },
    { label: 'DATE RANGE', value: rangeText },
    { label: 'ORDERS', value: String(sorted.length) },
    { label: 'ITEMS', value: String(totalQty) },
    { label: 'TOTAL SALES', value: taka(totalAmount) },
    { label: 'COLLECTED IN STORE', value: taka(totalCollected) },
  ];

  const rows = sorted
    .map((o) => {
      const d = rowDate(o);
      const paid = `${payLabelFor(o)}${o.bkash_number ? ` ··${o.bkash_number.slice(-4)}` : ''}`;
      return `<tr>
        <td class="muted">${formatDate(d)}</td>
        <td class="muted">${esc(o.order_code ?? o.id.slice(0, 8).toUpperCase())}</td>
        <td>${esc(o.product_title)}${o.selected_size ? ` <span class="muted">(${esc(o.selected_size)})</span>` : ''}</td>
        <td class="num">${o.quantity ?? 1}</td>
        <td>${esc(o.seller_name?.trim() || 'Unknown')}</td>
        <td>${esc(o.customer_name || 'Walk-in customer')}</td>
        <td class="muted">${esc(paid)}</td>
        <td class="amt num">${taka(rowAmount(o))}</td>
      </tr>`;
    })
    .join('');

  const sellerBlocks =
    bySeller.size > 1
      ? [...bySeller.entries()]
          .sort((a, b) => b[1].amount - a[1].amount)
          .map(
            ([name, s]) =>
              `<p class="seller-sub">${esc(name)} — ${s.count} order${s.count === 1 ? '' : 's'} · <span class="amt">${taka(s.amount)}</span></p>`
          )
          .join('')
      : '';

  const body = sorted.length
    ? `${sellerBlocks}
    <table>
      <thead><tr>
        <th>Date</th><th>Code</th><th>Product</th><th class="num">Qty</th>
        <th>Seller</th><th>Customer</th><th>Payment</th><th class="num">Amount</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`
    : '<p class="empty">No in-store sales match the selected filters.</p>';

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Ornix — Manual Orders Report</title>
<style>${REPORT_CSS}</style></head><body>
  <div class="head">
    <img class="logo" src="${LOGO_URL}" alt="ORNIX" />
    <div>
      <div class="title">MANUAL ORDERS REPORT</div>
      <div class="sub">In-store sales recorded in the Ornix admin panel</div>
    </div>
    <div class="head-right">Generated<br />${formatPrintedAt()}</div>
  </div>
  <div class="meta">
    ${chips.map((c) => `<div class="chip"><span class="chip-label">${c.label}</span><b>${esc(c.value)}</b></div>`).join('')}
  </div>
  ${body}
  <div class="foot">
    <span>Ornix · Manual orders report</span>
    <span>${sorted.length} order${sorted.length === 1 ? '' : 's'} · ${taka(totalAmount)}</span>
  </div>
</body></html>`;
}

/**
 * Build the report document and open the browser print dialog over it.
 * The user picks "Save as PDF" as the printer destination to download the file.
 */
export async function printManualOrdersReport(orders: Order[], meta: ReportMeta): Promise<void> {
  const doc = reportHtml(orders, meta);

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;opacity:0;border:0;';
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  const docEl = iframe.contentDocument;
  if (!win || !docEl) {
    iframe.remove();
    throw new Error('Could not open the print frame.');
  }

  const cleanup = () => window.setTimeout(() => iframe.remove(), 500);
  win.onafterprint = cleanup;

  docEl.open();
  docEl.write(doc);
  docEl.close();
  // Safety net: some browsers never fire onafterprint when the dialog is cancelled.
  window.setTimeout(cleanup, 120000);
  iframe.onload = () => window.setTimeout(() => win!.print(), 100);
}
