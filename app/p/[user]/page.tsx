import { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getPublicProfile, isPersonalProfile } from '@/lib/server/profile';
import { getSurface, originForFrom } from '@/lib/panaverse/surfaces';
import { buildPersonalProfileView } from '@/lib/server/personal-profile';
import { PersonalProfile } from './_components/personal/personal-profile';
import {
  getProfileSignalCounts,
  getRecommenderAvatars,
} from '@/lib/server/profile-signals';
import { getUpcomingEventsForHost } from '@/lib/event';
import { isProfileClaimed } from '@/lib/server/profile-owners';
import { getActorByScreenname } from '@/lib/federation/wrappers/actor';
import { ProfileViewer } from './_components/profile-viewer';
import { ProfileHero } from './_components/profile-hero';
import { ProfileAbout } from './_components/profile-about';
import { ProfileGallery } from './_components/profile-gallery';
import {
  ProfileEvents,
  ProfileEventsEmpty,
  type ProfileEvent,
} from './_components/profile-events';
import { ProfileLocation } from './_components/profile-location';
import { MentoringSection } from './_components/mentoring-section';
import { SocialSection } from './_components/social-section';
import { ClaimListingCta } from './_components/claim-listing-cta';
import { NpubQr } from '@/components/relay/NpubQr';
import { npubFromHex } from '@/lib/nostr/keys';
import { toProfileView } from './_lib/profile-view';

// Encode a hex pubkey to npub, returning null on malformed input so a bad row
// can't 500 the profile page.
function safeNpubFromHex(hex: string): string | null {
  try {
    return npubFromHex(hex);
  } catch {
    return null;
  }
}

// Cache public profile renders at the edge (Workers Cache).
// Safe: this page reads no cookies/headers/session server-side — session,
// theme, and language are all hydrated client-side, so the SSR output is
// identical for every visitor. vinext emits `s-maxage=300, stale-while-revalidate`.
//
// This is why the save/recommend *counts* are fetched here but "have I saved
// this?" is not: anything viewer-specific rendered server-side would be
// handed to the next 300 seconds of visitors. See _components/profile-viewer.
export const revalidate = 300;

