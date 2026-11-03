'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';

import { PortalButton } from '@/components/shop/portal-button';
import { billingDetailsSchema, formatBillingAmount } from '@/lib/billing';
import { SettingsCard, SettingsRow } from './settings-primitives';

export function BillingCard({ userId }: { userId: string }) {
  const { data, error, isPending, isFetching, refetch } = useQuery({
    queryKey: ['account-billing', userId],
    queryFn: async ({ signal }) => {
      const response = await fetch('/api/account/billing', {
        signal,
        cache: 'no-store',
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        throw new Error(
          body &&
            typeof body === 'object' &&
            'error' in body &&
            typeof body.error === 'string'
            ? body.error
            : 'Could not load your billing details.'
        );
      }
      const parsed = billingDetailsSchema.safeParse(body);
      if (!parsed.success) {
        console.error('Invalid account billing response', parsed.error);
        throw new Error(
          'Billing details could not be loaded. Please try again.'
        );
      }
      return parsed.data;
    },
    staleTime: 0,
    refetchOnWindowFocus: 'always',
    retry: false,
  });

  if (isPending) {
    return (
      <SettingsCard>
        <div
          className="settings-row settings-note flex items-center gap-2"
          role="status"
        >
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading your subscriptions and donations...
        </div>
      </SettingsCard>
    );
  }

  if (error) {
    return (
      <SettingsCard>
        <div className="settings-row">
          <p className="text-pana-red-deep text-sm font-bold" role="alert">
            {error.message}
          </p>
          <button
            type="button"
            className="settings-btn mt-3"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            Try again
          </button>
        </div>
      </SettingsCard>
    );
  }

  return (
    <SettingsCard>
      {data.customers.length === 0 ? (
        <SettingsRow
          label="No subscriptions or recurring donations found"
          note="Earlier guest donations are matched to your verified account email. If you gave using a different email, sign in with that address or contact hola@panamia.club."
        >
          <Link href="/support-pana" className="settings-btn inline-flex">
            Support Pana
          </Link>
        </SettingsRow>
      ) : (
        data.customers.map((customer) => (
          <SettingsRow
            key={customer.id}
            label={
              data.customers.length > 1
                ? `Billing account${customer.email ? `: ${customer.email}` : ''}`
                : 'Your subscriptions and recurring donations'
            }
            note="Stripe securely handles payment details, recurring invoices, and cancellation."
            control={
              <PortalButton
                endpoint="/api/account/billing/portal"
                customerId={customer.id}
                className="settings-btn"
              />
            }
          >
            {customer.subscriptions.length === 0 ? (
              <p className="settings-note">
                No recurring payments on this billing account.
              </p>
            ) : (
              <ul className="space-y-4" aria-label="Recurring payments">
                {customer.subscriptions.map((subscription) => {
                  const endDate =
                    subscription.cancelAt || subscription.currentPeriodEnd;
                  const ending =
                    subscription.cancelAtPeriodEnd || !!subscription.cancelAt;
                  return (
                    <li
                      key={subscription.id}
                      className="border-pana-ink/10 rounded-xl border p-4"
                    >
                      {subscription.items.map((item, index) => (
                        <div
                          key={index}
                          className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"
                        >
                          <span className="settings-label">{item.name}</span>
                          <span className="text-sm font-bold">
                            {item.amount === null
                              ? 'Amount calculated by Stripe'
                              : formatBillingAmount(item.amount, item.currency)}
                            {item.interval &&
                              (item.intervalCount === 1
                                ? ` per ${item.interval}`
                                : ` every ${item.intervalCount} ${item.interval}s`)}
                          </span>
                        </div>
                      ))}
                      <p className="settings-note mt-2 capitalize">
                        {subscription.status.replaceAll('_', ' ')}
                      </p>
                      {endDate &&
                        subscription.status !== 'canceled' &&
                        subscription.status !== 'incomplete_expired' && (
                          <p className="settings-note mt-1">
                            {ending ? 'Cancels on ' : 'Current period ends '}
                            {new Date(endDate).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </p>
                        )}
                    </li>
                  );
                })}
              </ul>
            )}
          </SettingsRow>
        ))
      )}
      <SettingsRow
        label="One-time gifts"
        note="One-time donations do not renew and cannot be canceled here. This page does not change donation amounts."
      >
        <Link
          href="/support-pana"
          className="text-pana-indigo text-sm font-extrabold underline"
        >
          Make another gift
        </Link>
      </SettingsRow>
    </SettingsCard>
  );
}
