'use client';

import { useCallback, useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useSession } from '@/lib/auth-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, XCircle, Store } from 'lucide-react';

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

  const [state, setState] = useState<
    'loading' | 'ready' | 'sending' | 'sent' | 'error'
  >('loading');
  const [name, setName] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const load = async () => {
      if (!profileId) {
        setState('error');
        setMessage('No listing selected.');
        return;
      }

      try {
        const response = await fetch(`/api/listings/${profileId}/claim`);
        const data = await response.json();

        if (!response.ok) {
          setState('error');
          setMessage(data.error || 'Could not load that listing.');
          return;
        }

        setName(data.name);

        if (!data.claimable) {
          setState('error');
          setMessage('This listing already has an owner.');
          return;
        }

        setState('ready');
      } catch (error) {
        console.error('Failed to load listing:', error);
        setState('error');
        setMessage('Could not load that listing.');
      }
    };

    load();
  }, [profileId]);

  const requestLink = useCallback(async () => {
    if (!profileId) return;
    setState('sending');

    try {
      const response = await fetch(`/api/listings/${profileId}/claim`, {
        method: 'POST',
      });
      const data = await response.json();

      if (!response.ok) {
        setState('error');
        setMessage(data.error || 'Could not send the confirmation email.');
        return;
      }

      setSentTo(data.sentTo || '');
      setState('sent');
    } catch (error) {
      console.error('Failed to request claim link:', error);
      setState('error');
      setMessage('Could not send the confirmation email.');
    }
  }, [profileId]);

  const signedIn = Boolean(session?.user);
  const sessionLoading = status === 'loading';

  return (
    <div className="auth-surface flex flex-col items-center px-4 py-12 sm:py-16">
      <div className="w-full max-w-lg">
        <Card className="border-pana-ink/10 rounded-2xl shadow-xl dark:border-white/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-black tracking-tight">
              {state === 'sent' ? (
                <CheckCircle2 className="text-pana-burnt dark:text-pana-flame h-5 w-5" />
              ) : state === 'error' ? (
                <XCircle className="text-pana-red h-5 w-5" />
              ) : (
                <Store className="text-pana-burnt dark:text-pana-flame h-5 w-5" />
              )}
              {state === 'sent'
                ? 'Check that inbox'
                : state === 'error'
                  ? "Can't claim this"
                  : 'Is this your business?'}
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-6">
            {(state === 'loading' || sessionLoading) && (
              <p className="text-pana-ink/75 dark:text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </p>
            )}

            {state === 'error' && (
              <>
                <p className="text-pana-ink/75 dark:text-muted-foreground">
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

            {state === 'sent' && (
              <>
                <p className="text-pana-ink/75 dark:text-muted-foreground">
                  We sent a confirmation link to{' '}
                  <strong className="text-pana-ink dark:text-foreground">
                    {sentTo}
                  </strong>
                  , the address on this listing. Open it from that inbox and{' '}
                  {name || 'the listing'} is yours. The link expires in an hour.
                </p>
                <p className="text-pana-ink/60 dark:text-muted-foreground text-sm">
                  No longer have access to that address? Email us at{' '}
                  <a
                    className="text-pana-indigo dark:text-pana-flame font-semibold underline"
                    href="mailto:hola@panamia.club"
                  >
                    hola@panamia.club
                  </a>
                  .
                </p>
              </>
            )}

            {(state === 'ready' || state === 'sending') && !sessionLoading && (
              <>
                <p className="text-pana-ink/75 dark:text-muted-foreground">
                  {name ? (
                    <>
                      <strong className="text-pana-ink dark:text-foreground">
                        {name}
                      </strong>{' '}
                      is listed on Pana MIA but nobody manages it yet. Claim it
                      to edit the details, add photos and post as the business.
                    </>
                  ) : (
                    'This listing has no owner yet.'
                  )}
                </p>

                {signedIn ? (
                  <>
                    <p className="text-pana-ink/60 dark:text-muted-foreground text-sm">
                      We&apos;ll email a one-time confirmation link to the
                      address on the listing to check you run it.
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
                        'Send me the confirmation link'
                      )}
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="text-pana-ink/60 dark:text-muted-foreground text-sm">
                      Sign in first so we know which account to attach it to.
                    </p>
                    <Button
                      asChild
                      className="bg-pana-flame text-pana-ink hover:bg-pana-burnt w-full font-extrabold"
                    >
                      <Link
                        href={`/signin?callbackUrl=${encodeURIComponent(
                          `/listings/claim/start?id=${profileId ?? ''}`
                        )}`}
                      >
                        Sign in to claim
                      </Link>
                    </Button>
                  </>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
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
