import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, beforeEach, mock, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { NextRequest } from 'next/server';
import type Stripe from 'stripe';

import { billingDetailsSchema, formatBillingAmount } from '@/lib/billing';
import * as schema from '@/lib/schema';
import type { ShopPrice } from '@/lib/shop/types';

const pg = new PGlite();
const db = drizzle(pg, { schema });
const userId = 'billing-member';
const email = 'donor@example.invalid';
const origin = 'https://panamia.club';
const periodEnd = Date.parse('2026-12-01T00:00:00Z') / 1000;
const originalSecret = process.env.STRIPE_SECRET_KEY;
const originalWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const tables = [
  schema.users,
  schema.profiles,
  schema.commerceSubscriptions,
  schema.commerceOrders,
  schema.commerceOrderItems,
  schema.commerceInventory,
  schema.stripeWebhookEvents,
];

function customer(id: string, billingEmail: string | null = email) {
  return { id, email: billingEmail, metadata: {} as Record<string, string> };
}
function item(id = 'si_fixture', quantity = 1, end = periodEnd) {
  return {
    id,
    quantity,
    current_period_end: end,
    price: {
      id: 'price_fixture',
      product: 'prod_donation',
      unit_amount: 1500,
      currency: 'usd',
      recurring: { interval: 'month', interval_count: 1 },
    },
  };
}
function subscription(id = 'sub_fixture', customerId = 'cus_guest') {
  return {
    id,
    customer: customerId,
    status: 'active',
    cancel_at_period_end: false,
    cancel_at: null as number | null,
    metadata: {} as Record<string, string>,
    items: { data: [item()], has_more: false },
  };
}
function stripeList<T>(values: T[]) {
  return {
    data: values.slice(0, 2),
    has_more: values.length > 2,
    async *[Symbol.asyncIterator]() {
      for (const value of values) yield value;
    },
  };
}

const customers = new Map<string, ReturnType<typeof customer>>();
const subscriptions: ReturnType<typeof subscription>[] = [];
const extraItems = new Map<string, ReturnType<typeof item>[]>();
const createdByKey = new Map<string, ReturnType<typeof customer>>();
const calls = {
  customerLists: [] as Stripe.CustomerListParams[],
  customerSearches: [] as Stripe.CustomerSearchParams[],
  customerCreates: [] as Stripe.CustomerCreateParams[],
  createKeys: [] as string[],
  portals: [] as Stripe.BillingPortal.SessionCreateParams[],
  productReads: [] as string[],
  cancelled: [] as string[],
  deleted: [] as string[],
  checkouts: [] as Stripe.Checkout.SessionCreateParams[],
};
let account: { user: { id: string; email: string } } | null = null;
let stripeFailure = false;
let portalUrl: string | null = null;
let shopKind: ShopPrice['kind'] = 'subscription';
let searchCustomers: ReturnType<typeof customer>[] | null = null;

