/**
 * Device token storage: registration, removal, and pruning of dead tokens.
 *
 * Every function here is written so that a device belongs to exactly one
 * account at a time. See the comment on the `device_tokens` table in
 * lib/schema/index.ts for why that invariant is a privacy control rather than
 * a tidiness one.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { deviceTokens } from '@/lib/schema';

export type DevicePlatform = 'ios' | 'android';

export interface StoredDeviceToken {
  token: string;
  platform: DevicePlatform;
}

/**
 * Record that a device will receive notifications for this member.
 *
 * Upserts on `token` rather than inserting. A phone that was signed into one
 * account and is now signed into another must be *reassigned*, not added
 * again: leaving the previous row in place would deliver the previous
 * member's notifications — direct messages included, with sender and preview
 * text — to whoever holds the handset now.
 *
 * Called on every app launch, not only at sign-in, which is what keeps
 * `lastSeenAt` meaningful: an uninstalled app produces no event anywhere, so
 * the absence of recent registrations is the only signal that an install is
 * gone.
 */
export async function registerDeviceToken(
  userId: string,
  token: string,
  platform: DevicePlatform
): Promise<void> {
  const now = new Date();

  await db
    .insert(deviceTokens)
    .values({ userId, token, platform, lastSeenAt: now })
    .onConflictDoUpdate({
      target: deviceTokens.token,
      set: { userId, platform, lastSeenAt: now, updatedAt: now },
    });
}

/**
 * Stop sending to a device, on sign-out.
 *
 * Scoped to the signing-out member rather than matching the token alone. The
 * two differ in one case that matters: if registration for a new account has
 * already landed, a sign-out request still in flight from the old session
 * would otherwise delete the *new* owner's registration and silently leave
 * them with no notifications.
 */
export async function unregisterDeviceToken(
  userId: string,
  token: string
): Promise<void> {
  await db
    .delete(deviceTokens)
    .where(
      and(eq(deviceTokens.userId, userId), eq(deviceTokens.token, token))
    );
}

/** Every device currently registered to a member. */
export async function getDeviceTokensForUser(
  userId: string
): Promise<StoredDeviceToken[]> {
  const rows = await db
    .select({ token: deviceTokens.token, platform: deviceTokens.platform })
    .from(deviceTokens)
    .where(eq(deviceTokens.userId, userId));

  return rows as StoredDeviceToken[];
}

/**
 * Delete tokens the push services have disowned.
 *
 * Called with the tokens that came back `dead` from a send. Both services
 * report this unambiguously and permanently, so there is nothing to retry and
 * a retained row would be a known-undeliverable address carried through every
 * future send.
 */
export async function pruneDeadTokens(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;

  await db.delete(deviceTokens).where(inArray(deviceTokens.token, tokens));
}
