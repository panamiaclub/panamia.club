import type { Metadata } from 'next';
import { headers } from 'next/headers';
import {
  DEFAULT_SURFACE,
  originForFrom,
  resolveSurface,
} from '@/lib/panaverse/surfaces';
import { SURFACE_MARK } from '@/lib/panaverse/branding';
import { SignInView } from './_components/signin-view';

/**
 * Sign-in is shared by the whole panaverse — one account, one auth instance,
 * reachable from every surface hostname. What changes per surface is only the
 * framing: which mark flies above the card, which room the member lands in
 * afterwards, and where the main-site links point.
 *
 * This resolves that on the server so the client never has to guess from
 * `window.location`, which would flash the wrong wordmark on first paint.
 */

async function currentSurface() {
  const host = (await headers()).get('host') ?? '';
  return { host, surface: resolveSurface(host) };
}

/**
 * Which OAuth buttons to offer, read from the runtime env.
 *
 * This has to happen on the server. The flags are plain runtime variables, but
 * `signin-view.tsx` is a client component, so a `process.env` read there is
 * resolved by the bundler at build time — and with no build variable present
 * it compiles down to a constant `false`, leaving the button permanently
 * hidden however the Worker is configured. Resolving here and passing the
 * result down means one source of truth and no hydration mismatch.
 *
 * Read per request rather than at module scope: on Workers the env is bound
 * per invocation, so a module-level read can run before it exists.
 */
function resolveEnabledOAuthProviders(): string[] {
  const flags: Record<string, string | undefined> = {
    google: process.env.NEXT_PUBLIC_GOOGLE_ENABLED,
    apple: process.env.NEXT_PUBLIC_APPLE_ENABLED,
    wikimedia: process.env.NEXT_PUBLIC_WIKIMEDIA_ENABLED,
    mastodon: process.env.NEXT_PUBLIC_MASTODON_ENABLED,
  };
  return Object.entries(flags)
    .filter(([, value]) => value === 'true')
    .map(([id]) => id);
}

export async function generateMetadata(): Promise<Metadata> {
  const { surface } = await currentSurface();
  return {
    title: `Sign in | ${surface.name}`,
    // A sign-in page has nothing to index, and indexing one per surface
    // hostname would just compete with itself.
    robots: { index: false, follow: false },
  };
}

export default async function SignInPage() {
  const { host, surface } = await currentSurface();
  const isMainSite = surface.id === DEFAULT_SURFACE.id;

  return (
    <SignInView
      surfaceId={surface.id}
      surfaceName={surface.name}
      rootPath={surface.rootPath}
      mark={SURFACE_MARK[surface.id]}
      mainSiteName={DEFAULT_SURFACE.name}
      /* Derived from the host in hand rather than the configured root domain,
         so signing in at social.localhost links back to localhost instead of
         sending a developer out to the live site. */
      mainSiteUrl={isMainSite ? null : originForFrom(DEFAULT_SURFACE, host)}
      enabledOAuthProviders={resolveEnabledOAuthProviders()}
      googleClientId={process.env.GOOGLE_CLIENT_ID?.trim() || null}
    />
  );
}
