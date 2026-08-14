import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import http from 'http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(__dirname, '..', 'dist');
const PORT = 3123;

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function productParam(title: string, productCode: string): string {
  return `${slugify(title)}-${productCode.toLowerCase()}`;
}

const STATIC_ROUTES = [
  { path: '/', out: 'index.html' },
  { path: '/collections', out: 'collections/index.html' },
];

async function getProductRoutes() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn('Supabase credentials not found. Skipping product pre-rendering.');
    return [];
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/products?select=title,product_code,description,price,discount_price,product_images(image_url,display_order)&limit=1000`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });

  if (!response.ok) {
    console.warn('Failed to fetch products for pre-rendering');
    return [];
  }

  const products = await response.json();
  return products.map((p: { 
    title: string; 
    product_code: string | null; 
    description: string;
    price: number;
    discount_price: number | null;
    product_images: { image_url: string; display_order: number }[];
  }) => {
    const code = p.product_code ?? `prd-${Math.random().toString(36).slice(2, 8)}`;
    const slug = productParam(p.title, code);
    const image = p.product_images && p.product_images.length > 0 
      ? p.product_images.sort((a, b) => a.display_order - b.display_order)[0].image_url
      : 'https://ik.imagekit.io/oy2vruqkz/images-photoaidcom-cropped.png';
    
    return {
      path: `/product/${slug}`,
      out: `product/${slug}/index.html`,
      title: `${p.title} — ORNIX`,
      description: p.description ? p.description.slice(0, 160) : `Buy ${p.title} at ORNIX. ৳${Number(p.price).toFixed(0)}. Modern streetwear from Bangladesh.`,
      image,
    };
  });
}

async function prerender() {
  console.log('Starting pre-rendering...');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const productRoutes = await getProductRoutes();
    const allRoutes = [...STATIC_ROUTES, ...productRoutes];

    const server = http.createServer((req, res) => {
      let filePath = join(DIST_DIR, req.url === '/' ? 'index.html' : req.url);
      if (filePath.endsWith('/')) filePath = join(filePath, 'index.html');

      try {
        const content = readFileSync(filePath);
        const ext = filePath.split('.').pop();
        const contentType = {
          'html': 'text/html',
          'js': 'application/javascript',
          'css': 'text/css',
          'json': 'application/json',
          'png': 'image/png',
          'jpg': 'image/jpeg',
          'gif': 'image/gif',
          'svg': 'image/svg+xml',
        }[ext || ''] || 'application/octet-stream';

        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
      } catch {
        try {
          const content = readFileSync(join(DIST_DIR, 'index.html'));
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(content);
        } catch {
          res.writeHead(404);
          res.end('Not found');
        }
      }
    });

    await new Promise<void>((resolve) => server.listen(PORT, resolve));
    console.log(`Server started on port ${PORT}`);

    for (const route of allRoutes) {
      const page = await browser.newPage();
      const url = `http://localhost:${PORT}${route.path}`;

      try {
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
        await page.waitForTimeout(5000);

        if ('image' in route) {
          const ogImage = await page.$eval('meta[property="og:image"]', (el) => (el as HTMLMetaElement).content).catch(() => null);
          console.log(`  OG image for ${route.path}: ${ogImage || 'not set'}`);
        }

        const html = await page.content();
        const outPath = join(DIST_DIR, route.out);
        mkdirSync(dirname(outPath), { recursive: true });
        writeFileSync(outPath, html);
        console.log(`Pre-rendered: ${route.path}`);
      } catch (err) {
        console.error(`Failed to pre-render ${route.path}:`, err);
      } finally {
        await page.close();
      }
    }

    console.log('Pre-rendering complete!');
    server.close();
  } finally {
    await browser.close();
  }
}

prerender().catch((err) => {
  console.error('Pre-rendering failed:', err);
  process.exit(1);
});
