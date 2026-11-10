export const LISTING_INVITATION_DAYS = 7;

export function listingInvitationIdentifier(profileId: string): string {
  return `listing-invitation:${profileId}`;
}

export function listingInvitationPath(profileId: string): string {
  return `/listings/invite?id=${encodeURIComponent(profileId)}`;
}

export function isListingInvitationToken(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

export function readListingInvitationFragment(hash: string): string | null {
  const fragment = new URLSearchParams(hash.replace(/^#/, ''));
  const token = fragment.get('token');
  return fragment.size === 1 && isListingInvitationToken(token) ? token : null;
}

export interface ListingInvitationState {
  profileId: string;
  state: 'available' | 'owned';
  expiresAt: string | null;
}

export function isListingInvitationState(
  value: unknown,
  profileId: string
): value is ListingInvitationState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Record<string, unknown>;
  return (
    state.profileId === profileId &&
    ((state.state === 'owned' && state.expiresAt === null) ||
      (state.state === 'available' &&
        typeof state.expiresAt === 'string' &&
        Number.isFinite(Date.parse(state.expiresAt))))
  );
}
