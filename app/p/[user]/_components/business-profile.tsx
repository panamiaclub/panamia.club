import type { LegacyProfile } from '@/lib/server/profile';
import {
  getProfileSignalCounts,
  getRecommenderAvatars,
} from '@/lib/server/profile-signals';
import { getUpcomingEventsForHost } from '@/lib/event';
import { isProfileClaimed } from '@/lib/server/profile-owners';
import { getActorByScreenname } from '@/lib/federation/wrappers/actor';
import { npubFromHex } from '@/lib/nostr/keys';
import { NpubQr } from '@/components/relay/NpubQr';
import { toProfileView } from '../_lib/profile-view';
import { ProfileViewer } from './profile-viewer';
import { ProfileHero } from './profile-hero';
import { ProfileAbout } from './profile-about';
import { ProfileGallery } from './profile-gallery';
import {
  ProfileEvents,
  ProfileEventsEmpty,
  type ProfileEvent,
} from './profile-events';
import { ProfileLocation } from './profile-location';
import { MentoringSection } from './mentoring-section';
import { SocialSection } from './social-section';
import { ClaimListingCta } from './claim-listing-cta';

export async function BusinessProfile({
  profile,
  handle = '',
  preview = false,
}: {
  profile: LegacyProfile;
  handle?: string;
  preview?: boolean;
}) {
  const view = toProfileView(profile, handle);
  const [counts, recommenderAvatars, upcoming, claimed, socialActor] =
    await Promise.all([
      getProfileSignalCounts(profile.id),
      getRecommenderAvatars(profile.id),
      getUpcomingEventsForHost(profile.id),
      isProfileClaimed(profile.id),
      !preview && handle ? getActorByScreenname(handle) : Promise.resolve(null),
    ]);
  const events: ProfileEvent[] = upcoming.map((event) => ({
    id: event.id,
    slug: event.slug,
    title: event.title,
    startsAt: event.startsAt,
    timezone: event.timezone,
    coverImage: event.coverImage,
    coverImageAlt: event.coverImageAlt,
    online: event.mode === 'online',
    venueName: event.venue?.name ?? null,
    venueCity: event.venue?.city ?? null,
  }));
  const tags = (profile.tags ?? '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
  const hasAddress =
    !view.onlineOnly &&
    Boolean(
      profile.primary_address?.street1 ||
      profile.primary_address?.city ||
      profile.primary_address?.state ||
      profile.primary_address?.zipcode
    );
  const isMentor = Boolean(handle) && profile.mentoring?.enabled === true;
  let npub: string | null = null;
  if (typeof profile.nostrPubkey === 'string') {
    try {
      npub = npubFromHex(profile.nostrPubkey);
    } catch {
      npub = null;
    }
  }
  const Container = preview ? 'div' : 'main';
  return (
    <ProfileViewer
      profileId={profile.id}
      businessName={view.name}
      businessLogo={view.logo}
      initialSaves={counts.saves}
      initialRecommends={counts.recommends}
      preview={preview}
    >
      <Container>
        <ProfileHero
          profile={view}
          recommenderAvatars={recommenderAvatars}
          preview={preview}
        />
        <section className="surface-butter py-16 md:py-24">
          <div className="container mx-auto px-4">
            <ProfileAbout profile={view} tags={tags} />
            <ProfileGallery profile={view} />
          </div>
        </section>
        {events.length > 0 ? (
          <ProfileEvents events={events} />
        ) : claimed ? (
          <ProfileEventsEmpty />
        ) : null}
        {!preview &&
          (claimed ? (
            socialActor && handle ? (
              <SocialSection handle={handle} />
            ) : null
          ) : (
            <ClaimListingCta profileId={profile.id} />
          ))}
        {(isMentor || hasAddress || npub) && (
          <section className="surface-cream py-16 md:py-24">
            <div className="container mx-auto max-w-3xl space-y-4 px-4">
              {isMentor && profile.mentoring && (
                <MentoringSection
                  mentoring={profile.mentoring}
                  handle={handle}
                  preview={preview}
                />
              )}
              {hasAddress && (
                <ProfileLocation
                  address={profile.primary_address}
                  geo={
                    profile.geo?.coordinates &&
                    profile.geo.coordinates.length >= 2
                      ? {
                          coordinates: [
                            profile.geo.coordinates[0],
                            profile.geo.coordinates[1],
                          ],
                        }
                      : undefined
                  }
                />
              )}
              {npub && <NpubQr npub={npub} />}
            </div>
          </section>
        )}
      </Container>
    </ProfileViewer>
  );
}
