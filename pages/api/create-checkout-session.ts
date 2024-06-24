import type { NextApiRequest, NextApiResponse } from 'next';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

export default async function createCheckoutSession(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    try {
      const { amount, isRecurring, customerEmail, comment, dedicate, monthlyTier } = req.body;
      const tier = monthlyTier ? monthlyTier : 0;
      const dedicated_to = dedicate ? dedicate : "";
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Donation',
            },
            unit_amount: amount,
            recurring: isRecurring ? { interval: 'month' } : undefined,
          },
          quantity: 1,
        }],
        mode: isRecurring ? 'subscription' : 'payment',
        success_url: `${req.headers.origin}/donation/confirmation?tier=${tier}&amt=${amount}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${req.headers.origin}/donate`,
        customer_email: customerEmail,
        metadata: {
          comment: comment,
          dedicated_to: dedicated_to,
          membership: tier,
        },
      });

      res.status(200).json({ sessionId: session.id });
    } catch (err) {
      const error = err as Stripe.StripeRawError;
      res.status(error.statusCode || 500).json({ message: error.message });
    }
  } else {
    res.setHeader('Allow', 'POST');
    res.status(405).end('Method Not Allowed');
  }
}