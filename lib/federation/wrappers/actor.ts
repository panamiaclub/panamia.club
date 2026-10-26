/**
 * Actor Management
 *
 * High-level functions for creating and managing SocialActors.
 * Bridges panamia Profiles to ActivityPub actors.
 *
 * @see docs/SOCIAL-ROADMAP.md
 */

import { db } from '@/lib/db';
import { socialActors, profiles, toPublicActor } from '@/lib/schema';
import type { Profile, SocialActor, PublicSocialActor } from '@/lib/schema';
import { and, eq, sql } from 'drizzle-orm';
import { generateActorKeyPair } from '../crypto/keys';
import { canCreateSocialActor, GateResult } from '../gates';
import { localActorFilter } from '../local-actor';
import {
  socialConfig,
  getActorUrl,
  getInboxUrl,
  getOutboxUrl,
  getFollowersUrl,
  getFollowingUrl,
} from '../index';

export type CreateActorResult =
  | { success: true; actor: PublicSocialActor }
  | { success: false; error: string; gateResult?: GateResult };

/**
 * Create a SocialActor for a Profile.
 */
export async function createActorForProfile(
  profileId: string
): Promise<CreateActorResult> {
  // Fetch the profile with user and socialActor
  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.id, profileId),
    with: { socialActor: true, user: true },
  });

  if (!profile) {
    return { success: false, error: 'Profile not found' };
  }

  // Check gate
  const gateResult = canCreateSocialActor(profile);
  if (!gateResult.allowed) {
    return {
      success: false,
      error: 'Not eligible for social features',
      gateResult,
    };
  }

  // Must have a handle. Prefer the profile's own, falling back to the linked
  // user's for profiles that predate profiles.screenname and have not been
  // through a rename since the backfill. A business listing has no user at all,
  // so sourcing this from profiles is what lets it federate.
  const username = profile.screenname ?? profile.user?.screenname;

  if (!username?.trim()) {
    return {
      success: false,
      error: 'A handle is required to use social features',
    };
  }

  // Check if already has an actor
  if (profile.socialActor) {
    return { success: true, actor: toPublicActor(profile.socialActor) };
  }

  // Generate keypair
  const { publicKey, privateKey } = generateActorKeyPair();

  // Build URIs
  const domain = socialConfig.domain;
  const uri = getActorUrl(username);

  // Create the actor
  const [actor] = await db
    .insert(socialActors)
    .values({
      username,
      domain,
      profileId: profile.id,
      uri,
      inboxUrl: getInboxUrl(username),
      outboxUrl: getOutboxUrl(username),
      followersUrl: getFollowersUrl(username),
      followingUrl: getFollowingUrl(username),
      publicKey,
      privateKey,
      name: profile.name,
      summary: getProfileSummary(profile),
      iconUrl: profile.primaryImageCdn ?? undefined,
    })
    .onConflictDoNothing()
    .returning();

  if (!actor) {
    // A concurrent request may have created this profile's identity. Only
    // reuse that identity, never another profile's conflicting handle or URI.
    const existing = await db.query.socialActors.findFirst({
      where: eq(socialActors.profileId, profileId),
    });
    if (existing) {
      return { success: true, actor: toPublicActor(existing) };
    }
    return {
      success: false,
      error: 'A social identity already uses this handle or URI',
    };
  }

  return { success: true, actor: toPublicActor(actor) };
}

/**
 * Prepare an eligible profile's identity without a separate activation step.
 * Ineligibility is expected; provisioning failures must remain visible.
 */
export async function ensureActorForProfile(
  profileId: string
): Promise<PublicSocialActor | null> {
  const result = await createActorForProfile(profileId);
  if (result.success) return result.actor;
  if (result.gateResult && !result.gateResult.allowed) return null;
  throw new Error(`Could not prepare social account: ${result.error}`);
}

/**
 * Update a SocialActor when its Profile changes.
 */
export async function syncActorFromProfile(
  profileId: string
): Promise<SocialActor | null> {
  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.id, profileId),
    with: { socialActor: true },
  });

  if (!profile || !profile.socialActor) {
    return null;
  }

  const [actor] = await db
    .update(socialActors)
    .set({
      name: profile.name,
      summary: getProfileSummary(profile),
      iconUrl: profile.primaryImageCdn ?? undefined,
    })
    .where(eq(socialActors.id, profile.socialActor.id))
    .returning();

  return actor ?? null;
}

/**
 * Get a SocialActor by screenname (local users only).
 */
export async function getActorByScreenname(
  screenname: string
): Promise<SocialActor | null> {
  return (
    (await db.query.socialActors.findFirst({
      where: and(
        sql`lower(${socialActors.username}) = lower(${screenname})`,
        localActorFilter(socialConfig.domain)
      ),
    })) ?? null
  );
}

/**
 * Get a SocialActor by full handle (@username@domain).
 */
export async function getActorByHandle(
  handle: string
): Promise<SocialActor | null> {
  // Parse handle: @username@domain or username@domain
  const cleaned = handle.replace(/^@/, '');
  const parts = cleaned.split('@');

  if (parts.length !== 2) {
    return null;
  }

  const [username, domain] = parts;

  return (
    (await db.query.socialActors.findFirst({
      where: (a, { and, eq }) =>
        and(eq(a.username, username), eq(a.domain, domain)),
    })) ?? null
  );
}

/**
 * Get a SocialActor by ActivityPub URI.
 */
export async function getActorByUri(uri: string): Promise<SocialActor | null> {
  return (
    (await db.query.socialActors.findFirst({
      where: eq(socialActors.uri, uri),
    })) ?? null
  );
}

/**
 * Extract a summary/bio from a Profile for the actor.
 */
function getProfileSummary(profile: Profile): string | undefined {
  const descriptions = profile.descriptions as {
    details?: string;
    background?: string;
  } | null;

  if (descriptions?.details) {
    return descriptions.details;
  }

  if (descriptions?.background) {
    return descriptions.background;
  }

  return undefined;
}
