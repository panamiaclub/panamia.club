'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  LISTING_REVIEW_STEPS,
  listingReviewStepPath,
  type ListingReviewStep,
} from '@/lib/listing-review';
import { listingClaimPath, listingReviewPath } from '@/lib/listing-url';
import { Button } from '@/components/ui/button';
import { signOut } from '@/lib/auth-client';
import { useState } from 'react';

export function useListingReviewStep(step: ListingReviewStep) {
  const params = useSearchParams();
  const router = useRouter();
  const listingId = params?.get('listingId') ?? undefined;
  const active = listingId !== undefined;
  const index = LISTING_REVIEW_STEPS.findIndex((item) => item.key === step);
  const next = LISTING_REVIEW_STEPS[index + 1];
  const backHref = active
    ? listingReviewPath(listingId)
    : '/account/profile/edit';
  const nextHref = active
    ? next
      ? listingReviewStepPath(listingId, next.key)
      : `${listingReviewPath(listingId)}&complete=1`
    : backHref;

  const navigation = {
    backHref,
    nextHref,
    onSaved: () => {
      if (active) router.push(nextHref);
    },
  };
  return listingId === undefined
    ? { ...navigation, active: false as const, listingId: undefined }
    : { ...navigation, active: true as const, listingId };
}

export function ListingReviewStepHeader({
  listingId,
  name,
  step,
}: {
  listingId: string;
  name: string;
  step: ListingReviewStep;
}) {
  const index = LISTING_REVIEW_STEPS.findIndex((item) => item.key === step);
  return (
    <header className="mb-6 space-y-4">
      <p className="section-eyebrow text-pana-burnt dark:text-pana-flame">
        Review your listing
      </p>
      <h1 className="text-3xl font-black tracking-tight">{name}</h1>
      <p className="font-bold">
        Step {index + 1} of {LISTING_REVIEW_STEPS.length}:{' '}
        {LISTING_REVIEW_STEPS[index].label}
      </p>
      <p className="text-muted-foreground text-sm">
        Changes apply only to this business. Your personal profile, sign-in
        email and other listings stay separate.
      </p>
      <nav aria-label="Listing review" className="flex flex-wrap gap-2">
        {LISTING_REVIEW_STEPS.map((item, position) => (
          <Link
            key={item.key}
            href={listingReviewStepPath(listingId, item.key)}
            aria-current={item.key === step ? 'step' : undefined}
            className={`rounded-full border px-3 py-2 text-sm font-bold ${
              item.key === step
                ? 'border-pana-indigo bg-pana-indigo text-white'
                : 'border-pana-ink/15 hover:bg-pana-ink/5 dark:border-white/20'
            }`}
          >
            {position + 1}. {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

export function ListingReviewAccess({
  listingId,
  signedIn = false,
}: {
  listingId: string;
  signedIn?: boolean;
}) {
  const [error, setError] = useState('');
  const [switching, setSwitching] = useState(false);
  const signInPath = `/signin?callbackUrl=${encodeURIComponent(listingReviewPath(listingId))}`;

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
    <main className="auth-surface px-4 py-16">
      <div className="mx-auto max-w-lg space-y-5 rounded-2xl border p-6">
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
        <Button asChild className="w-full rounded-full font-extrabold">
          <Link href={signedIn ? listingClaimPath(listingId) : signInPath}>
            {signedIn ? 'Return to this listing' : 'Sign in to continue'}
          </Link>
        </Button>
        {signedIn && (
          <Button
            onClick={changeAccount}
            disabled={switching}
            variant="outline"
            className="w-full rounded-full font-bold"
          >
            {switching ? 'Signing out...' : 'Use a different Pana account'}
          </Button>
        )}
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
