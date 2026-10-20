'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';

import { useAdminGate } from '@/components/Admin/gate';
import { AdminEyebrow } from '@/components/Admin/eyebrow';
import { Panel, StatBand } from '@/components/Admin/parts';
import PageMeta from '@/components/PageMeta';
import { ADMIN_CHROME } from '@/lib/admin/theme';
import {
  FLAG_LABEL,
  FLAG_NOTE,
  REVIEW_SLA_DAYS,
  type DecidedListing,
  type QueueListing,
  daysWaiting,
  listingStats,
  queueOrder,
  waitLabel,
} from '@/lib/admin/listings';

/**
 * The directory listing approval queue.
 *
 * ## What this replaces
 *
 * Nothing, which is the point. Before this screen an application was approved
 * or declined by clicking a link in an email: `/api/admin/profile/action`
 * reads `?email=`, `?access=` and `?action=` off the URL and posts the
 * decision. It works, and it has one hole you cannot patch from inside it —
 * there is no list. An admin could only act on an application somebody still
 * had the email for. Delete the email and the business waits forever, and
 * nobody could tell you how many businesses that had happened to.
 *
 * So the first job of this screen is not the buttons. It is the count at the
 * top of the page.
 *
 * That email link still works, and deliberately so — staff answer applications
 * from phones that are not signed in. Both doors now call the same write in
 * `lib/server/listing-decision`, so they cannot drift into disagreeing about
 * what approving a business does.
 *
 * ## Oldest first, and no way to change that
 *
 * `queueOrder()` sorts by submission date and nothing on this page re-sorts
 * it. The filters narrow the queue; they never reorder it. A queue you can
 * re-sort is a list, and a list is where the easy applications get done and
 * the awkward one from five weeks ago stays at the bottom. If something
 * genuinely needs to jump the queue, that is a conversation, not a column
 * header.
 *
 * ## Flags are notes, not verdicts
 *
 * A flag says "look at this before you decide" and never "decline this". They
 * are computed from the application and every one of them has a legitimate
 * explanation. See `FLAG_NOTE` in `lib/admin/listings` for what each is
 * actually claiming, and the note there on the one flag that was cut for
 * being unanswerable from the data.
 *
 * ## What the filters are, and are not
 *
 * County and category are not here. `/form/get-listed` writes neither column —
 * they are NULL on every intake row — so a county filter would be a control
 * over data that does not exist. What intake does capture is the category
 * labels as text, so the tag filter below is built from the tags actually
 * present in the queue rather than from a fixed list.
 */

interface QueueResponse {
  pending: QueueListing[];
  decided: DecidedListing[];
}

type FlagFilter = 'all' | 'flagged' | 'unflagged' | 'unclaimed';

const FLAG_FILTERS: { value: FlagFilter; label: string }[] = [
  { value: 'all', label: 'Everything' },
  { value: 'flagged', label: 'Flagged only' },
  { value: 'unflagged', label: 'Unflagged only' },
  { value: 'unclaimed', label: 'Unclaimed only' },
];