class FixtureStripe {
  static createFetchHttpClient() {
    return 'fixture-fetch';
  }
  customers = {
    retrieve: async (id: string) => {
      const value = customers.get(id);
      if (!value) throw new Error('Unknown fixture customer');
      return value;
    },
    list: (params: Stripe.CustomerListParams) => {
      calls.customerLists.push(params);
      if (stripeFailure) throw new Error('Private Stripe processor failure');
      return stripeList(
        [...customers.values()].filter((value) => value.email === params.email)
      );
    },
    search: (params: Stripe.CustomerSearchParams) => {
      calls.customerSearches.push(params);
      return stripeList(searchCustomers ?? [...customers.values()]);
    },
    create: async (
      params: Stripe.CustomerCreateParams,
      options: Stripe.RequestOptions
    ) => {
      const key = options.idempotencyKey;
      assert.ok(key);
      calls.customerCreates.push(params);
      calls.createKeys.push(key);
      let value = createdByKey.get(key);
      if (!value) {
        value = customer(`cus_created_${createdByKey.size}`, params.email);
        const owner =
          params.metadata && typeof params.metadata === 'object'
            ? params.metadata.panamiaUserId
            : undefined;
        assert.ok(typeof owner === 'string');
        value.metadata = { panamiaUserId: owner };
        createdByKey.set(key, value);
        customers.set(value.id, value);
      }
      return value;
    },
    del: async (id: string) => {
      calls.deleted.push(id);
      customers.delete(id);
      return { id, deleted: true };
    },
  };
  subscriptions = {
    list: (params: Stripe.SubscriptionListParams) =>
      stripeList(
        subscriptions.filter((value) => value.customer === params.customer)
      ),
    cancel: async (id: string) => {
      calls.cancelled.push(id);
      const value = subscriptions.find((entry) => entry.id === id)!;
      value.status = 'canceled';
      return value;
    },
  };
  subscriptionItems = {
    list: (params: Stripe.SubscriptionItemListParams) =>
      stripeList(extraItems.get(params.subscription) ?? []),
  };
  products = {
    retrieve: async (id: string) => {
      calls.productReads.push(id);
      return { id, name: 'Donation' };
    },
  };
  billingPortal = {
    sessions: {
      create: async (params: Stripe.BillingPortal.SessionCreateParams) => {
        calls.portals.push(params);
        if (stripeFailure) throw new Error('Private Stripe portal failure');
        return {
          url:
            portalUrl ??
            `https://billing.stripe.com/p/session/${calls.portals.length}`,
        };
      },
    },
  };
  checkout = {
    sessions: {
      create: async (params: Stripe.Checkout.SessionCreateParams) => {
        calls.checkouts.push(params);
        return {
          id: `cs_fixture_${calls.checkouts.length}`,
          url: 'https://checkout.stripe.com/c/pay/fixture',
        };
      },
    },
  };
  webhooks = {
    constructEventAsync: async (body: string) => JSON.parse(body),
  };
}

mock.module(import.meta.resolve('stripe'), {
  exports: { default: FixtureStripe },
});
const StripeClient = (await import('stripe')).default;
const stripe = new StripeClient('sk_test_billing_fixture');

mock.module(import.meta.resolve('../lib/db.ts'), { namedExports: { db } });
mock.module(import.meta.resolve('../auth.ts'), {
  namedExports: { auth: async () => account },
});
mock.module(import.meta.resolve('../lib/shop/stripe.ts'), {
  namedExports: {
    getStripe: () => {
      if (!process.env.STRIPE_SECRET_KEY)
        throw new Error('Stripe is not configured');
      return stripe;
    },
    listShopPrices: async (): Promise<ShopPrice[]> => [
      {
        id: 'price_fixture',
        productId: 'prod_fixture',
        slug: 'fixture',
        name: 'Fixture product',
        description: null,
        imageUrl: null,
        kind: shopKind,
        unitAmount: 1500,
        currency: 'usd',
        recurringInterval: shopKind === 'subscription' ? 'month' : null,
        recurringIntervalCount: shopKind === 'subscription' ? 1 : null,
        availableQuantity: null,
        inStock: true,
      },
    ],
  },
});
mock.module(import.meta.resolve('../lib/shop/settings.ts'), {
  namedExports: {
    getShopSettings: async () => ({
      standardShippingEnabled: true,
      standardShippingCents: 500,
      standardShippingMinDays: 3,
      standardShippingMaxDays: 7,
      localPickupEnabled: true,
      customerEmailEnabled: false,
      staffEmailEnabled: false,
      ghlSyncEnabled: false,
    }),
  },
});
mock.module(import.meta.resolve('../lib/email.ts'), {
  namedExports: { sendTemplateEmail: async () => {} },
});
mock.module(import.meta.resolve('../lib/shop/crm.ts'), {
  namedExports: { syncShopBuyerToGhl: async () => {} },
});
mock.method(globalThis, 'fetch', async () => {
  throw new Error('Unexpected network request in billing tests');
});
mock.method(console, 'error', () => {});
mock.method(console, 'warn', () => {});

let billing: typeof import('../lib/server/billing');
let accountRoute: typeof import('../app/api/account/billing/route');
let portalRoute: typeof import('../app/api/account/billing/portal/route');
let checkoutRoute: typeof import('../app/api/shop/checkout/route');
let webhookRoute: typeof import('../app/api/shop/webhook/route');
let shopPortalRoute: typeof import('../app/api/shop/portal/route');

