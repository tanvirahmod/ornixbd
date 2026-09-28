// Verify which SQL migrations are live on the Supabase project, using only
// the public anon key. Probes tables/columns/RPCs without reading any data:
//   • a column probe errors "column X does not exist" only when it's missing
//   • an RPC probe returns "Could not find the function" only when missing
// All RPC calls are no-ops or fail safely before writing anything.
// Run:  node scripts/check-migrations.mjs
import { readFileSync } from 'node:fs';

const env = readFileSync('.env', 'utf8');
const read = (k) => {
  const m = env.match(new RegExp(`^${k}=(.*)$`, 'm'));
  if (!m) throw new Error(`Missing ${k} in .env`);
  return m[1].trim();
};
const PROJECT_URL = read('VITE_SUPABASE_URL');
const KEY = read('VITE_SUPABASE_ANON_KEY');
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const mark = (ok) => (ok ? '✅' : '❌');

// ── Probes ───────────────────────────────────────────────────────────────────
async function probeColumns(table, cols) {
  // 200 (even with 0 rows, thanks to RLS) ⇒ every column exists.
  // PostgREST 400 names the first missing column in its message.
  const res = await fetch(`${PROJECT_URL}/rest/v1/${table}?select=${cols.join(',')}&limit=1`, { headers });
  if (res.ok) return { ok: true, missing: [] };
  const body = await res.json().catch(() => ({}));
  const missing = cols.filter((c) => (body.message ?? '').includes(`'${c}'`));
  return { ok: false, missing: missing.length ? missing : cols, error: body.message ?? res.status };
}

async function probeTable(table) {
  const res = await fetch(`${PROJECT_URL}/rest/v1/${table}?select=*&limit=0`, { headers });
  if (res.ok) return true;
  const body = await res.json().catch(() => ({}));
  return !/does not exist|Could not find the table/i.test(body.message ?? '');
}

async function probeRpc(name, args) {
  // 404 PGRST202 "Could not find the function" ⇒ missing.
  // Any other outcome (empty result, or a business-rule error) ⇒ exists.
  const res = await fetch(`${PROJECT_URL}/rest/v1/rpc/${name}`, {
    method: 'POST', headers, body: JSON.stringify(args),
  });
  if (res.ok) return true;
  const body = await res.json().catch(() => ({}));
  return !/Could not find the function/i.test(body.message ?? '');
}

// ── Table existence ──────────────────────────────────────────────────────────
console.log(`\nSupabase project: ${PROJECT_URL.replace(/^https:\/\//, '').split('.')[0]}\n`);
console.log('— Tables exposed via the API —');
const tables = ['orders', 'products', 'product_sizes', 'categories', 'coupons', 'announcements',
  'site_settings', 'sellers', 'expenses', 'stock_movements', 'admin_log', 'admin_users',
  'size_chart_templates', 'feedback'];
const tableExists = {};
for (const t of tables) {
  tableExists[t] = await probeTable(t);
  console.log(`  ${mark(tableExists[t])} ${t}`);
}

// ── Column probes grouped by migration ───────────────────────────────────────
console.log('\n— Migrations (by columns they add) —');
const columnChecks = [
  ['Checkout fields + coupons (orders pricing, coupons.product_codes)', [
    ['orders', ['subtotal', 'delivery_fee', 'discount_amount', 'total_amount', 'coupon_code', 'payment_method', 'advance_amount', 'due_amount', 'courier_name']],
    ['coupons', ['product_codes']],
  ]],
  ['Cost/hidden/advance flags (profit tracking, per-product COD, hidden categories)', [
    ['products', ['cost_price', 'advance_optional']],
    ['categories', ['is_hidden']],
  ]],
  ['Size charts (products.size_chart_template_id)', [
    ['products', ['size_chart_template_id']],
  ]],
  ['Steadfast + tracking (orders.tracking_code, delivery_zone, order_code)', [
    ['orders', ['tracking_code', 'delivery_zone', 'order_code']],
  ]],
  ['order_code multi-item (non-unique index — see note below)', []],
  ['Manual orders (orders.order_source, seller_name)', [
    ['orders', ['order_source', 'seller_name']],
  ]],
  ['Sellers table', [
    ['sellers', ['name']],
  ]],
  ['bKash/Nagad payment_channel (orders.payment_channel)', [
    ['orders', ['payment_channel']],
  ]],
  ['Super admin + permissions (admin_users.role, permissions)', [
    ['admin_users', ['role', 'permissions']],
  ]],
];
for (const [label, groups] of columnChecks) {
  if (groups.length === 0) continue;
  let allOk = true;
  for (const [table, cols] of groups) {
    const r = await probeColumns(table, cols);
    r.ok ? null : (allOk = false);
    console.log(`  ${mark(r.ok)} ${label}` + (r.ok ? '' : `   → ${table}.${r.missing.join(', ')} MISSING`));
    break; // one line per migration; report first failing group's detail
  }
  if (allOk) continue;
  // detail each group's missing columns on the failure line above (first group only)
}

console.log('\n— RPC functions —');
const rpcChecks = [
  ['track_order', 'customer tracking', { p_order_code: '__probe__', p_phone_last4: null }],
  ['checkout_decrement_stock', 'checkout stock', { p_items: [] }],
  ['checkout_consume_coupon', 'coupon counter', { p_code: '__probe__' }],
  ['admin_me', 'admin role loading', {}],
  ['super_admin_list_admins', 'team list', {}],
  ['super_admin_add_admin', 'team mgmt', { p_email: '__probe__', p_role: 'admin' }],
  ['super_admin_remove_admin', 'team mgmt', { p_email: '__probe__' }],
  ['super_admin_set_permissions', 'team mgmt', { p_email: '__probe__', p_permissions: {} }],
  ['log_admin_activity', 'activity log RPC', { p_action: '__probe__' }],
];
for (const [name, label, args] of rpcChecks) {
  const exists = await probeRpc(name, args);
  console.log(`  ${mark(exists)} ${name} (${label})`);
}

// ── Site settings keys (values are NOT printed) ──────────────────────────────
const setRes = await fetch(`${PROJECT_URL}/rest/v1/site_settings?select=key`, { headers });
const settingKeys = setRes.ok ? (await setRes.json()).map((r) => r.key) : [];
console.log('\n— site_settings keys —');
for (const k of ['checkout_bkash_number', 'checkout_nagad_number']) {
  console.log(`  ${mark(settingKeys.includes(k))} ${k}${settingKeys.includes(k) ? '' : '  (not set yet)'}`);
}
for (const k of settingKeys.filter((k) => !['checkout_bkash_number', 'checkout_nagad_number'].includes(k))) {
  console.log(`  ·  ${k}`);
}

console.log('\nNote: index changes (non-unique order_code), RLS policies, and the realtime');
console.log('publication are not visible from outside — verify those by behavior in the app.\n');
