'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Link2, Loader2 } from 'lucide-react';

import { SettingsCard, SettingsRow } from './settings-primitives';

interface ReferralData {
  code: string | null;
  referralUrl: string | null;
  milestones: {
    people: number;
    accounts: number;
    directory: number;
    connectors: number;
  };
}

export function ReferralCard() {
  const [data, setData] = useState<ReferralData | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const response = await fetch('/api/referrals/me');
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || 'Could not load your referral link.');
      }
      setData(body);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Could not load your referral link.'
      );
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function generateLink() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/referrals/me', { method: 'POST' });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || 'Could not generate your referral link.');
      }
      setData(body);
    } catch (generateError) {
      setError(
        generateError instanceof Error
          ? generateError.message
          : 'Could not generate your referral link.'
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!data?.referralUrl) return;
    await navigator.clipboard.writeText(data.referralUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  if (!data && !error) {
    return (
      <SettingsCard>
        <div className="settings-row settings-note flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading your referral details…
        </div>
      </SettingsCard>
    );
  }

  return (
    <SettingsCard>
      <SettingsRow
        label="Your referral results"
        note="Each milestone is counted independently, once per referred person."
      >
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['People', data?.milestones.people ?? 0],
            ['Accounts', data?.milestones.accounts ?? 0],
            ['Directory', data?.milestones.directory ?? 0],
            ['Connectors', data?.milestones.connectors ?? 0],
          ].map(([label, value]) => (
            <div
              key={label}
              className="border-pana-ink/10 bg-pana-butter-2/40 rounded-xl border p-4"
            >
              <dt className="text-pana-ink/60 text-xs font-black tracking-wide uppercase">
                {label}
              </dt>
              <dd className="mt-2 text-3xl font-black tracking-tight">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </SettingsRow>

      <SettingsRow
        label="Your referral link"
        note="The link opens an invitation page. First-touch attribution is remembered for 30 days and becomes permanent when the person connects an account."
      >
        {data?.referralUrl ? (
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              className="settings-input min-w-0 flex-1"
              value={data.referralUrl}
              readOnly
              aria-label="Your directory referral link"
            />
            <button
              type="button"
              className="settings-btn shrink-0"
              onClick={copyLink}
            >
              {copied ? (
                <Check className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Copy className="h-4 w-4" aria-hidden="true" />
              )}
              {copied ? 'Copied' : 'Copy link'}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="settings-btn"
            disabled={busy}
            onClick={generateLink}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Link2 className="h-4 w-4" aria-hidden="true" />
            )}
            Generate my link
          </button>
        )}
        {error && (
          <p className="text-pana-red-deep mt-3 text-sm font-bold" role="alert">
            {error}
          </p>
        )}
      </SettingsRow>
    </SettingsCard>
  );
}
