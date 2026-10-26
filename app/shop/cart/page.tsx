'use client';

import Link from 'next/link';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { useShopCart } from '@/components/shop/cart-provider';
import { useIsNativeApp } from '@/lib/mobile/use-native-app';

function money(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

export default function ShopCartPage() {
  const cart = useShopCart();
  const isNativeApp = useIsNativeApp();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function checkout() {
    setError('');
    setLoading(true);
    try {
      const response = await fetch('/api/shop/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.lines.map((line) => ({
            priceId: line.id,
            quantity: line.quantity,
          })),
        }),
      });
      const result = (await response.json()) as {
        url?: string;
        error?: string;
      };
      if (!response.ok || !result.url) {
        throw new Error(result.error || 'Checkout could not be started');
      }
      window.location.assign(result.url);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Checkout could not be started'
      );
      setLoading(false);
    }
  }

  if (cart.lines.length === 0) {
    return (
      <main className="container mx-auto px-4 py-20 text-center">
        <h1 className="text-4xl font-black">Your cart is empty.</h1>
        <p className="text-pana-ink/65 mt-3">
          {isNativeApp
            ? 'Merchandise is waiting back in the shop.'
            : 'Merchandise and memberships are waiting back in the shop.'}
        </p>
        <Button asChild className="bg-pana-ink text-pana-cream mt-7">
          <Link href="/shop">Browse the shop</Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="container mx-auto px-4 py-12">
      <div className="mx-auto max-w-4xl">
        <p className="text-pana-burnt-deep text-sm font-black tracking-widest uppercase">
          {cart.kind === 'subscription' ? 'Membership checkout' : 'Your bag'}
        </p>
        <h1 className="mt-2 text-4xl font-black">Review your cart</h1>
        <div className="mt-8 space-y-4">
          {cart.lines.map((line) => (
            <article
              key={line.id}
              className="border-pana-ink/10 flex gap-4 rounded-2xl border bg-white p-4"
            >
              {line.imageUrl ? (
                <img
                  src={line.imageUrl}
                  alt=""
                  className="h-24 w-24 rounded-xl object-cover"
                />
              ) : (
                <div className="bg-pana-butter-2 h-24 w-24 rounded-xl" />
              )}
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-black">{line.name}</h2>
                <p className="font-bold">{money(line.unitAmount)}</p>
                {line.kind === 'merchandise' ? (
                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      size="icon"
                      variant="outline"
                      aria-label={`Decrease ${line.name} quantity`}
                      onClick={() => cart.update(line.id, line.quantity - 1)}
                    >
                      <Minus />
                    </Button>
                    <span className="w-8 text-center font-bold">
                      {line.quantity}
                    </span>
                    <Button
                      size="icon"
                      variant="outline"
                      aria-label={`Increase ${line.name} quantity`}
                      disabled={
                        line.availableQuantity !== null &&
                        line.quantity >= line.availableQuantity
                      }
                      onClick={() => cart.update(line.id, line.quantity + 1)}
                    >
                      <Plus />
                    </Button>
                  </div>
                ) : (
                  <p className="text-pana-ink/65 mt-2 text-sm">
                    Recurs every {line.recurringInterval}.
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end justify-between">
                <p className="font-black">
                  {money(line.unitAmount * line.quantity)}
                </p>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Remove ${line.name}`}
                  onClick={() => cart.remove(line.id)}
                >
                  <Trash2 />
                </Button>
              </div>
            </article>
          ))}
        </div>
        <div className="border-pana-ink/10 mt-8 grid gap-6 border-t pt-7 md:grid-cols-[1fr_auto]">
          <div className="text-pana-ink/65 text-sm">
            {cart.kind === 'merchandise'
              ? 'Shipping is selected and calculated in Stripe Checkout.'
              : 'You can update payment details or cancel later through the Stripe Customer Portal.'}
          </div>
          <div className="min-w-72 space-y-4">
            <div className="flex justify-between text-xl font-black">
              <span>Subtotal</span>
              <span>{money(cart.subtotal)}</span>
            </div>
            <Button
              type="button"
              onClick={checkout}
              disabled={loading}
              className="bg-pana-ink text-pana-cream h-12 w-full text-base"
            >
              {loading ? 'Opening secure checkout…' : 'Checkout with Stripe'}
            </Button>
            {error && (
              <p role="alert" className="text-pana-red-deep text-sm">
                {error}
              </p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
