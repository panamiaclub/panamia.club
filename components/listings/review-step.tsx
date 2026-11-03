'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, Loader2, Save } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import {
  LISTING_REVIEW_STEPS,
  listingReviewNavigation,
  listingReviewStepPath,
  type ListingReviewStep,
} from '@/lib/listing-review';
import {
  listingClaimPath,
  listingPublicPath,
  listingReviewPath,
} from '@/lib/listing-url';
import type { ProfileInterface } from '@/lib/interfaces';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import PageMeta from '@/components/PageMeta';
import { signOut, useSession } from '@/lib/auth-client';
import { ListingReviewConfirmation } from './review-confirmation';
import styles from './review.module.css';

export function useListingReviewStep(step: ListingReviewStep) {
  const params = useSearchParams();
  const router = useRouter();
  const listingId = params?.get('listingId') ?? undefined;
  const active = listingId !== undefined;
  const { backHref, nextHref } = active
    ? listingReviewNavigation(listingId, step)
    : {
        backHref: '/account/profile/edit',
        nextHref: '/account/profile/edit',
      };

  const navigation = {
    backHref,
    nextHref,
    returnHref: active ? listingReviewStepPath(listingId, step) : undefined,
    onSaved: () => {
      if (!active) return;
      // A save may finish after the owner moves to another section or listing.
      const current = new URL(window.location.href);
      if (
        current.pathname === `/account/profile/${step}` &&
        current.searchParams.get('listingId') === listingId
      ) {
        router.push(nextHref);
      }
    },
  };
  return listingId === undefined
    ? { ...navigation, active: false as const, listingId: undefined }
    : { ...navigation, active: true as const, listingId };
}

export function ListingReviewLoading() {
  return (
    <main className={`${styles.surface} ${styles.loading}`} role="status">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
      Loading your listing...
    </main>
  );
}

export function ListingReviewFrame({
  listingId,
  profile,
  step,
  children,
}: {
  listingId: string;
  profile: ProfileInterface;
  step: ListingReviewStep | 'confirm';
  children: ReactNode;
}) {
  const { data: session } = useSession();
  return (
    <main className={styles.surface}>
      <div className={styles.content}>
        <ListingReviewStepHeader
          listingId={listingId}
          name={profile.name}
          step={step}
        />
        <ListingReviewConfirmation
          key={`${listingId}:${session?.user?.id}`}
          profileId={listingId}
          name={profile.name}
          publicPath={listingPublicPath({
            id: listingId,
            screenname: profile.screenname,
          })}
          active={Boolean(profile.active)}
          finish={step === 'confirm'}
        >
          {children}
        </ListingReviewConfirmation>
      </div>
    </main>
  );
}

export function ProfileEditorFrame({
  listingId,
  profile,
  step,
  title,
  pageTitle,
  children,
}: {
  listingId?: string;
  profile: ProfileInterface;
  step: ListingReviewStep;
  title: string;
  pageTitle: string;
  children: ReactNode;
}) {
  const meta = (
    <PageMeta
      title={
        listingId !== undefined ? `${profile.name} | Listing review` : pageTitle
      }
      desc=""
      hideHeading={listingId !== undefined}
    />
  );
  if (listingId === undefined) {
    return (
      <main className="container mx-auto max-w-3xl px-4 py-8">
        {meta}
        <h2 className="mb-8 text-3xl font-bold">{title}</h2>
        <Card>
          <CardContent className="pt-6">{children}</CardContent>
        </Card>
      </main>
    );
  }
  return (
    <ListingReviewFrame listingId={listingId} profile={profile} step={step}>
      {meta}
      <Card className={styles.editor}>
        <CardContent className={styles.editorContent}>{children}</CardContent>
      </Card>
    </ListingReviewFrame>
  );
}

