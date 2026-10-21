import { createId } from '@paralleldrive/cuid2';
import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';

import { db } from '@/lib/db';
import { commerceInventory } from '@/lib/schema';
import { checkAdminAuth } from '@/lib/server/admin-auth';
import { getStripe } from '@/lib/shop/stripe';

type ProductKind = 'merchandise' | 'subscription';

interface ProductInput {
  productId?: string;
  currentPriceId?: string;
  name?: string;
  description?: string;
  slug?: string;
  kind?: ProductKind;
  priceCents?: number;
  recurringInterval?: 'month' | 'year';
  visible?: boolean;
  trackInventory?: boolean;
  availableQuantity?: number;
  images?: string[];
}

function validateInput(body: ProductInput, creating: boolean): string | null {
  if (creating && !body.name?.trim()) return 'Product name is required';
  if (body.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.slug)) {
    return 'Slug must contain lowercase letters, numbers, and hyphens';
  }
  if (
    body.priceCents !== undefined &&
    (!Number.isInteger(body.priceCents) || body.priceCents < 0)
  ) {
    return 'Price must be a non-negative number of cents';
  }
  if (
    body.availableQuantity !== undefined &&
    (!Number.isInteger(body.availableQuantity) || body.availableQuantity < 0)
  ) {
    return 'Available quantity must be a non-negative integer';
  }
  if (body.kind === 'subscription' && !body.recurringInterval) {
    return 'Subscription interval is required';
  }
  return null;
}

function priceMatches(
  price: Stripe.Price | null,
  input: ProductInput
): boolean {
  if (!price || input.priceCents === undefined) return true;
  if (price.unit_amount !== input.priceCents) return false;
  if (input.kind === 'subscription') {
    return price.recurring?.interval === input.recurringInterval;
  }
  return price.type === 'one_time';
}

async function createPrice(
  productId: string,
  input: ProductInput
): Promise<Stripe.Price> {
  return getStripe().prices.create({
    product: productId,
    currency: 'usd',
    unit_amount: input.priceCents ?? 0,
    tax_behavior: 'exclusive',
    ...(input.kind === 'subscription'
      ? {
          recurring: {
            interval: input.recurringInterval ?? 'month',
          },
        }
      : {}),
  });
}

