/**
 * Social Feature Gates
 *
 * Permission checks for social features. These gates determine
 * whether a user can access various social capabilities.
 *
 * @see docs/SOCIAL-ROADMAP.md
 */

import type { Profile } from '@/lib/schema';

export type GateResult = {
  allowed: boolean;
  reason?: string;
};

/**
 * Check if a profile is eligible for an automatic social identity.
 *
 * Requirements:
 * - Profile must exist
 * - Profile must have socialEligible = true
 *
 * socialEligible is set by:
 * - Age verification (when implemented)
 * - Admin approval
 * - Other verification methods TBD
 */
export function canCreateSocialActor(profile: Profile | null): GateResult {
  if (!profile) {
    return { allowed: false, reason: 'no_profile' };
  }

  if (!profile.socialEligible) {
    return {
      allowed: false,
      reason: profile.socialIneligibleReason || 'not_eligible',
    };
  }

  return { allowed: true };
}

/**
 * Check if a user can post to the social timeline.
 */
export function canPost(profile: Profile | null): GateResult {
  // Must be able to create actor first
  const actorGate = canCreateSocialActor(profile);
  if (!actorGate.allowed) {
    return actorGate;
  }

  // Additional checks can be added here (e.g., rate limits, suspensions)

  return { allowed: true };
}

/**
 * Check if a user can follow other accounts.
 */
export function canFollow(profile: Profile | null): GateResult {
  return canCreateSocialActor(profile);
}

/**
 * Check if a user can be followed by others.
 */
export function canBeFollowed(profile: Profile | null): GateResult {
  return canCreateSocialActor(profile);
}

/**
 * Check if a user can interact with federated (remote) accounts.
 * May be restricted for certain user types (e.g., under-18 local-only).
 */
export function canFederate(profile: Profile | null): GateResult {
  const actorGate = canCreateSocialActor(profile);
  if (!actorGate.allowed) {
    return actorGate;
  }

  // Future: check if user is restricted to local-only
  // if (profile.federationRestricted) {
  //   return { allowed: false, reason: 'local_only' };
  // }

  return { allowed: true };
}
