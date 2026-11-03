'use client';

import { useEffect, useRef, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { signOut, useSession } from '@/lib/auth-client';
import { listingClaimPath, listingReviewPath } from '@/lib/listing-url';

/**
 * Landing page for the confirmation link in the claim email.
 *
 * The redemption happens on mount because arriving here already means the
 * person opened a one-time link from the business inbox — asking them to press
 * another button proves nothing extra.
 */
function ClaimContent() {
  const searchParams = useSearchParams();
  const token = searchParams?.get('token');
  const listingId = searchParams?.get('id');
  const { data: session, status: sessionStatus } = useSession();
  const verifiedFor = useRef<string | null>(null);

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>(
    'loading'
  );
  const [message, setMessage] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [profileId, setProfileId] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [switching, setSwitching] = useState(false);
  const returnPath = `/listings/claim?token=${encodeURIComponent(token ?? '')}${
    listingId ? `&id=${encodeURIComponent(listingId)}` : ''
  }`;
  const signInPath = `/signin?callbackUrl=${encodeURIComponent(returnPath)}`;

  useEffect(() => {
    const run = async () => {
      if (!token) {
        setStatus('error');
        setMessage('This link is missing its token. Open it from the email.');
        return;
      }
      if (sessionStatus === 'loading') return;
      if (!session?.user?.id) {
        verifiedFor.current = null;
        return;
      }
      const requestKey = `${session.user.id}:${token}`;
      if (verifiedFor.current === requestKey) return;
      verifiedFor.current = requestKey;
      setStatus('loading');
      setMessage('');
      setErrorCode('');

      try {
        const response = await fetch('/api/listings/claim/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        const data = await response.json();

        if (verifiedFor.current !== requestKey) return;
        if (
          response.ok &&
          data.success === true &&
          typeof data.profileId === 'string'
        ) {
          setStatus('success');
          setBusinessName(data.businessName || '');
          setProfileId(data.profileId);
        } else {
          setStatus('error');
          setMessage(data.error || 'Could not complete the claim.');
          setErrorCode(typeof data.code === 'string' ? data.code : '');
        }
      } catch (error) {
        if (verifiedFor.current !== requestKey) return;
        console.error('Claim verification failed:', error);
        setStatus('error');
        setMessage('Something went wrong. Please try again.');
      }
    };

    run();
  }, [token, sessionStatus, session?.user?.id]);

  async function changeAccount() {
    setSwitching(true);
    try {
      await signOut({ callbackUrl: signInPath });
    } catch (error) {
      console.error('Could not change the claim account:', error);
      setMessage('Could not sign out. Please try again.');
      setSwitching(false);
    }
  }

  const needsSignIn = sessionStatus === 'unauthenticated' && Boolean(token);

  return (
    <main className="auth-surface flex flex-col items-center px-4 py-12 sm:py-16">
      <div className="w-full max-w-lg">
        <Card className="border-pana-ink/10 rounded-2xl shadow-xl dark:border-white/10">
          <CardHeader>
            <CardTitle
              role="heading"
              aria-level={1}
              className="flex items-center gap-2 font-black tracking-tight"
            >
              {needsSignIn ? (
                'Sign in to confirm ownership'
              ) : status === 'loading' ? (
                <>
                  <Loader2 className="text-pana-burnt dark:text-pana-flame h-5 w-5 animate-spin" />
                  Confirming…
                </>
              ) : status === 'success' ? (
                <>
                  <CheckCircle2 className="text-pana-burnt dark:text-pana-flame h-5 w-5" />
                  It&apos;s yours
                </>
              ) : (
                <>
                  <XCircle className="text-pana-red h-5 w-5" />
                  Couldn&apos;t confirm
                </>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {needsSignIn ? (
              <>
                <p>
                  Sign in with the Pana account that requested this ownership
                  link. It can use a different email from the business inbox.
                </p>
                <Button asChild className="w-full rounded-full font-extrabold">
                  <Link href={signInPath}>Sign in to finish claiming</Link>
                </Button>
              </>
            ) : status === 'loading' ? (
              <p
                role="status"
                className="text-pana-ink/75 dark:text-muted-foreground"
              >
                Checking your link.
              </p>
            ) : status === 'success' ? (
              <>
                <p className="text-pana-ink/75 dark:text-muted-foreground">
                  {businessName ? (
                    <>
                      You now manage{' '}
                      <strong className="text-pana-ink dark:text-foreground">
                        {businessName}
                      </strong>{' '}
                      on Pana MIA. Next, review its details, starting with where
                      people can find it. Your personal profile and login are
                      unchanged.
                    </>
                  ) : (
                    'You now manage this listing on Pana MIA.'
                  )}
                </p>
                <Button
                  asChild
                  className="bg-pana-flame text-pana-ink hover:bg-pana-burnt w-full font-extrabold"
                >
                  <a href={listingReviewPath(profileId)}>Review your listing</a>
                </Button>
              </>
            ) : (
              <>
                <p
                  role="alert"
                  className="text-pana-ink/75 dark:text-muted-foreground"
                >
                  {message}
                </p>
                {(errorCode === 'wrong_account' ||
                  errorCode === 'signin_required') && (
                  <Button
                    onClick={changeAccount}
                    disabled={switching}
                    className="w-full rounded-full font-extrabold"
                  >
                    {switching
                      ? 'Signing out...'
                      : 'Use the account that requested this link'}
                  </Button>
                )}
                <Button
                  asChild
                  variant="outline"
                  className="border-pana-ink/15 w-full font-semibold"
                >
                  <Link href={listingId ? listingClaimPath(listingId) : '/d'}>
                    {listingId
                      ? 'Return to this listing or request a new link'
                      : 'Find your listing in the directory'}
                  </Link>
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

export default function ClaimListingPage() {
  return (
    <Suspense
      fallback={
        <div className="auth-surface flex items-center justify-center px-4 py-24">
          <Loader2 className="text-pana-burnt dark:text-pana-flame h-6 w-6 animate-spin" />
        </div>
      }
    >
      <ClaimContent />
    </Suspense>
  );
}
