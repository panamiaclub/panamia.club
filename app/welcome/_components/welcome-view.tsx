'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Check, Loader2, X } from 'lucide-react';
import { safeInternalPath } from '@/lib/safe-path';
import { ONBOARDING_DISMISS_KEY } from '@/lib/onboarding';

type CheckStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

function WelcomeForm({ rootPath }: { rootPath: string }) {
  const { t } = useTranslation('common');
  const router = useRouter();
  const searchParams = useSearchParams();

  const [screenname, setScreenname] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [status, setStatus] = useState<CheckStatus>('idle');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  /* Where the member was heading before we interrupted them. Validated rather
     than trusted: `next` is a query parameter, so it is attacker-supplied, and
     an unchecked value here would make our own domain a phishing redirector.
     A destination pointing back at onboarding is dropped too, since honouring
     it would trap the member in a loop. */
  const requestedNext = safeInternalPath(searchParams.get('next'));
  const destination =
    requestedNext && !requestedNext.startsWith('/welcome')
      ? requestedNext
      : rootPath;

  /* Where a finished setup leads. Someone interrupted on the way to a specific
     page gets taken there — their intent outranks our tour. Someone who just
     signed in and landed on a front door has nowhere in particular to be, and
     that is precisely who the fork is for. */
  const afterClaim =
    destination === rootPath || destination === '/'
      ? '/welcome/start'
      : destination;

  /* Someone who already has a handle has nothing to do here — they may have
     hit a stale link or the back button. Send them on rather than inviting
     them to re-answer a question with a 90-day cooldown attached. */
  useEffect(() => {
    let active = true;

    fetch('/api/user/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active) return;
        if (data?.data?.screenname) {
          router.replace(destination);
          return;
        }
        if (typeof data?.data?.name === 'string') {
          setDisplayName(data.data.name);
        }
        if (typeof data?.data?._id === 'string') {
          setUserId(data.data._id);
        }
        setReady(true);
      })
      .catch(() => {
        // A failed lookup should not strand anyone on a blank page; showing
        // the form is the harmless outcome, since the set endpoint revalidates.
        if (active) setReady(true);
      });

    return () => {
      active = false;
    };
  }, [destination, router]);

  const checkAvailability = useCallback(
    async (name: string) => {
      if (!name || name.length < 3) {
        setStatus('idle');
        setError('');
        return;
      }

      setStatus('checking');
      setError('');

      try {
        const response = await fetch(
          `/api/user/screenname/check?name=${encodeURIComponent(name)}`
        );
        const data = await response.json();

        if (data.available) {
          setStatus('available');
          setError('');
        } else {
          setStatus(data.error?.includes('taken') ? 'taken' : 'invalid');
          setError(data.error || t('onboarding.checkFailed'));
        }
      } catch {
        setStatus('idle');
        setError(t('onboarding.checkFailed'));
      }
    },
    [t]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      checkAvailability(screenname);
    }, 500);
    return () => clearTimeout(timer);
  }, [screenname, checkAvailability]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (status !== 'available' || isSubmitting) return;
    if (!displayName.trim() || !screenname.trim()) {
      setError(t('onboarding.requiredFields'));
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/user/screenname/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          screenname: screenname.trim(),
          name: displayName.trim(),
        }),
      });
      const data = await response.json();

      if (data.success) {
        /* A full load rather than a client navigation: this request just
           created the profile the masthead reads from, and every cached
           identity in the tree is now stale. Once per account, correctness is
           worth more than the transition. */
        window.location.assign(afterClaim);
        return;
      }

      setError(data.error || t('onboarding.setFailed'));
      setStatus('invalid');
      setIsSubmitting(false);
    } catch {
      setError(t('onboarding.setFailed'));
      setIsSubmitting(false);
    }
  };

  if (!ready) {
    return (
      <div className="auth-surface flex items-center justify-center px-4 py-24">
        <Loader2 className="text-pana-burnt dark:text-pana-flame h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="auth-surface flex flex-col items-center px-4 py-12 sm:py-16">
      <div className="w-full max-w-lg space-y-6">
        <div className="space-y-2 text-center">
          <p className="text-pana-flame-deep dark:text-pana-flame text-sm font-extrabold tracking-wide uppercase">
            {t('onboarding.welcomeEyebrow')}
          </p>
          <h1 className="text-pana-ink dark:text-pana-cream text-3xl font-extrabold">
            {t('onboarding.welcomeTitle')}
          </h1>
          <p className="text-muted-foreground text-base">
            {t('onboarding.welcomeBody')}
          </p>
        </div>

        <Card className="border-pana-ink/10 rounded-2xl shadow-xl dark:border-white/10">
          <CardContent className="p-6 sm:p-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="welcome-name">
                  {t('onboarding.nameLabel')}
                </Label>
                <Input
                  id="welcome-name"
                  type="text"
                  value={displayName}
                  maxLength={80}
                  autoComplete="name"
                  required
                  placeholder={t('onboarding.namePlaceholder')}
                  disabled={isSubmitting}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
                <p className="text-muted-foreground text-sm">
                  {t('onboarding.nameHint')}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="welcome-screenname">
                  {t('onboarding.screennameLabel')}
                </Label>
                <div className="relative">
                  <Input
                    id="welcome-screenname"
                    type="text"
                    value={screenname}
                    maxLength={24}
                    autoComplete="username"
                    required
                    autoFocus
                    placeholder={t('onboarding.screennamePlaceholder')}
                    disabled={isSubmitting}
                    onChange={(e) => setScreenname(e.target.value)}
                    className={
                      status === 'available'
                        ? 'border-green-500 pr-10'
                        : status === 'taken' || status === 'invalid'
                          ? 'border-red-500 pr-10'
                          : 'pr-10'
                    }
                  />
                  <div className="absolute top-1/2 right-3 -translate-y-1/2">
                    {status === 'checking' && (
                      <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
                    )}
                    {status === 'available' && (
                      <Check className="h-4 w-4 text-green-500" />
                    )}
                    {(status === 'taken' || status === 'invalid') && (
                      <X className="h-4 w-4 text-red-500" />
                    )}
                  </div>
                </div>
                {error && (
                  <p role="alert" className="text-destructive text-sm">
                    {error}
                  </p>
                )}
                <p className="text-muted-foreground text-sm">
                  {t('onboarding.screennameHint')}
                </p>
                <p className="text-muted-foreground text-sm">
                  {t('onboarding.screennameCooldown')}
                </p>
              </div>

              <div className="bg-pana-butter/60 dark:bg-pana-indigo rounded-lg p-3">
                <p className="text-pana-ink dark:text-pana-cream text-sm">
                  {t('onboarding.privacyNote')}
                </p>
              </div>

              <Button
                type="submit"
                className="bg-pana-flame text-pana-ink hover:bg-pana-burnt w-full font-extrabold"
                disabled={
                  !displayName.trim() ||
                  !screenname.trim() ||
                  status !== 'available' ||
                  isSubmitting
                }
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('onboarding.saving')}
                  </>
                ) : (
                  t('onboarding.continue')
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* The skip stays, because the alternative is trapping someone behind a
            decision that is hard to undo for 90 days. What it does not do is
            pretend the choice is free — the cost is stated next to it. */}
        <div className="space-y-2 text-center">
          <Button
            type="button"
            variant="ghost"
            className="text-muted-foreground"
            disabled={isSubmitting}
            onClick={() => {
              /* Record the decision before leaving, or the root-layout gate
                 would greet this member with the same question as a modal on
                 the very next page. */
              if (userId) {
                sessionStorage.setItem(ONBOARDING_DISMISS_KEY, userId);
              }
              router.replace(destination);
            }}
          >
            {t('onboarding.skip')}
          </Button>
          <p className="text-muted-foreground mx-auto max-w-sm text-xs">
            {t('onboarding.skipCost')}
          </p>
        </div>
      </div>
    </div>
  );
}

export function WelcomeView({ rootPath }: { rootPath: string }) {
  return (
    <Suspense
      fallback={
        <div className="auth-surface flex items-center justify-center px-4 py-24">
          <Loader2 className="text-pana-burnt dark:text-pana-flame h-6 w-6 animate-spin" />
        </div>
      }
    >
      <WelcomeForm rootPath={rootPath} />
    </Suspense>
  );
}
