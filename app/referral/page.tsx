import Link from 'next/link';
import { ArrowRight, Store, UserPlus, UsersRound } from 'lucide-react';
import { cookies } from 'next/headers';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  normalizeReferralAttributionId,
  REFERRAL_COOKIE,
} from '@/lib/referrals';

export const metadata = {
  title: 'You were invited | Pana MIA Club',
  description:
    'Create your Pana account, join the directory, or become a Community Connector.',
  robots: { index: false, follow: false },
};

function continueHref(next: string, attributionId: string | null) {
  const params = new URLSearchParams({ next });
  if (attributionId) params.set('attribution', attributionId);
  return `/referral/continue?${params.toString()}`;
}

export default async function ReferralLandingPage({
  searchParams,
}: {
  searchParams: Promise<{ invalid?: string }>;
}) {
  const [params, cookieStore] = await Promise.all([searchParams, cookies()]);
  const attributionId = normalizeReferralAttributionId(
    cookieStore.get(REFERRAL_COOKIE)?.value
  );

  return (
    <main className="auth-surface min-h-screen px-4 py-12 sm:py-16">
      <div className="mx-auto max-w-5xl">
        <header className="mx-auto max-w-3xl text-center">
          <span className="section-eyebrow">A Pana invited you</span>
          <h1 className="text-foreground mt-3 text-4xl font-black tracking-tight sm:text-5xl">
            Pick where you want to start.
          </h1>
          <p className="text-pana-ink/70 dark:text-muted-foreground mt-4 text-lg leading-relaxed">
            You can do one of these or all three. Your invitation stays
            connected as you create an account, join the directory, or become a
            Community Connector.
          </p>
          {params.invalid && (
            <p
              className="border-pana-red/30 bg-pana-red/10 text-pana-red-deep mt-5 rounded-xl border px-4 py-3 text-sm font-bold"
              role="alert"
            >
              That invitation link is no longer valid, but every Pana door is
              still open below.
            </p>
          )}
        </header>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          <Card className="border-pana-ink/10 rounded-2xl shadow-lg">
            <CardHeader>
              <UserPlus
                className="text-pana-indigo h-8 w-8"
                aria-hidden="true"
              />
              <CardTitle className="pt-2 text-xl font-black">
                Your Pana account
              </CardTitle>
              <CardDescription>
                One account gives you a profile, Pana Social, events, groups,
                and every community surface.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full font-extrabold">
                <Link
                  href={continueHref(
                    '/account/user/edit#referrals',
                    attributionId
                  )}
                >
                  Create or open my account
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="border-pana-ink/10 rounded-2xl shadow-lg">
            <CardHeader>
              <Store className="text-pana-burnt h-8 w-8" aria-hidden="true" />
              <CardTitle className="pt-2 text-xl font-black">
                Join the directory
              </CardTitle>
              <CardDescription>
                Add a South Florida shop, studio, band, organization, or
                community project so people can find it.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full font-extrabold">
                <Link href="/form/get-listed">
                  Start a directory listing
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="border-pana-ink/10 rounded-2xl shadow-lg">
            <CardHeader>
              <UsersRound
                className="text-pana-flame h-8 w-8"
                aria-hidden="true"
              />
              <CardTitle className="pt-2 text-xl font-black">
                Become a Connector
              </CardTitle>
              <CardDescription>
                Join a neighborhood pod and help connect people, projects, and
                opportunities across South Florida.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full font-extrabold">
                <Link href={continueHref('/connectors/join', attributionId)}>
                  Apply to be a Connector
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