before(async () => {
  for (const table of tables) {
    const { name, columns } = getTableConfig(table);
    const definitions = columns.map(
      (column) =>
        `"${column.name}" ${column.enumValues ? 'text' : column.getSQLType()}` +
        (column.primary ? ' PRIMARY KEY' : '') +
        (column.isUnique ? ` CONSTRAINT "${column.uniqueName}" UNIQUE` : '')
    );
    await pg.exec(`CREATE TABLE "${name}" (${definitions.join(', ')})`);
  }
  await db.insert(schema.users).values([
    { id: 'legacy-a', email: 'a@example.invalid' },
    { id: 'legacy-b', email: 'b@example.invalid' },
    { id: 'legacy-c', email: 'c@example.invalid' },
  ]);
  await db.insert(schema.profiles).values([
    {
      id: 'legacy-profile',
      userId: 'legacy-a',
      email: 'a@example.invalid',
      name: 'Legacy A',
      stripeCustomerId: 'cus_legacy',
    },
    {
      id: 'conflicting-profile',
      userId: 'legacy-c',
      email: 'c@example.invalid',
      name: 'Legacy C',
      stripeCustomerId: 'cus_conflict',
    },
  ]);
  await db.insert(schema.commerceSubscriptions).values([
    {
      userId: 'legacy-b',
      stripeCustomerId: 'cus_conflict',
      stripeSubscriptionId: 'sub_conflict',
      email,
      status: 'active',
    },
    {
      userId: 'legacy-b',
      stripeCustomerId: 'cus_legacy_shop',
      stripeSubscriptionId: 'sub_legacy_shop',
      email,
      status: 'active',
    },
  ]);
  await pg.exec(
    await readFile(
      new URL('../drizzle/0075_billing_customers.sql', import.meta.url),
      'utf8'
    )
  );
  const migrated = await db.query.billingCustomers.findMany();
  assert.deepEqual(
    migrated.map((row) => [row.stripeCustomerId, row.userId]).sort(),
    [
      ['cus_legacy', 'legacy-a'],
      ['cus_legacy_shop', 'legacy-b'],
    ]
  );
  assert.equal((await db.query.profiles.findMany()).length, 2);

  billing = await import('../lib/server/billing');
  accountRoute = await import('../app/api/account/billing/route');
  portalRoute = await import('../app/api/account/billing/portal/route');
  checkoutRoute = await import('../app/api/shop/checkout/route');
  webhookRoute = await import('../app/api/shop/webhook/route');
  shopPortalRoute = await import('../app/api/shop/portal/route');
});

beforeEach(async () => {
  await db.delete(schema.billingCustomers);
  for (const table of [...tables].reverse()) await db.delete(table);
  await db
    .insert(schema.users)
    .values({ id: userId, email, emailVerified: true });
  account = { user: { id: userId, email } };
  customers.clear();
  subscriptions.length = 0;
  extraItems.clear();
  createdByKey.clear();
  for (const entries of Object.values(calls)) entries.length = 0;
  stripeFailure = false;
  portalUrl = null;
  shopKind = 'subscription';
  searchCustomers = null;
  process.env.STRIPE_SECRET_KEY = 'sk_test_billing_fixture';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_billing_fixture';
});

