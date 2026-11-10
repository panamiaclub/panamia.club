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

export const LISTING_PRIMARY_PHOTO_REQUIRED_MESSAGE =
  'Add and save a primary business photo in Photos before confirming this review. An existing primary photo counts; gallery photos are optional.';

export function hasListingPrimaryPhoto(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  const source = value.trim();
  if (
    !/^https?:\/\//i.test(source) &&
    !(source.startsWith('/') && !source.startsWith('//'))
  )
    return false;
  try {
    const url = new URL(source, 'https://listing-photo.invalid');
    const path = decodeURIComponent(url.pathname);
    // Saved media URLs count, not inline seed art, file previews or site fallbacks.
    return (
      !url.username &&
      !url.password &&
      path !== '/' &&
      !/^\/(?:logos\/(?:logo(?:_new(?:_3)?|_pink_boxed)?\.png|pana_logo_long_[a-z]+\.png|2023_logo_[a-z]+\.svg)|favicon\.(?:png|ico)|meta_image\.jpg|social-preview-flower\.jpg)$/i.test(
        path
      ) &&
      !/(?:^|\/)(?:placeholder|default[-_](?:avatar|profile|image)|no[-_]image)(?:[./_-]|$)/i.test(
        path
      )
    );
  } catch {
    return false;
  }
}

export type ListingLocationMode = 'storefront' | 'online' | 'mobile';

export function isListingLocationMode(
  value: unknown
): value is ListingLocationMode {
  return value === 'storefront' || value === 'online' || value === 'mobile';
}

export function publicVisitingAddressIssue(address: {
  street1?: unknown;
  city?: unknown;
  state?: unknown;
}) {
  for (const [field, message] of [
    ['street1', 'Enter the public street address where visitors are welcome.'],
    ['city', 'Enter the city for the public visiting address.'],
    ['state', 'Enter the state for the public visiting address.'],
  ] as const) {
    const value = address[field];
    if (typeof value !== 'string' || !value.trim()) return { field, message };
  }
  return null;
}

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
