// Build-time prerender for Render static hosting (option B).
//
// WHY: This is a React SPA — the raw HTML served for every URL is the homepage
// shell, so crawlers that don't run JavaScript (WhatsApp, Facebook, Bing, and
// Google before its delayed JS-render pass) see homepage meta everywhere.
// This script snapshots real meta tags into static per-route HTML files at
// BUILD time, right after `vite build`:
//
//   dist/product/<slug>-<code>/index.html  (+ <slug>-<code>.html)
//   dist/collections/<slug>/index.html     (+ <slug>.html)
//   dist/<static-page>/index.html          (+ <static-page>.html)
//
// Each file is the built dist/index.html with ONLY the <head> meta tags
// swapped (title/description/canonical/og:*/twitter:*) and JSON-LD injected.
// The <body> is untouched, so real visitors get the exact same React app —
// it boots over the served HTML identically. Zero runtime code ships.
//
// META PARITY: titles/descriptions mirror what each page's setSEO() call sets
// at runtime (src/pages/*), and slugs mirror src/lib/utils.ts (slugify +
// productParam), so a prerendered path always equals the app's own link.
//
// FAIL-OPEN: any DB error degrades to static-page prerender; any unexpected
// error exits 0 with a warning. The deploy must never fail because of SEO.
//
// Run: node scripts/prerender.mjs   (after vite build — see build:render)

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

const SITE_URL = 'https://ornix.com.bd';
const SITE_NAME = 'ORNIX';
// Must match DEFAULT_IMAGE in netlify/edge-functions/seo-prerender.ts + index.html og:image.
const DEFAULT_IMAGE = 'https://ik.imagekit.io/oy2vruqkz/images-photoaidcom-cropped.png';
const DEFAULT_DESCRIPTION =
  'ORNIX — Modern streetwear from Bangladesh. Bold fashion, quality fabrics, nationwide delivery. Shop the latest collections online.';

// ── env (same pattern as scripts/generate-sitemap.mjs) ──────────────────────
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

// ── helpers (mirror src/lib/utils.ts) ───────────────────────────────────────
const slugify = (s) =>
  s
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

const productParam = (title, code) => `${slugify(title)}-${String(code).toLowerCase()}`;

const escapeHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// FB/WhatsApp silently drop the preview image when og:image is not one clean
// absolute https URL. Some product rows were saved with two URLs pasted
// together (an admin upload glitch) — keep only the first complete URL in
// that case; anything else malformed degrades to the brand banner. A branded
// preview always beats a broken one.
const safeImage = (url) => {
  if (typeof url !== 'string') return DEFAULT_IMAGE;
  let s = url.trim();
  if (!/^https:\/\//.test(s)) return DEFAULT_IMAGE;
  const second = s.indexOf('https://', 8);
  if (second !== -1) s = s.slice(0, second);
  return /^https:\/\/[^\s"'<>]+$/.test(s) ? s : DEFAULT_IMAGE;
};

// `</script>` inside a JSON-LD string would terminate the script tag — escape
// every `<` so injected JSON can never break out of <script>.
const jsonLd = (data) =>
  `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>\n  `;

function log(msg) {
  console.log(`prerender: ${msg}`);
}
function warn(msg) {
  console.warn(`prerender: WARNING — ${msg}`);
}

// ── load template ───────────────────────────────────────────────────────────
const TEMPLATE_PATH = join('dist', 'index.html');
if (!existsSync(TEMPLATE_PATH)) {
  warn('dist/index.html not found — run `vite build` first. Skipping prerender.');
  process.exit(0);
}
const TEMPLATE = readFileSync(TEMPLATE_PATH, 'utf8');

// Anchored to the exact tag shapes that src/index.html produces (same approach
// as the Netlify edge function), plus canonical which the edge fn didn't touch.
function applyMeta(html, { title, description, image, canonicalPath }) {
  const canonical = `${SITE_URL}${canonicalPath}`;
  const escTitle = escapeHtml(title);
  const escDesc = escapeHtml(description);
  const escImage = escapeHtml(image);
  return html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escTitle}</title>`)
    .replace(/<meta property="og:title" content="[^"]*"/, `<meta property="og:title" content="${escTitle}"`)
    .replace(/<meta property="og:description" content="[^"]*"/, `<meta property="og:description" content="${escDesc}"`)
    .replace(/<meta property="og:image" content="[^"]*"/, `<meta property="og:image" content="${escImage}"`)
    .replace(/<meta property="og:url" content="[^"]*"/, `<meta property="og:url" content="${canonical}"`)
    .replace(/<meta name="twitter:title" content="[^"]*"/, `<meta name="twitter:title" content="${escTitle}"`)
    .replace(/<meta name="twitter:description" content="[^"]*"/, `<meta name="twitter:description" content="${escDesc}"`)
    .replace(/<meta name="twitter:image" content="[^"]*"/, `<meta name="twitter:image" content="${escImage}"`)
    .replace(/<meta name="description" content="[^"]*"/, `<meta name="description" content="${escDesc}"`)
    .replace(/<link rel="canonical" href="[^"]*"/, `<link rel="canonical" href="${canonical}"`);
}

function injectBeforeHeadEnd(html, snippets) {
  return html.replace('</head>', `${snippets.join('')}</head>`);
}

// Writes a route as <dist>/<path>/index.html plus a flat <path>.html twin, so
// the file resolves on any host's path-resolution behaviour (directory index
// or extension mapping). Unresolved paths fall through to the SPA rewrite.
const written = [];
function writeRoute(routePath, html) {
  const rel = routePath.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!rel) return; // root index.html is already correct in the template
  try {
    const dirFile = join('dist', rel, 'index.html');
    mkdirSync(dirname(dirFile), { recursive: true });
    writeFileSync(dirFile, html);
    const flatFile = join('dist', `${rel}.html`);
    writeFileSync(flatFile, html);
    written.push(routePath);
  } catch (err) {
    warn(`could not write ${routePath} (${err.message})`);
  }
}

// ── static page metas (mirrors each page's setSEO() call exactly) ───────────
const STATIC_PAGES = [
  ['/collections', { title: `Collections — ${SITE_NAME}`, description: DEFAULT_DESCRIPTION }],
  ['/new-arrivals', {
    title: `New Arrivals — ${SITE_NAME}`,
    description: `Shop the latest streetwear drops at ${SITE_NAME}. Fresh designs added weekly — premium cotton tees, shirts and more. ${DEFAULT_DESCRIPTION}`,
  }],
  ['/hot-deals', {
    title: `Hot Deals — ${SITE_NAME}`,
    description: `Limited-time discounts on premium streetwear at ${SITE_NAME}. Shop discounted tees, shirts and more before the offers end. ${DEFAULT_DESCRIPTION}`,
  }],
  ['/shop-by-size', {
    title: `Shop by Size — ${SITE_NAME}`,
    description: `Find your size. Browse every in-stock product by size at ${SITE_NAME}. ${DEFAULT_DESCRIPTION}`,
  }],
  ['/story', {
    title: `Our Story — ${SITE_NAME}`,
    description:
      'From one laptop and a small room in Bangladesh to a streetwear brand the internet rallied behind. This is the ORNIX journey — raw, documented, and still being written.',
  }],
  ['/policies', {
    title: `Policies — ${SITE_NAME}`,
    description:
      'Shipping & delivery, returns & exchange, privacy, and terms — everything you need to know before ordering from ORNIX, in plain language.',
  }],
  ['/track', { title: `Track Order — ${SITE_NAME}`, description: 'Track your ORNIX order with your order code.' }],
  ['/feedback', { title: `Feedback — ${SITE_NAME}`, description: DEFAULT_DESCRIPTION }],
];

for (const [route, meta] of STATIC_PAGES) {
  writeRoute(
    route,
    applyMeta(TEMPLATE, { ...meta, image: DEFAULT_IMAGE, canonicalPath: route })
  );
}

// ── DB-backed prerender (products + categories) ─────────────────────────────
async function dbFetch(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Supabase ${res.status} for "${path.slice(0, 80)}..." — ${body.slice(0, 300)}`);
  }
  return res.json();
}

let productCount = 0;
let categoryCount = 0;

