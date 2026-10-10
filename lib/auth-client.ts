'use client';

/**
 * Compatibility shim: next-auth/react → better-auth/react
 *
 * Exports useSession, signIn, signOut, and SessionProvider with the same
 * call signatures as next-auth/react so client files need only a one-line
 * import change.
 */

import { createAuthClient } from 'better-auth/react';
// better-auth 1.7 folded generic OAuth into the core social provider surface,
// so genericOAuthClient() is gone — wikimedia/mastodon go through
// authClient.signIn.social() like google/apple.
import {
  magicLinkClient,
  customSessionClient,
} from 'better-auth/client/plugins';
import { useMemo, useSyncExternalStore } from 'react';
import type { AppSession, BetterAuthServer } from '@/auth';
import { unregisterThisDevice } from '@/lib/mobile/push-client';

export const authClient = createAuthClient({
  plugins: [magicLinkClient(), customSessionClient<BetterAuthServer>()],
});

// ── useSession ───────────────────────────────────────────────────────────────
// Returns { data: AppSession | null, status: 'loading' | 'authenticated' | 'unauthenticated' }
//
// The return value is memoized on the underlying session/user identity so
// callers that pass `session` (or `session.user`) into a useEffect dep array
// don't re-fire on every render. Without this, any setState in the consumer
// triggers a render → new object literal → effect refires → setState → loop.
//
// Hydration safety: the server cannot fetch the session, so SSR always renders
// the 'loading' branch. On the client better-auth's store may settle before
// React hydrates — when it does, the hydration render disagrees with the server
// HTML and React discards the tree ("Hydration failed..."). Whether that races
// is timing-dependent, so it surfaces intermittently and more often when
// /api/auth/get-session responds instantly. Reporting 'loading' until hydration
// finishes keeps the server render and the hydration render identical.

const emptySubscribe = () => () => {};