after(async () => {
  if (originalSecret === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = originalSecret;
  if (originalWebhookSecret === undefined)
    delete process.env.STRIPE_WEBHOOK_SECRET;
  else process.env.STRIPE_WEBHOOK_SECRET = originalWebhookSecret;
  mock.restoreAll();
  await pg.close();
});

function portalRequest(
  body: unknown = { customerId: 'cus_guest' },
  requestOrigin: string | null = origin,
  servingOrigin = origin
) {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (requestOrigin !== null) headers.set('Origin', requestOrigin);
  return new NextRequest(`${servingOrigin}/api/account/billing/portal`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

test('anonymous users cannot read billing or create a portal', async () => {
  account = null;
  assert.equal((await accountRoute.GET()).status, 401);
  assert.equal((await portalRoute.POST(portalRequest())).status, 401);
  assert.equal(calls.customerSearches.length, 0);
  assert.equal(calls.portals.length, 0);
});

test('guest discovery requires a freshly verified, exact login email', async () => {
  customers.set('cus_guest', customer('cus_guest', 'DONOR@example.invalid'));
  customers.set('cus_partial', customer('cus_partial', `another-${email}`));
  let response = await accountRoute.GET();
  assert.equal(response.status, 200);
  assert.deepEqual(
    billingDetailsSchema
      .parse(await response.json())
      .customers.map((entry) => entry.id),
    ['cus_guest']
  );
  assert.deepEqual(calls.customerSearches, [
    { query: `email:'${email}'`, limit: 100 },
  ]);
  assert.equal((await db.query.billingCustomers.findMany()).length, 0);

  await db
    .update(schema.users)
    .set({ emailVerified: false })
    .where(eq(schema.users.id, userId));
  calls.customerLists.length = 0;
  calls.customerSearches.length = 0;
  response = await accountRoute.GET();
  assert.deepEqual(await response.json(), { customers: [] });
  assert.equal(calls.customerLists.length, 0);
  assert.equal(calls.customerSearches.length, 0);
  assert.equal((await portalRoute.POST(portalRequest())).status, 404);
});

test('matching billing emails never transfer another member ownership', async () => {
  await db
    .insert(schema.users)
    .values({ id: 'other', email: 'other@example.invalid' });
  for (const id of [
    'cus_saved',
    'cus_profile',
    'cus_shop',
    'cus_metadata',
    'cus_guest',
  ]) {
    customers.set(id, customer(id));
  }
  customers.get('cus_metadata')!.metadata.panamiaUserId = 'other';
  await db
    .insert(schema.billingCustomers)
    .values({ stripeCustomerId: 'cus_saved', userId: 'other' });
  await db.insert(schema.profiles).values({
    id: 'other-profile',
    userId: 'other',
    email: 'other@example.invalid',
    name: 'Other member',
    stripeCustomerId: 'cus_profile',
  });

  await db.insert(schema.commerceSubscriptions).values({
    userId: 'other',
    stripeCustomerId: 'cus_shop',
    stripeSubscriptionId: 'sub_other',
    email,
    status: 'active',
  });
  const response = await accountRoute.GET();
  assert.deepEqual(
    billingDetailsSchema
      .parse(await response.json())
      .customers.map((entry) => entry.id),
    ['cus_guest']
  );
  for (const id of [
    'cus_saved',
    'cus_profile',
    'cus_shop',
    'cus_metadata',
    'cus_unknown',
  ]) {
    assert.equal(
      (await portalRoute.POST(portalRequest({ customerId: id }))).status,
      404
    );
  }
  assert.equal(calls.portals.length, 0);
  await assert.rejects(
    billing.claimBillingCustomer('cus_saved', userId),
    billing.BillingOwnershipError
  );
});

test('stale Stripe search results cannot grant guest access or overwrite current ownership metadata', async () => {
  customers.set(
    'cus_guest',
    customer('cus_guest', 'different@example.invalid')
  );
  searchCustomers = [customer('cus_guest')];
  let response = await accountRoute.GET();
  assert.deepEqual(await response.json(), { customers: [] });
  assert.equal((await portalRoute.POST(portalRequest())).status, 404);

  customers.get('cus_guest')!.email = email;
  customers.get('cus_guest')!.metadata.panamiaUserId = 'other';
  await db
    .insert(schema.billingCustomers)
    .values({ stripeCustomerId: 'cus_guest', userId });
  response = await accountRoute.GET();
  assert.deepEqual(await response.json(), { customers: [] });
  assert.equal((await portalRoute.POST(portalRequest())).status, 404);
  assert.equal(calls.portals.length, 0);
});

test('each portal is fresh, same-origin, and preserves ownership across both email changes', async () => {
  customers.set('cus_guest', customer('cus_guest'));
  const serving = 'https://social.panamia.club';
  let response = await portalRoute.POST(
    portalRequest(undefined, serving, serving)
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.deepEqual(await response.json(), {
    url: 'https://billing.stripe.com/p/session/1',
  });
  assert.deepEqual(calls.portals[0], {
    customer: 'cus_guest',
    return_url: `${serving}/account/user/edit#billing`,
  });
  assert.equal((await db.query.billingCustomers.findFirst())?.userId, userId);

  await db
    .update(schema.users)
    .set({ email: 'new-login@example.invalid' })
    .where(eq(schema.users.id, userId));
  customers.get('cus_guest')!.email = 'new-billing@example.invalid';
  response = await portalRoute.POST(portalRequest());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    url: 'https://billing.stripe.com/p/session/2',
  });
});

test('cross-origin and malformed portal requests never reach Stripe', async () => {
  for (const requestOrigin of [null, 'null', 'https://unrelated.example']) {
    assert.equal(
      (await portalRoute.POST(portalRequest(undefined, requestOrigin))).status,
      403
    );
  }
  for (const body of [
    null,
    {},
    { customerId: 42 },
    { customerId: 'sub_wrong' },
  ]) {
    assert.equal((await portalRoute.POST(portalRequest(body))).status, 400);
  }
  assert.equal(
    (
      await portalRoute.POST(
        new NextRequest(`${origin}/api/account/billing/portal`, {
          method: 'POST',
          headers: { Origin: origin },
          body: '{',
        })
      )
    ).status,
    400
  );
  assert.equal(calls.customerSearches.length, 0);
  assert.equal(calls.portals.length, 0);
});

test('billing reads current prices, cancellation state, and every page without duplicating product lookups', async () => {
  customers.set('cus_guest', customer('cus_guest'));
  for (let index = 0; index < 101; index++) {
    subscriptions.push(subscription(`sub_${index}`));
  }
  subscriptions[0].items.data[0].quantity = 2;
  subscriptions[0].cancel_at_period_end = true;
  subscriptions[0].cancel_at = periodEnd;
  let response = await accountRoute.GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  let details = billingDetailsSchema.parse(await response.json());
  assert.equal(details.customers[0].subscriptions.length, 101);
  assert.deepEqual(details.customers[0].subscriptions[0], {
    id: 'sub_0',
    status: 'active',
    cancelAtPeriodEnd: true,
    cancelAt: '2026-12-01T00:00:00.000Z',
    currentPeriodEnd: '2026-12-01T00:00:00.000Z',
    items: [
      {
        name: 'Donation',
        amount: 3000,
        currency: 'usd',
        interval: 'month',
        intervalCount: 1,
      },
    ],
  });
  assert.deepEqual(calls.productReads, ['prod_donation']);
  subscriptions[0].status = 'canceled';
  response = await accountRoute.GET();
  details = billingDetailsSchema.parse(await response.json());
  assert.equal(details.customers[0].subscriptions[0].status, 'canceled');
  assert.equal((await db.query.commerceSubscriptions.findMany()).length, 0);
});

test('truncated subscription items are fetched completely with their latest period end', async () => {
  customers.set('cus_guest', customer('cus_guest'));
  const value = subscription();
  value.items.has_more = true;
  subscriptions.push(value);
  extraItems.set(value.id, [
    item('si_1'),
    item('si_2'),
    item('si_3', 3, periodEnd + 86400),
  ]);
  const details = billingDetailsSchema.parse(
    await (await accountRoute.GET()).json()
  );
  assert.equal(details.customers[0].subscriptions[0].items.length, 3);
  assert.equal(details.customers[0].subscriptions[0].items[2].amount, 4500);
  assert.equal(
    details.customers[0].subscriptions[0].currentPeriodEnd,
    '2026-12-02T00:00:00.000Z'
  );
});

test('signed-in customer creation is idempotent and unverified emails cannot claim guest gifts', async () => {
  await db
    .update(schema.users)
    .set({ emailVerified: false })
    .where(eq(schema.users.id, userId));
  customers.set('cus_guest', customer('cus_guest'));
  const ids = await Promise.all([
    billing.getOrCreateBillingCustomer(stripe, userId),
    billing.getOrCreateBillingCustomer(stripe, userId),
  ]);
  assert.deepEqual(ids, ['cus_created_0', 'cus_created_0']);
  assert.equal(createdByKey.size, 1);
  assert.equal(calls.customerLists.length, 0);
  assert.equal(calls.customerSearches.length, 0);
  assert.ok(
    calls.createKeys.every((key) => key === `panamia-customer:${userId}`)
  );
  assert.ok(
    calls.customerCreates.every(
      (params) =>
        params.email === email &&
        params.metadata &&
        typeof params.metadata === 'object' &&
        params.metadata.panamiaUserId === userId
    )
  );
  assert.equal((await db.query.billingCustomers.findMany()).length, 1);
  assert.equal(
    await billing.getOrCreateBillingCustomer(stripe, userId),
    'cus_created_0'
  );
  assert.equal(createdByKey.size, 1);
});

test('shop memberships and merchandise reuse the same linked billing customer', async () => {
  customers.set('cus_saved', customer('cus_saved', 'old@example.invalid'));
  await db
    .insert(schema.billingCustomers)
    .values({ stripeCustomerId: 'cus_saved', userId });
  for (const kind of ['subscription', 'merchandise'] as const) {
    shopKind = kind;
    const response = await checkoutRoute.POST(
      new NextRequest(`${origin}/api/shop/checkout`, {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ priceId: 'price_fixture', quantity: 1 }],
        }),
      })
    );
    assert.equal(response.status, 200, kind);
    const params = calls.checkouts.at(-1)!;
    assert.equal(params.customer, 'cus_saved');
    assert.equal(params.customer_email, undefined);
    assert.equal(params.customer_creation, undefined);
    assert.equal(
      params.mode,
      kind === 'subscription' ? 'subscription' : 'payment'
    );
  }
  assert.equal(calls.customerCreates.length, 0);
  assert.equal(calls.customerSearches.length, 0);
});

