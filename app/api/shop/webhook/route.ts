import { createId } from '@paralleldrive/cuid2';
import { eq, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';

import { db } from '@/lib/db';
import { sendTemplateEmail } from '@/lib/email';
import {
  commerceInventory,
  commerceOrderItems,
  commerceOrders,
  commerceSubscriptions,
  profiles,
  stripeWebhookEvents,
} from '@/lib/schema';
import { adminEmailList } from '@/lib/server/admin-emails';
import { syncShopBuyerToGhl } from '@/lib/shop/crm';
import { getStripe } from '@/lib/shop/stripe';

function stripeId(value: string | { id: string } | null): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
}

function subscriptionPeriodEnd(subscription: Stripe.Subscription): Date | null {
  const periodEnd = subscription.items.data.reduce((latest, item) => {
    const value = (
      item as Stripe.SubscriptionItem & {
        current_period_end?: number;
      }
    ).current_period_end;
    return Math.max(latest, value ?? 0);
  }, 0);
  return periodEnd > 0 ? new Date(periodEnd * 1000) : null;
}

async function upsertSubscription(input: {
  subscription: Stripe.Subscription;
  email: string;
  userId: string | null;
}) {
  const customerId = stripeId(input.subscription.customer);
  if (!customerId) return;
  const priceId = input.subscription.items.data[0]?.price.id ?? null;
  await db
    .insert(commerceSubscriptions)
    .values({
      id: createId(),
      userId: input.userId,
      email: input.email.toLowerCase(),
      stripeCustomerId: customerId,
      stripeSubscriptionId: input.subscription.id,
      stripePriceId: priceId,
      status: input.subscription.status,
      cancelAtPeriodEnd: input.subscription.cancel_at_period_end,
      currentPeriodEnd: subscriptionPeriodEnd(input.subscription),
    })
    .onConflictDoUpdate({
      target: commerceSubscriptions.stripeSubscriptionId,
      set: {
        userId: input.userId,
        email: input.email.toLowerCase(),
        stripeCustomerId: customerId,
        stripePriceId: priceId,
        status: input.subscription.status,
        cancelAtPeriodEnd: input.subscription.cancel_at_period_end,
        currentPeriodEnd: subscriptionPeriodEnd(input.subscription),
        updatedAt: new Date(),
      },
    });
}

async function settleOrder(
  orderId: string,
  status: 'paid' | 'payment_failed' | 'cancelled'
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const order = await tx.query.commerceOrders.findFirst({
      where: eq(commerceOrders.id, orderId),
    });
    if (!order || order.status !== 'pending') return false;
    const items = await tx.query.commerceOrderItems.findMany({
      where: eq(commerceOrderItems.orderId, orderId),
    });
    for (const item of items) {
      await tx
        .update(commerceInventory)
        .set({
          reservedQuantity: sql`GREATEST(0, ${commerceInventory.reservedQuantity} - ${item.quantity})`,
          ...(status === 'paid'
            ? {
                availableQuantity: sql`GREATEST(0, ${commerceInventory.availableQuantity} - ${item.quantity})`,
              }
            : {}),
        })
        .where(eq(commerceInventory.stripePriceId, item.stripePriceId));
    }
    await tx
      .update(commerceOrders)
      .set({ status })
      .where(eq(commerceOrders.id, orderId));
    return true;
  });
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const orderId = session.metadata?.orderId;
  if (!orderId) throw new Error('Checkout Session is missing orderId metadata');

  const order = await db.query.commerceOrders.findFirst({
    where: eq(commerceOrders.id, orderId),
  });
  if (!order) throw new Error(`Unknown commerce order ${orderId}`);

  const paymentIsComplete =
    session.payment_status === 'paid' ||
    session.payment_status === 'no_payment_required';
  const transitioned = paymentIsComplete
    ? await settleOrder(orderId, 'paid')
    : false;
  const customerId = stripeId(session.customer);
  const subscriptionId = stripeId(session.subscription);
  const paymentIntentId = stripeId(session.payment_intent);
  const collected = session as Stripe.Checkout.Session & {
    collected_information?: {
      shipping_details?: { name?: string | null; address?: unknown };
    };
    shipping_details?: { name?: string | null; address?: unknown };
  };
  const shipping =
    collected.collected_information?.shipping_details ??
    collected.shipping_details ??
    null;
  const email =
    session.customer_details?.email ?? session.customer_email ?? order.email;
  const customerName =
    session.customer_details?.name ?? shipping?.name ?? order.customerName;

  await db
    .update(commerceOrders)
    .set({
      status: paymentIsComplete ? 'paid' : order.status,
      email: email?.toLowerCase() ?? null,
      customerName: customerName ?? null,
      stripeCustomerId: customerId,
      stripePaymentIntentId: paymentIntentId,
      stripeSubscriptionId: subscriptionId,
      subtotalCents: session.amount_subtotal ?? order.subtotalCents,
      shippingCents: session.shipping_cost?.amount_total ?? 0,
      taxCents: session.total_details?.amount_tax ?? 0,
      discountCents: session.total_details?.amount_discount ?? 0,
      totalCents: session.amount_total ?? order.totalCents,
      shippingAddress: shipping?.address ?? null,
      reservationExpiresAt: null,
    })
    .where(eq(commerceOrders.id, orderId));

  if (customerId && order.userId) {
    await db
      .update(profiles)
      .set({ stripeCustomerId: customerId })
      .where(eq(profiles.userId, order.userId));
  }

  if (paymentIsComplete && subscriptionId && email) {
    const subscription =
      await getStripe().subscriptions.retrieve(subscriptionId);
    await upsertSubscription({
      subscription,
      email,
      userId: order.userId,
    });
  }

  if (!paymentIsComplete || !transitioned || !email) return;
  const items = await db.query.commerceOrderItems.findMany({
    where: eq(commerceOrderItems.orderId, orderId),
  });
  const siteUrl = process.env.NEXT_PUBLIC_HOST_URL || 'https://panamia.club';
  const params = {
    orderId,
    customerName,
    email,
    totalCents: session.amount_total ?? order.totalCents,
    currency: session.currency ?? order.currency,
    kind: order.kind,
    siteUrl,
    items: items.map((item) => ({
      name: item.productName,
      quantity: item.quantity,
    })),
  };
  await sendTemplateEmail('shop.order', params, email).catch((error) =>
    console.error('[shop:webhook:customer-email]', error)
  );
  await Promise.all(
    adminEmailList().map((adminEmail) =>
      sendTemplateEmail('admin.shop_order', params, adminEmail).catch((error) =>
        console.error('[shop:webhook:admin-email]', error)
      )
    )
  );
  await syncShopBuyerToGhl({
    email,
    name: customerName,
    subscription: order.kind === 'subscription',
  }).catch((error) => console.error('[shop:webhook:ghl]', error));
}

