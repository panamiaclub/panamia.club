import { createActorForProfile } from '@/lib/federation';
import { revalidatePublicListing } from './profile';

export async function prepareClaimedListing(
  profileId: string,
  screenname: string | null
) {
  revalidatePublicListing(profileId, screenname);
  // Ownership is committed. An optional actor outage must not report a failed claim.
  try {
    const actor = await createActorForProfile(profileId);
    if (!actor.success) {
      console.warn('[listings/claim] actor unavailable', {
        profileId,
        error: actor.error,
      });
    }
  } catch (error) {
    console.error(
      '[listings/claim] ownership confirmed but actor setup failed',
      { profileId, error }
    );
  }
}
