import { Product } from './supabase';

export const COVER_FALLBACK = 'https://images.pexels.com/photos/5632398/pexels-photo-5632398.jpeg?auto=compress&cs=tinysrgb&w=800';

export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Builds a clean SEO-friendly product URL param: slug-PRDCODE */
export function productParam(title: string, productCode: string): string {
  return `${slugify(title)}-${productCode.toLowerCase()}`;
}

/** Possible product_code values encoded at the end of a product URL param,
 *  most likely first: a generated code (`PRD-00001`), a custom code with no
 *  hyphen (`R0YAL304`), or a custom code that itself contains a hyphen
 *  (`NX-001` → last two tokens joined). Empty array = no code in the URL
 *  (a code-less product's slug + uuid fallback link).
 */
export function extractProductCodeCandidates(param: string): string[] {
  const match = param.match(/-(prd-\d+)$/i);
  if (match) return [match[1].toUpperCase()];
  const tokens = param.split('-');
  if (tokens.length < 2) return [];
  const candidates: string[] = [];
  const last = tokens[tokens.length - 1] ?? '';
  if (/\d/.test(last) && last.length <= 20) candidates.push(last.toUpperCase());
  if (tokens.length >= 3) {
    const two = tokens.slice(-2).join('-');
    if (/\d/.test(two) && two.length <= 24) candidates.push(two.toUpperCase());
  }
  return candidates;
}

/** The most likely product_code in a product URL param (null if none). */
export function extractProductCode(param: string): string | null {
  return extractProductCodeCandidates(param)[0] ?? null;
}

export function getCoverImage(product: Product): string {
  if (product.product_images && product.product_images.length > 0) {
    return product.product_images[0].image_url;
  }
  return COVER_FALLBACK;
}
