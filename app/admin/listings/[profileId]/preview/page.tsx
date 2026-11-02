import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { BusinessProfile } from '@/app/p/[user]/_components/business-profile';
import { getAdminListingPreview } from '@/lib/server/profile';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Listing preview | Pana Admin',
  robots: { index: false, follow: false },
};

interface Props {
  params: Promise<{ profileId: string }>;
}

export default async function AdminListingPreviewPage({ params }: Props) {
  const { profileId } = await params;
  const profile = await getAdminListingPreview(profileId);
  if (!profile) notFound();

  const handle =
    typeof profile.screenname === 'string' ? profile.screenname.trim() : '';

  return (
    <>
      <section className="border-pana-ink/20 mb-5 rounded-xl border-2 bg-white p-5">
        <Link
          href="/admin/listings"
          className="hover:text-pana-navy text-sm font-bold underline underline-offset-4"
        >
          Back to directory listings
        </Link>
        <h2 className="mt-4 text-lg font-extrabold">Admin-only preview</h2>
        <p className="text-pana-ink/70 mt-1 text-sm leading-relaxed">
          This profile preview is only visible to admins. Public actions are
          unavailable here, and opening it does not publish the listing.
        </p>
      </section>
      <BusinessProfile profile={profile} handle={handle} preview />
    </>
  );
}
