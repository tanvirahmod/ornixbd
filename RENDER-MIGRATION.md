# Render Static Site Migration — Runbook (Option B: build-time prerender)

Decision: host on **Render Static Site** with build-time prerendering of
per-route HTML (real product/category SEO + WhatsApp/Facebook tags baked into
static files). Same repo, same Supabase, same domain — nothing else changes.

## What changed in the repo

| File | Purpose |
|---|---|
| `scripts/prerender.mjs` | NEW — after `vite build`, writes per-route HTML into `dist` (8 products, 6 categories, 8 static pages today). Head-only meta swap + JSON-LD; body untouched so React boots identically. **Fail-open**: DB errors degrade to static pages only, never fail the build. |
| `package.json` | NEW script `build:render` = sitemap → `vite build` → prerender. Plain `npm run build` unchanged (Netlify keeps behaving exactly as today). |
| `render.yaml` | NEW — Render blueprint: static runtime, `npm run build:render`, publish `dist`, Node 20, Supabase env vars, SPA rewrite `/*` → `/index.html`. |
| `public/robots.txt` | Added `Sitemap:` line. |
| Netlify files | **Untouched on purpose** — keep `netlify.toml` + `netlify/` until after DNS cutover so the live Netlify site keeps working. |

## 1. Create the site on Render

Easiest path (uses `render.yaml`):
1. Render Dashboard → **New +** → **Blueprint** → connect this repo.
2. When prompted for `VITE_SUPABASE_ANON_KEY`, paste the value from `.env`
   (same public anon key the browser uses — not a secret).
3. Deploy. Build takes ~1 min.

Manual path (no blueprint): New + → Static Site → build command
`npm run build:render`, publish directory `dist`, env vars `NODE_VERSION=20`,
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`; then Settings → Redirects/Rewrites:
add **Source `/*` → Destination `/index.html`, Action: Rewrite**.

## 2. Verify on the Render preview URL (before touching DNS)

```bash
# Should print: <title>A Mess Hide Hoodie — Buy Online at ORNIX</title>
curl -s https://YOUR-SITE.onrender.com/product/a-mess-hide-hoodie-prd-00003 | grep -o "<title>[^<]*</title>"
# Category:
curl -s https://YOUR-SITE.onrender.com/collections/hoodies | grep -o "<title>[^<]*</title>"
# SPA fallback (any client route must return 200 + homepage title):
curl -s -w "[%{http_code}]\n" https://YOUR-SITE.onrender.com/track | grep -o "<title>[^<]*</title>\|\[[0-9]*\]"
# Crawler view (what WhatsApp sees):
curl -s -A "facebookexternalhit" https://YOUR-SITE.onrender.com/product/a-mess-hide-hoodie-prd-00003 | grep -o "<title>[^<]*</title>"
```

Then test the site in a browser: home, product, collection, cart, checkout,
admin login. The prerendered HTML is head-only — the app behaves identically.

## 3. DNS cutover

1. Render → Settings → Custom Domains → add `ornix.com.bd` and `www.ornix.com.bd`.
2. At the domain's DNS provider, point the records Render shows (CNAME for
   `www` / apex per provider guidance). SSL is automatic (Let's Encrypt).
3. Keep the old Netlify site alive until Render answers on both hostnames,
   then delete the Netlify custom domains.

## 4. Post-cutover cleanup (only after DNS switched)

- Delete `netlify.toml` and the `netlify/` folder (edge function no longer
  used — prerender replaces it).
- Disable/remove the Netlify site so pushes don't deploy there.
- Facebook Sharing Debugger (`developers.facebook.com/tools/debug`) on a
  product URL → "Scrape again" to refresh cached previews.

## Known trade-off

Prerendered tags are as fresh as the last deploy. A product added via admin
shows homepage preview tags until the next push (page itself works fine).
Optional fix later: scheduled daily rebuild (GitHub Actions cron → Render
deploy hook). New products always fall back gracefully via the SPA rewrite.

## Local verification (done)

`npm run build:render` green; 22 route files written; product file verified
(title/canonical/OG/Product JSON-LD with BDT price + size-level stock);
`tsc --noEmit` and plain `npm run build` both green; served dist via
`vite preview` — extensionless, trailing-slash, `.html` paths all serve the
prerendered file; unknown routes fall back to the SPA at 200.
