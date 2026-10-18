import { Product } from './supabase';

export interface ProductListingSnapshot {
  products: Product[];
  totalCount: number;
  loadedPages: number;
  sortBy?: string;
  allProducts?: Product[];
  categoryId?: string;
  categoryName?: string;
  scrollY?: number;
}

const MAX_CACHED_LISTINGS = 20;
const snapshots = new Map<string, ProductListingSnapshot>();

export function getProductListingSnapshot(key: string): ProductListingSnapshot | undefined {
  return snapshots.get(key);
}

export function setProductListingSnapshot(key: string, snapshot: ProductListingSnapshot): void {
  const previous = snapshots.get(key);
  const nextSnapshot =
    snapshot.scrollY === undefined && previous?.scrollY !== undefined
      ? { ...snapshot, scrollY: previous.scrollY }
      : snapshot;
  snapshots.delete(key);
  snapshots.set(key, nextSnapshot);

  if (snapshots.size > MAX_CACHED_LISTINGS) {
    const oldestKey = snapshots.keys().next().value;
    if (oldestKey) snapshots.delete(oldestKey);
  }
}

export function removeProductListingSnapshot(key: string): void {
  snapshots.delete(key);
}
