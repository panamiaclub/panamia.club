export function listingPublicPath(listing: {
  id: string;
  screenname?: string | null;
}): string {
  const handle = listing.screenname?.trim();
  return handle
    ? `/p/${encodeURIComponent(handle)}`
    : `/listings/${encodeURIComponent(listing.id)}`;
}

export function listingSetupPath(profileId: string): string {
  return `/listings/setup?profileId=${encodeURIComponent(profileId)}`;
}

export function listingClaimPath(profileId: string): string {
  return `/listings/claim/start?id=${encodeURIComponent(profileId)}`;
}

export function listingReviewPath(profileId: string): string {
  return `/listings/review?id=${encodeURIComponent(profileId)}`;
}

export function listingPreviewPath(profileId: string): string {
  return `/admin/listings/${encodeURIComponent(profileId)}/preview`;
}
