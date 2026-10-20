import type { Metadata } from 'next';

import { ProductCard } from '@/components/shop/product-card';
import { listShopPrices } from '@/lib/shop/stripe';

export const metadata: Metadata = {
  title: 'Shop | Pana MIA',
  description: 'Pana MIA merchandise and recurring memberships.',
};

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const { kind } = await searchParams;
  const prices = await listShopPrices();
  const visible =
    kind === 'merchandise' || kind === 'subscription'
      ? prices.filter((price) => price.kind === kind)
      : prices;

  return (
    <main>
      <section className="bg-pana-indigo text-pana-cream">
        <div className="container mx-auto grid gap-8 px-4 py-16 md:grid-cols-[1.2fr_0.8fr] md:py-24">
          <div>
            <p className="text-pana-butter font-black tracking-[0.2em] uppercase">
              Support the community
            </p>
            <h1 className="mt-4 max-w-3xl text-5xl leading-none font-black md:text-7xl">
              Made for panas.
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-white/80">
              Shop Pana MIA goods or become a recurring member. Payments are
              securely handled by Stripe.
            </p>
          </div>
          <div className="bg-pana-flame text-pana-ink self-end rounded-3xl p-7">
            <span className="bg-pana-butter inline-flex rounded-full px-3 py-1 text-xs font-black tracking-widest uppercase">
              100% Pana
            </span>
            <p className="text-2xl font-black">One cart, one purpose.</p>
            <p className="mt-2">
              Merchandise and memberships check out separately so shipping and
              recurring billing stay clear.
            </p>
          </div>
        </div>
      </section>
      <section className="container mx-auto px-4 py-14">
        {prices.some((price) => price.isMock) && (
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
              {kind === 'subscription'
                ? 'Memberships'
                : kind === 'merchandise'
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
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
