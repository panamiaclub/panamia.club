'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { BadgeCheck, Loader2, Store } from 'lucide-react';
import { signOut, useSession } from '@/lib/auth-client';
import {
  LISTING_INVITATION_DAYS,
  isListingInvitationState,
  listingInvitationPath,
  readListingInvitationFragment,
  type ListingInvitationState,
} from '@/lib/listing-invitation';
import {
  isClaimListingContext,
  type ClaimListingContext,
} from '@/lib/listing-review';
import { listingClaimPath, listingReviewPath } from '@/lib/listing-url';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

function errorMessage(value: unknown, fallback: string): string {
  return value &&
    typeof value === 'object' &&
    'error' in value &&
    typeof value.error === 'string'
    ? value.error
    : fallback;
}

function InvitationContent() {
  const params = useSearchParams();
  const profileId = params?.get('id');
  const { data: session, status } = useSession();
  const proof = useRef<{
    profileId: string;
    token: string | null;
    invalid: boolean;
    prepared: Promise<string | null> | null;
  } | null>(null);
  const [listing, setListing] = useState<ClaimListingContext | null>(null);
  const [invitation, setInvitation] = useState<ListingInvitationState | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const returnPath = listingInvitationPath(profileId ?? '');
  const signInPath = `/signin?callbackUrl=${encodeURIComponent(returnPath)}`;

  useEffect(() => {
    const token = readListingInvitationFragment(window.location.hash);
    if (profileId && window.location.hash) {
      proof.current = { profileId, token, invalid: !token, prepared: null };
      // The fragment never reaches a server. Remove it before any sign-in URL
      // is built; the validated HttpOnly context carries it through that return.
      window.history.replaceState(
        window.history.state,
        '',
        `${window.location.pathname}${window.location.search}`
      );
    }
    if (status === 'loading') return;
    let active = true;
    setLoading(true);
    setInvitation(null);
    setListing(null);
    setError('');
    const load = async () => {
      if (!profileId) {
        setError(
          'No listing selected. Open the original invitation from the business inbox.'
        );
        setLoading(false);
        return;
      }
      try {
        const captured =
          proof.current?.profileId === profileId ? proof.current : null;
        if (captured?.token && !captured.prepared) {
          const token = captured.token;
          captured.prepared = fetch('/api/listings/invitations/context', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profileId, token }),
          }).then(async (response) => {
            const data: unknown = await response.json();
            if (response.ok) captured.token = null;
            return response.ok
              ? null
              : errorMessage(data, 'Could not check the original invitation.');
          });
        }
        const contextError = captured?.invalid
          ? 'This invitation link has invalid proof. Open the original link from the business inbox.'
          : captured?.prepared
            ? await captured.prepared
            : null;
        const [previewResponse, invitationResponse] = await Promise.all([
          fetch(`/api/listings/${encodeURIComponent(profileId)}/claim`, {
            cache: 'no-store',
          }),
          fetch(
            `/api/listings/invitations?profileId=${encodeURIComponent(profileId)}`,
            { cache: 'no-store' }
          ),
        ]);
        const preview: unknown = await previewResponse.json();
        const state: unknown = await invitationResponse.json();
        if (!active) return;
        if (previewResponse.ok && isClaimListingContext(preview, profileId))
          setListing(preview);
        if (
          !invitationResponse.ok ||
          !isListingInvitationState(state, profileId) ||
          (contextError && state.state !== 'owned')
        ) {
          throw new Error(
            contextError ||
              errorMessage(state, 'Could not open this invitation.')
          );
        }
        if (!previewResponse.ok || !isClaimListingContext(preview, profileId)) {
          throw new Error(
            errorMessage(
              preview,
              'Could not load this business. Check again before confirming ownership.'
            )
          );
        }
        setInvitation(state);
      } catch (cause) {
        if (!active) return;
        // Do not log the raw fragment or any request/callback URL.
        console.error('[listings/invite] could not load invitation');
        setError(
          cause instanceof Error
            ? cause.message
            : 'Could not open this invitation. Please try again.'
        );
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [profileId, status, session?.user?.id, session?.user?.email, revision]);

  async function confirm() {
    if (
      !profileId ||
      !session?.user?.id ||
      !session.user.email ||
      invitation?.state !== 'available' ||
      saving
    )
      return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/listings/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId,
          action: 'accept',
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
        !('profileId' in data) ||
        data.profileId !== profileId
      ) {
        throw new Error(
          errorMessage(
            data,
            'Could not confirm ownership. Please reload and confirm your account again.'
          )
        );
      }
      window.location.assign(listingReviewPath(profileId));
    } catch (cause) {
      console.error('[listings/invite] confirmation failed');
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not confirm ownership. Please try again.'
      );
      setSaving(false);
    }
  }

  async function changeAccount() {
    setSwitching(true);
    setError('');
    try {
      await signOut({ callbackUrl: signInPath });
    } catch {
      console.error('[listings/invite] account switch failed');
      setError('Could not sign out. Please try again.');
      setSwitching(false);
    }
  }

  function reloadInvitation() {
    if (proof.current?.token) proof.current.prepared = null;
    setRevision((value) => value + 1);
  }

  return (
    <main className="auth-surface px-4 py-12 sm:py-16">
      <Card className="mx-auto w-full max-w-xl rounded-2xl shadow-lg">
        <CardContent className="space-y-5 p-6 sm:p-8">
          <BadgeCheck
            className="text-pana-burnt dark:text-pana-flame h-8 w-8"
            aria-hidden="true"
          />
          <p className="section-eyebrow">Your listing invitation</p>
          <h1 className="text-3xl font-black tracking-tight">
            Review and claim your listing
          </h1>
          {loading || status === 'loading' ? (
            <LoadingInvitation />
          ) : (
            <>
              {listing && (
                <article className="border-pana-ink/10 space-y-3 rounded-2xl border p-4 dark:border-white/15">
                  {listing.imageUrl ? (
                    <img
                      src={listing.imageUrl}
                      alt=""
                      className="h-20 w-20 rounded-xl object-cover"
                    />
                  ) : (
                    <Store className="h-7 w-7" aria-hidden="true" />
                  )}
                  <h2 className="text-2xl font-extrabold">{listing.name}</h2>
                  {listing.summary && <p>{listing.summary}</p>}
                  <p className="text-muted-foreground text-sm">
                    {listing.locationLabel}
                  </p>
                  {listing.reviewPaused && (
                    <p className="text-muted-foreground text-sm">
                      Temporarily hidden for an overdue review. Claiming alone
                      will not restore it; confirm the business information at
                      the end.
                    </p>
                  )}
                  {listing.published !== false && (
                    <Link
                      href={listing.publicPath}
                      className="text-pana-indigo dark:text-pana-flame font-bold underline"
                    >
                      View the public listing
                    </Link>
                  )}
                </article>
              )}
              {error && (
                <p role="alert" className="text-destructive">
                  {error}
                </p>
              )}
              {invitation?.state === 'owned' ? (
                <>
                  <p>
                    You already manage this business. No new claim is needed.
                  </p>
                  <Button
                    asChild
                    className="w-full rounded-full font-extrabold"
                  >
                    <a href={listingReviewPath(invitation.profileId)}>
                      Review your listing
                    </a>
                  </Button>
                </>
              ) : invitation?.state === 'available' ? (
                <>
                  <p>
                    This invitation verifies access to the business inbox. It
                    does not sign you in or make you the owner just by opening
                    it.
                  </p>
                  <p className="text-muted-foreground text-sm">
                    Invitations last {LISTING_INVITATION_DAYS} days. This one
                    expires{' '}
                    {new Date(invitation.expiresAt ?? '').toLocaleDateString()}.
                    Your Pana sign-in link has its own shorter expiry.
                  </p>
                  {session?.user?.id ? (
                    <>
                      <p>
                        You are signed in as{' '}
                        <strong data-testid="invitation-account">
                          {session.user.email}
                        </strong>
                        . Confirm that this is the account you want to use to
                        manage{' '}
                        <strong>{listing?.name || 'this business'}</strong>.
                      </p>
                      <p className="text-muted-foreground text-sm">
                        Your business contact and personal login can be
                        different. Claiming does not replace your personal
                        profile, select a different active identity, or change
                        your other businesses. No second business verification
                        email is needed.
                      </p>
                      <Button
                        onClick={confirm}
                        disabled={saving || switching}
                        className="bg-pana-flame text-pana-ink hover:bg-pana-burnt w-full rounded-full font-extrabold"
                      >
                        {saving ? 'Confirming...' : 'Confirm claim and review'}
                      </Button>
                    </>
                  ) : (
                    <>
                      <p>
                        Choose your Pana account and sign in with its email. It
                        can be different from the business contact. You will
                        return here to explicitly confirm the claim.
                      </p>
                      <Button
                        asChild
                        className="w-full rounded-full font-extrabold"
                      >
                        <Link href={signInPath}>
                          Choose my Pana account and sign in
                        </Link>
                      </Button>
                      <p className="text-muted-foreground text-sm">
                        Use the same browser for the sign-in link, or reopen
                        this original invitation in the browser where you are
                        signed in.
                      </p>
                    </>
                  )}
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={reloadInvitation}
                    className="w-full rounded-full font-bold"
                  >
                    Check again
                  </Button>
                  <Button
                    asChild
                    className="w-full rounded-full font-extrabold"
                  >
                    <Link href={profileId ? listingClaimPath(profileId) : '/d'}>
                      {profileId
                        ? 'Return to this listing'
                        : 'Find your listing'}
                    </Link>
                  </Button>
                </>
              )}
              {session?.user?.id && profileId && (
                <Button
                  variant="outline"
                  onClick={changeAccount}
                  disabled={saving || switching}
                  className="w-full rounded-full font-bold"
                >
                  {switching
                    ? 'Signing out...'
                    : 'Use a different Pana account'}
                </Button>
              )}
              {error && invitation?.state === 'available' && (
                <Button
                  variant="outline"
                  onClick={() => window.location.reload()}
                  disabled={saving}
                  className="w-full rounded-full font-bold"
                >
                  Reload and confirm my account again
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

function LoadingInvitation() {
  return (
    <p role="status" className="flex items-center gap-2">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      Checking your listing invitation...
    </p>
  );
}

export default function ListingInvitationPage() {
  return (
    <Suspense fallback={<LoadingInvitation />}>
      <InvitationContent />
    </Suspense>
  );
}