export async function POST(request: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
  }
  const body = (await request.json()) as ProductInput;
  const error = validateInput(body, true);
  if (error) return NextResponse.json({ error }, { status: 400 });

  try {
    const stripe = getStripe();
    const kind = body.kind ?? 'merchandise';
    const product = await stripe.products.create({
      name: body.name!.trim(),
      description: body.description?.trim() || undefined,
      images: body.images?.filter(Boolean).slice(0, 8),
      shippable: kind === 'merchandise',
      metadata: {
        slug: body.slug?.trim() || createId(),
        shop_visible: body.visible === false ? 'false' : 'true',
        track_inventory:
          kind === 'merchandise' && body.trackInventory !== false
            ? 'true'
            : 'false',
        inventory_quantity: String(
          kind === 'merchandise' ? (body.availableQuantity ?? 0) : 0
        ),
      },
    });
    const price = await createPrice(product.id, { ...body, kind });
    await stripe.products.update(product.id, { default_price: price.id });

    if (kind === 'merchandise') {
      await db.insert(commerceInventory).values({
        stripePriceId: price.id,
        stripeProductId: product.id,
        availableQuantity: body.availableQuantity ?? 0,
        reservedQuantity: 0,
        trackInventory: body.trackInventory !== false,
      });
    }

    return NextResponse.json(
      { success: true, productId: product.id, priceId: price.id },
      { status: 201 }
    );
  } catch (cause) {
    console.error('[admin:shop:product:create]', cause);
    return NextResponse.json(
      {
        error:
          cause instanceof Error ? cause.message : 'Product creation failed',
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
  }
  const body = (await request.json()) as ProductInput;
  if (!body.productId) {
    return NextResponse.json(
      { error: 'Product ID is required' },
      { status: 400 }
    );
  }
  const error = validateInput(body, false);
  if (error) return NextResponse.json({ error }, { status: 400 });

  try {
    const stripe = getStripe();
    const existing = await stripe.products.retrieve(body.productId, {
      expand: ['default_price'],
    });
    if (existing.deleted) {
      return NextResponse.json(
        { error: 'Product is deleted' },
        { status: 404 }
      );
    }
    const currentPrice =
      existing.default_price && typeof existing.default_price !== 'string'
        ? existing.default_price
        : null;
    const kind: ProductKind =
      body.kind ??
      (currentPrice?.type === 'recurring' ? 'subscription' : 'merchandise');

    await stripe.products.update(existing.id, {
      ...(body.name !== undefined && { name: body.name.trim() }),
      ...(body.description !== undefined && {
        description: body.description.trim() || '',
      }),
      ...(body.images !== undefined && {
        images: body.images.filter(Boolean).slice(0, 8),
      }),
      shippable: kind === 'merchandise',
      metadata: {
        ...existing.metadata,
        ...(body.slug !== undefined && { slug: body.slug }),
        ...(body.visible !== undefined && {
          shop_visible: body.visible ? 'true' : 'false',
        }),
        track_inventory:
          kind === 'merchandise' && body.trackInventory !== false
            ? 'true'
            : 'false',
        ...(body.availableQuantity !== undefined && {
          inventory_quantity: String(body.availableQuantity),
        }),
      },
    });

    let priceId = currentPrice?.id ?? body.currentPriceId ?? null;
    if (!priceMatches(currentPrice, { ...body, kind })) {
      const replacement = await createPrice(existing.id, { ...body, kind });
      await stripe.products.update(existing.id, {
        default_price: replacement.id,
      });
      if (currentPrice) {
        await stripe.prices.update(currentPrice.id, { active: false });
      }
      priceId = replacement.id;
    }

    if (kind === 'merchandise' && priceId) {
      const oldInventory = body.currentPriceId
        ? await db.query.commerceInventory.findFirst({
            where: eq(commerceInventory.stripePriceId, body.currentPriceId),
          })
        : null;
      await db
        .insert(commerceInventory)
        .values({
          stripePriceId: priceId,
          stripeProductId: existing.id,
          availableQuantity:
            body.availableQuantity ?? oldInventory?.availableQuantity ?? 0,
          reservedQuantity:
            priceId === body.currentPriceId
              ? (oldInventory?.reservedQuantity ?? 0)
              : 0,
          trackInventory: body.trackInventory !== false,
        })
        .onConflictDoUpdate({
          target: commerceInventory.stripePriceId,
          set: {
            availableQuantity:
              body.availableQuantity ?? oldInventory?.availableQuantity ?? 0,
            trackInventory: body.trackInventory !== false,
            updatedAt: new Date(),
          },
        });
    }

    return NextResponse.json({ success: true, priceId });
  } catch (cause) {
    console.error('[admin:shop:product:update]', cause);
    return NextResponse.json(
      {
        error: cause instanceof Error ? cause.message : 'Product update failed',
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
  }
  const body = (await request.json()) as {
    productId?: string;
    priceId?: string;
  };
  if (!body.productId) {
    return NextResponse.json(
      { error: 'Product ID is required' },
      { status: 400 }
    );
  }

  try {
    const stripe = getStripe();
    await stripe.products.update(body.productId, {
      active: false,
      metadata: { shop_visible: 'false' },
    });
    if (body.priceId) {
      await stripe.prices.update(body.priceId, { active: false });
    }
    return NextResponse.json({ success: true });
  } catch (cause) {
    console.error('[admin:shop:product:archive]', cause);
    return NextResponse.json(
      {
        error: cause instanceof Error ? cause.message : 'Archive failed',
      },
      { status: 500 }
    );
  }
}