interface PageProps {
  params: Promise<{ user: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { user } = await params;
  const profile = await getPublicProfile(user);

  if (!profile) {
    return { title: 'Profile Not Found' };
  }

  /* `/p/<user>` serves two different pages, so no single surface owns it in
   * the path registry: a personal account gets the Pana Social profile —
   * posts, Panas, groups — while a business or unclaimed listing gets the
   * directory storefront below. The registry matches on pathname alone and
   * cannot tell those apart, so the page names its own owner here, having
   * already loaded the profile to render it.
   *
   * Without this the two competed: every route answers on every hostname, so
   * a listing returns 200 on both panamia.club and social.panamia.club, and a
   * crawler sees two URLs with identical content splitting one ranking.
   *
   * The split is metadata only, and that is the point. A member who taps a
   * business card in the feed stays on social, in social chrome, with the
   * switcher intact — the canonical moves what a crawler indexes, never where
   * a member is. Framing the listing as a borrowed www page was considered
   * and rejected: it would tell a member they had left home for tapping a
   * card in their own feed. So a canonical pointing at www while social
   * renders the page and owns `/p` in the registry is the intended state,
   * not a disagreement to reconcile.
   *
   * The canonical is absolute deliberately. A relative one resolves against
   * the host being served, which would declare whichever copy the crawler
   * happened to fetch the original — the bug it is meant to settle. Reading
   * headers costs no cacheability: the root layout already reads them for
   * every route, so this page is dynamic either way. */
  const personal = isPersonalProfile(profile);
  const owner = getSurface(personal ? 'social' : 'www');
  const host = (await headers()).get('host');

  return {
    title: `${profile.name} | ${personal ? 'Pana Social' : 'Pana Mia Club'}`,
    description: profile.details || profile.five_words,
    alternates: {
      canonical: `${originForFrom(owner, host)}/p/${user}`,
    },
    openGraph: {
      title: profile.name,
      description: profile.details || profile.five_words,
      images: profile.images?.primaryCDN
        ? [profile.images.primaryCDN]
        : undefined,
    },
  };
}

export default async function ProfilePage({ params }: PageProps) {
  const { user } = await params;
  const profile = await getPublicProfile(user);

  if (!profile) {
    notFound();
  }

  /* Personal accounts get the Pana Social profile: posts, Panas, groups, and
     no storefront chrome. Business and legacy directory listings get the
     business layout below. */
  if (isPersonalProfile(profile)) {
    const view = await buildPersonalProfileView(user, profile);
    return <PersonalProfile profile={view} />;
  }

  const view = toProfileView(profile, user);

  // Independent reads, so they go in parallel rather than stacking four round
  // trips onto a page that is meant to be cached and fast.
  const [counts, recommenderAvatars, upcoming, claimed, socialActor] =
    await Promise.all([
      getProfileSignalCounts(profile.id),
      getRecommenderAvatars(profile.id),
      getUpcomingEventsForHost(profile.id),
      isProfileClaimed(profile.id),
      getActorByScreenname(user),
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

  // descriptions.tags is free text the member typed, comma separated.
  const tags = (profile.tags ?? '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);

  const hasAddress = Boolean(
    profile.primary_address?.street1 ||
    profile.primary_address?.city ||
    profile.primary_address?.state ||
    profile.primary_address?.zipcode
  );

  const isMentor = profile.mentoring?.enabled === true;

  // Relay-enrolled profiles carry a hex nostr_pubkey; encode it to an npub
  // here so only the npub (never raw hex) reaches the client.
  const npub =
    typeof profile.nostrPubkey === 'string'
      ? safeNpubFromHex(profile.nostrPubkey)
      : null;

  return (
    <ProfileViewer
      profileId={profile.id}
      businessName={view.name}
      businessLogo={view.logo}
      initialSaves={counts.saves}
      initialRecommends={counts.recommends}
    >
      <main>
        <ProfileHero profile={view} recommenderAvatars={recommenderAvatars} />

        <section className="surface-butter py-16 md:py-24">
          <div className="container mx-auto px-4">
            <ProfileAbout profile={view} tags={tags} />
            <ProfileGallery profile={view} />
          </div>
        </section>

        {/* A claimed listing with nothing scheduled still gets the section, so
            the absence reads as "nothing coming up" rather than a page that
            never had events at all. An unclaimed one has nobody to add any. */}
        {events.length > 0 ? (
          <ProfileEvents events={events} />
        ) : claimed ? (
          <ProfileEventsEmpty />
        ) : null}

        {/* An unclaimed listing has nobody posting updates, so it gets the
            claim invitation in that slot instead of an empty feed.

            Claiming provisions a Pana Social actor, but listings claimed
            before that shipped -- or ones with no handle to name an actor --
            still have none, so the check stays. SocialSection owns its own
            band (as ClaimListingCta does), which is what keeps the slot
            looking the same whichever half of it renders. */}
        {claimed ? (
          socialActor ? (
            <SocialSection handle={user} />
          ) : null
        ) : (
          <ClaimListingCta profileId={profile.id} />
        )}

        {(isMentor || hasAddress || npub) && (
          <section className="surface-cream py-16 md:py-24">
            <div className="container mx-auto max-w-3xl space-y-4 px-4">
              {isMentor && profile.mentoring && (
                <MentoringSection mentoring={profile.mentoring} handle={user} />
              )}

              {hasAddress && (
                <ProfileLocation
                  address={profile.primary_address}
                  geo={
                    profile.geo
                      ? {
                          coordinates: profile.geo.coordinates as [
                            number,
                            number,
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
      </main>
    </ProfileViewer>
  );
}