export function ProfileEditorActions({
  review,
  pending,
  continueLabel = 'Save and continue',
  pendingLabel = 'Saving...',
}: {
  review: ReturnType<typeof useListingReviewStep>;
  pending: boolean;
  continueLabel?: string;
  pendingLabel?: string;
}) {
  return (
    <div
      className={
        review.active ? styles.actions : 'mb-6 flex justify-between gap-4'
      }
    >
      <Button
        variant="outline"
        asChild
        className={review.active ? styles.secondary : undefined}
      >
        <Link
          href={review.backHref}
          aria-disabled={review.active && pending ? true : undefined}
          onClick={(event) => {
            if (review.active && pending) event.preventDefault();
          }}
        >
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
          {review.active && review.backHref.startsWith('/listings/claim/')
            ? 'Back to listing'
            : 'Back'}
        </Link>
      </Button>
      <Button
        type="submit"
        disabled={pending}
        className={review.active ? styles.primary : undefined}
      >
        {review.active ? (
          <>
            {pending ? pendingLabel : continueLabel}
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            )}
          </>
        ) : (
          <>
            <Save className="mr-2 h-4 w-4" aria-hidden="true" />
            {pending ? pendingLabel : 'Save Changes'}
          </>
        )}
      </Button>
    </div>
  );
}

export function ListingReviewStepHeader({
  listingId,
  name,
  step,
}: {
  listingId: string;
  name: string;
  step: ListingReviewStep | 'confirm';
}) {
  const index = LISTING_REVIEW_STEPS.findIndex((item) => item.key === step);
  return (
    <header className={styles.header}>
      <p className="section-eyebrow">Review your listing</p>
      <h1 className={styles.heading}>{name}</h1>
      <p className={styles.position}>
        {step === 'confirm'
          ? 'Final check'
          : `Step ${index + 1} of ${LISTING_REVIEW_STEPS.length}: ${LISTING_REVIEW_STEPS[index].label}`}
      </p>
      <progress
        className={styles.progress}
        aria-label="Listing review position"
        max={LISTING_REVIEW_STEPS.length}
        value={step === 'confirm' ? LISTING_REVIEW_STEPS.length : index + 1}
      />
      <p className={styles.helper}>
        Only this business is updated. Your personal profile, sign-in email and
        other listings stay separate.
      </p>
      <nav aria-label="Listing review">
        <ol className={styles.steps}>
          {LISTING_REVIEW_STEPS.map((item, position) => (
            <li key={item.key}>
              <Link
                href={listingReviewStepPath(listingId, item.key)}
                aria-current={item.key === step ? 'step' : undefined}
                className={styles.pill}
              >
                {position + 1}. {item.label}
              </Link>
            </li>
          ))}
        </ol>
      </nav>
    </header>
  );
}

export function ListingReviewAccess({
  listingId,
  signedIn = false,
  returnHref,
}: {
  listingId: string;
  signedIn?: boolean;
  returnHref?: string;
}) {
  const [error, setError] = useState('');
  const [switching, setSwitching] = useState(false);
  const signInPath = `/signin?callbackUrl=${encodeURIComponent(returnHref ?? listingReviewPath(listingId))}`;

  async function changeAccount() {
    setSwitching(true);
    setError('');
    try {
      await signOut({ callbackUrl: signInPath });
    } catch (cause) {
      console.error('Could not change the listing review account:', cause);
      setError('Could not sign out. Please try again.');
      setSwitching(false);
    }
  }

  return (
    <main className={styles.surface}>
      <div className={`${styles.editor} mx-auto max-w-lg space-y-5 p-6`}>
        <h1 className="text-2xl font-black">
          {signedIn
            ? 'This business could not be opened'
            : 'Sign in to review your listing'}
        </h1>
        <p role={signedIn ? 'alert' : undefined}>
          {signedIn
            ? 'Use an account that manages this business. If you have not claimed it yet, start with ownership verification. If you already manage it, return to the listing or try again.'
            : 'Your Pana account and business contact email can be different. Signing in does not claim a business.'}
        </p>
        <Button asChild className={`${styles.primary} w-full`}>
          <Link href={signedIn ? listingClaimPath(listingId) : signInPath}>
            {signedIn ? 'Return to this listing' : 'Sign in to continue'}
          </Link>
        </Button>
        {signedIn && (
          <Button
            onClick={changeAccount}
            disabled={switching}
            variant="outline"
            className={`${styles.secondary} w-full`}
          >
            {switching ? 'Signing out...' : 'Use a different Pana account'}
          </Button>
        )}
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
