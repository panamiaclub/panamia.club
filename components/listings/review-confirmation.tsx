'use client';

import { useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react';
import { useSession } from '@/lib/auth-client';
import {
  isListingReviewState,
  type ListingReviewState,
} from '@/lib/listing-refresh';
import { listingReviewPath } from '@/lib/listing-url';
import {
  listingReviewFinishPath,
  listingReviewStepPath,
} from '@/lib/listing-review';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import styles from './review.module.css';

export function ListingReviewConfirmation({
  profileId,
  name,
  publicPath,
  active,
  finish,
  children,
}: {
  profileId: string;
  name: string;
  publicPath: string;
  active: boolean;
  finish: boolean;
  children?: ReactNode;
}) {
  const { data: session } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const client = useQueryClient();
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [locationError, setLocationError] = useState(false);
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
    state.isSuccess &&
    Boolean(state.data?.lastReviewedAt) &&
    state.data?.zipVerified === true &&
    !state.data?.cycle;

  async function submit(
    action: 'confirm' | 'stop_reminders' | 'allow_reminders'
  ) {
    if (!state.data || !session?.user?.id || saving) return;
    setSaving(true);
    setError('');
    setLocationError(false);
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
      const data: unknown = await response.json();
      if (
        !response.ok ||
        !data ||
        typeof data !== 'object' ||
        !('success' in data) ||
        data.success !== true ||
        (action === 'confirm' &&
          (!('profileId' in data) || data.profileId !== profileId))
      ) {
        setLocationError(
          Boolean(
            data &&
            typeof data === 'object' &&
            'field' in data &&
            data.field === 'zipcode' &&
            'step' in data &&
            data.step === 'address'
          )
        );
        throw new Error(
          data &&
            typeof data === 'object' &&
            'error' in data &&
            typeof data.error === 'string'
            ? data.error
            : 'Could not save this review.'
        );
      }
      if (action === 'confirm') {
        setRestored('restored' in data && data.restored === true);
        await client.invalidateQueries({ queryKey: ['profile'] });
        const current = new URL(window.location.href);
        if (
          current.pathname === '/listings/review' &&
          current.searchParams.get('id') === profileId &&
          current.searchParams.get('complete') === '1'
        ) {
          router.replace(`${listingReviewFinishPath(profileId)}&confirmed=1`);
        }
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
        <aside className={styles.deadline} aria-label="Review status">
          <p className="font-extrabold">
            {state.data.cycle.state === 'paused'
              ? 'This listing is temporarily hidden because its review is overdue.'
              : state.data.cycle.state === 'held'
                ? 'Reminders are on hold. This hold does not count as ignoring the review.'
                : state.data.cycle.dueAt
                  ? `Confirm this listing by ${new Date(state.data.cycle.dueAt).toLocaleDateString()}.`
                  : 'The response window starts after the initial notice is successfully sent.'}
          </p>
          <p className="mt-1">
            Only the final confirmation completes this review. A valid US ZIP is
            required; a street or home address is not.
          </p>
        </aside>
      )}
      {state.isLoading && (
        <p role="status" className={`${styles.helper} mb-4`}>
          Loading review status...
        </p>
      )}
      {state.isError && (
        <div className="mb-5 space-y-3">
          <p role="alert" className={styles.error}>
            {state.error.message}
          </p>
          <Button
            variant="outline"
            className={styles.secondary}
            disabled={state.isFetching}
            onClick={() => state.refetch()}
          >
            Reload review status
          </Button>
        </div>
      )}
      {!(finish && confirmed) && children}
      {finish && (
        <Card className={styles.editor}>
          <CardContent className={`${styles.editorContent} space-y-5`}>
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
                  <p className={styles.helper}>
                    Last confirmed:{' '}
                    {new Date(state.data.lastReviewedAt).toLocaleString()}.
                  </p>
                )}
                <div className="flex flex-col gap-3 sm:flex-row">
                  {(active || restored) && (
                    <Button asChild className={styles.primary}>
                      <Link href={publicPath}>View updated listing</Link>
                    </Button>
                  )}
                  <Button
                    asChild
                    variant="outline"
                    className={styles.secondary}
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
                  Confirm that the information for <strong>{name}</strong> is
                  current. Sections you left alone stay unchanged. This final
                  action completes the review and stops reminders for this
                  cycle. Every business needs a valid five-digit US ZIP in
                  Location, including online and mobile services. A street or
                  home address is not required.
                </p>
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="confirm-listing-information"
                    checked={checked}
                    onCheckedChange={(value) => setChecked(value === true)}
                    disabled={saving || !state.data || state.isError}
                  />
                  <Label
                    htmlFor="confirm-listing-information"
                    className="cursor-pointer leading-relaxed"
                  >
                    I reviewed this business and confirm that the listed
                    information is current.
                  </Label>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
                  <Button
                    asChild
                    variant="outline"
                    className={styles.secondary}
                  >
                    <Link href={listingReviewStepPath(profileId, 'images')}>
                      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                      Back to photos
                    </Link>
                  </Button>
                  <Button
                    onClick={() => submit('confirm')}
                    disabled={
                      !checked ||
                      saving ||
                      !state.data ||
                      state.isError ||
                      state.isFetching
                    }
                    className={styles.primary}
                  >
                    {saving ? (
                      <>
                        <Loader2
                          className="h-4 w-4 animate-spin"
                          aria-hidden="true"
                        />
                        Saving...
                      </>
                    ) : (
                      'Confirm business information'
                    )}
                  </Button>
                </div>
                <p className={styles.helper}>
                  An overdue-review pause can be lifted after this confirmation.
                  It never overrides a staff decline or manual suspension.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      )}
      {error && (
        <div className="mt-4 space-y-3">
          <p role="alert" className={styles.error}>
            {error}
          </p>
          {locationError ? (
            <Button asChild variant="outline" className={styles.secondary}>
              <Link href={listingReviewStepPath(profileId, 'address')}>
                Add or check ZIP in Location
              </Link>
            </Button>
          ) : (
            <Button
              variant="outline"
              className={styles.secondary}
              onClick={() => window.location.reload()}
              disabled={saving}
            >
              Reload and confirm again
            </Button>
          )}
        </div>
      )}
      {state.data && (
        <details className={styles.preferences}>
          <summary>Review reminders</summary>
          <p className={`${styles.helper} mb-3`}>
            {state.data.remindersOptedOut
              ? 'Listing-review reminders are opted out. You can still confirm the business without enabling email.'
              : 'Reminder preferences do not confirm this review or change your listing visibility.'}
          </p>
          <Button
            variant="outline"
            className={styles.secondary}
            disabled={saving || state.isError || state.isFetching}
            onClick={() =>
              submit(
                state.data.remindersOptedOut
                  ? 'allow_reminders'
                  : 'stop_reminders'
              )
            }
          >
            {state.data.remindersOptedOut
              ? 'Allow future listing-review reminders'
              : 'Stop listing-review reminders'}
          </Button>
        </details>
      )}
    </>
  );
}
