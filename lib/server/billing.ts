import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import type Stripe from 'stripe';

import type { BillingDetails } from '@/lib/billing';
import { db } from '@/lib/db';
import {
  billingCustomers,
  commerceSubscriptions,
  profiles,
  users,
} from '@/lib/schema';

type BillingUser = Pick<
  typeof users.$inferSelect,
  'id' | 'email' | 'emailVerified'
>;

export class BillingOwnershipError extends Error {}

export function getBillingUser(userId: string) {
  return db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true, email: true, emailVerified: true },
  });
}

async function linkedCustomerIds(userId: string) {
  const [saved, legacyProfiles, subscriptions] = await Promise.all([
    db.query.billingCustomers.findMany({
      where: eq(billingCustomers.userId, userId),
      columns: { stripeCustomerId: true },
      orderBy: billingCustomers.createdAt,
    }),
    db.query.profiles.findMany({
      where: eq(profiles.userId, userId),
      columns: { stripeCustomerId: true },
    }),
    db.query.commerceSubscriptions.findMany({
      where: eq(commerceSubscriptions.userId, userId),
      columns: { stripeCustomerId: true },
    }),
  ]);
  return [
    ...new Set(
      [...saved, ...legacyProfiles, ...subscriptions]
        .map((row) => row.stripeCustomerId)
        .filter((id): id is string => !!id)
    ),
  ];
}

async function excludeOtherOwners(
  ids: string[],
  userId: string,
  verifiedEmail?: string
) {
  if (ids.length === 0) return ids;
  const [saved, legacyProfiles, subscriptions] = await Promise.all([
    db.query.billingCustomers.findMany({
      where: inArray(billingCustomers.stripeCustomerId, ids),
      columns: { stripeCustomerId: true, userId: true },
    }),
    db.query.profiles.findMany({
      where: inArray(profiles.stripeCustomerId, ids),
      columns: { stripeCustomerId: true, userId: true },
    }),
    db.query.commerceSubscriptions.findMany({
      where: inArray(commerceSubscriptions.stripeCustomerId, ids),
      columns: { stripeCustomerId: true, userId: true, email: true },
    }),
  ]);
  const otherOwners = new Set(
    [...saved, ...legacyProfiles, ...subscriptions]
      .filter((row) => row.userId && row.userId !== userId)
      .map((row) => row.stripeCustomerId)
  );
  const owned = new Set(
    [...saved, ...legacyProfiles, ...subscriptions]
      .filter((row) => row.userId === userId)
      .map((row) => row.stripeCustomerId)
  );
  if (verifiedEmail) {
    for (const subscription of subscriptions) {
      // A changed billing contact must not transfer an unclaimed shop purchase.
      if (
        !subscription.userId &&
        !owned.has(subscription.stripeCustomerId) &&
        subscription.email.toLowerCase() !== verifiedEmail.toLowerCase()
      ) {
        otherOwners.add(subscription.stripeCustomerId);
      }
    }
  }
  return ids.filter((id) => !otherOwners.has(id));
}

export async function getOwnedBillingCustomerIds(userId: string) {
  return excludeOtherOwners(await linkedCustomerIds(userId), userId);
}

export async function listShopSubscriptionsForUser(
  user: BillingUser,
  linkedIds?: string[]
) {
  const ids = linkedIds ?? (await linkedCustomerIds(user.id));
  const subscriptions = await db.query.commerceSubscriptions.findMany({
    where: or(
      eq(commerceSubscriptions.userId, user.id),
      ids.length
        ? inArray(commerceSubscriptions.stripeCustomerId, ids)
        : undefined,
      user.emailVerified
        ? and(
            isNull(commerceSubscriptions.userId),
            eq(commerceSubscriptions.email, user.email.toLowerCase())
          )
        : undefined
    ),
    orderBy: desc(commerceSubscriptions.updatedAt),
  });
  const allowed = new Set(
    await excludeOtherOwners(
      subscriptions.map((subscription) => subscription.stripeCustomerId),
      user.id,
      user.emailVerified ? user.email : undefined
    )
  );
  return subscriptions.filter((subscription) =>
    allowed.has(subscription.stripeCustomerId)
  );
}

export async function listBillingCustomers(
  stripe: Stripe,
  user: BillingUser
): Promise<Stripe.Customer[]> {
  const linked = await linkedCustomerIds(user.id);
  const shopSubscriptions = await listShopSubscriptionsForUser(user, linked);
  const ids = [
    ...new Set([
      ...linked,
      ...shopSubscriptions.map((subscription) => subscription.stripeCustomerId),
    ]),
  ];
  const customers = new Map<string, Stripe.Customer>();
  const savedCustomers = await Promise.all(
    ids.map(async (id) => {
      return stripe.customers.retrieve(id);
    })
  );
  for (const customer of savedCustomers) {
    if (!customer.deleted) customers.set(customer.id, customer);
  }

  if (user.emailVerified) {
    const email = user.email.trim().toLowerCase();
    // List is immediately consistent but case-sensitive. Search discovers
    // earlier guest gifts with differently cased emails; saved IDs never
    // depend on Stripe's eventually consistent search index.
    for await (const customer of stripe.customers.list({
      email: user.email,
      limit: 100,
    })) {
      if (
        !customers.has(customer.id) &&
        customer.email?.trim().toLowerCase() === email
      ) {
        customers.set(customer.id, customer);
      }
    }
    const term = email.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    for await (const match of stripe.customers.search({
      query: `email:'${term}'`,
      limit: 100,
    })) {
      if (customers.has(match.id)) continue;
      // Search results can be stale; only a current customer read can prove
      // that an earlier guest gift still matches this verified email.
      const customer = await stripe.customers.retrieve(match.id);
      if (!customer.deleted && customer.email?.trim().toLowerCase() === email) {
        customers.set(customer.id, customer);
      }
    }
  }

  const allowed = await excludeOtherOwners(
    [...customers.keys()],
    user.id,
    user.emailVerified ? user.email : undefined
  );
  return allowed
    .map((id) => customers.get(id)!)
    .filter(
      (customer) =>
        !customer.metadata.panamiaUserId ||
        customer.metadata.panamiaUserId === user.id
    );
}