export default function AdminListingsPage() {
  const { gate } = useAdminGate();

  const [pending, setPending] = useState<QueueListing[]>([]);
  const [decided, setDecided] = useState<DecidedListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();

  const [query, setQuery] = useState('');
  const [flagFilter, setFlagFilter] = useState<FlagFilter>('all');
  const [tagFilter, setTagFilter] = useState('');

  // Keyed by listing id. A decision is two writes away from irreversible —
  // it flips a public row and mails the owner — so the row it belongs to is
  // locked while it is in flight rather than the whole page.
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string>();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(undefined);
    try {
      const { data } = await axios.get<QueueResponse>('/api/admin/listings');
      setPending(data.pending ?? []);
      setDecided(data.decided ?? []);
    } catch {
      setLoadError(
        'Could not load the review queue. Reload the page to try again.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const decide = useCallback(
    async (listing: QueueListing, decision: 'approve' | 'decline', reason?: string) => {
      setBusyId(listing.id);
      setActionError(undefined);
      try {
        const { data } = await axios.post<{
          success: true;
          mailFailed?: boolean;
        }>(`/api/admin/listings/${listing.id}/decide`, {
          decision,
          reason,
        });
        setPending((rows) => rows.filter((row) => row.id !== listing.id));
        setDecided((rows) => [
          {
            id: listing.id,
            name: listing.name,
            locality: listing.locality || listing.region,
            decidedAt: new Date().toISOString(),
            decision: decision === 'approve' ? 'approved' : 'declined',
            decidedBy: 'you',
            reason: reason ?? '',
          },
          ...rows,
        ]);
        if (data.mailFailed) {
          setActionError(
            `${listing.name} was ${
              decision === 'approve' ? 'approved' : 'declined'
            }, but the notification email could not be sent.`
          );
        }
      } catch (error) {
        const message =
          axios.isAxiosError(error) && error.response?.data?.error
            ? String(error.response.data.error)
            : 'Could not record that decision.';
        setActionError(message);
        // A 409 means somebody else answered it while this page was open. The
        // queue on screen is wrong, not just this row, so refetch the lot.
        if (axios.isAxiosError(error) && error.response?.status === 409) {
          load();
        }
      } finally {
        setBusyId(null);
      }
    },
    [load]
  );

  const allTags = useMemo(() => {
    const seen = new Set<string>();
    for (const row of pending) for (const tag of row.tags) seen.add(tag);
    return [...seen].sort();
  }, [pending]);

  const queue = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return queueOrder(pending).filter((row) => {
      if (needle && !row.name.toLowerCase().includes(needle)) return false;
      if (tagFilter && !row.tags.includes(tagFilter)) return false;
      if (flagFilter === 'flagged' && row.flags.length === 0) return false;
      if (flagFilter === 'unflagged' && row.flags.length > 0) return false;
      if (flagFilter === 'unclaimed' && row.pendingOwnerEmail) return false;
      return true;
    });
  }, [pending, query, tagFilter, flagFilter]);

  if (gate) return gate;

  const filtered = queue.length !== pending.length;

  return (
    <>
      <PageMeta title="Directory listings | Pana Admin" desc="" />

      <header className="pb-6">
        <AdminEyebrow>Directory</AdminEyebrow>
        <h1 className="mt-2 text-4xl font-extrabold leading-tight sm:text-5xl">
          Directory listings
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-pana-ink/70">
          Applications to the directory that have not been answered yet. Oldest
          first, because the oldest one is the one somebody has been waiting on.
        </p>
      </header>

      <div className="flex flex-col gap-6">
        <StatBand stats={listingStats(pending)} />

        {/* The honest note about why this page exists. Sits under the band
          * rather than above it so the numbers land first — the numbers are
          * the argument and this is the explanation of it. */}
        <section
          className={`rounded-xl border-2 border-dashed ${ADMIN_CHROME.BORDER} bg-pana-cream p-5`}
        >
          <h2 className="text-sm font-extrabold uppercase tracking-wide">
            Why some of these are a month old
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-pana-ink/70">
            Until this screen, an application could only be answered by clicking
            a link in the email it generated. That link still works and still
            posts to{' '}
            <code className="text-pana-ink/60">/api/admin/profile/action</code> —
            staff answer applications from phones that are not signed in, and
            taking that away would cost more than it saved. What did not exist
            was any way to see what was waiting, so an application whose email
            got buried had nothing left pointing at it. Everything below was
            found by reading the table, not the inbox.
          </p>
        </section>

        {loadError && (
          <p className="rounded-xl border-2 border-pana-red/50 bg-white p-4 text-sm font-bold text-pana-ink">
            {loadError}
          </p>
        )}

        <Panel
          title={
            loading
              ? 'Waiting'
              : `Waiting — ${filtered ? `${queue.length} of ${pending.length}` : pending.length}`
          }
          className="overflow-visible"
        >
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-extrabold uppercase tracking-wider text-pana-ink/60">
                  Search
                </span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Listing name"
                  className={`rounded-lg border-2 ${ADMIN_CHROME.BORDER} bg-white px-3 py-2 text-sm`}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-extrabold uppercase tracking-wider text-pana-ink/60">
                  Category
                </span>
                <select
                  value={tagFilter}
                  onChange={(event) => setTagFilter(event.target.value)}
                  className={`rounded-lg border-2 ${ADMIN_CHROME.BORDER} bg-white px-3 py-2 text-sm`}
                >
                  <option value="">All categories</option>
                  {allTags.map((tag) => (
                    <option key={tag} value={tag}>
                      {tag}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-extrabold uppercase tracking-wider text-pana-ink/60">
                  Flagged
                </span>
                <select
                  value={flagFilter}
                  onChange={(event) =>
                    setFlagFilter(event.target.value as FlagFilter)
                  }
                  className={`rounded-lg border-2 ${ADMIN_CHROME.BORDER} bg-white px-3 py-2 text-sm`}
                >
                  {FLAG_FILTERS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="text-xs leading-relaxed text-pana-ink/60">
              Filters narrow the queue. They do not reorder it — see the note in
              the source for why nothing here sorts.
            </p>
          </div>

          {actionError && (
            <p className="mt-4 rounded-lg border-2 border-pana-red/50 px-4 py-3 text-sm font-bold">
              {actionError}
            </p>
          )}

          {loading ? (
            <p className="mt-5 text-sm text-pana-ink/60">Reading the table…</p>
          ) : queue.length === 0 ? (
            <p className="mt-5 text-sm leading-relaxed text-pana-ink/70">
              {pending.length === 0
                ? 'Nothing is waiting. Every application has been answered.'
                : 'No application matches those filters. Clear them to see the rest of the queue.'}
            </p>
          ) : (
            <ul className="mt-5 flex flex-col gap-4">
              {queue.map((listing) => (
                <ListingRow
                  key={listing.id}
                  listing={listing}
                  busy={busyId === listing.id}
                  disabled={busyId !== null && busyId !== listing.id}
                  onDecide={decide}
                />
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Recently decided">
          <p className="mb-4 text-sm leading-relaxed text-pana-ink/70">
            The last few answers, so somebody picking up the queue can see what
            has already been handled and roughly where the line is being drawn.
            Decisions made here are attributed; the ones answered from an email
            link cannot be, because that link has no session behind it.
          </p>

          {decided.length === 0 ? (
            <p className="text-sm text-pana-ink/60">
              {loading ? 'Reading the table…' : 'Nothing has been decided yet.'}
            </p>
          ) : (
            <ul
              className={`divide-y-2 ${ADMIN_CHROME.DIVIDE} border-t-2 ${ADMIN_CHROME.RULE}`}
            >
              {decided.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:gap-4"
                >
                  <span
                    className={`w-24 shrink-0 text-xs font-extrabold uppercase tracking-wider ${
                      row.decision === 'approved'
                        ? ADMIN_CHROME.ACCENT
                        : 'text-pana-ink/50'
                    }`}
                  >
                    {row.decision}
                  </span>
                  <span className="min-w-[12rem] font-bold leading-snug">
                    {row.name}
                    {row.locality && (
                      <span className="font-normal text-pana-ink/60">
                        {' '}
                        · {row.locality}
                      </span>
                    )}
                  </span>
                  <span className="flex-1 text-sm leading-relaxed text-pana-ink/70">
                    {row.reason ||
                      (row.decision === 'approved'
                        ? 'Published to the directory.'
                        : 'No reason recorded.')}
                  </span>
                  <span className="text-xs text-pana-ink/50">
                    {row.decidedAt
                      ? `${waitLabel(daysWaiting(row.decidedAt))} ago`
                      : 'date not recorded'}
                    {row.decidedBy ? ` · ${row.decidedBy}` : ' · from an email link'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}

/**
 * One application, expanded.
 *
 * Not a table row. The six columns that would fit cannot hold the thing a
 * reviewer actually needs — the description the business wrote about itself —
 * and a queue that makes you open each item to read it is a queue that gets
 * skimmed instead of read. So everything needed to decide is on the card, and
 * the decision buttons sit next to it rather than a screen away.
 */
function ListingRow({
  listing,
  busy,
  disabled,
  onDecide,
}: {
  listing: QueueListing;
  busy: boolean;
  disabled: boolean;
  onDecide: (
    listing: QueueListing,
    decision: 'approve' | 'decline',
    reason?: string
  ) => void;
}) {
  const days = daysWaiting(listing.submittedAt);
  const overdue = days > REVIEW_SLA_DAYS;

  // Declining asks for a reason before it commits. Not because the reason is
  // mailed anywhere — the decline template takes only a name — but because the
  // next person to read this queue deserves to know why the line was drawn
  // where it was, and the moment to capture that is while somebody still knows.
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');

  const locale = [listing.locality, listing.region].filter(Boolean).join(', ');

  return (
    <li className="rounded-xl border-2 border-pana-ink p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-[16rem] flex-1">
          <h3 className="text-xl font-extrabold leading-tight">
            {listing.name}
          </h3>
          <p className="mt-1 text-sm text-pana-ink/70">
            {listing.fiveWords || 'No summary given'}
            {locale && <span className="text-pana-ink/60"> · {locale}</span>}
          </p>
        </div>

        <div className="text-right">
          {/* Ink at 70% rather than red. Red would read as "this one is bad"
            * when all it means is "this one has been ignored longest", and the
            * business is not the party at fault. */}
          <p
            className={`text-sm font-extrabold ${
              overdue ? ADMIN_CHROME.ACCENT : 'text-pana-ink/70'
            }`}
          >
            Waiting {waitLabel(days)}
            {overdue ? ' · over the window' : ''}
          </p>
          <p className="mt-0.5 text-xs text-pana-ink/50">
            {listing.pendingOwnerEmail
              ? `Claimed by ${listing.pendingOwnerEmail}`
              : 'Nobody has claimed this listing'}
          </p>
        </div>
      </div>

      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-pana-ink/80">
        {listing.details || 'The application left the description blank.'}
      </p>

      {listing.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {listing.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border-2 border-pana-ink/30 px-2.5 py-0.5 text-xs font-bold text-pana-ink/70"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-pana-ink/60">
        <div className="flex gap-1.5">
          <dt className="font-bold">Contact</dt>
          <dd>{listing.email}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="font-bold">Instagram</dt>
          <dd>{listing.instagram || 'none given'}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="font-bold">Website</dt>
          <dd>{listing.website || 'none given'}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="font-bold">Listing type</dt>
          <dd>{listing.accountType}</dd>
        </div>
      </dl>

      {listing.flags.length > 0 && (
        <ul className="mt-4 flex flex-col gap-1.5 border-t-2 border-dashed border-pana-ink/20 pt-3">
          {listing.flags.map((flag) => (
            <li
              key={flag}
              className="flex flex-wrap gap-x-2 text-xs leading-relaxed"
            >
              <span
                className={`font-extrabold uppercase tracking-wider ${ADMIN_CHROME.ACCENT}`}
              >
                {FLAG_LABEL[flag]}
              </span>
              <span className="text-pana-ink/60">{FLAG_NOTE[flag]}</span>
            </li>
          ))}
        </ul>
      )}

      {declining ? (
        <div className="mt-4 flex flex-col gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-extrabold uppercase tracking-wider text-pana-ink/60">
              Why this one is being declined
            </span>
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Kept for the next reviewer. Not sent to the business."
              className={`rounded-lg border-2 ${ADMIN_CHROME.BORDER} bg-white px-3 py-2 text-sm`}
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <ActionButton
              tone="danger"
              disabled={busy || disabled}
              onClick={() => onDecide(listing, 'decline', reason.trim())}
            >
              {busy ? 'Declining…' : 'Confirm decline'}
            </ActionButton>
            <ActionButton
              tone="quiet"
              disabled={busy}
              onClick={() => {
                setDeclining(false);
                setReason('');
              }}
            >
              Cancel
            </ActionButton>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <ActionButton
            disabled={busy || disabled}
            onClick={() => onDecide(listing, 'approve')}
          >
            {busy ? 'Publishing…' : 'Approve and publish'}
          </ActionButton>
          <ActionButton
            tone="danger"
            disabled={busy || disabled}
            onClick={() => setDeclining(true)}
          >
            Decline
          </ActionButton>
        </div>
      )}
    </li>
  );
}

/**
 * `danger` is spent on exactly one control per card.
 *
 * Declining is the only genuinely irreversible thing here — it mails the
 * business owner — so it is the only thing that gets the red border. The label
 * stays ink because red on this surface measures 3.86, which fails body copy;
 * only the border carries the colour.
 */
function ActionButton({
  children,
  onClick,
  disabled,
  tone = 'primary',
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'primary' | 'danger' | 'quiet';
}) {
  const toneClass =
    tone === 'primary'
      ? 'border-pana-ink bg-pana-ink text-pana-cream hover:bg-pana-ink/90'
      : tone === 'danger'
        ? 'border-pana-red text-pana-ink hover:bg-pana-red/10'
        : 'border-pana-ink/30 text-pana-ink/70 hover:bg-pana-ink/5';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg border-2 px-4 py-2 text-sm font-extrabold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${toneClass}`}
    >
      {children}
    </button>
  );
}
