import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import {
  getBillingUser,
  listBillingCustomers,
  readBillingDetails,
} from '@/lib/server/billing';
import { getStripe } from '@/lib/shop/stripe';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  try {
    const user = await getBillingUser(session.user.id);
    if (!user) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }
    const stripe = getStripe();
    const customers = await listBillingCustomers(stripe, user);
    return NextResponse.json(await readBillingDetails(stripe, customers), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    console.error('[account:billing]', error);
    return NextResponse.json(
      {
        error: 'Billing details are temporarily unavailable. Please try again.',
      },
      { status: 503, headers: { 'Cache-Control': 'private, no-store' } }
    );
  }
}
