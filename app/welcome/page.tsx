import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { resolveSurface } from '@/lib/panaverse/surfaces';
import { safeInternalPath } from '@/lib/safe-path';
import { WelcomeView } from './_components/welcome-view';

/**
 * The first page a brand-new member sees after their first sign-in.
 *
 * It exists because signing up and signing in are the same exchange here: a
 * magic link authenticates an email and nothing else, so a first-time member
 * arrives with a `users` row and no profile — able to read, silently unable to
 * post or follow. This page resolves that half-state by collecting the name and
 * screenname that create a profile.
 *
 * Deliberately an interstitial and not a wizard: one page, two required answers,
 * and a skip that says what it costs. See docs/ONBOARDING-ROADMAP.md.
 */

export async function generateMetadata(): Promise<Metadata> {
  const host = (await headers()).get('host') ?? '';
  const surface = resolveSurface(host);
  return {
    title: `Welcome | ${surface.name}`,
    // Nothing here is meaningful to a search engine, and it is reachable only
    // while signed in.
    robots: { index: false, follow: false },
  };
}

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const host = (await headers()).get('host') ?? '';
  const surface = resolveSurface(host);
  const session = await auth();
  const { next } = await searchParams;

  // Signed-out visitors have nothing to set up. Send them to the one door —
  // carrying the interrupted destination through, so a sign-in bounce does not
  // quietly lose where they were originally headed. Validated rather than
  // reflected: `next` arrives from the query string, so echoing it unchecked
  // into a redirect would hand an attacker our domain as a phishing hop.
  if (!session?.user?.id) {
    const safeNext = safeInternalPath(next);
    const target = safeNext
      ? `/welcome?next=${encodeURIComponent(safeNext)}`
      : '/welcome';
    redirect(`/signin?callbackUrl=${encodeURIComponent(target)}`);
  }

  return <WelcomeView rootPath={surface.rootPath} />;
}
