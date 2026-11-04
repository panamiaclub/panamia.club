'use client';

import { useCallback, useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { signOut, useSession } from '@/lib/auth-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, XCircle, Store } from 'lucide-react';
import {
  isClaimListingContext,
  type ClaimListingContext,
} from '@/lib/listing-review';
import { listingClaimPath, listingReviewPath } from '@/lib/listing-url';

/**
 * Start of the claim flow, reached from an unclaimed listing in the directory.
 *
 * Sign-in comes first: the claim ends in a profile_owners row, which needs an
 * account to point at. Proof of ownership is separate and happens next — we
 * mail a one-time link to the address on the listing, so the account email does
 * not have to match.
 */
function ClaimStartContent() {
  const searchParams = useSearchParams();
  const profileId = searchParams?.get('id');
  const { data: session, status } = useSession();
  const router = useRouter();

  const [state, setState] = useState<
    'loading' | 'ready' | 'sending' | 'sent' | 'error'
  >('loading');
  const [listing, setListing] = useState<ClaimListingContext | null>(null);
  const [sentTo, setSentTo] = useState('');
  const [message, setMessage] = useState('');
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    if (status === 'loading') return;
    const controller = new AbortController();
    setState('loading');
    setListing(null);
    setMessage('');
    const load = async () => {
      if (!profileId) {
        setState('error');
        setMessage('No listing selected.');
        return;
      }

      try {
        const response = await fetch(
          `/api/listings/${encodeURIComponent(profileId)}/claim`,
          { signal: controller.signal, cache: 'no-store' }
        );
        const data: unknown = await response.json();

        if (!response.ok) {
          throw new Error(
            data &&
              typeof data === 'object' &&
              'error' in data &&
              typeof data.error === 'string'
              ? data.error
              : 'Could not load that listing.'
          );
        }
        if (!isClaimListingContext(data, profileId)) {
          throw new Error('Could not load that listing.');
        }
        if (controller.signal.aborted) return;
        setListing(data);
        setState('ready');
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error('Failed to load listing:', error);
        setState('error');
        setMessage(
          error instanceof Error
            ? error.message
            : 'Could not load that listing.'
        );
      }
    };

    load();
    return () => controller.abort();
  }, [profileId, status, session?.user?.id]);

  const requestLink = useCallback(async () => {
    if (!profileId || !session?.user?.id) return;
    setState('sending');
    setMessage('');

    try {
      const response = await fetch(
        `/api/listings/${encodeURIComponent(profileId)}/claim`,
        {
          method: 'POST',
        }
      );
      const data = await response.json();

      if (!response.ok) {
        setState('ready');
        setMessage(data.error || 'Could not send the confirmation email.');
        return;
      }

      if (data.alreadyOwned === true && data.profileId === profileId) {
        router.push(listingReviewPath(profileId));
        return;
      }
      if (data.success !== true || typeof data.sentTo !== 'string') {
        throw new Error('The confirmation email could not be requested.');
      }
      setSentTo(data.sentTo || '');
      setState('sent');
    } catch (error) {
      console.error('Failed to request claim link:', error);
      setState('ready');
      setMessage('Could not send the confirmation email.');
    }
  }, [profileId, session?.user?.id, router]);

  const signedIn = Boolean(session?.user);
  const sessionLoading = status === 'loading';

  async function changeAccount() {
    setSwitching(true);
    try {
      await signOut({
        callbackUrl: `/signin?callbackUrl=${encodeURIComponent(listingClaimPath(profileId ?? ''))}`,
      });
    } catch (error) {
      console.error('Could not change the listing account:', error);
      setMessage('Could not sign out. Please try again.');
      setSwitching(false);
    }
  }

  return (
    <main className="auth-surface flex flex-col items-center px-4 py-12 sm:py-16">
      <div className="w-full max-w-xl">
        <Card className="border-pana-ink/10 rounded-2xl shadow-xl dark:border-white/10">
          <CardHeader>
            <CardTitle
              className="flex items-center gap-2 font-black tracking-tight"
              role="heading"
              aria-level={1}
            >
              {state === 'sent' ? (
                <CheckCircle2 className="text-pana-burnt dark:text-pana-flame h-5 w-5" />
              ) : state === 'error' ? (
                <XCircle className="text-pana-red h-5 w-5" />
              ) : (
                <Store className="text-pana-burnt dark:text-pana-flame h-5 w-5" />
              )}
              {state === 'sent'
                ? 'Check the business inbox'
                : state === 'error'
                  ? 'Listing unavailable'
                  : 'Review and claim your listing'}
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-6">
            {(state === 'loading' || sessionLoading) && (
              <p
                role="status"
                className="text-pana-ink/75 dark:text-muted-foreground flex items-center gap-2"
              >
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </p>
            )}

            {state === 'error' && (
              <>
                <p
                  role="alert"
                  className="text-pana-ink/75 dark:text-muted-foreground"
                >
                  {message}
                </p>
                <Button
                  asChild
                  variant="outline"
                  className="border-pana-ink/15 w-full font-semibold"
                >
                  <Link href="/d">Back to the directory</Link>
                </Button>
              </>
            )}

            {listing && state !== 'loading' && (
              <article className="border-pana-ink/10 space-y-3 rounded-2xl border p-4 dark:border-white/10">
                {listing.imageUrl && (
                  <img
                    src={listing.imageUrl}
                    alt=""
                    className="h-20 w-20 rounded-2xl object-cover"
                  />
                )}
                <h2 className="text-2xl font-black">{listing.name}</h2>
                {listing.summary && <p>{listing.summary}</p>}
                <p className="text-muted-foreground text-sm">
                  {listing.locationLabel}
                </p>
                {listing.published !== false && (
                  <Link
                    href={listing.publicPath}
                    className="text-pana-indigo dark:text-pana-flame inline-block font-bold underline"
                  >
                    View the public listing
                  </Link>
                )}
                {listing.reviewPaused && (
                  <p className="text-muted-foreground text-sm">
                    This listing is temporarily hidden because its review is
                    overdue. Verify ownership and confirm its information to
                    restore it.
                  </p>
                )}
                {listing.published === false && !listing.reviewPaused && (
                  <p className="text-muted-foreground text-sm">
                    This listing is not public yet. You can still update it;
                    staff review is separate.
                  </p>
                )}
              </article>
            )}

            {state === 'sent' && (
              <>
                <p className="text-pana-ink/75 dark:text-muted-foreground">
                  We sent a confirmation link to{' '}
                  <strong className="text-pana-ink dark:text-foreground">
                    {sentTo}
                  </strong>
                  , the business contact on this listing. Open it while signed
                  in with the Pana account that requested it, then continue to
                  review {listing?.name || 'the listing'}. The link expires in
                  an hour.
                </p>
                <p className="text-muted-foreground text-sm">
                  Your personal sign-in email has not changed. This listing is
                  not claimed until the ownership link is verified.
                </p>
                <p className="text-pana-ink/60 dark:text-muted-foreground text-sm">
                  No longer have access to that address? Email us at{' '}
                  <a
                    className="text-pana-indigo dark:text-pana-flame font-semibold underline"
                    href="mailto:hola@pana.social"
                  >
                    hola@pana.social
                  </a>
                  .
                </p>
              </>
            )}

            {(state === 'ready' || state === 'sending') &&
              !sessionLoading &&
              listing && (
                <>
                  <p>
                    We&apos;ve refreshed the directory. Check your business
                    description, categories, links, photos and where people can
                    find you.
                  </p>
                  {listing.missingLocation && (
                    <p className="bg-pana-flame/10 rounded-xl p-3 text-sm font-semibold">
                      A ZIP has not been added yet. Every business needs a valid
                      five-digit US ZIP to complete its listing review,
                      including online and mobile services. Choose a public
                      visiting address, or a ZIP-only base for an online or
                      mobile business. Never enter a private home address.
                    </p>
                  )}
                  {message && (
                    <p role="alert" className="text-destructive">
                      {message}
                    </p>
                  )}

                  {signedIn && listing.canManage ? (
                    <>
                      <p>
                        You already manage this business. Go straight to its
                        review.
                      </p>
                      <Button
                        asChild
                        className="bg-pana-flame text-pana-ink hover:bg-pana-burnt w-full rounded-full font-extrabold"
                      >
                        <Link href={listingReviewPath(listing.profileId)}>
                          Review your listing
                        </Link>
                      </Button>
                    </>
                  ) : signedIn && !listing.claimable ? (
                    <>
                      <p role="status">
                        This listing is managed by another account. Sign in with
                        an authorized account, or contact{' '}
                        <a
                          href="mailto:hola@pana.social"
                          className="font-bold underline"
                        >
                          hola@pana.social
                        </a>{' '}
                        if ownership needs to be corrected.
                      </p>
                      <Button
                        onClick={changeAccount}
                        disabled={switching}
                        variant="outline"
                        className="w-full rounded-full font-bold"
                      >
                        {switching
                          ? 'Signing out...'
                          : 'Use a different Pana account'}
                      </Button>
                    </>
                  ) : signedIn ? (
                    <>
                      <p className="text-pana-ink/60 dark:text-muted-foreground text-sm">
                        Signed in as {session?.user?.email}. We&apos;ll send a
                        one-time ownership link to the business inbox. These
                        emails can be different; neither your personal identity
                        nor your other businesses will be replaced.
                      </p>
                      <Button
                        onClick={requestLink}
                        disabled={state === 'sending'}
                        className="bg-pana-flame text-pana-ink hover:bg-pana-burnt w-full font-extrabold"
                      >
                        {state === 'sending' ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Sending…
                          </>
                        ) : (
                          'Send ownership verification email'
                        )}
                      </Button>
                    </>
                  ) : (
                    <>
                      <p className="text-pana-ink/60 dark:text-muted-foreground text-sm">
                        Sign in with your Pana account first. If you already
                        manage this business, you can update it directly.
                        Otherwise, you&apos;ll verify access to the business
                        inbox. Opening this page or signing in never claims it.
                      </p>
                      <Button
                        asChild
                        className="bg-pana-flame text-pana-ink hover:bg-pana-burnt w-full font-extrabold"
                      >
                        <Link
                          href={`/signin?callbackUrl=${encodeURIComponent(
                            listingClaimPath(profileId ?? '')
                          )}`}
                        >
                          Sign in to review and claim
                        </Link>
                      </Button>
                    </>
                  )}
                </>
              )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

export default function ClaimStartPage() {
  return (
    <Suspense
      fallback={
        <div className="auth-surface flex items-center justify-center px-4 py-24">
          <Loader2 className="text-pana-burnt dark:text-pana-flame h-6 w-6 animate-spin" />
        </div>
      }
    >
      <ClaimStartContent />
    </Suspense>
  );
}
