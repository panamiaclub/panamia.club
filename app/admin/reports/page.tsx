'use client';

import { useSession } from '@/lib/auth-client';
import { useAdminGate } from '@/components/Admin/gate';
import { AdminPageHeader } from '@/components/Admin/parts';
import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import PageMeta from '@/components/PageMeta';
import { standardizeDateTime } from '@/lib/standardized';
import { kindName } from '@/lib/nostr/kinds';
import { npubFromHex } from '@/lib/nostr/keys';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';

interface RelayReport {
  id: string;
  eventId: string;
  reporterPubkey: string;
  reporterName: string | null;
  targetPubkey: string | null;
  targetName: string | null;
  targetEventId: string | null;
  reportType: string | null;
  content: string;
  reportedContent: string | null;
  reportedKind: number | null;
  reportedAt: string;
  receivedAt: string;
  status: 'open' | 'actioned' | 'dismissed' | 'removed';
  moderationReason: string | null;
  // True when the reported content is gone from the relay — either this report
  // removed it, or a sibling report on the same event did.
  contentRemoved: boolean;
  // ISO timestamp of when the content was removed from the relay, or null if it
  // hasn't been. Used to warn that clients may still be serving a cached copy.
  contentRemovedAt: string | null;
}

// A removal is "recent" for 24h — long enough to cover client cache lag. Within
// that window we warn the operator that clients may still show a cached copy.
const REMOVAL_CATCHUP_MS = 24 * 60 * 60 * 1000;
function removedRecently(contentRemovedAt: string | null): boolean {
  if (!contentRemovedAt) return false;
  const t = new Date(contentRemovedAt).getTime();
  return Number.isFinite(t) && Date.now() - t < REMOVAL_CATCHUP_MS;
}

interface Pagination {
  page_number: number;
  total_pages: number;
}

// Full npub for a hex pubkey so the operator sees/copies the exact key; falls
// back to raw hex if npub encoding fails. Pubkeys and event ids are shown in
// full (no truncation) — see <Party> and the "Reported event" row.
const npubOrHex = (hex: string) => {
  try {
    return npubFromHex(hex);
  } catch {
    return hex;
  }
};

const statusBadge: Record<RelayReport['status'], string> = {
  open: 'bg-yellow-100 text-yellow-800',
  actioned: 'bg-green-100 text-green-800',
  dismissed: 'bg-gray-100 text-gray-500',
  removed: 'bg-red-100 text-red-800',
};

// "screenname (abcd1234…wxyz)" or, with no panamia profile, just the short key.
function Party({
  name,
  pubkey,
}: {
  name: string | null;
  pubkey: string | null;
}) {
  if (!pubkey) return <span className="text-muted-foreground">—</span>;
  return (
    <span>
      {name ? (
        <span className="font-medium">{name}</span>
      ) : (
        <span className="text-muted-foreground italic">no panamia profile</span>
      )}{' '}
      <code className="text-muted-foreground text-xs break-all">
        {npubOrHex(pubkey)}
      </code>
    </span>
  );
}

