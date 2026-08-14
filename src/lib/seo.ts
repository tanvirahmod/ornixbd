export const SITE_URL = 'https://ornixbd.com';
export const SITE_NAME = 'ORNIX';
export const DEFAULT_OG_IMAGE = 'https://ik.imagekit.io/oy2vruqkz/images-photoaidcom-cropped.png';
export const DEFAULT_DESCRIPTION = 'ORNIX — Modern streetwear from Bangladesh. Bold fashion, quality fabrics, nationwide delivery. Shop the latest collections online.';

function updateMetaTag(attr: 'name' | 'property', key: string, value: string) {
  let tag = document.querySelector(`meta[${attr}="${key}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attr, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', value);
}

function updateLinkTag(rel: string, href: string) {
  let tag = document.querySelector(`link[rel="${rel}"]`);
  if (!tag) {
    tag = document.createElement('link');
    tag.setAttribute('rel', rel);
    document.head.appendChild(tag);
  }
  tag.setAttribute('href', href);
}

export function setSEO({
  title,
  description,
  image,
  url,
}: {
  title: string;
  description?: string;
  image?: string;
  url?: string;
}) {
  document.title = title;

  if (description) {
    updateMetaTag('name', 'description', description);
  }

  const fullUrl = url ? `${SITE_URL}${url}` : SITE_URL;
  updateLinkTag('canonical', fullUrl);

  updateMetaTag('property', 'og:title', title);
  updateMetaTag('property', 'og:description', description || DEFAULT_DESCRIPTION);
  updateMetaTag('property', 'og:image', image || DEFAULT_OG_IMAGE);
  updateMetaTag('property', 'og:url', fullUrl);
  updateMetaTag('property', 'og:type', 'website');
  updateMetaTag('property', 'og:site_name', SITE_NAME);

  updateMetaTag('name', 'twitter:card', 'summary_large_image');
  updateMetaTag('name', 'twitter:title', title);
  updateMetaTag('name', 'twitter:description', description || DEFAULT_DESCRIPTION);
  updateMetaTag('name', 'twitter:image', image || DEFAULT_OG_IMAGE);
}

export function setJsonLd(data: Record<string, unknown>) {
  const existing = document.querySelector('script[type="application/ld+json"]');
  if (existing) {
    existing.textContent = JSON.stringify(data);
  } else {
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(data);
    document.head.appendChild(script);
  }
}
