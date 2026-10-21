import { createId } from '@paralleldrive/cuid2';
import { and, eq, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/auth';
import { db } from '@/lib/db';
import {
  commerceInventory,
  commerceOrderItems,
  commerceOrders,
} from '@/lib/schema';
import { getStripe, listShopPrices } from '@/lib/shop/stripe';
import { getShopSettings } from '@/lib/shop/settings';
import type { ShopCartItem } from '@/lib/shop/types';

const CHECKOUT_TTL_SECONDS = 30 * 60;

function originFor(request: NextRequest): string {
  return (
    request.headers.get('origin') ||
    process.env.NEXT_PUBLIC_HOST_URL ||
    'http://localhost:3000'
  );
}

function parseCart(body: unknown): ShopCartItem[] | null {
  if (!body || typeof body !== 'object') return null;
  const items = (body as { items?: unknown }).items;
  if (!Array.isArray(items) || items.length === 0 || items.length > 25) {
    return null;
  }

  const parsed: ShopCartItem[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') return null;
    const priceId = String((item as { priceId?: unknown }).priceId ?? '');
    const quantity = Number((item as { quantity?: unknown }).quantity);
    if (
      !priceId.startsWith('price_') ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 20
    ) {
      return null;
    }
    parsed.push({ priceId, quantity });
  }
  return parsed;
}

async function releaseReservation(orderId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const order = await tx.query.commerceOrders.findFirst({
      where: eq(commerceOrders.id, orderId),
    });
    if (!order || order.status !== 'pending') return;
    const items = await tx.query.commerceOrderItems.findMany({
      where: eq(commerceOrderItems.orderId, orderId),
    });
    for (const item of items) {
      await tx
        .update(commerceInventory)
        .set({
          reservedQuantity: sql`GREATEST(0, ${commerceInventory.reservedQuantity} - ${item.quantity})`,
        })
        .where(eq(commerceInventory.stripePriceId, item.stripePriceId));
    }
    await tx
      .update(commerceOrders)
      .set({ status: 'cancelled' })
      .where(eq(commerceOrders.id, orderId));
  });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed JSON' }, { status: 400 });
  }

  const requested = parseCart(body);
  if (!requested) {
    return NextResponse.json({ error: 'Invalid cart' }, { status: 400 });
  }

  try {
    const catalog = await listShopPrices();
    const byId = new Map(catalog.map((price) => [price.id, price]));
    const selected = requested.map((item) => ({
      item,
      price: byId.get(item.priceId),
    }));
    if (selected.some(({ price }) => !price)) {
      return NextResponse.json(
        { error: 'A product is no longer available' },
        { status: 409 }
      );
    }

    const resolved = selected.map(({ item, price }) => ({
      item,
      price: price!,
    }));
    if (
      resolved.some(
        ({ price }) => price.kind === 'merchandise' && !price.inStock
      )
    ) {
      return NextResponse.json(
        { error: 'A product is out of stock' },
        { status: 409 }
      );
    }
    const kind = resolved[0].price.kind;
    if (resolved.some(({ price }) => price.kind !== kind)) {
      return NextResponse.json(
        {
          error: 'Merchandise and subscriptions must use separate checkouts',
        },
        { status: 400 }
      );
    }
    if (
      kind === 'subscription' &&
      (resolved.length !== 1 || resolved[0].item.quantity !== 1)
    ) {
      return NextResponse.json(
        { error: 'Choose one subscription plan at a time' },
        { status: 400 }
      );
    }

    const session = await auth();
    const shopSettings =
      kind === 'merchandise' ? await getShopSettings() : null;
    const shippingOptions =
      kind === 'merchandise'
        ? [
            ...(shopSettings?.standardShippingEnabled
              ? [
                  {
                    shipping_rate_data: {
                      type: 'fixed_amount' as const,
                      fixed_amount: {
                        amount: shopSettings.standardShippingCents,
                        currency: 'usd',
                      },
                      display_name: 'Standard shipping',
                      delivery_estimate: {
                        minimum: {
                          unit: 'business_day' as const,
                          value: shopSettings.standardShippingMinDays,
                        },
                        maximum: {
                          unit: 'business_day' as const,
                          value: shopSettings.standardShippingMaxDays,
                        },
                      },
                    },
                  },
                ]
              : []),
            ...(shopSettings?.localPickupEnabled
              ? [
                  {
                    shipping_rate_data: {
                      type: 'fixed_amount' as const,
                      fixed_amount: { amount: 0, currency: 'usd' },
                      display_name: 'Local pickup',
                    },
                  },
                ]
              : []),
          ]
        : [];
    if (kind === 'merchandise' && shippingOptions.length === 0) {
      return NextResponse.json(
        { error: 'No fulfillment options are currently available' },
        { status: 503 }
      );
    }
    const orderId = createId();
    const expiresAt = new Date(Date.now() + CHECKOUT_TTL_SECONDS * 1000);
    const subtotalCents = resolved.reduce(
      (sum, { item, price }) => sum + item.quantity * price.unitAmount,
      0
    );

    try {
      await db.transaction(async (tx) => {
        for (const { item, price } of resolved) {
          if (price.kind !== 'merchandise') continue;
          const stock = await tx.query.commerceInventory.findFirst({
            where: eq(commerceInventory.stripePriceId, price.id),
          });
          if (!stock?.trackInventory) continue;
          const [reserved] = await tx
            .update(commerceInventory)
            .set({
              reservedQuantity: sql`${commerceInventory.reservedQuantity} + ${item.quantity}`,
            })
            .where(
              and(
                eq(commerceInventory.stripePriceId, price.id),
                sql`${commerceInventory.availableQuantity} - ${commerceInventory.reservedQuantity} >= ${item.quantity}`
              )
            )
            .returning({ id: commerceInventory.stripePriceId });
          if (!reserved) throw new Error(`OUT_OF_STOCK:${price.id}`);
        }

        await tx.insert(commerceOrders).values({
          id: orderId,
          userId: session?.user?.id ?? null,
          kind,
          fulfillmentStatus:
            kind === 'merchandise' ? 'unfulfilled' : 'not_required',
          email: session?.user?.email ?? null,
          subtotalCents,
          totalCents: subtotalCents,
          reservationExpiresAt: expiresAt,
        });
        await tx.insert(commerceOrderItems).values(
          resolved.map(({ item, price }) => ({
            id: createId(),
            orderId,
            stripeProductId: price.productId,
            stripePriceId: price.id,
            productName: price.name,
            priceName: price.recurringInterval
              ? `${price.recurringIntervalCount ?? 1} ${price.recurringInterval}`
              : null,
            imageUrl: price.imageUrl,
            quantity: item.quantity,
            unitAmountCents: price.unitAmount,
            amountTotalCents: price.unitAmount * item.quantity,
            recurringInterval: price.recurringInterval,
          }))
        );
      });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('OUT_OF_STOCK:')) {
        return NextResponse.json(
          { error: 'A product no longer has enough stock' },
          { status: 409 }
        );
      }
      throw error;
    }

    const stripe = getStripe();
    try {
      const checkout = await stripe.checkout.sessions.create({
        mode: kind === 'subscription' ? 'subscription' : 'payment',
        line_items: resolved.map(({ item, price }) => ({
          price: price.id,
          quantity: item.quantity,
        })),
        customer_email: session?.user?.email ?? undefined,
        customer_creation: kind === 'merchandise' ? 'always' : undefined,
        allow_promotion_codes: true,
        billing_address_collection: 'auto',
        shipping_address_collection:
          kind === 'merchandise'
            ? { allowed_countries: ['US', 'PR'] }
            : undefined,
        shipping_options: kind === 'merchandise' ? shippingOptions : undefined,
        phone_number_collection:
          kind === 'merchandise' ? { enabled: true } : undefined,
        metadata: { orderId, kind },
        subscription_data:
          kind === 'subscription' ? { metadata: { orderId } } : undefined,
        expires_at: Math.floor(expiresAt.getTime() / 1000),
        success_url: `${originFor(request)}/shop/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${originFor(request)}/shop/cart`,
      });

      await db
        .update(commerceOrders)
        .set({ stripeCheckoutSessionId: checkout.id })
        .where(eq(commerceOrders.id, orderId));
      return NextResponse.json({ url: checkout.url });
    } catch (error) {
      await releaseReservation(orderId);
      throw error;
    }
  } catch (error) {
    console.error('[shop:checkout]', error);
    return NextResponse.json(
      { error: 'Checkout could not be created' },
      { status: 500 }
    );
  }
}
