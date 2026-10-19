import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

// Initialize Stripe lazily to avoid build-time env issues
const getStripe = () => {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not set');
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY);
};

export async function POST(request: NextRequest) {
  const stripe = getStripe();
  try {
    const body = await request.json();
    const {
      amount,
      isRecurring,
      customerEmail,
      comment,
      dedicate,
      monthlyTier,
    } = body;
    const tier = monthlyTier ? monthlyTier : 0;
    const dedicated_to = dedicate ? dedicate : '';

    const origin = request.headers.get('origin') || 'https://pana.social';

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
      success_url: `${origin}/donation/confirmation?tier=${tier}&amt=${amount}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/donate`,
      customer_email: customerEmail,
      metadata: {
        comment: comment,
        dedicated_to: dedicated_to,
        membership: tier,
      },
    });

    return NextResponse.json(
      { url: session.url, sessionId: session.id },
      { status: 200 }
    );
  } catch (err) {
    const error = err as { message?: string; statusCode?: number };
    return NextResponse.json(
      { message: error.message },
      { status: error.statusCode || 500 }
    );
  }
}
