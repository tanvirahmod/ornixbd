import { useEffect, useRef } from 'react';
import { useNavigationType } from 'react-router-dom';
import { getProductListingSnapshot, setProductListingSnapshot } from './productListingCache';

export function useProductListingScroll(cacheKey: string, savedScrollY?: number): void {
  const navigationType = useNavigationType();
  const navigatingToProduct = useRef(false);
  const storageKey = `ornix:product-list-scroll:${cacheKey}`;

  useEffect(() => {
    const saveScrollPosition = () => {
      if (navigatingToProduct.current) return;
      const snapshot = getProductListingSnapshot(cacheKey);
      if (snapshot) {
        setProductListingSnapshot(cacheKey, { ...snapshot, scrollY: window.scrollY });
      }
    };
    const saveBeforeProductNavigation = (event: MouseEvent) => {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        !(event.target instanceof Element) ||
        !event.target.closest('a[href^="/product/"]')
      ) {
        return;
      }

      const snapshot = getProductListingSnapshot(cacheKey);
      if (snapshot) {
        setProductListingSnapshot(cacheKey, { ...snapshot, scrollY: window.scrollY });
        sessionStorage.setItem(storageKey, String(window.scrollY));
        navigatingToProduct.current = true;
      }
    };

    window.addEventListener('scroll', saveScrollPosition, { passive: true });
    document.addEventListener('click', saveBeforeProductNavigation, true);
    return () => {
      window.removeEventListener('scroll', saveScrollPosition);
      document.removeEventListener('click', saveBeforeProductNavigation, true);
    };
  }, [cacheKey, storageKey]);

  useEffect(() => {
    if (navigationType !== 'POP') return;
    const storedScrollY = sessionStorage.getItem(storageKey);
    const scrollY = savedScrollY ?? (storedScrollY === null ? undefined : Number(storedScrollY));
    if (scrollY === undefined || !Number.isFinite(scrollY)) return;

    const timer = window.setTimeout(() => {
      window.scrollTo({ top: scrollY, behavior: 'auto' });
    }, 100);
    return () => window.clearTimeout(timer);
  }, [navigationType, savedScrollY, storageKey]);
}
