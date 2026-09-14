# Hosting ORNIX on an Ubuntu VPS

Yes, a VPS works fine. The only thing that can't carry over is the Netlify
edge function — instead we use a tiny Node "meta server" (in this folder) that
serves social-media crawlers correctly-tagged HTML. Real visitors are served
pure static files by Nginx, so site speed is completely unaffected.

## Architecture

```
                         ┌─ real visitors ──→ Nginx serves /var/www/ornix/dist (static, fast)
Internet → Nginx :443 ──┤
                         └─ crawler UAs ────→ meta server 127.0.0.1:3001 (injects OG tags)
```

## 1. Install prerequisites

```bash
sudo apt update
sudo apt install -y nginx nodejs npm certbot python3-certbot-nginx
```

Node must be ≥ 18 (the meta server uses global `fetch`). If apt gives an older
version: `curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs`

## 2. Build and upload the site

On your local machine:

```bash
npm run build
rsync -avz --delete dist/ user@YOUR_VPS_IP:/var/www/ornix/dist/
rsync -avz server/ user@YOUR_VPS_IP:/var/www/ornix/server/
```

## 3. Set up the meta server (systemd)

```bash
sudo nano /etc/systemd/system/ornix-meta.service
# paste server/ornix-meta.service contents, and put your real
# SUPABASE_ANON_KEY in the Environment line

sudo chown -R www-data:www-data /var/www/ornix
sudo systemctl daemon-reload
sudo systemctl enable --now ornix-meta
systemctl status ornix-meta          # should say "active (running)"
curl http://127.0.0.1:3001/healthz   # should print: ok
```

## 4. Nginx site config

Create `/etc/nginx/sites-available/ornix`:

```nginx
# Serve static files to real visitors; proxy crawler traffic to the meta server
map $http_user_agent $is_crawler {
    default                 0;
    ~*facebookexternalhit   1;
    ~*facebookcatalog       1;
    ~*Facebot               1;
    ~*WhatsApp              1;
    ~*TelegramBot           1;
    ~*Twitterbot            1;
    ~*LinkedInBot           1;
    ~*Discordbot            1;
    ~*Slackbot              1;
    ~*Pinterestbot          1;
    ~*embedly               1;
    ~*vkshare               1;
}

server {
    listen 80;
    server_name ornix.com.bd www.ornix.com.bd;

    root /var/www/ornix/dist;
    index index.html;

    # Static assets: long cache (hashed filenames)
    location /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
        try_files $uri =404;
    }

    # Crawler requests for pages → meta server
    location / {
        if ($is_crawler) {
            proxy_pass http://127.0.0.1:3001;
        }
        try_files $uri $uri/ /index.html;
    }
}
```

Enable it:

```bash
sudo ln -s /etc/nginx/sites-available/ornix /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

## 5. HTTPS (required — Facebook refuses to crawl http-only sites)

```bash
sudo certbot --nginx -d ornix.com.bd -d www.ornix.com.bd
```

Certbot rewrites the config for SSL + auto-renewal automatically.

## 6. Point the domain

At your domain registrar, set A records:
- `ornix.com.bd` → your VPS IP
- `www.ornix.com.bd` → your VPS IP

## 7. Verify the social previews

After DNS + SSL are live:

```bash
# Should return HTML containing the PRODUCT title:
curl -s -A "facebookexternalhit" https://ornix.com.bd/product/drop-shoulder-tee-prd-00012 | grep -o '<title>[^<]*</title>'
```

Then use the Facebook Sharing Debugger (developers.facebook.com/tools/debug)
and send a link to yourself on WhatsApp.

## Deploying updates later

```bash
npm run build
rsync -avz --delete dist/ user@YOUR_VPS_IP:/var/www/ornix/dist/
# meta server caches index.html at startup — restart it after a deploy:
ssh user@YOUR_VPS_IP 'sudo systemctl restart ornix-meta'
```

## Performance notes (why this stays fast)

- Real visitors hit Nginx directly for static files — same speed as any
  static host. The meta server is never in their path.
- The meta server responds only to crawlers, caches DB results for 5 minutes
  in memory, and is a ~7 KB script using ~30 MB RAM.
- If it ever crashes, systemd restarts it in 3 seconds; if it's briefly down,
  crawlers just get the homepage preview (site still works).

## Maintenance checklist

- `systemctl status ornix-meta` — service alive
- `journalctl -u ornix-meta -f` — live logs
- Renewal of SSL is automatic via certbot timer (`systemctl list-timers | grep certbot`)