export async function claimBillingCustomer(customerId: string, userId: string) {
  await db
    .insert(billingCustomers)
    .values({ stripeCustomerId: customerId, userId })
    .onConflictDoNothing();
  const owner = await db.query.billingCustomers.findFirst({
    where: eq(billingCustomers.stripeCustomerId, customerId),
  });
  if (owner?.userId !== userId) {
    throw new BillingOwnershipError(
      'This billing account belongs to another member.'
    );
  }
}

export async function createBillingPortal(
  stripe: Stripe,
  customerId: string,
  userId: string,
  returnUrl: string
) {
  await claimBillingCustomer(customerId, userId);
  const portal = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
  const url = new URL(portal.url);
  if (url.protocol !== 'https:') {
    throw new Error('Stripe did not return a secure billing URL');
  }
  return url.href;
}

export async function getOrCreateBillingCustomer(
  stripe: Stripe,
  userId: string
): Promise<string> {
  const user = await getBillingUser(userId);
  if (!user) throw new Error('Billing account no longer exists');
  for (const id of await getOwnedBillingCustomerIds(user.id)) {
    const linked = await stripe.customers.retrieve(id);
    if (
      !linked.deleted &&
      (!linked.metadata.panamiaUserId ||
        linked.metadata.panamiaUserId === user.id)
    ) {
      await claimBillingCustomer(linked.id, user.id);
      return linked.id;
    }
  }
  const customers = await listBillingCustomers(stripe, user);
  const customer =
    customers[0] ??
    (await stripe.customers.create(
      {
        email: user.email,
        metadata: { panamiaUserId: user.id },
      },
      { idempotencyKey: `panamia-customer:${user.id}` }
    ));
  await claimBillingCustomer(customer.id, user.id);
  return customer.id;
}

export async function readBillingDetails(
  stripe: Stripe,
  customers: Stripe.Customer[]
): Promise<BillingDetails> {
  const productNames = new Map<string, Promise<string>>();
  function productName(price: Stripe.Price) {
    if (typeof price.product !== 'string') {
      return Promise.resolve(
        price.product.deleted ? 'Subscription' : price.product.name
      );
    }
    let name = productNames.get(price.product);
    if (!name) {
      name = stripe.products
        .retrieve(price.product)
        .then((product) => product.name);
      productNames.set(price.product, name);
    }
    return name;
  }

  return {
    customers: await Promise.all(
      customers.map(async (customer) => {
        const subscriptions: BillingDetails['customers'][number]['subscriptions'] =
          [];
        for await (const subscription of stripe.subscriptions.list({
          customer: customer.id,
          status: 'all',
          limit: 100,
        })) {
          const items = [...subscription.items.data];
          if (subscription.items.has_more) {
            items.length = 0;
            for await (const item of stripe.subscriptionItems.list({
              subscription: subscription.id,
              limit: 100,
              expand: ['data.price.product'],
            })) {
              items.push(item);
            }
          }
          const periodEnd = Math.max(
            0,
            ...items.map((item) => item.current_period_end)
          );
          subscriptions.push({
            id: subscription.id,
            status: subscription.status,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            cancelAt: subscription.cancel_at
              ? new Date(subscription.cancel_at * 1000).toISOString()
              : null,
            currentPeriodEnd: periodEnd
              ? new Date(periodEnd * 1000).toISOString()
              : null,
            items: await Promise.all(
              items.map(async (item) => ({
                name:
                  subscription.metadata.kind === 'donation'
                    ? 'Donation'
                    : await productName(item.price),
                amount:
                  item.price.unit_amount === null
                    ? null
                    : item.price.unit_amount * (item.quantity ?? 1),
                currency: item.price.currency,
                interval: item.price.recurring?.interval ?? null,
                intervalCount: item.price.recurring?.interval_count ?? 1,
              }))
            ),
          });
        }
        return {
          id: customer.id,
          email: customer.email,
          subscriptions,
        };
      })
    ),
  };
}

export async function deleteBillingCustomers(stripe: Stripe, userId: string) {
  const ids = await getOwnedBillingCustomerIds(userId);
  const failures: unknown[] = [];
  for (const customer of ids) {
    try {
      const record = await stripe.customers.retrieve(customer);
      if (record.deleted) continue;
      if (
        record.metadata.panamiaUserId &&
        record.metadata.panamiaUserId !== userId
      ) {
        throw new BillingOwnershipError(
          'Stripe billing ownership no longer matches this member.'
        );
      }
      for await (const subscription of stripe.subscriptions.list({
        customer,
        status: 'all',
        limit: 100,
      })) {
        if (
          subscription.status !== 'canceled' &&
          subscription.status !== 'incomplete_expired'
        ) {
          await stripe.subscriptions.cancel(subscription.id);
        }
      }
      await stripe.customers.del(customer);
    } catch (error) {
      console.error('[billing:delete-customer]', customer, error);
      failures.push(error);
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      'Some Stripe billing accounts could not be removed'
    );
  }
  return ids.length;
}
