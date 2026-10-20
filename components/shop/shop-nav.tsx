'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

import { useShopCart } from './cart-provider';

export function ShopNav() {
  const { itemCount } = useShopCart();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const kind = searchParams.get('kind');
  const onCatalog = pathname === '/shop';

  const filterClass = (active: boolean) =>
    [
      'rounded-full px-4 py-2 transition-colors',
      active
        ? 'bg-pana-ink text-pana-cream'
        : 'text-pana-ink hover:bg-pana-ink/5',
    ].join(' ');

  return (
    <nav
      aria-label="Shop"
      className="border-pana-ink/10 bg-pana-cream sticky top-[59px] z-30 border-b"
    >
      <div className="container mx-auto flex min-h-16 items-center gap-2 px-4 text-sm font-bold sm:gap-3">
        <Link href="/shop" className="mr-2 text-lg font-black sm:mr-4">
          Pana Shop
        </Link>
        <Link
          href="/shop"
          className={filterClass(
            onCatalog && kind !== 'merchandise' && kind !== 'subscription'
          )}
          aria-current={
            onCatalog && kind !== 'merchandise' && kind !== 'subscription'
              ? 'page'
              : undefined
          }
        >
          Everything
        </Link>
        <Link
          href="/shop?kind=merchandise"
          className={filterClass(onCatalog && kind === 'merchandise')}
          aria-current={
            onCatalog && kind === 'merchandise' ? 'page' : undefined
          }
        >
          Merchandise
        </Link>
        <Link
          href="/shop?kind=subscription"
          className={`${filterClass(onCatalog && kind === 'subscription')} hidden sm:inline-flex`}
          aria-current={
            onCatalog && kind === 'subscription' ? 'page' : undefined
          }
        >
          Memberships
        </Link>
        <Link
          href="/shop/cart"
          className="bg-pana-ink text-pana-cream ml-auto inline-flex items-center gap-2 rounded-full px-5 py-2.5"
        >
          Bag
          <span className="bg-pana-butter text-pana-ink grid min-h-6 min-w-6 place-items-center rounded-full px-1.5 text-xs">
            {itemCount}
          </span>
        </Link>
      </div>
    </nav>
  );
}
