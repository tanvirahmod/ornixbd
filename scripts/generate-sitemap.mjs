// Generates public/sitemap.xml from the live database before every build:
// static pages + every category and product page (with lastmod timestamps).
// Wired into hosting build commands, so deploys always ship a fresh
// sitemap. Falls back to a static-only sitemap if the DB is unreachable.
// Run:  node scripts/generate-sitemap.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const SITE_URL = 'https://www.ornix.com.bd';
const now = new Date().toISOString().slice(0, 10);

const env = (() => {
  try {
    return readFileSync('.env', 'utf8');
  } catch {
    return '';
  }
})();
const read = (k) => {
  const m = env.match(new RegExp(`^${k}=(.*)$`, 'm'));
  return m ? m[1].trim() : process.env[k] ?? '';
};
const SUPABASE_URL = read('VITE_SUPABASE_URL');
const ANON_KEY = read('VITE_SUPABASE_ANON_KEY');

const slugify = (s) =>
  s.toString().toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '');

const urls = [];
const add = (loc, changefreq, priority, lastmod) =>
  urls.push({ loc, changefreq, priority, lastmod: lastmod ?? now });

add(`${SITE_URL}/`, 'daily', '1.0');
add(`${SITE_URL}/collections`, 'daily', '0.9');
add(`${SITE_URL}/new-arrivals`, 'daily', '0.9');
add(`${SITE_URL}/hot-deals`, 'daily', '0.8');
add(`${SITE_URL}/shop-by-size`, 'weekly', '0.7');
add(`${SITE_URL}/story`, 'monthly', '0.5');
add(`${SITE_URL}/policies`, 'monthly', '0.5');
add(`${SITE_URL}/feedback`, 'monthly', '0.4');
add(`${SITE_URL}/track`, 'monthly', '0.4');

async function dbFetch(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}`);
  return res.json();
}

let dynamicCount = 0;
if (SUPABASE_URL && ANON_KEY) {
  try {
    // Categories: /collections/<slugified-name> (same slug logic as the site)
    const cats = (await dbFetch('categories?select=id,name,is_hidden')) ?? [];
    for (const c of cats) {
      if (c.is_hidden === true) continue;
      add(`${SITE_URL}/collections/${slugify(c.name)}`, 'daily', '0.8');
    }

    // Products: /product/<slugified-title>-<lowercase code> — the same URL
    // shape ProductCard builds. Use today as lastmod (the table has no
    // reliable updated_at column).
    const prods = (await dbFetch('products?select=id,title,product_code')) ?? [];
    for (const p of prods) {
      const code = p.product_code ?? p.id;
      if (!p.title || !code) continue;
      add(`${SITE_URL}/product/${slugify(p.title)}-${String(code).toLowerCase()}`, 'weekly', '0.7');
      dynamicCount++;
    }
  } catch (err) {
    console.warn(`generate-sitemap: DB fetch failed (${err.message}) — shipping static sitemap only.`);
  }
} else {
  console.warn('generate-sitemap: no Supabase env — shipping static sitemap only.');
}

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>
`;

writeFileSync('public/sitemap.xml', xml);
console.log(`generate-sitemap: wrote ${urls.length} URLs (${dynamicCount} products).`);
