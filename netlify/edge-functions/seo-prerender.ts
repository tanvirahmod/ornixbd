// Netlify Edge Function: SEO prerender for social-media crawlers.
//
// WHY THIS EXISTS:
// Facebook, WhatsApp, LinkedIn, Twitter/X, Telegram etc. do NOT run JavaScript.
// This is a React SPA, so when their crawler requests a page it gets the raw
// index.html — which always contains the HOMEPAGE title/logo. That's why pasting
// a product link on Facebook showed the homepage preview.
//
// WHAT THIS DOES:
// For crawler requests only (identified by User-Agent), it fetches the page's
// real data straight from Supabase REST (one fast, cached query) and rewrites
// the <title> + og:* + twitter:* tags in the served HTML before returning it.
// Real visitors are untouched: their requests are passed through instantly.
//
// No build changes, no extra JS shipped, zero impact on site speed for users.

import type { Context } from 'https://deno.land/x/edge_function_types@0.1.0/mod.ts';

const SITE_URL = 'https://ornix.com.bd';
const SITE_NAME = 'ORNIX';
const DEFAULT_IMAGE = 'https://ik.imagekit.io/oy2vruqkz/images-photoaidcom-cropped.png';
const DEFAULT_DESCRIPTION = 'ORNIX — Modern streetwear from Bangladesh. Bold fashion, quality fabrics, nationwide delivery. Shop the latest collections online.';

