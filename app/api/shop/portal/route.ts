import { desc, eq, or } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/auth';
import { db } from '@/lib/db';
import { commerceSubscriptions } from '@/lib/schema';
import { getStripe } from '@/lib/shop/stripe';

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const subscription = await db.query.commerceSubscriptions.findFirst({
    where: or(
      eq(commerceSubscriptions.userId, session.user.id),
      eq(commerceSubscriptions.email, session.user.email.toLowerCase())
    ),
    orderBy: desc(commerceSubscriptions.updatedAt),
  });
  if (!subscription) {
    return NextResponse.json(
      { error: 'No subscription was found for this account' },
      { status: 404 }
    );
  }

  try {
    const origin =
      request.headers.get('origin') ||
      process.env.NEXT_PUBLIC_HOST_URL ||
      'http://localhost:3000';
    const portal = await getStripe().billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: `${origin}/shop/account`,
    });
    return NextResponse.json({ url: portal.url });
  } catch (error) {
    console.error('[shop:portal]', error);
    return NextResponse.json(
      { error: 'Subscription management is temporarily unavailable' },
      { status: 500 }
    );
  }
}
