import { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getPublicProfile, isPersonalProfile } from '@/lib/server/profile';
import { getSurface, originForFrom } from '@/lib/panaverse/surfaces';
import { buildPersonalProfileView } from '@/lib/server/personal-profile';
import { PersonalProfile } from './_components/personal/personal-profile';
import { BusinessProfile } from './_components/business-profile';

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
   * a listing returns 200 on both pana.social and social.pana.social, and a
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

  return <BusinessProfile profile={profile} handle={user} />;
}
