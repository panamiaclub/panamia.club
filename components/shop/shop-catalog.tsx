'use client';

import { ProductCard } from '@/components/shop/product-card';
import { useIsNativeApp } from '@/lib/mobile/use-native-app';
import type { ShopPrice } from '@/lib/shop/types';

export function ShopCatalog({
  prices,
  kind,
}: {
  prices: ShopPrice[];
  kind?: string;
}) {
  const isNativeApp = useIsNativeApp();
  const requestedKind =
    kind === 'merchandise' || (!isNativeApp && kind === 'subscription')
      ? kind
      : undefined;
  const available = isNativeApp
    ? prices.filter((price) => price.kind === 'merchandise')
    : prices;
  const visible = requestedKind
    ? available.filter((price) => price.kind === requestedKind)
    : available;

  return (
    <main>
      <section className="bg-pana-indigo text-pana-cream relative overflow-hidden">
        <div
          aria-hidden="true"
          className="bg-pana-pink absolute -top-[185px] right-[6%] h-[340px] w-[340px] rounded-full"
        />
        <div
          aria-hidden="true"
          className="bg-pana-blue absolute right-[27%] -bottom-[165px] h-[220px] w-[220px] rounded-full"
        />
        <div className="relative z-10 container mx-auto grid gap-12 px-4 py-16 md:grid-cols-[1.2fr_0.8fr] md:items-center md:py-24">
          <div>
            <p className="text-pana-butter font-black tracking-[0.2em] uppercase">
              Support the community
            </p>
            <h1 className="mt-4 max-w-3xl text-5xl leading-none font-black md:text-7xl">
              Made for panas.
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-white/80">
              {isNativeApp
                ? 'Shop Pana MIA goods. Payments are securely handled by Stripe.'
                : 'Shop Pana MIA goods or become a recurring member. Payments are securely handled by Stripe.'}
            </p>
          </div>
          <div className="bg-pana-flame text-pana-ink border-pana-ink relative self-center rounded-[28px] border-4 p-8 shadow-[12px_12px_0_#110d0d] md:rotate-[2deg]">
            <span className="bg-pana-butter border-pana-ink absolute -top-6 right-6 grid h-[72px] w-[72px] rotate-[10deg] place-items-center rounded-full border-[3px] text-center text-sm leading-tight font-black uppercase">
              100%
              <br />
              Pana
            </span>
            <p className="max-w-[13ch] text-3xl leading-none font-black">
              One cart, one purpose.
            </p>
            <p className="mt-4 max-w-md text-base leading-relaxed font-bold">
              {isNativeApp
                ? 'Every purchase supports Pana MIA community programs.'
                : 'Merchandise and memberships check out separately so shipping and recurring billing stay clear.'}
            </p>
          </div>
        </div>
      </section>
      <section className="container mx-auto max-w-[1800px] px-4 py-14">
        {visible.some((price) => price.isMock) && (
          <div className="border-pana-indigo/20 bg-pana-butter-2 mb-8 rounded-2xl border px-5 py-4 text-sm">
            <strong>Preview collection:</strong> These sample items establish
            the storefront design while the final Stripe catalog, photography,
            stock, and fulfillment details are prepared. Checkout is disabled
            for preview items.
          </div>
        )}
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-pana-burnt-deep text-sm font-black tracking-widest uppercase">
              {requestedKind === 'subscription'
                ? 'Memberships'
                : requestedKind === 'merchandise' || isNativeApp
                  ? 'Merchandise'
                  : 'Everything'}
            </p>
            <h2 className="mt-1 text-3xl font-black">The Pana collection</h2>
          </div>
          <p className="text-pana-ink/65 text-sm">
            {visible.length} {visible.length === 1 ? 'option' : 'options'}
          </p>
        </div>
        {visible.length > 0 ? (
          <div
            className="grid justify-center gap-5"
            style={{
              gridTemplateColumns:
                'repeat(auto-fit, minmax(min(100%, 250px), 300px))',
            }}
          >
            {visible.map((price) => (
              <ProductCard key={price.id} price={price} />
            ))}
          </div>
        ) : (
          <div className="border-pana-ink/15 rounded-3xl border border-dashed p-12 text-center">
            <h2 className="text-2xl font-black">
              Nothing is on this shelf yet.
            </h2>
            <p className="text-pana-ink/65 mt-2">
              Active Stripe products marked for the shop will appear here.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
