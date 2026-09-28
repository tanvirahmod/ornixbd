// One-off READ-ONLY diagnostic: newest products and their product_code.
// Uses the public anon key, exactly like the storefront does.
// Run: node scripts/check-recent-products.mjs
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

const res = await fetch(
  `${PROJECT_URL}/rest/v1/products?select=id,title,product_code,category_id,created_at&order=created_at.desc&limit=10`,
  { headers }
);
if (!res.ok) {
  console.error('Probe failed:', res.status, await res.text());
  process.exit(1);
}
const rows = await res.json();
console.log('code | id | title | category_id');
for (const r of rows) {
  console.log(`${r.product_code ?? 'NULL'} | ${r.id} | ${r.title.slice(0, 40)} | ${r.category_id ?? 'NULL'}`);
}
