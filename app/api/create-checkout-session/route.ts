import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { z } from 'zod';
import {
  DONATION_AMOUNT_ERROR,
  getMonthlyDonationTier,
  isDonationAmount,
} from '@/lib/donations';

const checkoutRequest = z.object({
  amount: z.number().refine(isDonationAmount, DONATION_AMOUNT_ERROR),
  isRecurring: z.boolean(),
  customerEmail: z
    .union([z.string().trim().email().max(254), z.literal('')])
    .optional(),
  comment: z.string().trim().max(500).default(''),
  dedicate: z.string().trim().max(500).default(''),
});

export async function POST(request: NextRequest) {
  const origin = new URL(request.url).origin;
  // Donation pages can be borrowed by another Pana surface; compare with the
  // serving origin, not just the canonical main-site hostname.
  if (request.headers.get('origin') !== origin) {
    console.warn('Blocked cross-origin donation checkout request');
    return NextResponse.json(
      { message: 'Checkout must be opened from this site.' },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: 'Malformed donation request.' },
      { status: 400 }
    );
  }

  const parsed = checkoutRequest.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        message: parsed.error.issues[0]?.message ?? 'Invalid donation details.',
      },
      { status: 400 }
    );
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    console.error('Donation checkout unavailable: Stripe is not configured');
    return NextResponse.json(
      {
        message:
          'Secure checkout is currently unavailable. Please try again later.',
      },
      { status: 503 }
    );
  }

  try {
    const stripe = new Stripe(secret, {
      httpClient: Stripe.createFetchHttpClient(),
    });
    const { amount, isRecurring, customerEmail, comment, dedicate } =
      parsed.data;
    const tier = getMonthlyDonationTier(amount, isRecurring);
    const frequency = isRecurring ? 'monthly' : 'one-time';
    const cancelQuery = new URLSearchParams({
      canceled: '1',
      frequency,
      amount: String(amount),
    });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      submit_type: 'donate',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Donation',
            },
            unit_amount: amount,
            recurring: isRecurring ? { interval: 'month' } : undefined,
          },
          quantity: 1,
        },
      ],
      mode: isRecurring ? 'subscription' : 'payment',
      success_url: `${origin}/donation/confirmation?tier=${tier}&amt=${amount}&frequency=${frequency}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/donate?${cancelQuery}`,
      customer_email: customerEmail || undefined,
      metadata: {
        comment,
        dedicated_to: dedicate,
        membership: String(tier),
        frequency,
      },
    });

    if (!session.url) {
      console.error('Stripe returned a donation checkout without a hosted URL');
      return NextResponse.json(
        {
          message:
            'Secure checkout is currently unavailable. Please try again later.',
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { url: session.url, sessionId: session.id },
      { status: 200 }
    );
  } catch (error) {
    const stripeError =
      error instanceof Stripe.errors.StripeError ? error : null;
    console.error('Donation checkout failed', {
      type:
        stripeError?.type ?? (error instanceof Error ? error.name : 'unknown'),
      code: stripeError?.code,
      requestId: stripeError?.requestId,
    });
    return NextResponse.json(
      {
        message:
          'Secure checkout is currently unavailable. Please try again later.',
      },
      { status: 503 }
    );
  }
}
