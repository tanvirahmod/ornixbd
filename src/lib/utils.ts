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

/** Extracts the product_code from the end of a product URL param.
 *  The code is the last hyphen-separated token that matches PRD-XXXXX (case-insensitive).
 */
export function extractProductCode(param: string): string | null {
  const match = param.match(/-(prd-\d+)$/i);
  return match ? match[1].toUpperCase() : null;
}

export function getCoverImage(product: Product): string {
  if (product.product_images && product.product_images.length > 0) {
    return product.product_images[0].image_url;
  }
  return COVER_FALLBACK;
}
