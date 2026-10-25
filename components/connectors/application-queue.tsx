'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ADMIN_CHROME } from '@/lib/admin/theme';
import { getPod } from '@/lib/connectors/model';
import type { HouseId, PodId } from '@/lib/connectors/model';
import { ConnectorHousePills } from '@/components/connectors/dashboard-parts';

/**
 * The queue of people waiting to be let into the Connectors programme.
 *
 * This is the other half of the gate in `app/api/connectors/join/route.ts`.
 * Applying writes a `pending` record; nothing turns it into membership except
 * somebody clicking Accept here.
 *
 * ## Why this is real when the rest of the page is not
 *
 * The dashboard below it still renders fixtures and says so. This panel reads
 * live rows and writes real decisions, which is why it sits above the mock
 * bar rather than under it — a staff member needs to know which of the things
 * on this screen actually does something, and "everything below is a fixture"
 * would be a lie told over a working Accept button.
 *
 * ## Why the row disappears on success
 *
 * Decided applications are not shown. Keeping them with a greyed-out label
 * would turn a queue you work to empty into a list that only grows, and the
 * record of who decided what is on the profile — `decidedBy` and `decidedAt`
 * — rather than in this panel's memory.
 *
 * The row is removed locally *and* `router.refresh()` is called: the local
 * removal is so the button does not sit there looking unclicked while the
 * server round-trips, and the refresh is because the pod and house tallies
 * elsewhere on the page are now wrong.
 */

export interface PendingApplication {
  profileId: string;
  displayName: string;
  email: string;
  pod: PodId;
  houses: HouseId[];
  majorHouse: HouseId | null;
  minorHouse: HouseId | null;
  bring: string;
  appliedAt: string;
}

export function ApplicationQueue({
  applications,
}: {
  applications: PendingApplication[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState(applications);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(profileId: string, decision: 'approve' | 'decline') {
    setBusy(profileId);
    setError(null);

    try {
      const res = await fetch(
        `/api/admin/connectors/${profileId}/${decision}`,
        { method: 'POST' }
      );
      const data = (await res.json()) as { success: boolean; error?: string };

      if (!res.ok || !data.success) {
        setError(data.error ?? 'Could not save that decision.');
        setBusy(null);
        return;
      }

      setRows((current) => current.filter((r) => r.profileId !== profileId));
      setBusy(null);
      router.refresh();
    } catch {
      setError('Could not reach the server. Try again.');
      setBusy(null);
    }
  }

  if (rows.length === 0) {
    return (
      <p className="text-pana-ink/60 text-sm leading-relaxed">
        Nobody is waiting. New applications show up here as they come in.
      </p>
    );
  }

  return (
    <>
      <p className="text-pana-ink/70 mb-4 text-sm leading-relaxed">
        {rows.length === 1
          ? 'One person is waiting to hear back.'
          : `${rows.length} people are waiting to hear back.`}{' '}
        Accepting someone puts them in their pod and opens their HQ. Oldest
        application first.
      </p>

      {error && (
        <p
          role="alert"
          className="border-pana-ink bg-pana-butter text-pana-ink mb-4 rounded-lg border-2 px-4 py-3 text-sm font-bold"
        >
          {error}
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {rows.map((row) => (
          <li
            key={row.profileId}
            className="border-pana-ink/20 flex flex-wrap items-start justify-between gap-x-6 gap-y-3 rounded-xl border-2 p-4"
          >
            <div className="min-w-0">
              <p className="text-base leading-tight font-extrabold">
                {row.displayName}
              </p>
              <p className="text-pana-ink/60 mt-0.5 text-sm break-words">
                {row.email}
              </p>
              <p className="mt-2 text-sm">
                <span className="font-bold">{getPod(row.pod).name}</span>
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <ConnectorHousePills
                  houses={row.houses}
                  majorHouse={row.majorHouse}
                  minorHouse={row.minorHouse}
                />
              </div>
              {row.bring && (
                <p className="text-pana-ink/80 mt-2 max-w-prose text-sm leading-snug">
                  &ldquo;{row.bring}&rdquo;
                </p>
              )}
              <p className="text-pana-ink/50 mt-2 text-xs">
                Applied <AppliedAt iso={row.appliedAt} />
              </p>
            </div>

            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                disabled={busy === row.profileId}
                onClick={() => decide(row.profileId, 'approve')}
                className="border-pana-ink bg-pana-ink text-pana-cream rounded-full border-2 px-4 py-2 text-sm font-extrabold disabled:opacity-60"
              >
                {busy === row.profileId ? 'Saving…' : 'Accept'}
              </button>
              <button
                type="button"
                disabled={busy === row.profileId}
                onClick={() => decide(row.profileId, 'decline')}
                className={`rounded-full border-2 px-4 py-2 text-sm font-extrabold ${ADMIN_CHROME.ACCENT} border-pana-ink/40 disabled:opacity-60`}
              >
                Decline
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Where the programme is, for the one render that cannot ask the reader. */
const PROGRAMME_TZ = 'America/New_York';

/**
 * A date a human can act on.
 *
 * The staff member working the queue and the Worker rendering the page are
 * rarely in the same timezone, and "applied 3 October" is only useful if it
 * means October the 3rd where the reader is.
 *
 * The catch is that a `'use client'` component still renders once on the
 * server, where the reader's timezone is not knowable. Asking for it anyway
 * gets the Worker's — UTC — so a late-evening application renders as one date
 * on the server and the next date in Miami, the two passes disagree, and
 * hydration tears on exactly the rows staff are meant to be reading. It only
 * shows up once somebody has actually applied, which is the worst time to
 * find out.
 *
 * So the first pass is pinned: the programme's own timezone and a fixed
 * locale, identical on both sides. Once the component is really in the
 * reader's browser it re-renders in the reader's own settings, which is what
 * was wanted in the first place.
 */
function AppliedAt({ iso }: { iso: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return <>{formatApplied(iso, mounted)}</>;
}

function formatApplied(iso: string, local: boolean): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'at an unknown time';

  const options: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  };

  return local
    ? date.toLocaleDateString(undefined, options)
    : date.toLocaleDateString('en-US', { ...options, timeZone: PROGRAMME_TZ });
}
