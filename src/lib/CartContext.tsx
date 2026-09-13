import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Product } from './supabase';

export interface CartItem {
  productId: string;
  productCode: string | null;
  title: string;
  imageUrl: string | null;
  unitPrice: number;
  size: string | null;
  quantity: number;
}

interface CartContextValue {
  items: CartItem[];
  itemCount: number;
  subtotal: number;
  addItem: (product: Product, options: { size: string | null; quantity: number; imageUrl?: string | null }) => void;
  updateQuantity: (productId: string, size: string | null, quantity: number) => void;
  removeItem: (productId: string, size: string | null) => void;
  clearCart: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

const STORAGE_KEY = 'ornix_cart_v1';

function sameLineItem(a: { productId: string; size: string | null }, b: { productId: string; size: string | null }) {
  return a.productId === b.productId && (a.size ?? null) === (b.size ?? null);
}

function loadCart(): CartItem[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is CartItem =>
        item &&
        typeof item.productId === 'string' &&
        typeof item.title === 'string' &&
        typeof item.unitPrice === 'number' &&
        typeof item.quantity === 'number'
    );
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => loadCart());

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // storage full/unavailable — cart just won't persist
    }
  }, [items]);

  const value = useMemo<CartContextValue>(() => {
    const addItem: CartContextValue['addItem'] = (product, { size, quantity, imageUrl }) => {
      const unitPrice =
        product.discount_price != null && product.discount_price < product.price
          ? Number(product.discount_price)
          : Number(product.price);

      setItems((prev) => {
        const existing = prev.find((item) => sameLineItem(item, { productId: product.id, size }));
        if (existing) {
          return prev.map((item) =>
            sameLineItem(item, { productId: product.id, size })
              ? { ...item, quantity: Math.min(item.quantity + quantity, 99) }
              : item
          );
        }
        return [
          ...prev,
          {
            productId: product.id,
            productCode: product.product_code ?? null,
            title: product.title,
            imageUrl: imageUrl ?? null,
            unitPrice,
            size: size ?? null,
            quantity,
          },
        ];
      });
    };

    return {
      items,
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
      subtotal: items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
      addItem,
      updateQuantity: (productId, size, quantity) => {
        setItems((prev) =>
          quantity <= 0
            ? prev.filter((item) => !sameLineItem(item, { productId, size }))
            : prev.map((item) =>
                sameLineItem(item, { productId, size })
                  ? { ...item, quantity: Math.min(quantity, 99) }
                  : item
              )
        );
      },
      removeItem: (productId, size) => {
        setItems((prev) => prev.filter((item) => !sameLineItem(item, { productId, size })));
      },
      clearCart: () => setItems([]),
    };
  }, [items]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within a CartProvider');
  return ctx;
}