// False during SSR and during the hydration render, true on every render after.
// Uses useSyncExternalStore rather than a mount effect because React is
// required to call getServerSnapshot for the hydration render itself, which is
// exactly the render that has to match the server.
function useIsHydrated(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

export function useSession(): {
  data: AppSession | null;
  status: 'loading' | 'authenticated' | 'unauthenticated';
} {
  const { data, isPending } = authClient.useSession();
  const isHydrated = useIsHydrated();

  // Treat the pre-hydration render as loading so it matches the server output.
  const pending = isPending || !isHydrated;

  // data.user is extended by customSession (server-side) with enriched fields
  const u = data?.user as
    | (NonNullable<typeof data>['user'] & {
        isAdmin?: boolean;
        isSuperAdmin?: boolean;
        panaVerified?: boolean;
        legalAgeVerified?: boolean;
        isMentoringModerator?: boolean;
        isEventOrganizer?: boolean;
        isContentModerator?: boolean;
      })
    | undefined;

  // Pull primitives out so useMemo deps are stable across renders.
  const userId = u?.id;
  const userEmail = u?.email;
  const emailVerified = u?.emailVerified ?? false;
  const isAdmin = u?.isAdmin ?? false;
  const isSuperAdmin = u?.isSuperAdmin ?? false;
  const panaVerified = u?.panaVerified ?? false;
  const legalAgeVerified = u?.legalAgeVerified ?? false;
  const isMentoringModerator = u?.isMentoringModerator ?? false;
  const isEventOrganizer = u?.isEventOrganizer ?? false;
  const isContentModerator = u?.isContentModerator ?? false;
  const expiresAtMs = data?.session.expiresAt
    ? new Date(data.session.expiresAt).getTime()
    : 0;

  return useMemo(() => {
    if (pending) {
      return { data: null, status: 'loading' as const };
    }
    if (!userId) {
      return { data: null, status: 'unauthenticated' as const };
    }
    return {
      data: {
        user: {
          id: userId,
          email: userEmail,
          emailVerified: emailVerified ? new Date() : null,
          name: '',
          image: '',
          isAdmin,
          isSuperAdmin,
          panaVerified,
          legalAgeVerified,
          isMentoringModerator,
          isEventOrganizer,
          isContentModerator,
        },
        expires: new Date(expiresAtMs).toISOString(),
      } as AppSession,
      status: 'authenticated' as const,
    };
  }, [
    pending,
    userId,
    userEmail,
    emailVerified,
    isAdmin,
    isSuperAdmin,
    panaVerified,
    legalAgeVerified,
    isMentoringModerator,
    isEventOrganizer,
    isContentModerator,
    expiresAtMs,
  ]);
}

// ── signIn ───────────────────────────────────────────────────────────────────
// Matches next-auth/react: signIn(provider?, options?)

export async function signIn(
  provider?: string,
  options?: {
    email?: string;
    callbackUrl?: string;
    redirect?: boolean;
    [key: string]: unknown;
  }
): Promise<void> {
  // better-auth resolves a relative callbackURL against the server's baseURL,
  // which is one fixed origin. A member signing in on social.pana.social is
  // therefore redirected to pana.social — the surface they weren't using.
  // Resolving against the surface in hand keeps them where they started; the
  // origin is accepted because every surface is in trustedOrigins.
  const requestedCallback = options?.callbackUrl ?? '/';
  const callbackURL =
    typeof window === 'undefined'
      ? requestedCallback
      : new URL(requestedCallback, window.location.origin).toString();

  if (provider === 'email' || provider === 'nodemailer') {
    // Magic link sign-in. better-auth returns { error } instead of throwing,
    // so surface it — otherwise a failed send looks like success to the caller.
    const { error } = await authClient.signIn.magicLink({
      email: options?.email ?? '',
      callbackURL,
    });
    if (error) {
      throw new Error(error.message ?? 'Magic link sign-in failed');
    }
    return;
  }

  if (provider) {
    // Social / OAuth sign-in
    const { error } = await authClient.signIn.social({
      provider: provider as Parameters<
        typeof authClient.signIn.social
      >[0]['provider'],
      callbackURL,
    });
    if (error) {
      throw new Error(error.message ?? 'OAuth sign-in failed');
    }
  }
}

// ── signOut ──────────────────────────────────────────────────────────────────
// Matches next-auth/react: signOut(options?)

export async function signOut(options?: {
  redirect?: boolean;
  callbackUrl?: string;
}): Promise<void> {
  const callbackURL = options?.callbackUrl ?? '/';

  /* Stop push to this device before the session is destroyed, not after.
   *
   * Ordering is the whole point. /api/push/unregister requires a session, so
   * once better-auth has cleared the cookie there is no authenticated way to
   * say "this device is no longer mine" — the call would 401 and the device
   * would keep receiving the previous member's notifications, message
   * previews included, until somebody else signed in on it.
   *
   * Awaited, but failure is ignored: signing out must succeed even when the
   * network does not. The remaining protections for that case are that a new
   * sign-in reassigns the token to its new owner (lib/push/tokens.ts) and
   * that dead tokens are pruned on send (lib/push/index.ts).
   *
   * Does nothing in a browser — unregisterThisDevice returns immediately when
   * there is no native push plugin to ask. */
  await unregisterThisDevice().catch(() => {});

  await authClient.signOut({
    fetchOptions: {
      onSuccess: () => {
        if (options?.redirect !== false && typeof window !== 'undefined') {
          window.location.href = callbackURL;
        }
      },
    },
  });
}

// ── SessionProvider ──────────────────────────────────────────────────────────
// better-auth does not require a provider wrapper. This is a passthrough shim
// so existing code that renders <SessionProvider> continues to compile.

export function SessionProvider({
  children,
}: {
  children: React.ReactNode;
  session?: AppSession | null;
}) {
  return children as React.ReactElement;
}
