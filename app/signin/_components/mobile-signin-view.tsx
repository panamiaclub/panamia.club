'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useIsNativeApp } from '@/lib/mobile/use-native-app';
import {
  MOBILE_MAGIC_LINK_PATH,
  magicLinkVerificationUrl,
  mobileMagicLinkAppUrl,
  mobileMagicLinkIntentUrl,
  rememberNativeLaunchUrl,
} from '@/lib/mobile/auth-links';

export function MobileSignInView() {
  const searchParams = useSearchParams();
  const query = searchParams?.toString() ?? '';
  const isNativeApp = useIsNativeApp();
  const { t } = useTranslation('signin');
  const [handoff, setHandoff] = useState<{
    appUrl: string;
    intentUrl: string;
    verificationUrl: string;
  } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const url = new URL(MOBILE_MAGIC_LINK_PATH, window.location.origin);
      url.search = query;
      const verificationUrl = magicLinkVerificationUrl(url.href);

      if (!isNativeApp) {
        setHandoff({
          appUrl: mobileMagicLinkAppUrl(url.href),
          intentUrl: mobileMagicLinkIntentUrl(url.href),
          verificationUrl,
        });
        return;
      }

      const { App } = await import('@capacitor/app');
      const launch = await App.getLaunchUrl();
      if (cancelled) return;
      // Remember on this origin before verification redirects away, including
      // when the app started on the other panaverse surface.
      if (launch?.url) await rememberNativeLaunchUrl(launch.url);
      if (!cancelled) window.location.replace(verificationUrl);
    })().catch((error: unknown) => {
      console.error('[mobile-auth] email link handoff failed', error);
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [isNativeApp, query]);

  return (
    <div
      className="auth-surface flex min-h-[60vh] items-center justify-center px-4 py-12"
      data-standalone="true"
    >
      <Card className="border-pana-ink/10 w-full max-w-md rounded-2xl shadow-xl dark:border-white/10">
        <CardContent className="space-y-6 p-8 text-center">
          <h1 className="text-foreground text-2xl font-black tracking-tight">
            {t('mobileSignInTitle')}
          </h1>
          {failed ? (
            <>
              <p role="alert" className="text-destructive text-sm">
                {t('mobileInvalidLink')}
              </p>
              <Button asChild>
                <a href="/signin">{t('mobileRequestNewLink')}</a>
              </Button>
            </>
          ) : isNativeApp || !handoff ? (
            <p role="status" className="text-muted-foreground text-sm">
              {t('signingIn')}
            </p>
          ) : (
            <>
              <p className="text-muted-foreground text-sm">
                {t('mobileSignInDescription')}
              </p>
              <Button asChild className="w-full" size="lg">
                <a
                  href={handoff.appUrl}
                  onClick={(event) => {
                    if (/Android/i.test(navigator.userAgent)) {
                      event.preventDefault();
                      window.location.assign(handoff.intentUrl);
                    }
                  }}
                >
                  {t('mobileOpenApp')}
                </a>
              </Button>
              <p className="text-muted-foreground text-xs">
                {t('mobileAppHelp')}
              </p>
              <a
                href={handoff.verificationUrl}
                className="text-pana-indigo dark:text-pana-flame block text-sm font-semibold hover:underline"
              >
                {t('mobileBrowserInstead')}
              </a>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
