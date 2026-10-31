import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound, permanentRedirect } from 'next/navigation';
import { getPublicListing } from '@/lib/server/profile';
import { listingPublicPath } from '@/lib/listing-url';
import { getSurface, originForFrom } from '@/lib/panaverse/surfaces';
import { BusinessProfile } from '@/app/p/[user]/_components/business-profile';

export const revalidate = 300;
interface Props {
  params: Promise<{ profileId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { profileId } = await params;
  const profile = await getPublicListing(profileId);
  if (!profile) return { title: 'Listing Not Found', robots: { index: false } };
  const path = listingPublicPath({
    id: profile.id,
    screenname:
      typeof profile.screenname === 'string' ? profile.screenname : null,
  });
  const host = (await headers()).get('host');
  return {
    title: `${profile.name} | Pana Mia Club`,
    description: profile.details || profile.five_words,
    alternates: {
      canonical: `${originForFrom(getSurface('www'), host)}${path}`,
    },
    openGraph: {
      title: profile.name,
      description: profile.details || profile.five_words,
      images: profile.images.primaryCDN
        ? [profile.images.primaryCDN]
        : undefined,
    },
  };
}

export default async function PublicListingPage({ params }: Props) {
  const { profileId } = await params;
  const profile = await getPublicListing(profileId);
  if (!profile) notFound();
  const handle =
    typeof profile.screenname === 'string' ? profile.screenname.trim() : '';
  if (handle)
    permanentRedirect(
      listingPublicPath({ id: profile.id, screenname: handle })
    );
  return <BusinessProfile profile={profile} />;
}