test('the existing shop portal claims verified guest memberships without bypassing billing ownership', async () => {
  customers.set(
    'cus_guest',
    customer('cus_guest', 'changed-billing@example.invalid')
  );
  await db.insert(schema.commerceSubscriptions).values({
    userId: null,
    email,
    stripeCustomerId: 'cus_guest',
    stripeSubscriptionId: 'sub_guest_shop',
    status: 'active',
  });
  const request = () =>
    new NextRequest(`${origin}/api/shop/portal`, {
      method: 'POST',
      headers: { Origin: origin },
    });
  await db.insert(schema.users).values({
    id: 'new-contact',
    email: 'changed-billing@example.invalid',
    emailVerified: true,
  });
  account = {
    user: { id: 'new-contact', email: 'changed-billing@example.invalid' },
  };
  assert.deepEqual(await (await accountRoute.GET()).json(), { customers: [] });
  assert.equal((await portalRoute.POST(portalRequest())).status, 404);
  account = { user: { id: userId, email } };
  let response = await shopPortalRoute.POST(request());
  assert.equal(response.status, 200);
  assert.deepEqual(calls.portals[0], {
    customer: 'cus_guest',
    return_url: `${origin}/shop/account`,
  });
  await db.delete(schema.billingCustomers);
  await db
    .update(schema.users)
    .set({ emailVerified: false })
    .where(eq(schema.users.id, userId));
  response = await shopPortalRoute.POST(request());
  assert.equal(response.status, 404);
  await db
    .update(schema.users)
    .set({ emailVerified: true })
    .where(eq(schema.users.id, userId));
  await db
    .insert(schema.users)
    .values({ id: 'other', email: 'other@example.invalid' });
  await db
    .insert(schema.billingCustomers)
    .values({ stripeCustomerId: 'cus_guest', userId: 'other' });
  response = await shopPortalRoute.POST(request());
  assert.equal(response.status, 404);
  assert.equal(calls.portals.length, 1);
});

