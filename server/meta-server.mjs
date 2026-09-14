// ORNIX SEO meta server (VPS edition)
// =====================================
// This is the VPS equivalent of the Netlify edge function. It runs on your
// Ubuntu server behind Nginx and serves HTML with correct per-page meta tags
// ONLY to social-media crawlers (Facebook, WhatsApp, Twitter, etc.).
//
// Nginx routes crawler User-Agents here; real visitors are served static
// files directly by Nginx — they never touch this process, so site speed
// for users is completely unaffected.
//
// Run it with:
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... node server/meta-server.mjs
// (see server/ornix-meta.service for the systemd unit)

import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT || 3001);
const SITE_URL = 'https://ornix.com.bd';
const SITE_NAME = 'ORNIX';
const DEFAULT_IMAGE = 'https://ik.imagekit.io/oy2vruqkz/images-photoaidcom-cropped.png';
const DEFAULT_DESCRIPTION = 'ORNIX — Modern streetwear from Bangladesh. Bold fashion, quality fabrics, nationwide delivery. Shop the latest collections online.';

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? '';

// Load the built index.html once at startup (rebuild + restart to update).
const INDEX_HTML = readFileSync(path.join(__dirname, '..', 'dist', 'index.html'), 'utf8');

const CRAWLER_UA =
  /(facebookexternalhit|facebookcatalog|Facebot|WhatsApp|TelegramBot|Twitterbot|LinkedInBot|Discordbot|Slackbot|Pinterestbot|embedly|quora link preview|vkshare|vkShare)/i;

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const slugify = (s) =>
  s.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');

// ── Supabase REST helpers ────────────────────────────────────────────────
async function supabaseRest(pathAndQuery) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}`);
  return res.json();
}

async function getProductMeta(productCode) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const rows = await supabaseRest(
    `products?product_code=eq.${encodeURIComponent(productCode)}&select=title,description,price,discount_price,product_images(image_url)` +
      `&product_images.limit=1&product_images.order=display_order.asc&limit=1`
  );
  const p = rows?.[0];
  if (!p) return null;

  const finalPrice = p.discount_price ?? p.price;
  return {
    title: `${p.title} — ${SITE_NAME}`,
    description:
      p.description?.trim() ||
      `${p.title} — ৳${finalPrice}. Premium quality streetwear from ORNIX. Cash on delivery available, nationwide shipping across Bangladesh.`,
    image: p.product_images?.[0]?.image_url ?? DEFAULT_IMAGE,
  };
}

async function getCategoryMeta(slug) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const cats = await supabaseRest('categories?select=id,name,description');
  const cat = cats.find((c) => slugify(c.name) === slug);
  if (!cat) return null;

  let image = DEFAULT_IMAGE;
  try {
    const prods = await supabaseRest(
      `products?category_id=eq.${cat.id}&select=product_images(image_url)&product_images.limit=1&order=created_at.desc&limit=1`
    );
    const url = prods?.[0]?.product_images?.[0]?.image_url;
    if (url) image = url;
  } catch {
    /* keep default image */
  }

  return {
    title: `${cat.name} — ${SITE_NAME}`,
    description:
      cat.description?.trim() ||
      `Shop ${cat.name} at ORNIX — premium quality streetwear with nationwide delivery across Bangladesh.`,
    image,
  };
}

// Static page metadata (no DB query needed)
const PAGE_META = {
  '/': {
    title: `${SITE_NAME} — Modern Fashion from Bangladesh`,
    description: DEFAULT_DESCRIPTION,
  },
  '/collections': { title: `Collections — ${SITE_NAME}`, description: `Browse all collections at ${SITE_NAME}.` },
  '/new-arrivals': { title: `New Arrivals — ${SITE_NAME}`, description: `Fresh drops every week at ${SITE_NAME}. Shop the latest styles.` },
  '/hot-deals': { title: `Hot Deals — ${SITE_NAME}`, description: `Biggest discounts at ${SITE_NAME} — limited-time offers on premium streetwear.` },
  '/shop-by-size': { title: `Shop by Size — ${SITE_NAME}`, description: `Find products available in your size at ${SITE_NAME}.` },
  '/story': { title: `Our Story — ${SITE_NAME}`, description: `It started with a laptop, a room, and a massive dream. Read the ORNIX story.` },
  '/policies': { title: `Policies — ${SITE_NAME}`, description: `Shipping, returns, privacy and terms — policies, no fine print.` },
};

// ── In-memory cache (5 min TTL) so crawlers never hammer Supabase ────────
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map(); // pathname -> { meta, expires }

async function resolveMeta(pathname) {
  const hit = cache.get(pathname);
  if (hit && hit.expires > Date.now()) return hit.meta;

  let meta = null;
  try {
    const productMatch = pathname.match(/^\/product\/(.+?)(?:\/|$)/);
    const collectionMatch = pathname.match(/^\/collections\/(.+)$/);

    if (productMatch) {
      const codeMatch = productMatch[1].match(/-(prd-\d+)$/i);
      if (codeMatch) meta = await getProductMeta(codeMatch[1].toUpperCase());
    } else if (collectionMatch) {
      meta = await getCategoryMeta(collectionMatch[1]);
    } else {
      const page = PAGE_META[pathname];
      if (page) meta = { ...page, image: DEFAULT_IMAGE };
    }
  } catch (err) {
    console.error('resolveMeta error:', err.message);
  }

  cache.set(pathname, { meta, expires: Date.now() + CACHE_TTL_MS });
  return meta;
}

function injectMeta(html, meta, pathname) {
  if (!meta) return html;
  const escTitle = escapeHtml(meta.title);
  const escDesc = escapeHtml(meta.description);
  const escImage = escapeHtml(meta.image);
  const canonical = `${SITE_URL}${pathname}`;

  return html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escTitle}</title>`)
    .replace(/<meta property="og:title" content="[^"]*"/, `<meta property="og:title" content="${escTitle}"`)
    .replace(/<meta property="og:description" content="[^"]*"/, `<meta property="og:description" content="${escDesc}"`)
    .replace(/<meta property="og:image" content="[^"]*"/, `<meta property="og:image" content="${escImage}"`)
    .replace(/<meta property="og:url" content="[^"]*"/, `<meta property="og:url" content="${canonical}"`)
    .replace(/<meta name="twitter:title" content="[^"]*"/, `<meta name="twitter:title" content="${escTitle}"`)
    .replace(/<meta name="twitter:description" content="[^"]*"/, `<meta name="twitter:description" content="${escDesc}"`)
    .replace(/<meta name="twitter:image" content="[^"]*"/, `<meta name="twitter:image" content="${escImage}"`)
    .replace(/<meta name="description" content="[^"]*"/, `<meta name="description" content="${escDesc}"`);
}

// ── HTTP server ──────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  // Health check for systemd / uptime monitors
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
    return;
  }

  try {
    const meta = await resolveMeta(url.pathname);
    const html = injectMeta(INDEX_HTML, meta, url.pathname);
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=0, s-maxage=300',
      'x-ornix-seo': meta ? 'prerendered' : 'default',
    });
    res.end(html);
  } catch (err) {
    console.error('request error:', err.message);
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(INDEX_HTML);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`ORNIX meta server listening on 127.0.0.1:${PORT}`);
});
