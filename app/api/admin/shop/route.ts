import { count, desc, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/lib/db';
import {
  commerceInventory,
  commerceOrders,
  commerceFulfillmentStatus,
} from '@/lib/schema';
import { checkAdminAuth } from '@/lib/server/admin-auth';
import { getStripe } from '@/lib/shop/stripe';

const FULFILLMENT = new Set(commerceFulfillmentStatus.enumValues);

export async function GET(request: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
  }
  const page = Math.max(
    1,
    Number.parseInt(request.nextUrl.searchParams.get('page') ?? '1', 10) || 1
  );
  const perPage = 25;
  const [{ total }] = await db.select({ total: count() }).from(commerceOrders);
  const orders = await db.query.commerceOrders.findMany({
    orderBy: desc(commerceOrders.createdAt),
    limit: perPage,
    offset: (page - 1) * perPage,
    with: {
      items: true,
    },
  });
  const inventory = await db.query.commerceInventory.findMany({
    orderBy: (table, { asc }) => [asc(table.stripeProductId)],
  });
  return NextResponse.json({
    orders,
    inventory,
    pagination: {
      page,
      perPage,
      total: Number(total),
      totalPages: Math.max(1, Math.ceil(Number(total) / perPage)),
    },
  });
}

export async function PATCH(request: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
  }
  const body = (await request.json()) as {
    orderId?: string;
    fulfillmentStatus?: string;
    trackingNumber?: string;
    trackingUrl?: string;
    priceId?: string;
    availableQuantity?: number;
    trackInventory?: boolean;
  };

  if (body.orderId) {
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

  return NextResponse.json({ error: 'Invalid update' }, { status: 400 });
}

export async function POST() {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
  }
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
}
