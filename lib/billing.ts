import { z } from 'zod';

export const billingDetailsSchema = z.object({
  customers: z.array(
    z.object({
      id: z.string(),
      email: z.string().nullable(),
      subscriptions: z.array(
        z.object({
          id: z.string(),
          status: z.string(),
          cancelAtPeriodEnd: z.boolean(),
          cancelAt: z.iso.datetime().nullable(),
          currentPeriodEnd: z.iso.datetime().nullable(),
          items: z.array(
            z.object({
              name: z.string(),
              amount: z.number().int().nonnegative().nullable(),
              currency: z.string().regex(/^[a-z]{3}$/i),
              interval: z.string().nullable(),
              intervalCount: z.number().int().positive(),
            })
          ),
        })
      ),
    })
  ),
});

export type BillingDetails = z.infer<typeof billingDetailsSchema>;

export function formatBillingAmount(amount: number, currency: string) {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  });
  // Stripe still represents ISK and UGX charges in two-decimal minor units.
  const decimals = ['isk', 'ugx'].includes(currency.toLowerCase())
    ? 2
    : formatter.resolvedOptions().maximumFractionDigits;
  if (decimals === undefined) {
    throw new Error('Could not determine the billing currency denomination');
  }
  return formatter.format(amount / 10 ** decimals);
}
