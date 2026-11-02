import assert from 'node:assert/strict';
import { after, beforeEach, mock, test } from 'node:test';
import { NextRequest } from 'next/server';
import type Stripe from 'stripe';

const origin = 'https://panamia.club';
const originalSecret = process.env.STRIPE_SECRET_KEY;
const calls: Stripe.Checkout.SessionCreateParams[] = [];
let checkoutUrl: string | null =
  'https://checkout.stripe.com/c/pay/cs_test_donation';
let stripeFailure = false;

class FixtureStripeError extends Error {
  type = 'StripeAPIError';
  code = 'api_error';
  requestId = 'req_donation_fixture';
}

class FixtureStripe {
  static errors = { StripeError: FixtureStripeError };
  static createFetchHttpClient() {
    return 'fixture-fetch-client';
  }

  constructor(secret: string, options: { httpClient?: unknown }) {
    assert.equal(secret, 'sk_test_donation_fixture');
    assert.equal(options.httpClient, 'fixture-fetch-client');
  }

  checkout = {
    sessions: {
      create: async (params: Stripe.Checkout.SessionCreateParams) => {
        calls.push(params);
        if (stripeFailure)
          throw new FixtureStripeError('Fixture processor failure');
        return { url: checkoutUrl, id: 'cs_test_donation' };
      },
    },
  };
}

mock.module(import.meta.resolve('stripe'), {
  exports: { default: FixtureStripe },
});
mock.method(globalThis, 'fetch', async () => {
  throw new Error('Unexpected network request in donation checkout tests');
});
mock.method(console, 'error', () => {});
mock.method(console, 'warn', () => {});

const { POST } = await import('../app/api/create-checkout-session/route');

beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_donation_fixture';
  calls.length = 0;
  checkoutUrl = 'https://checkout.stripe.com/c/pay/cs_test_donation';
  stripeFailure = false;
});

after(() => {
  if (originalSecret === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = originalSecret;
  mock.restoreAll();
});

function request(
  body: unknown,
  requestOrigin: string | null = origin,
  servingOrigin = origin
) {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (requestOrigin !== null) headers.set('Origin', requestOrigin);
  return new NextRequest(`${servingOrigin}/api/create-checkout-session`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

test('one-time checkout lets Stripe collect email and derives membership instead of trusting it', async () => {
  const response = await POST(
    request({
      amount: 4000,
      isRecurring: false,
      monthlyTier: 3,
      comment: '  For our neighbors.  ',
      dedicate: '  Directory  ',
    })
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    url: checkoutUrl,
    sessionId: 'cs_test_donation',
  });
  assert.equal(calls.length, 1);
  const params = calls[0];
  assert.equal(params.mode, 'payment');
  assert.equal(params.submit_type, 'donate');
  assert.deepEqual(params.payment_method_types, ['card']);
  assert.equal(params.customer_email, undefined);
  assert.equal(params.line_items?.[0].price_data?.unit_amount, 4000);
  assert.equal(params.line_items?.[0].price_data?.recurring, undefined);
  assert.deepEqual(params.metadata, {
    comment: 'For our neighbors.',
    dedicated_to: 'Directory',
    membership: '0',
    frequency: 'one-time',
  });
  const cancel = new URL(params.cancel_url!);
  assert.equal(cancel.origin, origin);
  assert.equal(cancel.pathname, '/donate');
  assert.equal(cancel.searchParams.get('frequency'), 'one-time');
  assert.equal(cancel.searchParams.get('amount'), '4000');
  assert.equal(cancel.searchParams.get('canceled'), '1');
  assert.equal(cancel.searchParams.has('comment'), false);
  assert.equal(cancel.searchParams.has('customerEmail'), false);
});

test('monthly checkout creates a monthly USD price and preserves low-tier recurrence in confirmation', async () => {
  for (const [amount, tier] of [
    [50, 0],
    [1250, 1],
    [1500, 2],
    [2500, 3],
  ]) {
    const response = await POST(
      request({ amount, isRecurring: true, monthlyTier: 99 })
    );
    assert.equal(response.status, 200);
    const params = calls.at(-1)!;
    assert.equal(params.mode, 'subscription');
    assert.equal(params.submit_type, 'donate');
    assert.equal(params.line_items?.[0].price_data?.currency, 'usd');
    assert.equal(params.line_items?.[0].price_data?.unit_amount, amount);
    assert.deepEqual(params.line_items?.[0].price_data?.recurring, {
      interval: 'month',
    });
    assert.equal(params.metadata?.membership, String(tier));
    const success = new URL(params.success_url!);
    assert.equal(success.searchParams.get('frequency'), 'monthly');
    assert.equal(success.searchParams.get('tier'), String(tier));
    assert.equal(success.searchParams.get('amt'), String(amount));
    assert.equal(
      success.searchParams.get('session_id'),
      '{CHECKOUT_SESSION_ID}'
    );
  }
});

test('legacy email prefilling remains supported on any same-origin Pana surface', async () => {
  const serving = 'https://social.panamia.club';
  const response = await POST(
    request(
      {
        amount: 1000,
        isRecurring: true,
        customerEmail: '  donor@example.test  ',
      },
      serving,
      serving
    )
  );
  assert.equal(response.status, 200);
  assert.equal(calls[0].customer_email, 'donor@example.test');
  assert.equal(new URL(calls[0].cancel_url!).origin, serving);
});

test('invalid amounts, recurrence, and metadata never reach Stripe', async () => {
  const invalid = [
    null,
    {},
    { amount: '1500', isRecurring: true },
    { amount: 49, isRecurring: true },
    { amount: 50.5, isRecurring: true },
    { amount: 100_000_000, isRecurring: true },
    { amount: 1500, isRecurring: 'false' },
    { amount: 1500, isRecurring: true, customerEmail: 'not-an-email' },
    { amount: 1500, isRecurring: true, comment: 'x'.repeat(501) },
    { amount: 1500, isRecurring: true, dedicate: 'x'.repeat(501) },
    { amount: 1500, isRecurring: true, comment: {} },
  ];
  for (const body of invalid) {
    const response = await POST(request(body));
    assert.equal(response.status, 400);
    assert.equal(typeof (await response.json()).message, 'string');
  }
  assert.equal(calls.length, 0);
});

test('malformed and cross-origin requests fail explicitly without creating a checkout', async () => {
  for (const requestOrigin of [null, 'https://another.example', 'null']) {
    const response = await POST(
      request({ amount: 1500, isRecurring: true }, requestOrigin)
    );
    assert.equal(response.status, 403);
  }
  const response = await POST(
    new NextRequest(`${origin}/api/create-checkout-session`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: '{',
    })
  );
  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
});

test('missing configuration, processor failures, and missing hosted URLs return donor-safe errors', async () => {
  delete process.env.STRIPE_SECRET_KEY;
  let response = await POST(request({ amount: 1500, isRecurring: true }));
  assert.equal(response.status, 503);
  assert.equal(calls.length, 0);
  assert.doesNotMatch(
    (await response.json()).message,
    /STRIPE_SECRET_KEY|sk_test/
  );

  process.env.STRIPE_SECRET_KEY = 'sk_test_donation_fixture';
  stripeFailure = true;
  response = await POST(request({ amount: 1500, isRecurring: true }));
  assert.equal(response.status, 503);
  assert.doesNotMatch(
    (await response.json()).message,
    /Fixture processor failure/
  );

  stripeFailure = false;
  checkoutUrl = null;
  response = await POST(request({ amount: 1500, isRecurring: true }));
  assert.equal(response.status, 503);
  assert.equal('url' in (await response.json()), false);
});
