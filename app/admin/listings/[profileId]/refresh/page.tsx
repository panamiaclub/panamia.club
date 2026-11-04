'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useSession } from '@/lib/auth-client';
import { useAdminGate } from '@/components/Admin/gate';
import { AdminPageHeader } from '@/components/Admin/parts';
import {
  isListingReviewState,
  type ListingReviewState,
} from '@/lib/listing-refresh';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

interface AdminState {
  profile: {
    id: string;
    name: string;
    active: boolean;
    lastReviewedAt: string | null;
  };
  cycle: ListingReviewState['cycle'];
  deliveries: {
    id: string;
    round: number;
    status: string;
    attemptedAt: string;
    sentAt: string | null;
    errorCode: string | null;
  }[];
}

function valid(value: unknown, id: string): value is AdminState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Record<string, unknown>;
  if (
    !state.profile ||
    typeof state.profile !== 'object' ||
    !Array.isArray(state.deliveries)
  )
    return false;
  const profile = state.profile as Record<string, unknown>;
  return (
    profile.id === id &&
    typeof profile.name === 'string' &&
    typeof profile.active === 'boolean' &&
    isListingReviewState(
      {
        profileId: id,
        lastReviewedAt: profile.lastReviewedAt,
        zipVerified: false,
        remindersOptedOut: false,
        cycle: state.cycle,
      },
      id
    )
  );
}

export default function ListingRefreshAdminPage() {
  const params = useParams<{ profileId: string }>();
  const profileId = params?.profileId;
  const { data: session, status } = useSession();
  const { gate } = useAdminGate();
  const [data, setData] = useState<AdminState | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [authorize, setAuthorize] = useState(false);
  const [risk, setRisk] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!profileId || status !== 'authenticated' || !session?.user?.isAdmin)
      return;
    const controller = new AbortController();
    setData(null);
    setError('');
    fetch(`/api/admin/listings/${encodeURIComponent(profileId)}/refresh`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const body: unknown = await response.json();
        if (!response.ok || !valid(body, profileId))
          throw new Error('Could not load this business review cycle.');
        if (!controller.signal.aborted) setData(body);
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : 'Could not load review status.'
          );
      });
    return () => controller.abort();
  }, [profileId, status, session?.user?.id, session?.user?.isAdmin, revision]);

  async function act(
    action: 'start' | 'hold' | 'cancel' | 'retry',
    reason = 'operator_hold'
  ) {
    if (!profileId || !data || !session?.user?.id || busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(
        `/api/admin/listings/${encodeURIComponent(profileId)}/refresh`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profileId,
            action,
            reason,
            expectedActorId: session.user.id,
            confirmed: action !== 'start' || authorize,
            acknowledgeResendRisk: risk,
          }),
        }
      );
      const body = await response.json();
      if (!response.ok || body.success !== true)
        throw new Error(body.error || 'Could not update the review cycle.');
      setRevision((value) => value + 1);
      setAuthorize(false);
      setRisk(false);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not update the review cycle.'
      );
    } finally {
      setBusy(false);
    }
  }

  if (gate) return gate;
  return (
    <>
      <AdminPageHeader
        eyebrow="Directory"
        title="Listing review reminders"
        description={
          <p>
            Enrollment is explicit. Opening this page sends nothing and changes
            no listing.
          </p>
        }
      />
      <Link href="/admin/listings" className="font-bold underline">
        Back to directory review
      </Link>
      {error && (
        <p role="alert" className="text-destructive mt-4">
          {error}
        </p>
      )}
      {!data ? (
        <p role="status">Loading review cycle...</p>
      ) : (
        <Card className="mt-6 rounded-2xl">
          <CardContent className="space-y-5 p-6">
            <h1 className="text-2xl font-black">{data.profile.name}</h1>
            <p>{data.profile.active ? 'Public listing' : 'Currently hidden'}</p>
            <p className="text-muted-foreground text-sm">
              The initial notice goes to the business inbox when unclaimed, or
              to its current managing accounts. Review confirmation stops the
              cycle. Missing ZIPs never cause a pause by themselves.
            </p>
            {data.cycle && (
              <>
                <p className="font-bold">Cycle status: {data.cycle.state}</p>
                <p>Weekly reminders sent: {data.cycle.reminderCount} of 4</p>
                {data.cycle.dueAt && (
                  <p>
                    Confirmation deadline:{' '}
                    {new Date(data.cycle.dueAt).toLocaleString()}
                  </p>
                )}
                {data.cycle.holdReason && (
                  <p role="status">
                    On hold: {data.cycle.holdReason}. Do not interpret delivery
                    problems or opt-outs as nonresponse.
                  </p>
                )}
              </>
            )}
            {!data.cycle ||
            ['completed', 'cancelled'].includes(data.cycle.state) ? (
              <>
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="authorize-review-cycle"
                    checked={authorize}
                    onCheckedChange={(value) => setAuthorize(value === true)}
                  />
                  <Label htmlFor="authorize-review-cycle">
                    I authorize the initial email, four weekly reminders, and a
                    recoverable overdue pause for this business after its 30-day
                    response window.
                  </Label>
                </div>
                <Button
                  onClick={() => act('start')}
                  disabled={!authorize || busy || !data.profile.active}
                  className="rounded-full font-extrabold"
                >
                  Start review reminder cycle
                </Button>
              </>
            ) : (
              <div className="flex flex-wrap gap-3">
                {['active', 'queued'].includes(data.cycle.state) && (
                  <>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => act('hold')}
                    >
                      Hold reminders
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => act('hold', 'bounced')}
                    >
                      Flag bounced delivery
                    </Button>
                  </>
                )}
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => act('cancel')}
                >
                  Cancel review cycle
                </Button>
              </div>
            )}
            {data.cycle?.state === 'held' && (
              <>
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="acknowledge-resend-risk"
                    checked={risk}
                    onCheckedChange={(value) => setRisk(value === true)}
                  />
                  <Label htmlFor="acknowledge-resend-risk">
                    I checked provider delivery records and accept the risk of a
                    duplicate message before retrying. Recipient opt-outs still
                    apply.
                  </Label>
                </div>
                <Button
                  variant="outline"
                  onClick={() => act('retry')}
                  disabled={!risk || busy}
                >
                  Retry held reminder
                </Button>
              </>
            )}
            <h2 className="text-lg font-extrabold">Delivery history</h2>
            {data.deliveries.length ? (
              <ul className="space-y-2">
                {data.deliveries.map((delivery) => (
                  <li
                    key={delivery.id}
                    className="rounded-xl border p-3 text-sm"
                  >
                    {delivery.round === 0
                      ? 'Initial notice'
                      : `Reminder ${delivery.round}`}
                    : <strong>{delivery.status}</strong>
                    {delivery.errorCode && ` (${delivery.errorCode})`}
                    <p className="text-muted-foreground break-all">
                      Reference: {delivery.id}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No delivery attempts recorded.</p>
            )}
            <p className="text-muted-foreground text-sm">
              Cancellation does not publish a hidden listing. Overdue
              restoration requires an authorized review; staff decisions remain
              authoritative.
            </p>
          </CardContent>
        </Card>
      )}
    </>
  );
}
