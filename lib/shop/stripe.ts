import Stripe from 'stripe';
import { inArray } from 'drizzle-orm';

import { db } from '@/lib/db';
import { commerceInventory } from '@/lib/schema';
import { MOCK_SHOP_PRICES } from '@/lib/shop/mock-products';
import type { ShopPrice } from '@/lib/shop/types';

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new Error('STRIPE_SECRET_KEY is not configured');
  if (!stripeClient) {
    stripeClient = new Stripe(secret, {
      httpClient: Stripe.createFetchHttpClient(),
    });
  }
  return stripeClient;
}

function slugFor(product: Stripe.Product): string {
  return product.metadata.slug?.trim() || product.id;
}

function isVisible(product: Stripe.Product): boolean {
  return (
    product.active &&
    product.metadata.shop_visible !== 'false' &&
    product.metadata.archived !== 'true'
  );
}

export async function listShopPrices(): Promise<ShopPrice[]> {
  if (process.env.SHOP_USE_MOCK_PRODUCTS === '1') {
    return MOCK_SHOP_PRICES;
  }

  const stripe = getStripe();
  const prices = await stripe.prices.list({
    active: true,
    limit: 100,
    expand: ['data.product'],
  });

  const sellable = prices.data.filter(
    (price): price is Stripe.Price & { product: Stripe.Product } =>
      typeof price.product !== 'string' &&
      !price.product.deleted &&
      isVisible(price.product) &&
      price.unit_amount !== null &&
      price.currency.toLowerCase() === 'usd' &&
      (price.type === 'one_time' ||
        price.recurring?.interval === 'month' ||
        price.recurring?.interval === 'year')
  );

  const merchandiseIds = sellable
    .filter((price) => price.type === 'one_time')
    .map((price) => price.id);
  const inventoryRows =
    merchandiseIds.length > 0
      ? await db.query.commerceInventory.findMany({
          where: inArray(commerceInventory.stripePriceId, merchandiseIds),
        })
      : [];
  const inventory = new Map(
    inventoryRows.map((row) => [row.stripePriceId, row])
  );

  return sellable
    .map((price) => {
      const product = price.product;
      const stock = inventory.get(price.id);
      const recurringInterval: 'month' | 'year' | null =
        price.recurring?.interval === 'month'
          ? 'month'
          : price.recurring?.interval === 'year'
            ? 'year'
            : null;
      const tracksInventory =
        stock?.trackInventory ?? product.metadata.track_inventory === 'true';
      const availableQuantity = tracksInventory
        ? stock
          ? Math.max(0, stock.availableQuantity - stock.reservedQuantity)
          : 0
        : null;

      return {
        id: price.id,
        productId: product.id,
        slug: slugFor(product),
        name: product.name,
        description: product.description,
        imageUrl: product.images[0] ?? null,
        kind: price.type === 'recurring' ? 'subscription' : 'merchandise',
        unitAmount: price.unit_amount ?? 0,
        currency: price.currency,
        recurringInterval,
        recurringIntervalCount: price.recurring?.interval_count ?? null,
        availableQuantity,
        inStock: availableQuantity === null || availableQuantity > 0,
      } satisfies ShopPrice;
    })
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'merchandise' ? -1 : 1;
      return a.name.localeCompare(b.name) || a.unitAmount - b.unitAmount;
    });
}

export async function getShopPriceBySlug(
  slug: string
): Promise<ShopPrice | null> {
  const prices = await listShopPrices();
  return prices.find((price) => price.slug === slug) ?? null;
}

export function shippingRateIds(): string[] {
  return (
    process.env.STRIPE_SHIPPING_RATE_IDS?.split(',')
      .map((id) => id.trim())
      .filter(Boolean) ?? []
  );
}