test('malformed or insecure portal URLs never produce a success response', async () => {
  customers.set('cus_guest', customer('cus_guest'));
  for (const url of ['', 'http://billing.stripe.com/not-secure']) {
    portalUrl = url;
    const response = await portalRoute.POST(portalRequest());
    assert.equal(response.status, 503);
    assert.equal('url' in (await response.json()), false);
  }
  portalUrl = 'https://billing.panamia.club/stripe-portal';
  const response = await portalRoute.POST(portalRequest());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { url: portalUrl });
});

test('Stripe configuration and processor errors remain explicit without leaking details', async () => {
  delete process.env.STRIPE_SECRET_KEY;
  let response = await accountRoute.GET();
  assert.equal(response.status, 503);
  assert.doesNotMatch(
    (await response.json()).error,
    /STRIPE_SECRET_KEY|configured/
  );
  process.env.STRIPE_SECRET_KEY = 'sk_test_billing_fixture';
  customers.set('cus_guest', customer('cus_guest'));
  stripeFailure = true;
  response = await accountRoute.GET();
  assert.equal(response.status, 503);
  assert.doesNotMatch((await response.json()).error, /Private Stripe/);
  const portalResponse = await portalRoute.POST(portalRequest());
  assert.equal(portalResponse.status, 503);
  assert.doesNotMatch((await portalResponse.json()).error, /Private Stripe/);
});

