'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { useSession } from '@/lib/auth-client';
import {
  isListingReviewState,
  type ListingReviewState,
} from '@/lib/listing-refresh';
import { listingReviewPath } from '@/lib/listing-url';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

export function ListingReviewConfirmation({
  profileId,
  name,
  publicPath,
  active,
  finish,
}: {
  profileId: string;
  name: string;
  publicPath: string;
  active: boolean;
  finish: boolean;
}) {
  const { data: session } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const client = useQueryClient();
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [restored, setRestored] = useState(false);
  const state = useQuery<ListingReviewState, Error>({
    queryKey: ['listing-review-state', profileId, session?.user?.id],
    enabled: Boolean(session?.user?.id),
    retry: false,
    staleTime: 0,
    queryFn: async () => {
      const response = await fetch(
        `/api/listings/review?profileId=${encodeURIComponent(profileId)}`,
        { cache: 'no-store' }
      );
      const data: unknown = await response.json();
      if (!response.ok || !isListingReviewState(data, profileId))
        throw new Error('Could not load the review status for this business.');
      return data;
    },
  });
  const confirmed =
    params?.get('confirmed') === '1' &&
    Boolean(state.data?.lastReviewedAt) &&
    !state.data?.cycle;

  async function submit(
    action: 'confirm' | 'stop_reminders' | 'allow_reminders'
  ) {
    if (!state.data || !session?.user?.id || saving) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/listings/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId,
          action,
          confirmed: checked,
          cycleId: state.data.cycle?.id ?? null,
          expectedOwnerId: session.user.id,
          expectedOwnerEmail: session.user.email,
        }),
      });
      const data = await response.json();
      if (
        !response.ok ||
        data.success !== true ||
        (action === 'confirm' && data.profileId !== profileId)
      ) {
        throw new Error(data.error || 'Could not save this review.');
      }
      if (action === 'confirm') {
        setRestored(data.restored === true);
        await client.invalidateQueries({ queryKey: ['profile'] });
        router.replace(
          `${listingReviewPath(profileId)}&complete=1&confirmed=1`
        );
      }
      await state.refetch();
    } catch (cause) {
      console.error('[listing-review] could not save confirmation');
      setError(
        cause instanceof Error ? cause.message : 'Could not save this review.'
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {state.data?.cycle && (
        <div className="border-pana-ink/10 rounded-2xl border p-4">
          <p className="font-bold">
            {state.data.cycle.state === 'paused'
              ? 'This listing is temporarily hidden because its review is overdue.'
              : state.data.cycle.state === 'held'
                ? 'Reminders are on hold. This hold does not count as ignoring the review.'
                : state.data.cycle.dueAt
                  ? `Confirm this listing by ${new Date(state.data.cycle.dueAt).toLocaleDateString()}.`
                  : 'The response window starts after the initial notice is successfully sent.'}
          </p>
          <p className="text-muted-foreground mt-2 text-sm">
            Signing in, claiming or opening a link does not confirm the business
            information. No private home address or invented ZIP is required.
          </p>
        </div>
      )}
      {finish && (
        <Card className="border-pana-indigo/20 rounded-2xl">
          <CardContent className="space-y-4 pt-6">
            {confirmed ? (
              <>
                <CheckCircle2
                  className="text-pana-indigo h-8 w-8"
                  aria-hidden="true"
                />
                <h2 className="text-xl font-extrabold">
                  Your review is complete
                </h2>
                <p role="status">
                  Your confirmation was saved. Review reminders have stopped for
                  this cycle.
                </p>
                {state.data?.lastReviewedAt && (
                  <p className="text-muted-foreground text-sm">
                    Last confirmed:{' '}
                    {new Date(state.data.lastReviewedAt).toLocaleString()}.
                  </p>
                )}
                <div className="flex flex-col gap-3 sm:flex-row">
                  {(active || restored) && (
                    <Button asChild className="rounded-full font-extrabold">
                      <Link href={publicPath}>View updated listing</Link>
                    </Button>
                  )}
                  <Button
                    asChild
                    variant="outline"
                    className="rounded-full font-bold"
                  >
                    <Link href={listingReviewPath(profileId)}>
                      Manage this business
                    </Link>
                  </Button>
                </div>
                {!active && !restored && (
                  <p>
                    This listing is not public. Staff decisions and manual
                    suspensions are separate from your saved review.
                  </p>
                )}
              </>
            ) : (
              <>
                <h2 className="text-xl font-extrabold">
                  Confirm your listing information
                </h2>
                <p>
                  Check the summary below for <strong>{name}</strong>. Anything
                  you skipped stays unchanged. This final confirmation is what
                  completes the review and stops reminders.
                </p>
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="confirm-listing-information"
                    checked={checked}
                    onCheckedChange={(value) => setChecked(value === true)}
                    disabled={saving}
                  />
                  <Label htmlFor="confirm-listing-information">
                    I reviewed this business and confirm that the listed
                    information is current.
                  </Label>
                </div>
                <Button
                  onClick={() => submit('confirm')}
                  disabled={!checked || saving || !state.data || state.isError}
                  className="w-full rounded-full font-extrabold"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Confirm business information'
                  )}
                </Button>
                <p className="text-muted-foreground text-sm">
                  An overdue-review pause can be lifted after this confirmation.
                  It never overrides a staff decline or manual suspension.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      )}
      {state.isLoading && <p role="status">Loading review status...</p>}
      {(error || state.error) && (
        <p role="alert" className="text-destructive">
          {error || state.error?.message}
        </p>
      )}
      {error && (
        <Button
          variant="outline"
          onClick={() => window.location.reload()}
          disabled={saving}
        >
          Reload and confirm again
        </Button>
      )}
      {state.isError && (
        <Button variant="outline" onClick={() => state.refetch()}>
          Reload review status
        </Button>
      )}
      {state.data && (
        <div className="text-muted-foreground space-y-2 text-sm">
          {state.data.remindersOptedOut ? (
            <>
              <p>
                Listing-review reminders are opted out. You can still confirm
                the business without enabling email.
              </p>
              <Button
                variant="outline"
                disabled={saving}
                onClick={() => submit('allow_reminders')}
              >
                Allow future listing-review reminders
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => submit('stop_reminders')}
            >
              Stop listing-review reminders
            </Button>
          )}
        </div>
      )}
    </>
  );
}