async function handleSubscription(subscription: Stripe.Subscription) {
  const existing = await db.query.commerceSubscriptions.findFirst({
    where: eq(commerceSubscriptions.stripeSubscriptionId, subscription.id),
  });
  if (!existing) return;
  await upsertSubscription({
    subscription,
    email: existing.email,
    userId: existing.userId,
  });
}

async function processEvent(event: Stripe.Event) {
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      await handleCheckoutCompleted(
        event.data.object as Stripe.Checkout.Session
      );
      break;
    case 'checkout.session.async_payment_failed': {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.metadata?.orderId) {
        await settleOrder(session.metadata.orderId, 'payment_failed');
      }
      break;
    }
    case 'checkout.session.expired': {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.metadata?.orderId) {
        await settleOrder(session.metadata.orderId, 'cancelled');
      }
      break;
    }
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await handleSubscription(event.data.object as Stripe.Subscription);
      break;
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const parent = invoice.parent?.subscription_details?.subscription;
      const subscriptionId = stripeId(parent ?? null);
      if (subscriptionId) {
        await db
          .update(commerceSubscriptions)
          .set({ status: 'past_due', updatedAt: new Date() })
          .where(
            eq(commerceSubscriptions.stripeSubscriptionId, subscriptionId)
          );
      }
      break;
    }
    case 'charge.refunded': {
      const charge = event.data.object as Stripe.Charge;
      const paymentIntentId = stripeId(charge.payment_intent);
      if (!paymentIntentId) break;
      const order = await db.query.commerceOrders.findFirst({
        where: eq(commerceOrders.stripePaymentIntentId, paymentIntentId),
      });
      if (!order) break;
      const refundedCents = charge.amount_refunded;
      await db
        .update(commerceOrders)
        .set({
          refundedCents,
          status:
            refundedCents >= order.totalCents
              ? 'refunded'
              : 'partially_refunded',
        })
        .where(eq(commerceOrders.id, order.id));
      break;
    }
  }
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get('stripe-signature');
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !secret) {
    return NextResponse.json(
      { error: 'Stripe webhook is not configured' },
      { status: 503 }
    );
  }

  let event: Stripe.Event;
  try {
    event = await getStripe().webhooks.constructEventAsync(
      await request.text(),
      signature,
      secret
    );
  } catch (error) {
    console.error('[shop:webhook:signature]', error);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const [claimed] = await db
    .insert(stripeWebhookEvents)
    .values({ stripeEventId: event.id, eventType: event.type })
    .onConflictDoNothing()
    .returning({ id: stripeWebhookEvents.stripeEventId });
  if (!claimed) return NextResponse.json({ received: true, duplicate: true });

  try {
    await processEvent(event);
    return NextResponse.json({ received: true });
  } catch (error) {
    await db
      .delete(stripeWebhookEvents)
      .where(eq(stripeWebhookEvents.stripeEventId, event.id));
    console.error('[shop:webhook:process]', event.type, error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}
