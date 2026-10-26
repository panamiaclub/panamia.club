/**
 * Active profile ("act as") resolution.
 *
 * One login can administer several profiles: the person's own, plus any
 * business listings they have claimed. This module answers "which one are they
 * acting as right now?" for server code.
 *
 * The selection lives in a cookie, which is client-controlled and therefore
 * never trusted. Every read re-validates the id against profile_owners before
 * returning it, so forging the cookie gets you nothing — a mismatch silently
 * falls back to the user's own profile rather than erroring, because a stale
 * cookie (access revoked, listing deleted) is expected, not exceptional.
 *
 * @see lib/server/profile-owners.ts
 */

import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { profiles } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { ensureActorForProfile } from '@/lib/federation/wrappers/actor';
import { canAdministerProfile } from './profile-owners';

export const ACTIVE_PROFILE_COOKIE = 'pana_active_profile';

/**
 * Resolve the profile this user is currently acting as.
 *
 * Order: validated cookie selection, else their own profile.
 * Returns null only when the user has no profile at all.
 */
export async function getActiveProfileId(
  userId: string
): Promise<string | null> {
  const store = await cookies();
  const selected = store.get(ACTIVE_PROFILE_COOKIE)?.value;

  if (selected && (await canAdministerProfile(userId, selected))) {
    return selected;
  }

  const own = await db.query.profiles.findFirst({
    where: eq(profiles.userId, userId),
    columns: { id: true },
  });

  return own?.id ?? null;
}

/**
 * Full profile row for whoever the user is acting as.
 */
export async function getActiveProfile(userId: string) {
  const id = await getActiveProfileId(userId);
  if (!id) return null;

  return (
    (await db.query.profiles.findFirst({ where: eq(profiles.id, id) })) ?? null
  );
}

/**
 * Active profile with its social actor prepared and loaded.
 *
 * This is what makes "post as the business" work: the actor is resolved from
 * whoever the user is acting as, so a status created while switched to a
 * business listing is authored by the business's actor, not the person's.
 */
export async function getActiveProfileWithActor(userId: string) {
  const id = await getActiveProfileId(userId);
  if (!id) return null;

  const loadProfile = () =>
    db.query.profiles.findFirst({
      where: eq(profiles.id, id),
      with: { socialActor: true, user: { columns: { screenname: true } } },
    });
  const profile = await loadProfile();
  if (
    profile &&
    !profile.socialActor &&
    profile.socialEligible &&
    (profile.screenname ?? profile.user?.screenname)?.trim()
  ) {
    await ensureActorForProfile(profile.id);
    return (await loadProfile()) ?? null;
  }
  return profile ?? null;
}

/**
 * Assert the user may act as this profile, for write paths that take an
 * explicit profile id rather than reading the cookie.
 */
export async function requireProfileAccess(
  userId: string,
  profileId: string
): Promise<boolean> {
  return canAdministerProfile(userId, profileId);
}
