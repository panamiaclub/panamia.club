'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type { ShopItemKind, ShopPrice } from '@/lib/shop/types';

const STORAGE_KEY = 'panamia-shop-cart-v1';

export interface CartLine extends ShopPrice {
  quantity: number;
}

interface CartContextValue {
  lines: CartLine[];
  kind: ShopItemKind | null;
  itemCount: number;
  subtotal: number;
  add: (price: ShopPrice, quantity?: number) => boolean;
  update: (priceId: string, quantity: number) => void;
  remove: (priceId: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

function readStoredCart(): CartLine[] {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (!value) return [];
    const parsed = JSON.parse(value) as CartLine[];
    return Array.isArray(parsed)
      ? parsed.filter(
          (line) =>
            line &&
            typeof line.id === 'string' &&
            Number.isInteger(line.quantity) &&
            line.quantity > 0
        )
      : [];
  } catch {
    return [];
  }
}

export function ShopCartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setLines(readStoredCart());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  }, [hydrated, lines]);

  const kind = lines[0]?.kind ?? null;
  const add = useCallback(
    (price: ShopPrice, quantity = 1) => {
      if (kind && kind !== price.kind) return false;
      setLines((current) => {
        const existing = current.find((line) => line.id === price.id);
        if (existing) {
          return current.map((line) =>
            line.id === price.id
              ? {
                  ...line,
                  quantity:
                    price.kind === 'subscription'
                      ? 1
                      : Math.min(20, line.quantity + quantity),
                }
              : line
          );
        }
        return [
          ...current,
          {
            ...price,
            quantity:
              price.kind === 'subscription' ? 1 : Math.min(20, quantity),
          },
        ];
      });
      return true;
    },
    [kind]
  );
  const update = useCallback((priceId: string, quantity: number) => {
    if (quantity < 1) {
      setLines((current) => current.filter((line) => line.id !== priceId));
      return;
    }
    setLines((current) =>
      current.map((line) =>
        line.id === priceId
          ? {
              ...line,
              quantity:
                line.kind === 'subscription'
                  ? 1
                  : Math.min(
                      line.availableQuantity ?? 20,
                      Math.min(20, quantity)
                    ),
            }
          : line
      )
    );
  }, []);
  const remove = useCallback((priceId: string) => {
    setLines((current) => current.filter((line) => line.id !== priceId));
  }, []);
  const clear = useCallback(() => setLines([]), []);

  const value = useMemo(
    () => ({
      lines,
      kind,
      itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
      subtotal: lines.reduce(
        (sum, line) => sum + line.unitAmount * line.quantity,
        0
      ),
      add,
      update,
      remove,
      clear,
    }),
    [add, clear, kind, lines, remove, update]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useShopCart(): CartContextValue {
  const value = useContext(CartContext);
  if (!value)
    throw new Error('useShopCart must be used inside ShopCartProvider');
  return value;
}
