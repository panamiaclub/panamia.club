import type { Metadata } from 'next';

import { ShopCatalog } from '@/components/shop/shop-catalog';
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
  return <ShopCatalog prices={prices} kind={kind} />;
}
