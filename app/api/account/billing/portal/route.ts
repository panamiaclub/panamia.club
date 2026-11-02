import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { auth } from '@/auth';
import {
  BillingOwnershipError,
  createBillingPortal,
  getBillingUser,
  listBillingCustomers,
} from '@/lib/server/billing';
import { getStripe } from '@/lib/shop/stripe';

const portalRequest = z.object({ customerId: z.string().startsWith('cus_') });

export async function POST(request: NextRequest) {
  const origin = new URL(request.url).origin;
  if (request.headers.get('origin') !== origin) {
    console.warn('[account:billing:portal] Blocked cross-origin request');
    return NextResponse.json(
      { error: 'Billing management must be opened from this site.' },
      { status: 403 }
    );
  }
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid billing request' },
      { status: 400 }
    );
  }
  const parsed = portalRequest.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid billing request' },
      { status: 400 }
    );
  }

  try {
    const user = await getBillingUser(session.user.id);
    if (!user) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }
    const stripe = getStripe();
    const customers = await listBillingCustomers(stripe, user);
    const customer = customers.find(
      (entry) => entry.id === parsed.data.customerId
    );
    if (!customer) {
      return NextResponse.json(
        { error: 'No billing account was found for this member.' },
        { status: 404 }
      );
    }
    const url = await createBillingPortal(
      stripe,
      customer.id,
      user.id,
      `${origin}/account/user/edit#billing`
    );
    return NextResponse.json(
      { url },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    console.error('[account:billing:portal]', error);
    return NextResponse.json(
      {
        error:
          error instanceof BillingOwnershipError
            ? 'This billing account is not available to this member.'
            : 'Billing management is temporarily unavailable. Please try again.',
      },
      { status: error instanceof BillingOwnershipError ? 403 : 503 }
    );
  }
}
