'use client';

import Link from 'next/link';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { useIsNativeApp } from '@/lib/mobile/use-native-app';
import type { ShopPrice } from '@/lib/shop/types';
import { useShopCart } from './cart-provider';

const MOCK_ART: Record<
  NonNullable<ShopPrice['mockArt']>,
  { className: string; content: string }
> = {
  shirt: { className: 'bg-pana-butter', content: '👕' },
  bracelet: { className: 'bg-pana-blue', content: '◉' },
  tote: { className: 'bg-pana-flame', content: 'THE\nFUTURE\nIS LOCAL' },
  membership: {
    className: 'bg-pana-indigo text-pana-butter',
    content: 'GENTE\nDE PANA',
  },
  zine: { className: 'bg-pana-butter-2', content: 'GENTE\nDE PANA\nNo. 3' },
  cap: { className: 'bg-[#efd4b1]', content: '🧢' },
};

export function formatShopPrice(price: ShopPrice): string {
  const amount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: price.currency.toUpperCase(),
  }).format(price.unitAmount / 100);
  if (!price.recurringInterval) return amount;
  const count = price.recurringIntervalCount ?? 1;
  return `${amount} / ${count === 1 ? price.recurringInterval : `${count} ${price.recurringInterval}s`}`;
}

export function ProductCard({ price }: { price: ShopPrice }) {
  const cart = useShopCart();
  const isNativeApp = useIsNativeApp();
  const [message, setMessage] = useState('');

  if (isNativeApp && price.kind === 'subscription') return null;

  function add() {
    if (price.isMock) {
      setMessage(
        'Preview item — purchasing will open when the Stripe catalog is ready.'
      );
      return;
    }
    if (!cart.add(price)) {
      setMessage(
        'Merchandise and memberships use separate checkouts. Finish or clear the current cart first.'
      );
      return;
    }
    setMessage('Added to cart.');
  }

  return (
    <article className="border-pana-ink/10 overflow-hidden rounded-3xl border bg-white shadow-sm">
      <Link href={`/shop/${price.slug}`} className="block">
        {price.imageUrl ? (
          <img
            src={price.imageUrl}
            alt={price.name}
            className="aspect-[1.15] w-full object-cover"
          />
        ) : price.mockArt ? (
          <div
            className={`${MOCK_ART[price.mockArt].className} flex aspect-[1.15] items-center justify-center overflow-hidden p-8`}
          >
            <span className="font-montserrat text-center text-4xl leading-[0.95] font-black whitespace-pre-line drop-shadow-sm">
              {MOCK_ART[price.mockArt].content}
            </span>
          </div>
        ) : (
          <div className="bg-pana-butter-2 flex aspect-[1.15] items-center justify-center text-5xl">
            ✦
          </div>
        )}
      </Link>
      <div className="space-y-3 p-5">
        <div>
          <p className="text-pana-burnt-deep text-xs font-black tracking-widest uppercase">
            {price.isMock
              ? 'Preview'
              : price.kind === 'subscription'
                ? 'Membership'
                : 'Merchandise'}
          </p>
          <h2 className="mt-1 text-xl font-black">
            <Link href={`/shop/${price.slug}`} className="hover:underline">
              {price.name}
            </Link>
          </h2>
          <p className="mt-1 font-bold">{formatShopPrice(price)}</p>
        </div>
        {price.description && (
          <p className="text-pana-ink/70 line-clamp-3 text-sm">
            {price.description}
          </p>
        )}
        {price.availableQuantity !== null && (
          <p className="text-sm">
            {price.inStock
              ? `${price.availableQuantity} available`
              : 'Out of stock'}
          </p>
        )}
        <Button
          type="button"
          onClick={add}
          disabled={!price.inStock}
          className="bg-pana-ink text-pana-cream w-full"
        >
          {price.isMock
            ? 'Coming soon'
            : price.kind === 'subscription'
              ? 'Choose membership'
              : 'Add to cart'}
        </Button>
        {message && (
          <p role="status" className="text-pana-burnt-deep text-sm">
            {message}
          </p>
        )}
      </div>
    </article>
  );
}