// Supabase credentials for server-side REST calls (public anon key only —
// safe for edge functions, same key the browser already uses).
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const CRAWLER_UA =
  /(facebookexternalhit|facebookcatalog|Facebot|WhatsApp|TelegramBot|Twitterbot|LinkedInBot|Discordbot|Slackbot|Pinterestbot|embedly|quora link preview|vkshare|vkShare)/i;

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function supabaseRest(path: string): Promise<unknown> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}`);
  return res.json();
}

async function getProductMeta(productCode: string) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const rows = (await supabaseRest(
    `products?product_code=eq.${encodeURIComponent(productCode)}&select=title,description,price,discount_price,product_images(image_url)` +
      `&product_images.limit=1&product_images.order=display_order.asc`
  )) as Array<{
    title: string;
    description: string | null;
    price: number;
    discount_price: number | null;
    product_images?: Array<{ image_url: string }>;
  }>;
  const p = rows?.[0];
  if (!p) return null;

  const finalPrice = p.discount_price ?? p.price;
  const image = p.product_images?.[0]?.image_url ?? DEFAULT_IMAGE;
  return {
    title: `${p.title} — ${SITE_NAME}`,
    description:
      p.description?.trim() ||
      `${p.title} — ৳${finalPrice}. Premium quality streetwear from ORNIX. Cash on delivery available, nationwide shipping across Bangladesh.`,
    image,
  };
}

async function getCategoryMeta(slug: string) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const cats = (await supabaseRest('categories?select=id,name,description')) as Array<{
    id: string;
    name: string;
    description: string | null;
  }>;
  // Match by slugified name (same logic as the storefront).
  const slugify = (s: string) =>
    s.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');
  const cat = cats.find((c) => slugify(c.name) === slug);
  if (!cat) return null;

  // First product image in this category as the preview.
  let image = DEFAULT_IMAGE;
  try {
    const prods = (await supabaseRest(
      `products?category_id=eq.${cat.id}&select=product_images(image_url)&product_images.limit=1&order=created_at.desc&limit=1`
    )) as Array<{ product_images?: Array<{ image_url: string }> }>;
    const url = prods?.[0]?.product_images?.[0]?.image_url;
    if (url) image = url;
  } catch {
    /* keep default */
  }

  return {
    title: `${cat.name} — ${SITE_NAME}`,
    description: cat.description?.trim() || `Shop ${cat.name} at ORNIX — premium quality streetwear with nationwide delivery across Bangladesh.`,
    image,
  };
}

export default async (request: Request, context: Context) => {
  const response = await context.next();
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/html')) return response;

  const url = new URL(request.url);
  const ua = request.headers.get('user-agent') ?? '';
  const isCrawler = CRAWLER_UA.test(ua);

  // Pages that should never get custom social tags.
  if (url.pathname.startsWith('/admin')) return response;

  // Real users: pass through untouched (zero performance cost).
  if (!isCrawler) {
    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
    });
  }

  // ── Crawler path: fetch HTML, resolve metadata, rewrite tags ──
  const html = await response.text();
  let meta: { title: string; description: string; image: string } | null = null;

  try {
    let productCode: string | undefined;
    let categorySlug: string | undefined;

    const productMatch = url.pathname.match(/^\/product\/(.+?)(?:\/|$)/);
    const collectionMatch = url.pathname.match(/^\/collections\/(.+)$/);

    if (productMatch) {
      // Product URLs end with -prd-XXXXX (slugified title + lowercase code)
      const codeMatch = productMatch[1].match(/-(prd-\d+)$/i);
      productCode = codeMatch ? codeMatch[1].toUpperCase() : undefined;
    } else if (collectionMatch) {
      categorySlug = collectionMatch[1];
    }

    if (productCode) {
      meta = await getProductMeta(productCode);
    } else if (categorySlug) {
      meta = await getCategoryMeta(categorySlug);
    } else if (url.pathname === '/' || url.pathname === '') {
      meta = {
        title: `${SITE_NAME} — Modern Fashion from Bangladesh`,
        description: DEFAULT_DESCRIPTION,
        image: DEFAULT_IMAGE,
      };
    } else {
      // Static pages (story, policies, new-arrivals, hot-deals, shop-by-size)
      const pageMeta: Record<string, { title: string; description: string }> = {
        '/': { title: `${SITE_NAME} — Modern Fashion from Bangladesh`, description: DEFAULT_DESCRIPTION },
        '/collections': { title: `Collections — ${SITE_NAME}`, description: `Browse all collections at ${SITE_NAME}.` },
        '/new-arrivals': { title: `New Arrivals — ${SITE_NAME}`, description: `Fresh drops every week at ${SITE_NAME}. Shop the latest styles.` },
        '/hot-deals': { title: `Hot Deals — ${SITE_NAME}`, description: `Biggest discounts at ${SITE_NAME} — limited-time offers on premium streetwear.` },
        '/shop-by-size': { title: `Shop by Size — ${SITE_NAME}`, description: `Find products available in your size at ${SITE_NAME}.` },
        '/story': { title: `Our Story — ${SITE_NAME}`, description: `It started with a laptop, a room, and a massive dream. Read the ORNIX story.` },
        '/policies': { title: `Policies — ${SITE_NAME}`, description: `Shipping, returns, privacy and terms — policies, no fine print.` },
      };
      const page = pageMeta[url.pathname];
      if (page) meta = { ...page, image: DEFAULT_IMAGE };
    }
  } catch (err) {
    // On any data error, serve the default HTML (homepage preview) — never break the page.
    console.error('SEO prerender error:', err);
  }

  if (!meta) return new Response(html, { status: response.status, headers: response.headers });

  const escTitle = escapeHtml(meta.title);
  const escDesc = escapeHtml(meta.description);
  const escImage = escapeHtml(meta.image);
  const canonical = `${SITE_URL}${url.pathname}`;

  // Replace existing tags wholesale — regexes are anchored to exact tag shapes
  // that index.html produces, so this is fast and deterministic.
  let out = html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escTitle}</title>`)
    .replace(/<meta property="og:title" content="[^"]*"/, `<meta property="og:title" content="${escTitle}"`)
    .replace(/<meta property="og:description" content="[^"]*"/, `<meta property="og:description" content="${escDesc}"`)
    .replace(/<meta property="og:image" content="[^"]*"/, `<meta property="og:image" content="${escImage}"`)
    .replace(/<meta property="og:url" content="[^"]*"/, `<meta property="og:url" content="${canonical}"`)
    .replace(/<meta name="twitter:title" content="[^"]*"/, `<meta name="twitter:title" content="${escTitle}"`)
    .replace(/<meta name="twitter:description" content="[^"]*"/, `<meta name="twitter:description" content="${escDesc}"`)
    .replace(/<meta name="twitter:image" content="[^"]*"/, `<meta name="twitter:image" content="${escImage}"`)
    .replace(/<meta name="description" content="[^"]*"/, `<meta name="description" content="${escDesc}"`);

  return new Response(out, {
    status: response.status,
    headers: {
      ...Object.fromEntries(response.headers.entries()),
      // Let Facebook cache the preview but refresh it periodically (seconds).
      'x-ornix-seo': 'prerendered',
      'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400',
    },
  });
};
