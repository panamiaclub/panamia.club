import { listingClaimPath, listingReviewPath } from '@/lib/listing-url';

export const LISTING_REVIEW_STEPS = [
  { key: 'address', label: 'Location' },
  { key: 'desc', label: 'Description' },
  { key: 'categories', label: 'Categories' },
  { key: 'contact', label: 'Private contact' },
  { key: 'social', label: 'Public links' },
  { key: 'images', label: 'Photos' },
] as const;

export type ListingReviewStep = (typeof LISTING_REVIEW_STEPS)[number]['key'];

export function listingReviewStepPath(
  profileId: string,
  step: ListingReviewStep
): string {
  return `/account/profile/${step}?listingId=${encodeURIComponent(profileId)}`;
}

export function listingReviewFinishPath(profileId: string): string {
  return `${listingReviewPath(profileId)}&complete=1`;
}

export function listingReviewNavigation(
  profileId: string,
  step: ListingReviewStep
) {
  const index = LISTING_REVIEW_STEPS.findIndex((item) => item.key === step);
  const previous = LISTING_REVIEW_STEPS[index - 1];
  const next = LISTING_REVIEW_STEPS[index + 1];
  return {
    backHref: previous
      ? listingReviewStepPath(profileId, previous.key)
      : listingClaimPath(profileId),
    nextHref: next
      ? listingReviewStepPath(profileId, next.key)
      : listingReviewFinishPath(profileId),
  };
}

export interface ClaimListingContext {
  profileId: string;
  name: string;
  summary: string;
  imageUrl: string | null;
  publicPath: string;
  locationLabel: string;
  missingLocation: boolean;
  claimable: boolean;
  canManage: boolean;
  published?: boolean;
  reviewPaused?: boolean;
}

export function isClaimListingContext(
  value: unknown,
  profileId: string
): value is ClaimListingContext {
  if (!value || typeof value !== 'object') return false;
  const listing = value as Record<string, unknown>;
  return (
    listing.profileId === profileId &&
    typeof listing.name === 'string' &&
    typeof listing.summary === 'string' &&
    (listing.imageUrl === null || typeof listing.imageUrl === 'string') &&
    typeof listing.publicPath === 'string' &&
    typeof listing.locationLabel === 'string' &&
    typeof listing.missingLocation === 'boolean' &&
    typeof listing.claimable === 'boolean' &&
    typeof listing.canManage === 'boolean' &&
    (listing.published === undefined ||
      typeof listing.published === 'boolean') &&
    (listing.reviewPaused === undefined ||
      typeof listing.reviewPaused === 'boolean')
  );
}
