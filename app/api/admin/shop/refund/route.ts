import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { commerceOrders } from '@/lib/schema';
import { checkAdminAuth } from '@/lib/server/admin-auth';
import { getStripe } from '@/lib/shop/stripe';

export async function POST(request: NextRequest) {
  const admin = await checkAdminAuth();
  if (!admin) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
  }
  const body = (await request.json()) as {
    orderId?: string;
    amountCents?: number;
    reason?: string;
  };
  if (!body.orderId || !body.reason?.trim()) {
    return NextResponse.json(
      { error: 'Order and refund reason are required' },
      { status: 400 }
    );
  }
  const order = await db.query.commerceOrders.findFirst({
    where: eq(commerceOrders.id, body.orderId),
  });
  if (!order?.stripePaymentIntentId) {
    return NextResponse.json(
      { error: 'This order has no refundable Stripe payment' },
      { status: 409 }
    );
  }
  const refundable = order.totalCents - order.refundedCents;
  const amount = body.amountCents === undefined ? refundable : body.amountCents;
  if (!Number.isInteger(amount) || amount <= 0 || amount > refundable) {
    return NextResponse.json(
      { error: 'Refund amount exceeds the remaining paid amount' },
      { status: 400 }
    );
  }

  try {
    const refund = await getStripe().refunds.create({
      payment_intent: order.stripePaymentIntentId,
      amount,
      reason: 'requested_by_customer',
      metadata: {
        orderId: order.id,
        adminUserId: admin.id,
        adminReason: body.reason.trim().slice(0, 400),
      },
    });
    return NextResponse.json({
      success: true,
      refundId: refund.id,
      status: refund.status,
    });
  } catch (cause) {
    console.error('[admin:shop:refund]', cause);
    return NextResponse.json(
      {
        error: cause instanceof Error ? cause.message : 'Refund failed',
      },
      { status: 500 }
    );
  }
}
