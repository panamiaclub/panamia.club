import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/auth';
import {
  BillingOwnershipError,
  createBillingPortal,
  getBillingUser,
  listBillingCustomers,
  listShopSubscriptionsForUser,
} from '@/lib/server/billing';
import { getStripe } from '@/lib/shop/stripe';

export async function POST(request: NextRequest) {
  const origin = new URL(request.url).origin;
  if (request.headers.get('origin') !== origin) {
    console.warn('[shop:portal] Blocked cross-origin request');
    return NextResponse.json(
      { error: 'Billing management must be opened from this site.' },
      { status: 403 }
    );
  }
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  try {
    const user = await getBillingUser(session.user.id);
    if (!user) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }
    const subscriptions = await listShopSubscriptionsForUser(user);
    if (subscriptions.length === 0) {
      return NextResponse.json(
        { error: 'No subscription was found for this account' },
        { status: 404 }
      );
    }
    const stripe = getStripe();
    const customers = await listBillingCustomers(stripe, user);
    const allowed = new Set(customers.map((customer) => customer.id));
    const subscription = subscriptions.find((entry) =>
      allowed.has(entry.stripeCustomerId)
    );
    if (!subscription) {
      return NextResponse.json(
        { error: 'No subscription was found for this account' },
        { status: 404 }
      );
    }
    const url = await createBillingPortal(
      stripe,
      subscription.stripeCustomerId,
      user.id,
      `${origin}/shop/account`
    );
    return NextResponse.json(
      { url },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    console.error('[shop:portal]', error);
    return NextResponse.json(
      { error: 'Subscription management is temporarily unavailable' },
      { status: error instanceof BillingOwnershipError ? 403 : 503 }
    );
  }
}