export default function AdminReportsPage() {
  const { data: session } = useSession();
  const { gate } = useAdminGate({ allow: 'moderator' });
  const [page_number, setPageNumber] = useState(1);
  const [reports, setReports] = useState<RelayReport[]>([]);
  const [pagination, setPagination] = useState({} as Pagination);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  // Per-report moderation reason drafts for the (non-revocable) remove action.
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    setLoadError(false);
    axios
      .get(`/api/admin/relayReports?page_number=${page_number}`, {
        headers: { Accept: 'application/json' },
      })
      .then((resp) => {
        setReports(resp.data.data);
        setPagination(resp.data.pagination);
        setLoaded(true);
      })
      .catch((error) => {
        // Ignore canceled/aborted requests (e.g. an in-flight fetch superseded
        // by a re-render) — don't wipe the list and flash "No reports."
        if (axios.isCancel(error) || error?.code === 'ERR_CANCELED') return;
        console.log(error);
        // Surface the failure instead of leaving the page wedged on "Loading…".
        // A cold-start request that 401s before the admin session is warm used
        // to stick here forever (only a remount, e.g. visiting another admin
        // page and coming back, would retry). Toast + an inline Retry instead.
        setLoadError(true);
        setLoaded(true);
        toast({
          title: 'Could not load reports',
          description: 'The request failed. Use Retry to try again.',
          variant: 'destructive',
        });
      });
  }, [page_number]);

  // Wait for the auth session before the first fetch so the request carries the
  // admin cookie — firing pre-session would 401 and wedge the page. Re-runs when
  // the session resolves or the page changes.
  useEffect(() => {
    if (!session?.user) return;
    load();
  }, [load, session?.user]);

  function updateStatus(id: string, status: RelayReport['status']) {
    axios
      .patch(
        '/api/admin/relayReports',
        { id, status },
        { headers: { 'Content-Type': 'application/json' } }
      )
      .then(() => load())
      .catch((error) => {
        console.log(error);
        toast({
          title: 'Update failed',
          description: 'The report status could not be changed. Try again.',
          variant: 'destructive',
        });
      });
  }

  function removeFromRelay(id: string, contentAlreadyRemoved: boolean) {
    const reason = (reasons[id] ?? '').trim();
    // The reason is only required for the content-removing action. A stray
    // report (content already gone) just deletes the leftover report event —
    // no reason, and no confirmation dialog; remove on click.
    if (!contentAlreadyRemoved && !reason) {
      toast({
        title: 'Moderation reason required',
        description: 'Enter a moderation reason before removing.',
        variant: 'destructive',
      });
      return;
    }
    if (
      !contentAlreadyRemoved &&
      !window.confirm(
        'Remove from relay? This permanently deletes the reported content and ' +
          'the report event from the relay and cannot be undone.'
      )
    ) {
      return;
    }
    axios
      .patch(
        '/api/admin/relayReports',
        { id, status: 'removed', reason },
        { headers: { 'Content-Type': 'application/json' } }
      )
      .then(() => load())
      .catch((error) => {
        console.log(error);
        toast({
          title: 'Removal failed',
          description:
            'The report was left unchanged. See console for details.',
          variant: 'destructive',
        });
      });
  }

  function reportCards() {
    return reports.map((item) => (
      <Card key={item.id}>
        <CardContent className="p-5">
          <div className="space-y-4">
            {/* Header: status pill + type + timestamps */}
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide uppercase ${statusBadge[item.status]}`}
              >
                {item.status}
              </span>
              <span className="text-base font-semibold capitalize">
                {item.reportType ?? 'unspecified'}
              </span>
              <span className="text-muted-foreground ml-auto text-xs">
                Reported {standardizeDateTime(new Date(item.reportedAt))}
              </span>
            </div>

            {/* Who reported whom */}
            <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              <div>
                <span className="font-semibold">Reporter:</span>{' '}
                <Party name={item.reporterName} pubkey={item.reporterPubkey} />
              </div>
              <div>
                <span className="font-semibold">Target account:</span>{' '}
                <Party name={item.targetName} pubkey={item.targetPubkey} />
              </div>
              <div>
                <span className="font-semibold">Reported event:</span>{' '}
                {item.targetEventId ? (
                  <>
                    <code className="text-muted-foreground text-xs break-all">
                      {item.targetEventId}
                    </code>
                    {item.reportedKind != null && (
                      <span className="text-muted-foreground ml-1">
                        · {kindName(item.reportedKind)}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </div>
            </div>

            {/* Reporter's freeform context */}
            {item.content && (
              <div className="text-sm">
                <span className="font-semibold">Reporter&rsquo;s context:</span>{' '}
                {item.content}
              </div>
            )}

            {/* Snapshot of the reported original content */}
            {item.reportedContent && (
              <div className="text-sm">
                <div className="mb-1 font-semibold">
                  Reported content
                  {item.reportedKind != null && (
                    <span className="text-muted-foreground font-normal">
                      {' '}
                      ({kindName(item.reportedKind)})
                    </span>
                  )}
                  :
                </div>
                <blockquote className="bg-muted/50 text-muted-foreground rounded-md border-l-4 border-pink-400 px-4 py-2 whitespace-pre-wrap">
                  {item.reportedContent}
                </blockquote>
              </div>
            )}

            {/* Actions. Three cases:
                1. status 'removed' — this report's event is gone too: terminal.
                2. content removed by a sibling — offer "Remove report from relay".
                3. normal — status flips + "Remove from Relay". */}
            {item.status === 'removed' ? (
              <div className="rounded-md border-l-4 border-red-400 bg-red-50 px-4 py-2 text-sm text-red-800">
                <span className="font-semibold">
                  {removedRecently(item.contentRemovedAt)
                    ? 'Removed from relay, clients might need a few hours to catch up.'
                    : 'Removed from relay.'}
                </span>{' '}
                {item.moderationReason ? (
                  <>Reason: {item.moderationReason}</>
                ) : (
                  <span className="italic">
                    content previously removed from relay by moderation event
                  </span>
                )}
              </div>
            ) : (
              <div className="space-y-2 pt-1">
                {item.contentRemoved && (
                  <div className="rounded-md border-l-4 border-red-400 bg-red-50 px-4 py-2 text-sm text-red-800">
                    <span className="font-semibold">
                      {removedRecently(item.contentRemovedAt)
                        ? 'Removed from relay, clients might need a few hours to catch up.'
                        : 'Removed from relay.'}
                    </span>{' '}
                    The reported content was taken down by another report; this
                    report event is still on the relay.
                  </div>
                )}
                {!item.contentRemoved && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={item.status === 'actioned'}
                      onClick={() => updateStatus(item.id, 'actioned')}
                    >
                      Mark actioned
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={item.status === 'dismissed'}
                      onClick={() => updateStatus(item.id, 'dismissed')}
                    >
                      Dismiss
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={item.status === 'open'}
                      onClick={() => updateStatus(item.id, 'open')}
                    >
                      Reopen
                    </Button>
                    <span className="text-muted-foreground ml-auto text-xs">
                      received {standardizeDateTime(new Date(item.receivedAt))}
                    </span>
                  </div>
                )}
                {/* Removal. Content removal requires a recorded reason; a stray
                    report (content already gone) removes the leftover report
                    event with no reason and no confirm. */}
                <div className="flex flex-wrap items-center gap-2">
                  {!item.contentRemoved && (
                    <input
                      type="text"
                      value={reasons[item.id] ?? ''}
                      onChange={(e) =>
                        setReasons((r) => ({ ...r, [item.id]: e.target.value }))
                      }
                      placeholder="Moderation reason (required to remove)"
                      className="border-input bg-background min-w-[16rem] flex-1 rounded-md border px-3 py-1.5 text-sm"
                    />
                  )}
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() =>
                      removeFromRelay(item.id, item.contentRemoved)
                    }
                  >
                    {item.contentRemoved
                      ? 'Remove report from relay'
                      : 'Remove from Relay'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    ));
  }

  if (gate) return gate;

  return (
    <>
      <PageMeta title="Abuse Reports | Admin" desc="" />
      <div>
        <AdminPageHeader
          eyebrow="Moderation"
          title="Abuse reports"
          description={
            <p>
              Review reports from the social relay, document decisions, and
              remove content when a policy violation is confirmed.
            </p>
          }
        />
        <div className="space-y-6">
          <div className="space-y-4">
            {!loaded ? (
              <p className="text-muted-foreground">Loading…</p>
            ) : loadError ? (
              <div className="flex items-center gap-3">
                <p className="text-muted-foreground">
                  Couldn&rsquo;t load reports.
                </p>
                <Button size="sm" variant="outline" onClick={() => load()}>
                  Retry
                </Button>
              </div>
            ) : reports.length === 0 ? (
              <p className="text-muted-foreground">No reports.</p>
            ) : (
              reportCards()
            )}
          </div>
          <div className="flex items-center gap-4">
            <small>Page: {pagination?.page_number}</small>
            <Button
              onClick={() => setPageNumber(page_number - 1)}
              disabled={pagination?.page_number == 1}
            >
              Previous
            </Button>
            <Button
              onClick={() => setPageNumber(page_number + 1)}
              disabled={pagination?.page_number == pagination?.total_pages}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
