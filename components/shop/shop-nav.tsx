'use client';

import Link from 'next/link';
import { ShoppingBag } from 'lucide-react';

import { useShopCart } from './cart-provider';

export function ShopNav() {
  const { itemCount } = useShopCart();
  return (
    <nav
      aria-label="Shop"
      className="border-pana-ink/10 bg-pana-cream sticky top-0 z-20 border-b"
    >
      <div className="container mx-auto flex items-center gap-5 px-4 py-3 text-sm font-bold">
        <Link href="/shop" className="text-lg">
          Pana Shop
        </Link>
        <Link href="/shop?kind=merchandise" className="hover:underline">
          Merchandise
        </Link>
        <Link href="/shop?kind=subscription" className="hover:underline">
          Memberships
        </Link>
        <Link
          href="/shop/cart"
          className="bg-pana-ink text-pana-cream ml-auto inline-flex items-center gap-2 rounded-full px-4 py-2"
        >
          <ShoppingBag aria-hidden className="h-4 w-4" />
          Cart
          {itemCount > 0 && (
            <span className="bg-pana-butter text-pana-ink rounded-full px-2 py-0.5 text-xs">
              {itemCount}
            </span>
          )}
        </Link>
      </div>
    </nav>
  );
}
