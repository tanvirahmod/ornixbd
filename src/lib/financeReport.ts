// ── Finance PDF report (via the browser's Save-as-PDF print) ──
// Same trick as manualOrdersReport.ts / parcelLabel.ts: write a styled
// document into a hidden iframe and call print() — the user picks
// "Save as PDF" as the destination. No PDF library needed, and the output
// stays selectable/copyable text.
//
// Layout (A4 LANDSCAPE — the ledger is wide):
//   • header: ORNIX logo + "Finance Report" + generated-at line
//   • meta chips: range, orders, revenue, delivery fees, discounts,
//     collected, due, profit (when cost prices are known)
//   • per-order ledger table (the CSV's columns, nicely typeset)
//   • totals row + footer

import { ORNIX_LOGO_URL } from './seo';

// Same logo as the storefront navbar / other reports (ImageKit CDN).
const LOGO_URL = ORNIX_LOGO_URL;

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
  @page { size: A4 landscape; margin: 10mm 8mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111;
         -webkit-print-color-adjust: exact; print-color-adjust: exact; font-size: 10px; }
  .head { display: flex; align-items: center; gap: 14px; padding-bottom: 8px;
          border-bottom: 3px solid #111; }
  .logo { width: 56px; height: 42px; object-fit: contain; object-position: left center; }
  .title { font-size: 19px; font-weight: 900; letter-spacing: 2px; }
  .sub { font-size: 10px; color: #555; margin-top: 2px; }
  .head-right { margin-left: auto; text-align: right; font-size: 10px; color: #444; }
  .meta { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 12px; }
  .chip { border: 1px solid #ccc; border-radius: 6px; padding: 4px 9px; font-size: 10px; }
  .chip b { font-size: 12px; }
  .chip-label { color: #666; letter-spacing: 1px; font-size: 8px; display: block; margin-bottom: 2px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #111; color: #fff; text-align: left; padding: 4px 5px;
       font-size: 8px; letter-spacing: 0.5px; text-transform: uppercase; }
  td { border-bottom: 1px solid #e5e5e5; padding: 4px 5px; vertical-align: top; }
  tr { page-break-inside: avoid; }
  .num { text-align: right; white-space: nowrap; }
  .amt { font-weight: 700; white-space: nowrap; }
  .muted { color: #777; }
  tfoot td { border-top: 2px solid #111; border-bottom: none; font-weight: 700; padding-top: 6px; }
  .foot { margin-top: 14px; padding-top: 7px; border-top: 1px solid #ccc;
          display: flex; justify-content: space-between; font-size: 9px; color: #666; }
  .empty { margin: 20px 0; color: #555; font-size: 12px; }
  .badge { display: inline-block; border: 1px solid #bbb; border-radius: 4px;
           padding: 0 4px; font-size: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
  .b-ok { background: #ecfdf5; border-color: #6ee7b7; color: #047857; }
  .b-pend { background: #fffbeb; border-color: #fcd34d; color: #b45309; }
  .b-cxl { background: #fef2f2; border-color: #fca5a5; color: #b91c1c; }
`;

export type FinanceReportRow = {
  orderCode: string;
  dateLabel: string;
  customer: string;
  productTitle: string;
  size: string;
  qty: number;
  payLabel: string;
  subtotal: number;
  discount: number;
  deliveryFee: number;
  total: number;
  advance: number;
  due: number;
  status: string;
  sellerName: string;
  orderSource: string;
};

export type FinanceReportMeta = {
  /** Human-readable range, e.g. "01/09/2026 — 29/09/2026" or "All time". */
  rangeText: string;
  /** Pre-computed summary chips from finStats. */
  chips: Array<{ label: string; value: string }>;
};

const statusBadge = (status: string): string => {
  const cls = status === 'delivered' ? 'b-ok' : status === 'canceled' ? 'b-cxl' : 'b-pend';
  return `<span class="badge ${cls}">${esc(status)}</span>`;
};

export function financeReportHtml(rows: FinanceReportRow[], meta: FinanceReportMeta): string {
  const sorted = [...rows].sort((a, b) => a.orderCode.localeCompare(b.orderCode));

  const sum = (pick: (r: FinanceReportRow) => number) => sorted.reduce((s, r) => s + pick(r), 0);
  const totalSubtotal = sum((r) => r.subtotal);
  const totalDiscount = sum((r) => r.discount);
  const totalFees = sum((r) => r.deliveryFee);
  const totalAmount = sum((r) => r.total);
  const totalAdvance = sum((r) => r.advance);
  const totalDue = sum((r) => r.due);

  const chips = [
    { label: 'DATE RANGE', value: meta.rangeText },
    { label: 'ORDERS', value: String(sorted.length) },
    ...meta.chips,
  ];

  const body = sorted.length
    ? `<table>
      <thead><tr>
        <th>Date</th><th>Code</th><th>Customer</th><th>Product</th>
        <th class="num">Qty</th><th>Payment</th>
        <th class="num">Subtotal</th><th class="num">Disc.</th><th class="num">Fee</th>
        <th class="num">Total</th><th class="num">Advance</th><th class="num">Due</th>
        <th>Status</th><th>Source</th>
      </tr></thead>
      <tbody>${sorted
        .map(
          (r) => `<tr>
        <td class="muted">${esc(r.dateLabel)}</td>
        <td class="muted">${esc(r.orderCode)}</td>
        <td>${esc(r.customer)}</td>
        <td>${esc(r.productTitle)}${r.size ? ` <span class="muted">(${esc(r.size)})</span>` : ''}</td>
        <td class="num">${r.qty}</td>
        <td>${esc(r.payLabel)}${r.sellerName ? ` <span class="muted">· ${esc(r.sellerName)}</span>` : ''}</td>
        <td class="num">${taka(r.subtotal)}</td>
        <td class="num">${r.discount > 0 ? `−${taka(r.discount)}` : '<span class="muted">—</span>'}</td>
        <td class="num">${taka(r.deliveryFee)}</td>
        <td class="amt num">${taka(r.total)}</td>
        <td class="num">${taka(r.advance)}</td>
        <td class="num">${r.due > 0 ? taka(r.due) : '<span class="muted">—</span>'}</td>
        <td>${statusBadge(r.status)}${r.orderSource === 'manual' ? ' <span class="badge">store</span>' : ''}</td>
        <td class="muted">${esc(r.orderSource)}</td>
      </tr>`,
        )
        .join('')}</tbody>
      <tfoot>
        <tr>
          <td colspan="6">${sorted.length} order${sorted.length === 1 ? '' : 's'}</td>
          <td class="num">${taka(totalSubtotal)}</td>
          <td class="num">${totalDiscount > 0 ? `−${taka(totalDiscount)}` : '—'}</td>
          <td class="num">${taka(totalFees)}</td>
          <td class="num">${taka(totalAmount)}</td>
          <td class="num">${taka(totalAdvance)}</td>
          <td class="num">${taka(totalDue)}</td>
          <td colspan="2"></td>
        </tr>
      </tfoot>
    </table>`
    : '<p class="empty">No orders match the selected range.</p>';

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Ornix — Finance Report</title>
<style>${REPORT_CSS}</style></head><body>
  <div class="head">
    <img class="logo" src="${LOGO_URL}" alt="ORNIX" />
    <div>
      <div class="title">FINANCE REPORT</div>
      <div class="sub">Order ledger for the selected range — canceled orders excluded</div>
    </div>
    <div class="head-right">Generated<br />${formatPrintedAt()}</div>
  </div>
  <div class="meta">
    ${chips.map((c) => `<div class="chip"><span class="chip-label">${esc(c.label)}</span><b>${esc(c.value)}</b></div>`).join('')}
  </div>
  ${body}
  <div class="foot">
    <span>Ornix · Finance report</span>
    <span>${sorted.length} order${sorted.length === 1 ? '' : 's'} · ${taka(totalAmount)}</span>
  </div>
</body></html>`;
}

/**
 * Build the report document and open the browser print dialog over it.
 * The user picks "Save as PDF" as the printer destination to download the file.
 */
export async function printFinanceReport(rows: FinanceReportRow[], meta: FinanceReportMeta): Promise<void> {
  const doc = financeReportHtml(rows, meta);

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

  // Give images/logo a beat to load inside the frame before printing.
  await new Promise<void>((resolve) => {
    if (docEl.readyState === 'complete') resolve();
    else win.addEventListener('load', () => resolve(), { once: true });
    window.setTimeout(resolve, 1200); // hard cap — never hang the click
  });

  win.focus();
  win.print();
}
