'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, MessageSquareText } from 'lucide-react';
import Link from 'next/link';

import {
  SettingsCard,
  SettingsRow,
} from '@/app/account/user/edit/_components/settings-primitives';

interface Subscription {
  phone: string;
  status: 'pending' | 'active' | 'opted_out';
  syncedAt: string | null;
  syncError: string | null;
}

export function SmsSubscriptionCard({ onChanged }: { onChanged?: () => void }) {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch('/api/crm/sms-subscription')
      .then(async (response) => {
        const body = (await response.json()) as {
          data?: Subscription | null;
          error?: string;
        };
        if (!response.ok) throw new Error(body.error ?? 'Could not load.');
        setSubscription(body.data ?? null);
        setPhone(body.data?.phone ?? '');
      })
      .catch((cause) =>
        setError(
          cause instanceof Error
            ? cause.message
            : 'Could not load SMS preferences.'
        )
      )
      .finally(() => setLoading(false));
  }, []);

  async function subscribe() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/crm/sms-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, consent }),
      });
      const body = (await response.json()) as {
        data?: Subscription;
        error?: string;
      };
      if (!response.ok && response.status !== 202) {
        throw new Error(body.error ?? 'Could not save SMS preferences.');
      }
      if (!body.data) throw new Error('SMS preferences were not returned.');
      setSubscription(body.data);
      setPhone(body.data.phone);
      setConsent(false);
      onChanged?.();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not save SMS preferences.'
      );
    } finally {
      setSaving(false);
    }
  }

  async function unsubscribe() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/crm/sms-subscription', {
        method: 'DELETE',
      });
      const body = (await response.json()) as {
        data?: Subscription | null;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(body.error ?? 'Could not turn off text messages.');
      }
      setSubscription(body.data ?? null);
      onChanged?.();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not turn off text messages.'
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <SettingsCard>
        <div className="settings-row settings-note flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading text-message preferences…
        </div>
      </SettingsCard>
    );
  }

  const active = subscription?.status === 'active';
  return (
    <SettingsCard>
      <SettingsRow
        label="Community text messages"
        note={
          active
            ? `Text updates are on for ${subscription.phone}.`
            : 'Add a mobile number to receive community and Connector updates.'
        }
        control={
          active ? (
            <button
              type="button"
              className="settings-btn"
              data-variant="danger"
              disabled={saving}
              onClick={unsubscribe}
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Turn off texts
            </button>
          ) : undefined
        }
      >
        {active ? (
          <p className="text-pana-indigo flex items-center gap-2 text-sm font-bold">
            <CheckCircle2 className="h-4 w-4" />
            Confirmed and synced with HighLevel
          </p>
        ) : (
          <div className="space-y-3">
            <label className="block">
              <span className="settings-note mb-1.5 block font-bold">
                Mobile number
              </span>
              <input
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="(305) 555-0123"
                className="border-pana-ink/20 w-full max-w-sm rounded-lg border-2 bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="flex max-w-2xl items-start gap-2.5 text-sm leading-relaxed">
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
                className="mt-1 size-4 shrink-0"
              />
              <span>
                I agree to receive community and Connector text messages from
                Pana MIA. Message frequency varies. Message and data rates may
                apply. Reply STOP to opt out or HELP for help. See our{' '}
                <Link
                  href="/legal/privacy"
                  className="text-pana-indigo font-bold underline"
                >
                  privacy policy
                </Link>{' '}
                and{' '}
                <Link
                  href="/legal/terms"
                  className="text-pana-indigo font-bold underline"
                >
                  terms
                </Link>
                .
              </span>
            </label>
            <button
              type="button"
              className="settings-btn"
              disabled={saving || !consent || !phone.trim()}
              onClick={subscribe}
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <MessageSquareText className="h-3.5 w-3.5" />
              )}
              Turn on text messages
            </button>
            {subscription?.status === 'pending' ? (
              <p className="settings-note">
                Your consent is saved. HighLevel synchronization is pending and
                will retry automatically.
              </p>
            ) : null}
          </div>
        )}
        {error ? (
          <p className="text-pana-red-deep mt-3 text-sm font-bold">{error}</p>
        ) : null}
      </SettingsRow>
    </SettingsCard>
  );
}