test('donation webhooks are acknowledged independently of shop fulfillment, including legacy gifts', async () => {
  for (const [index, metadata] of [
    { kind: 'donation' },
    { frequency: 'monthly', membership: '2' },
  ].entries()) {
    const event = {
      id: `evt_donation_${index}`,
      type: 'checkout.session.completed',
      data: { object: { id: `cs_donation_${index}`, metadata } },
    };
    const response = await webhookRoute.POST(
      new NextRequest(`${origin}/api/shop/webhook`, {
        method: 'POST',
        headers: { 'stripe-signature': 'fixture' },
        body: JSON.stringify(event),
      })
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { received: true });
  }
  assert.equal((await db.query.commerceOrders.findMany()).length, 0);
  assert.equal((await db.query.stripeWebhookEvents.findMany()).length, 2);
});

test('deletion cancels all outstanding subscriptions for every owned customer, never someone else', async () => {
  for (const id of ['cus_first', 'cus_second']) {
    customers.set(id, customer(id));
    await db
      .insert(schema.billingCustomers)
      .values({ stripeCustomerId: id, userId });
  }
  await db
    .insert(schema.users)
    .values({ id: 'other', email: 'other@example.invalid' });
  customers.set('cus_other', customer('cus_other'));
  await db
    .insert(schema.billingCustomers)
    .values({ stripeCustomerId: 'cus_other', userId: 'other' });
  for (const [index, status] of [
    'active',
    'past_due',
    'trialing',
    'paused',
    'canceled',
    'incomplete_expired',
  ].entries()) {
    const value = subscription(
      `sub_${index}`,
      index % 2 ? 'cus_second' : 'cus_first'
    );
    value.status = status;
    subscriptions.push(value);
  }
  subscriptions.push(subscription('sub_other', 'cus_other'));
  assert.equal(await billing.deleteBillingCustomers(stripe, userId), 2);
  assert.deepEqual([...calls.cancelled].sort(), [
    'sub_0',
    'sub_1',
    'sub_2',
    'sub_3',
  ]);
  assert.deepEqual(calls.deleted, ['cus_first', 'cus_second']);
  assert.equal(customers.has('cus_other'), true);
  await db.delete(schema.users).where(eq(schema.users.id, userId));
  assert.equal((await db.query.billingCustomers.findMany()).length, 1);
});

test('billing ownership rows are not readable through direct client database roles', async () => {
  await db
    .insert(schema.billingCustomers)
    .values({ stripeCustomerId: 'cus_saved', userId });
  await pg.exec(`
    CREATE ROLE billing_client NOLOGIN;
    GRANT USAGE ON SCHEMA public TO billing_client;
    GRANT SELECT ON billing_customers TO billing_client;
    BEGIN;
    SET LOCAL ROLE billing_client;
  `);
  try {
    assert.deepEqual(
      (await pg.query('SELECT * FROM billing_customers')).rows,
      []
    );
  } finally {
    await pg.exec('ROLLBACK');
  }
});

test('cleanup reports changed ownership while still removing other owned billing accounts', async () => {
  for (const id of ['cus_changed_owner', 'cus_own']) {
    customers.set(id, customer(id));
    await db
      .insert(schema.billingCustomers)
      .values({ stripeCustomerId: id, userId });
    subscriptions.push(subscription(`sub_${id}`, id));
  }
  customers.get('cus_changed_owner')!.metadata.panamiaUserId = 'other';
  await assert.rejects(
    billing.deleteBillingCustomers(stripe, userId),
    AggregateError
  );
  assert.deepEqual(calls.cancelled, ['sub_cus_own']);
  assert.deepEqual(calls.deleted, ['cus_own']);
  assert.equal(customers.has('cus_changed_owner'), true);
});

test('billing display respects exact USD cents and currency-specific minor units', () => {
  assert.equal(formatBillingAmount(1550, 'usd'), '$15.50');
  assert.match(formatBillingAmount(500, 'jpy'), /500/);
  assert.match(formatBillingAmount(1234, 'bhd'), /1\.234/);
  assert.match(formatBillingAmount(500, 'isk'), /5/);
  assert.doesNotMatch(formatBillingAmount(500, 'isk'), /500/);
});
