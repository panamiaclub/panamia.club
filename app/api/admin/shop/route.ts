import { desc, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';

import { db } from '@/lib/db';
import {
  commerceFulfillmentStatus,
  commerceInventory,
  commerceOrders,
  commerceShopSettings,
  commerceSubscriptions,
} from '@/lib/schema';
import { checkAdminAuth } from '@/lib/server/admin-auth';
import { getShopSettings } from '@/lib/shop/settings';
import { getStripe } from '@/lib/shop/stripe';

const FULFILLMENT = new Set(commerceFulfillmentStatus.enumValues);

function serializePrice(price: Stripe.Price | string | null | undefined) {
  if (!price || typeof price === 'string') return null;
  return {
    id: price.id,
    unitAmount: price.unit_amount ?? 0,
    currency: price.currency,
    type: price.type,
    recurringInterval:
      price.recurring?.interval === 'month' ||
      price.recurring?.interval === 'year'
        ? price.recurring.interval
        : null,
  };
}

export async function GET() {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
  }

  try {
    const stripe = getStripe();
    const [stripeProducts, orders, inventory, subscriptions, settings] =
      await Promise.all([
        stripe.products.list({
          active: true,
          limit: 100,
          expand: ['data.default_price'],
        }),
        db.query.commerceOrders.findMany({
          orderBy: desc(commerceOrders.createdAt),
          limit: 100,
          with: { items: true },
        }),
        db.query.commerceInventory.findMany(),
        db.query.commerceSubscriptions.findMany({
          orderBy: desc(commerceSubscriptions.updatedAt),
          limit: 100,
        }),
        getShopSettings(),
      ]);

    const inventoryByPrice = new Map(
      inventory.map((row) => [row.stripePriceId, row])
    );
    const products = stripeProducts.data
      .map((product) => {
        const price = serializePrice(product.default_price);
        if (!price) return null;
        const stock = inventoryByPrice.get(price.id);
        return {
          id: product.id,
          name: product.name,
          description: product.description,
          images: product.images,
          active: product.active,
          visible: product.metadata.shop_visible !== 'false',
          slug: product.metadata.slug || product.id,
          shippable: product.shippable ?? price.type === 'one_time',
          kind: price.type === 'recurring' ? 'subscription' : 'merchandise',
          price,
          availableQuantity: stock?.availableQuantity ?? null,
          reservedQuantity: stock?.reservedQuantity ?? 0,
          trackInventory: stock?.trackInventory ?? false,
        };
      })
      .filter(Boolean);

    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const monthOrders = orders.filter(
      (order) =>
        new Date(order.createdAt) >= monthStart &&
        ['paid', 'refunded', 'partially_refunded'].includes(order.status)
    );
    const revenueCents = monthOrders.reduce(
      (sum, order) => sum + order.totalCents - order.refundedCents,
      0
    );

    return NextResponse.json({
      products,
      orders,
      subscriptions,
      settings,
      stats: {
        revenueCents,
        completedOrders: monthOrders.length,
        availableItems: inventory.reduce(
          (sum, row) =>
            sum + Math.max(0, row.availableQuantity - row.reservedQuantity),
          0
        ),
        activeProducts: products.filter((product) => product?.visible).length,
        needsFulfillment: orders.filter(
          (order) =>
            order.kind === 'merchandise' &&
            order.status === 'paid' &&
            order.fulfillmentStatus !== 'fulfilled' &&
            order.fulfillmentStatus !== 'cancelled'
        ).length,
        activeSubscriptions: subscriptions.filter((subscription) =>
          ['active', 'trialing'].includes(subscription.status)
        ).length,
      },
    });
  } catch (cause) {
    console.error('[admin:shop:get]', cause);
    return NextResponse.json(
      {
        error: cause instanceof Error ? cause.message : 'Shop data load failed',
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
  }
  const body = (await request.json()) as {
    action?: 'order' | 'inventory' | 'settings';
    orderId?: string;
    fulfillmentStatus?: string;
    trackingNumber?: string;
    trackingUrl?: string;
    priceId?: string;
    availableQuantity?: number;
    trackInventory?: boolean;
    settings?: Partial<typeof commerceShopSettings.$inferInsert>;
  };

  if (body.action === 'order' && body.orderId) {
    if (
      !body.fulfillmentStatus ||
      !FULFILLMENT.has(body.fulfillmentStatus as never)
    ) {
      return NextResponse.json(
        { error: 'Invalid fulfillment status' },
        { status: 400 }
      );
    }
    await db
      .update(commerceOrders)
      .set({
        fulfillmentStatus:
          body.fulfillmentStatus as (typeof commerceFulfillmentStatus.enumValues)[number],
        trackingNumber: body.trackingNumber?.trim() || null,
        trackingUrl: body.trackingUrl?.trim() || null,
        fulfilledAt: body.fulfillmentStatus === 'fulfilled' ? new Date() : null,
      })
      .where(eq(commerceOrders.id, body.orderId));
    return NextResponse.json({ success: true });
  }

  if (
    body.action === 'inventory' &&
    body.priceId &&
    Number.isInteger(body.availableQuantity) &&
    body.availableQuantity! >= 0
  ) {
    const current = await db.query.commerceInventory.findFirst({
      where: eq(commerceInventory.stripePriceId, body.priceId),
    });
    if (!current) {
      return NextResponse.json(
        { error: 'Inventory row not found; sync Stripe first' },
        { status: 404 }
      );
    }
    if (body.availableQuantity! < current.reservedQuantity) {
      return NextResponse.json(
        { error: 'Available quantity cannot be below reserved quantity' },
        { status: 409 }
      );
    }
    await db
      .update(commerceInventory)
      .set({
        availableQuantity: body.availableQuantity,
        trackInventory: body.trackInventory ?? true,
      })
      .where(eq(commerceInventory.stripePriceId, body.priceId));
    return NextResponse.json({ success: true });
  }

  if (body.action === 'settings' && body.settings) {
    const settings = body.settings;
    const shippingCents = Number(settings.standardShippingCents ?? 500);
    const minDays = Number(settings.standardShippingMinDays ?? 3);
    const maxDays = Number(settings.standardShippingMaxDays ?? 7);
    if (
      !Number.isInteger(shippingCents) ||
      shippingCents < 0 ||
      !Number.isInteger(minDays) ||
      minDays < 0 ||
      !Number.isInteger(maxDays) ||
      maxDays < minDays
    ) {
      return NextResponse.json(
        { error: 'Shipping settings are invalid' },
        { status: 400 }
      );
    }
    await db
      .insert(commerceShopSettings)
      .values({
        id: 'default',
        standardShippingEnabled: settings.standardShippingEnabled ?? true,
        standardShippingCents: shippingCents,
        standardShippingMinDays: minDays,
        standardShippingMaxDays: maxDays,
        localPickupEnabled: settings.localPickupEnabled ?? true,
        pickupInstructions: settings.pickupInstructions ?? null,
        ghlSyncEnabled: settings.ghlSyncEnabled ?? true,
        customerEmailEnabled: settings.customerEmailEnabled ?? true,
        staffEmailEnabled: settings.staffEmailEnabled ?? true,
      })
      .onConflictDoUpdate({
        target: commerceShopSettings.id,
        set: {
          standardShippingEnabled: settings.standardShippingEnabled ?? true,
          standardShippingCents: shippingCents,
          standardShippingMinDays: minDays,
          standardShippingMaxDays: maxDays,
          localPickupEnabled: settings.localPickupEnabled ?? true,
          pickupInstructions: settings.pickupInstructions ?? null,
          ghlSyncEnabled: settings.ghlSyncEnabled ?? true,
          customerEmailEnabled: settings.customerEmailEnabled ?? true,
          staffEmailEnabled: settings.staffEmailEnabled ?? true,
          updatedAt: new Date(),
        },
      });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Invalid update' }, { status: 400 });
}

export async function POST() {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
  }
  try {
    const prices = await getStripe().prices.list({
      active: true,
      limit: 100,
      type: 'one_time',
      expand: ['data.product'],
    });
    let synced = 0;
    for (const price of prices.data) {
      if (
        typeof price.product === 'string' ||
        price.product.deleted ||
        !price.product.active ||
        price.product.metadata.shop_visible === 'false'
      ) {
        continue;
      }
      const trackInventory = price.product.metadata.track_inventory === 'true';
      const metadataQuantity = Number.parseInt(
        price.product.metadata.inventory_quantity ?? '0',
        10
      );
      await db
        .insert(commerceInventory)
        .values({
          stripePriceId: price.id,
          stripeProductId: price.product.id,
          availableQuantity:
            trackInventory && Number.isFinite(metadataQuantity)
              ? Math.max(0, metadataQuantity)
              : 0,
          trackInventory,
        })
        .onConflictDoUpdate({
          target: commerceInventory.stripePriceId,
          set: {
            stripeProductId: price.product.id,
            trackInventory,
            updatedAt: new Date(),
          },
        });
      synced += 1;
    }
    return NextResponse.json({ success: true, synced });
  } catch (cause) {
    console.error('[admin:shop:sync]', cause);
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : 'Sync failed' },
      { status: 500 }
    );
  }
}
