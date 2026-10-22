'use client';

import { useCallback, useEffect, useState } from 'react';

import { useAdminGate } from '@/components/Admin/gate';
import { AdminPageHeader, Panel, StatBand } from '@/components/Admin/parts';
import PageMeta from '@/components/PageMeta';

interface Referrer {
  rank: number;
  userId: string;
  name: string | null;
  screenname: string | null;
  email: string;
  people: number;
  accounts: number;
  directory: number;
  connectors: number;
  lastReferralAt: string | null;
}

interface ReferralResponse {
  totals: {
    people: number;
    accounts: number;
    directory: number;
    connectors: number;
  };
  referrers: Referrer[];
}

export default function AdminReferralsPage() {
  const { allowed, gate } = useAdminGate();
  const [data, setData] = useState<ReferralResponse | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!allowed) return;
    setError('');
    try {
      const response = await fetch('/api/admin/referrals');
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || 'Could not load referral results.');
      }
      setData(body);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Could not load referral results.'
      );
    }
  }, [allowed]);

  useEffect(() => {
    load();
  }, [load]);

  if (gate) return gate;

  const leader = data?.referrers[0];

  return (
    <>
      <PageMeta title="Community referrals | Pana Admin" desc="" />
      <AdminPageHeader
        eyebrow="Community"
        title="Referral leaderboard"
        description={
          <p>
            One invitation tracks account creation, directory applications, and
            accepted Community Connectors as separate milestones.
          </p>
        }
      />

      <div className="space-y-6">
        <StatBand
          stats={[
            {
              label: 'People referred',
              value: String(data?.totals.people ?? 0),
              note: 'Unique referral journeys with at least one milestone',
            },
            {
              label: 'Accounts created',
              value: String(data?.totals.accounts ?? 0),
              note: 'New Pana accounts created through referral journeys',
            },
            {
              label: 'Directory applications',
              value: String(data?.totals.directory ?? 0),
              note: 'Submitted directory applications',
            },
            {
              label: 'Connectors',
              value: String(data?.totals.connectors ?? 0),
              note: 'Applicants accepted as active Community Connectors',
            },
            {
              label: 'Current leader',
              value: leader ? String(leader.people) : '0',
              note: leader
                ? leader.screenname
                  ? `@${leader.screenname}`
                  : leader.name || leader.email
                : 'No referral milestones yet',
            },
          ]}
        />

        <Panel title="Rankings">
          {error ? (
            <div className="space-y-3" role="alert">
              <p className="text-pana-red-deep text-sm font-bold">{error}</p>
              <button
                type="button"
                className="rounded-lg border px-3 py-2 text-sm font-bold"
                onClick={load}
              >
                Try again
              </button>
            </div>
          ) : !data ? (
            <p className="text-pana-ink/60 text-sm font-bold">Loading…</p>
          ) : data.referrers.length === 0 ? (
            <p className="text-pana-ink/60 text-sm">
              No referral milestones have been attributed yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[58rem] text-left text-sm">
                <thead>
                  <tr className="border-pana-ink/10 border-b">
                    <th className="px-3 py-3 font-black">Rank</th>
                    <th className="px-3 py-3 font-black">Pana</th>
                    <th className="px-3 py-3 font-black">People</th>
                    <th className="px-3 py-3 font-black">Accounts</th>
                    <th className="px-3 py-3 font-black">Directory</th>
                    <th className="px-3 py-3 font-black">Connectors</th>
                    <th className="px-3 py-3 font-black">Most recent</th>
                  </tr>
                </thead>
                <tbody>
                  {data.referrers.map((referrer) => (
                    <tr
                      key={referrer.userId}
                      className="border-pana-ink/10 border-b last:border-0"
                    >
                      <td className="px-3 py-4 text-lg font-black">
                        {referrer.rank}
                      </td>
                      <td className="px-3 py-4">
                        <p className="font-extrabold">
                          {referrer.screenname
                            ? `@${referrer.screenname}`
                            : referrer.name || referrer.email}
                        </p>
                        <p className="text-pana-ink/55 text-xs">
                          {referrer.email}
                        </p>
                      </td>
                      <td className="px-3 py-4 text-lg font-black">
                        {referrer.people}
                      </td>
                      <td className="px-3 py-4 text-lg font-black">
                        {referrer.accounts}
                      </td>
                      <td className="px-3 py-4 text-lg font-black">
                        {referrer.directory}
                      </td>
                      <td className="px-3 py-4 text-lg font-black">
                        {referrer.connectors}
                      </td>
                      <td className="px-3 py-4">
                        {referrer.lastReferralAt
                          ? new Intl.DateTimeFormat(undefined, {
                              dateStyle: 'medium',
                            }).format(new Date(referrer.lastReferralAt))
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
