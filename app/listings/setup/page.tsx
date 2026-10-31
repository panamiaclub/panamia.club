'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Loader2, Store } from 'lucide-react';
import { useSession } from '@/lib/auth-client';
import { listingSetupPath } from '@/lib/listing-url';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface SetupListing {
  profileId: string;
  name: string;
  state: 'owned' | 'confirm';
  active: boolean;
  reviewState: 'approved' | 'declined' | 'pending' | 'inactive';
}

function isSetupListing(
  value: unknown,
  profileId: string
): value is SetupListing {
  if (!value || typeof value !== 'object') return false;
  const listing = value as Record<string, unknown>;
  return (
    listing.profileId === profileId &&
    typeof listing.name === 'string' &&
    (listing.state === 'owned' || listing.state === 'confirm') &&
    typeof listing.active === 'boolean' &&
    (listing.reviewState === 'approved' ||
      listing.reviewState === 'declined' ||
      listing.reviewState === 'pending' ||
      listing.reviewState === 'inactive')
  );
}

function responseError(value: unknown, fallback: string): string {
  if (
    value &&
    typeof value === 'object' &&
    'error' in value &&
    typeof value.error === 'string'
  ) {
    return value.error;
  }
  return fallback;
}

function ListingSetup() {
  const params = useSearchParams();
  const profileId = params?.get('profileId');
  const { data: session, status } = useSession();
  const { t } = useTranslation('getListed');
  const [listing, setListing] = useState<SetupListing | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setListing(null);
    setError('');
    setLoading(true);
    if (status !== 'authenticated' || !profileId) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetch(`/api/listings/setup?profileId=${encodeURIComponent(profileId)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const data: unknown = await response.json();
        if (!response.ok) throw new Error(responseError(data, t('setupError')));
        if (!isSetupListing(data, profileId)) throw new Error(t('setupError'));
        if (!controller.signal.aborted) setListing(data);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        console.error('Business setup lookup failed:', cause);
        setError(cause instanceof Error ? cause.message : t('setupError'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [profileId, status, session?.user?.id, session?.user?.email, t]);

  async function confirm() {
    if (!listing || !session?.user?.id) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/listings/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: listing.profileId,
          expectedOwnerId: session.user.id,
        }),
      });
      const data: unknown = await response.json();
      if (
        !response.ok ||
        !data ||
        typeof data !== 'object' ||
        !('success' in data) ||
        data.success !== true
      ) {
        throw new Error(responseError(data, t('setupError')));
      }
      // Reload the cookie-scoped business selection and the header identity.
      window.location.assign('/account/profile/edit');
    } catch (cause) {
      console.error('Business setup confirmation failed:', cause);
      setError(cause instanceof Error ? cause.message : t('setupError'));
      setSaving(false);
    }
  }

  const signInPath = `/signin?callbackUrl=${encodeURIComponent(listingSetupPath(profileId ?? ''))}`;
  return (
    <main className="auth-surface flex min-h-[65vh] items-center justify-center px-4 py-12">
      <Card className="w-full max-w-xl rounded-2xl">
        <CardContent className="space-y-5 p-8">
          <Store className="text-pana-indigo h-9 w-9" aria-hidden="true" />
          <h1 className="text-2xl font-black">{t('setupTitle')}</h1>
          {!profileId ? (
            <p role="alert">{t('setupMissing')}</p>
          ) : status === 'loading' ? (
            <p role="status">{t('setupLoading')}</p>
          ) : status !== 'authenticated' ? (
            <>
              <p>{t('setupSignInNote')}</p>
              <Button asChild className="w-full">
                <Link href={signInPath}>{t('setupSignIn')}</Link>
              </Button>
            </>
          ) : (
            <>
              {loading && <p role="status">{t('setupLoading')}</p>}
              {listing && !loading && (
                <>
                  <h2 className="text-xl font-extrabold">{listing.name}</h2>
                  <p>
                    {t(
                      listing.state === 'owned'
                        ? 'setupOwnedNote'
                        : 'setupConfirmNote'
                    )}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {t(
                      listing.reviewState === 'approved'
                        ? 'setupPublished'
                        : listing.reviewState === 'declined'
                          ? 'setupDeclined'
                          : listing.reviewState === 'inactive'
                            ? 'setupInactive'
                            : 'setupUnderReview'
                    )}
                  </p>
                  <Button
                    onClick={confirm}
                    disabled={saving}
                    className="w-full font-bold"
                  >
                    {saving ? (
                      <Loader2
                        className="mr-2 h-4 w-4 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <CheckCircle2
                        className="mr-2 h-4 w-4"
                        aria-hidden="true"
                      />
                    )}
                    {saving
                      ? t('setupSaving')
                      : t(
                          listing.state === 'owned'
                            ? 'setupManage'
                            : 'setupConfirm',
                          { name: listing.name }
                        )}
                  </Button>
                </>
              )}
              {error && (
                <p role="alert" className="text-destructive">
                  {error}
                </p>
              )}
              {error && (
                <p className="text-muted-foreground text-sm">
                  {t('setupAccountHint')}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

export default function ListingSetupPage() {
  const { t } = useTranslation('getListed');
  return (
    <Suspense fallback={<p>{t('setupLoading')}</p>}>
      <ListingSetup />
    </Suspense>
  );
}
