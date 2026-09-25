// ── Steadfast parcel label generator ──
// The Steadfast API v1 has no label/sticker endpoint (only create_order,
// status checks and balance), so we reproduce their sticker layout locally:
//   • header: ORNIX logo box + merchant ID
//   • Code-128 barcode of the courier tracking code (scannable)
//   • QR code linking to the parcel's public tracking page
//   • invoice / SF-ID / delivery / weight block
//   • customer name / phone / address / area
//   • cash-on-delivery strip, printed-at footer
// Printing happens through a hidden iframe + window.print(), so any
// thermal or regular printer the browser can reach works — no popup blockers.

import QRCode from 'qrcode';
import type { Order } from './supabase';

// Same logo as the storefront navbar (ImageKit CDN).
const LOGO_URL = 'https://ik.imagekit.io/oy2vruqkz/images-photoaidcom-cropped.png';

// Declared parcel weight printed on labels and sent with every booking.
const WEIGHT_KG = 1.5;

// Canonical Code 128 symbol widths (6 bar/space widths, 7 for the STOP symbol).
const CODE128_PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311131', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];

/** Render `value` as an inline SVG Code-128-B barcode (fully scannable). */
export function code128Svg(value: string, width = 340, height = 58): string {
  const clean = (value || '').replace(/[^\x20-\x7E]/g, '').slice(0, 40) || '0';
  const codes: number[] = [104 /* START B */];
  for (const ch of clean) codes.push(ch.charCodeAt(0) - 32);
  let checksum = 104;
  for (let i = 1; i < codes.length; i++) checksum += codes[i] * i;
  codes.push(checksum % 103, 106 /* STOP */);

  const modules: number[] = [];
  for (const c of codes) {
    for (const d of CODE128_PATTERNS[c]) modules.push(parseInt(d, 10));
  }
  const total = modules.reduce((a, b) => a + b, 0);
  const unit = width / total;

  let x = 0;
  let bars = '';
  modules.forEach((w, i) => {
    const px = w * unit;
    if (i % 2 === 0) bars += `<rect x="${x.toFixed(2)}" y="0" width="${px.toFixed(2)}" height="${height}" fill="#000"/>`;
    x += px;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="barcode ${clean}">${bars}</svg>`;
}

function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatPrintedAt(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  let h = d.getHours();
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)} ${p(h)}:${p(d.getMinutes())}${ampm}`;
}

const ZONE_LABELS: Record<string, string> = {
  dhaka_city: 'Inside Dhaka',
  dhaka_suburban: 'Dhaka Suburban',
  outside_dhaka: 'Outside Dhaka',
};

type LabelData = {
  barcodeSvg: string;
  barcodeText: string;
  qrDataUrl: string;
  invoice: string;
  delivery: string;
  name: string;
  phone: string;
  address: string;
  area: string;
  codAmount: number;
};

function labelDataFor(order: Order): LabelData {
  const code = order.tracking_code || order.order_code || '0';
  const cod = Math.max(0, Number(order.due_amount ?? order.total_amount ?? 0));
  return {
    barcodeSvg: code128Svg(code),
    barcodeText: code,
    qrDataUrl: '', // filled in buildLabelHtml (async QR)
    invoice: order.order_code || '—',
    delivery: order.courier_name === 'Store Pickup' ? 'Store Pickup' : 'Home',
    name: order.customer_name || '—',
    phone: order.customer_phone || '—',
    address: order.customer_address || '—',
    area: (order.delivery_zone && (ZONE_LABELS[order.delivery_zone] ?? order.delivery_zone)) || '—',
    codAmount: cod,
  };
}

const LABEL_CSS = `
  @page { size: 4in 6in; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #000;
         -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .label { width: 384px; height: 576px; padding: 14px 16px 10px; display: flex; flex-direction: column;
           page-break-after: always; overflow: hidden; }
  .label:last-child { page-break-after: auto; }
  @media screen {
    body { background: #777; padding: 20px 0; }
    .label { background: #fff; margin: 0 auto 20px; box-shadow: 0 2px 10px rgba(0,0,0,.35); }
  }
  .head { display: flex; align-items: flex-start; justify-content: space-between; padding-bottom: 8px;
          border-bottom: 3px solid #000; }
  .logo { width: 76px; height: 60px; object-fit: contain; object-position: left top; }
  .brand { text-align: right; }
  .brand-name { font-size: 26px; font-weight: 900; letter-spacing: 3px; }
  .merchant { font-size: 15px; color: #222; margin-top: 6px; }
  .barcode-wrap { text-align: center; padding: 10px 0 8px; }
  .barcode-wrap svg { display: block; margin: 0 auto; }
  .barcode-num { font-size: 18px; font-weight: 700; letter-spacing: 6px; margin-top: 4px; }
  .mid { display: flex; gap: 12px; align-items: stretch; border-top: 2px solid #000;
         border-bottom: 2px solid #000; padding: 10px 0; }
  .qr { width: 96px; height: 96px; flex-shrink: 0; border: 1px solid #e5e5e5; }
  .meta { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 8px; }
  .meta-row { display: flex; justify-content: space-between; align-items: baseline; padding-right: 4px; }
  .meta-label { font-size: 13px; color: #555; letter-spacing: 1px; }
  .meta-val { font-size: 16px; font-weight: 700; max-width: 220px; text-align: right; overflow: hidden;
              text-overflow: ellipsis; white-space: nowrap; }
  .cust { flex: 1; padding: 12px 0; display: flex; flex-direction: column; gap: 10px; }
  .cust-row { display: flex; gap: 10px; align-items: baseline; }
  .cust-label { width: 84px; flex-shrink: 0; font-size: 13px; color: #555; letter-spacing: 1px; }
  .cust-val { font-size: 15px; font-weight: 700; overflow-wrap: anywhere; }
  .cod { border: 3px solid #000; padding: 12px 14px; display: flex; justify-content: space-between;
         align-items: center; }
  .cod-text { font-size: 16px; font-weight: 800; letter-spacing: 1px; }
  .cod-amt { font-size: 22px; font-weight: 900; }
  .foot { display: flex; justify-content: space-between; align-items: center; padding-top: 10px;
          font-size: 12px; color: #555; }
  .sf { font-weight: 700; color: #000; }
  .sf em { font-style: normal; font-weight: 400; color: #555; margin-left: 4px; }
`;

function labelHtml(data: LabelData, merchantId: string | null): string {
  const rows: Array<[string, string]> = [
    ['INVOICE', data.invoice],
    ['SF-ID', data.barcodeText],
    ['DELIVERY', data.delivery],
    ['WEIGHT', `${WEIGHT_KG} KG`],
  ];
  const custRows: Array<[string, string]> = [
    ['NAME', data.name],
    ['PHONE', data.phone],
    ['ADDRESS', data.address],
    ['AREA', data.area],
  ];
  const codText = data.codAmount > 0 ? 'CASH ON DELIVERY' : 'ADVANCE PAID — NO COD';
  return `
    <div class="label">
      <div class="head">
        <img class="logo" src="${LOGO_URL}" alt="ORNIX" />
        <div class="brand">
          <div class="brand-name">ORNIX</div>
          <div class="merchant">Merchant ID: ${esc(merchantId || '—')}</div>
        </div>
      </div>
      <div class="barcode-wrap">
        ${data.barcodeSvg}
        <div class="barcode-num">${esc(data.barcodeText)}</div>
      </div>
      <div class="mid">
        <img class="qr" src="${data.qrDataUrl}" alt="QR" />
        <div class="meta">
          ${rows.map(([k, v]) => `<div class="meta-row"><span class="meta-label">${k}</span><span class="meta-val">${esc(v)}</span></div>`).join('')}
        </div>
      </div>
      <div class="cust">
        ${custRows.map(([k, v]) => `<div class="cust-row"><span class="cust-label">${k}</span><span class="cust-val">${esc(v)}</span></div>`).join('')}
      </div>
      <div class="cod">
        <span class="cod-text">${codText}</span>
        <span class="cod-amt">৳ ${data.codAmount % 1 === 0 ? data.codAmount : data.codAmount.toFixed(2)}</span>
      </div>
      <div class="foot">
        <span>Printed: ${formatPrintedAt()}</span>
        <span class="sf">▧ steadfast<em>steadfast.com.bd</em></span>
      </div>
    </div>`;
}

/** Build the full standalone HTML document with one sticker per order. */
export async function renderLabelsDocument(orders: Order[], merchantId: string | null): Promise<string> {
  const pages = await Promise.all(
    orders.map(async (o) => {
      const data = labelDataFor(o);
      try {
        data.qrDataUrl = await QRCode.toDataURL(`https://steadfast.com.bd/t/${data.barcodeText}`, {
          margin: 1,
          width: 240,
          color: { dark: '#000000', light: '#ffffff' },
        });
      } catch {
        data.qrDataUrl = '';
      }
      return labelHtml(data, merchantId);
    })
  );

  return `<!doctype html><html><head><meta charset="utf-8"><title>Steadfast parcel labels (${orders.length})</title>
<style>${LABEL_CSS}</style></head><body>${pages.join('\n')}</body></html>`;
}

/** Open the browser print dialog with one sticker per order (4×6in pages). */
export async function printLabels(orders: Order[], merchantId: string | null): Promise<void> {
  const doc = await renderLabelsDocument(orders, merchantId);

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
  // Wait for the frame to finish loading (and let layout settle) before printing —
  // calling print() too early can race the first paint of the barcode/QR images.
  iframe.onload = () => window.setTimeout(() => win!.print(), 100);
}