async function prerenderFromDb() {
  if (!SUPABASE_URL || !ANON_KEY) {
    warn('no Supabase env — skipping product/category prerender.');
    return;
  }

  const products = (await dbFetch(
    'products?select=id,product_code,title,description,price,discount_price,stock_count,sizes,category_id,categories(name),product_images(image_url,display_order),product_sizes(quantity)' +
      '&product_images.order=display_order.asc'
  )) ?? [];
  const categories = (await dbFetch('categories?select=id,name,is_hidden')) ?? [];
  const visibleCategories = categories.filter((c) => c.is_hidden !== true);

  // Cover image per category: newest product's first image (same query shape
  // the Netlify edge function uses).
  const coverByCategory = new Map();
  for (const cat of visibleCategories) {
    try {
      const rows = (await dbFetch(
        `products?category_id=eq.${cat.id}&select=product_images(image_url)&product_images.limit=1&order=created_at.desc&limit=1`
      )) ?? [];
      const url = rows?.[0]?.product_images?.[0]?.image_url;
      if (url) coverByCategory.set(cat.id, safeImage(url));
    } catch {
      /* keep default cover */
    }
  }
  const productsInCategory = new Map();
  for (const p of products) {
    if (p.category_id) productsInCategory.set(p.category_id, (productsInCategory.get(p.category_id) ?? 0) + 1);
  }

  // Categories — mirrors SingleCollectionPage.setSEO + its JSON-LD.
  for (const cat of visibleCategories) {
    const slug = slugify(cat.name);
    if (!slug) continue;
    const route = `/collections/${slug}`;
    const count = productsInCategory.get(cat.id) ?? 0;
    const title = `${cat.name} — ${SITE_NAME}`;
    const description = `Shop ${cat.name} at ${SITE_NAME}. Premium quality, nationwide delivery across Bangladesh. ${count} product${count !== 1 ? 's' : ''} available.`;
    const image = coverByCategory.get(cat.id) ?? DEFAULT_IMAGE;

    const jsonLdBlocks = [
      jsonLd({
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: cat.name,
        url: `${SITE_URL}${route}`,
      }),
      jsonLd({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: 'Collections', item: `${SITE_URL}/collections` },
          { '@type': 'ListItem', position: 3, name: cat.name, item: `${SITE_URL}${route}` },
        ],
      }),
    ];
    writeRoute(
      route,
      injectBeforeHeadEnd(applyMeta(TEMPLATE, { title, description, image, canonicalPath: route }), jsonLdBlocks)
    );
    categoryCount++;
  }

  // Products — mirrors ProductPage.setSEO + its Product/Breadcrumb JSON-LD.
  for (const p of products) {
    if (!p.title) continue;
    const code = p.product_code ?? p.id; // same fallback ProductCard/ProductPage use
    if (!code) continue;
    const route = `/product/${productParam(p.title, code)}`;
    const firstImage = safeImage(p.product_images?.[0]?.image_url ?? DEFAULT_IMAGE);
    const title = `${p.title} — Buy Online at ${SITE_NAME}`;
    const description = p.description
      ? `${p.description.slice(0, 160)}...`
      : `Buy ${p.title} at ${SITE_NAME}. ৳${Number(p.price).toFixed(0)}. ${DEFAULT_DESCRIPTION}`;
    const finalPrice = p.discount_price != null && p.discount_price < p.price ? p.discount_price : p.price;

    // Availability logic mirrors ProductPage exactly (size-level first).
    const hasSizes = Array.isArray(p.sizes) && p.sizes.length > 0;
    const inStock = hasSizes
      ? (p.product_sizes ?? []).some((ps) => (ps.quantity ?? 0) > 0)
      : (p.stock_count ?? 0) > 0;

    const breadcrumbItems = [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
    ];
    if (p.categories?.name) {
      breadcrumbItems.push({
        '@type': 'ListItem',
        position: 2,
        name: p.categories.name,
        item: `${SITE_URL}/collections/${slugify(p.categories.name)}`,
      });
    }
    breadcrumbItems.push({ '@type': 'ListItem', position: breadcrumbItems.length + 1, name: p.title, item: `${SITE_URL}${route}` });

    const jsonLdBlocks = [
      jsonLd({
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: p.title,
        description: p.description || `Buy ${p.title} at ${SITE_NAME}.`,
        image: (p.product_images ?? []).map((img) => img.image_url).filter(Boolean).length > 0
          ? p.product_images.map((img) => safeImage(img.image_url)).filter(Boolean)
          : [DEFAULT_IMAGE],
        sku: code,
        brand: { '@type': 'Brand', name: SITE_NAME },
        offers: {
          '@type': 'Offer',
          price: Number(finalPrice).toFixed(2),
          priceCurrency: 'BDT',
          url: `${SITE_URL}${route}`,
          availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
          itemCondition: 'https://schema.org/NewCondition',
        },
      }),
      jsonLd({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: breadcrumbItems,
      }),
    ];
    writeRoute(
      route,
      injectBeforeHeadEnd(applyMeta(TEMPLATE, { title, description, image: firstImage, canonicalPath: route }), jsonLdBlocks)
    );
    productCount++;
  }
}

try {
  await prerenderFromDb();
} catch (err) {
  warn(`DB prerender failed (${err.message}) — shipping static pages only. Site is unaffected.`);
}

log(`wrote ${written.length} route files: ${categoryCount} categories, ${productCount} products, ${written.length - categoryCount - productCount} static.`);
process.exit(0);
