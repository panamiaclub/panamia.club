'use client';

import { Suspense, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from '@/lib/auth-client';
import { useProfile } from '@/lib/query/profile';
import {
  LISTING_REVIEW_STEPS,
  listingReviewFinishPath,
  listingReviewStepPath,
  type ListingReviewStep,
} from '@/lib/listing-review';
import { listingReviewPath } from '@/lib/listing-url';
import { listSelectedCategories } from '@/lib/profile';
import { readMapPoint } from '@/lib/map/viewport';
import {
  ListingReviewAccess,
  ListingReviewFrame,
  ListingReviewLoading,
} from '@/components/listings/review-step';
import PageMeta from '@/components/PageMeta';
import { Card } from '@/components/ui/card';
import styles from '@/components/listings/review.module.css';

function OwnedListingReview({
  profileId,
  complete,
}: {
  profileId: string;
  complete: boolean;
}) {
  const router = useRouter();
  const { data: profile, isLoading, isError } = useProfile(profileId);

  useEffect(() => {
    if (!complete && !isError && profile?.id === profileId) {
      router.replace(listingReviewStepPath(profileId, 'address'));
    }
  }, [complete, isError, profile, profileId, router]);

  if (isLoading) {
    return <ListingReviewLoading />;
  }
  if (isError || !profile || profile.id !== profileId) {
    return <ListingReviewAccess listingId={profileId} signedIn />;
  }
  if (!complete) return <ListingReviewLoading />;

  const address = profile.primary_address;
  const zip = profile.addressPostalCode ?? address?.zipcode;
  const street = profile.addressLine1 ?? address?.street1;
  const city = profile.addressLocality ?? address?.city;
  const region = profile.addressRegion ?? address?.state;
  const legacyPoint =
    profile.geo &&
    'coordinates' in profile.geo &&
    Array.isArray(profile.geo.coordinates)
      ? readMapPoint(profile.geo.coordinates[1], profile.geo.coordinates[0])
      : null;
  const publicPoint =
    readMapPoint(profile.addressLat, profile.addressLng) ?? legacyPoint;
  const online = profile.onlineOnly === true || profile.online_only === true;
  const location = online
    ? zip
      ? `Online business - based near ZIP ${zip} (approximate area, not a visiting address)`
      : 'Online business - base ZIP not added'
    : street
      ? [street, city, region, zip].filter(Boolean).join(', ')
      : publicPoint
        ? `Public visiting map point${zip ? ` near ZIP ${zip}` : ''} (unchanged)`
        : zip
          ? `Based near ZIP ${zip} (base area, not a visiting address or service boundary)`
          : 'Choose a location type and add a valid US ZIP in Location before confirming. Online and mobile services need only a base ZIP, not a street or home address.';
  const description = profile.descriptions?.details ?? profile.details;
  const shortDescription =
    profile.descriptions?.fiveWords ?? profile.five_words;
  const photos = [
    profile.images?.primaryCDN,
    profile.images?.gallery1CDN,
    profile.images?.gallery2CDN,
    profile.images?.gallery3CDN,
  ].filter((url): url is string => Boolean(url));

  function summary(step: ListingReviewStep): string {
    switch (step) {
      case 'address':
        return location;
      case 'desc':
        return (
          [shortDescription, description].filter(Boolean).join(' - ') ||
          'Add a short introduction to your business.'
        );
      case 'categories':
        return profile?.categories
          ? listSelectedCategories(profile.categories) ||
              'No categories selected.'
          : 'No categories selected.';
      case 'contact':
        return `${profile?.email || 'No contact email'}${
          profile?.phoneNumber || profile?.phone_number
            ? ` - ${profile.phoneNumber ?? profile.phone_number}`
            : ''
        } (private; not your Pana login)`;
      case 'social':
        return (
          Object.values(profile?.socials ?? {})
            .filter((value) => typeof value === 'string' && value.trim())
            .join(' - ') || 'No public links added.'
        );
      case 'images':
        return photos.length
          ? `${photos.length} existing photo${photos.length === 1 ? '' : 's'}. Only replace the ones you choose.`
          : 'Add a logo or photos when you are ready.';
    }
  }

  return (
    <>
      <PageMeta
        title={`${profile.name} | Confirm listing review`}
        desc=""
        hideHeading
      />
      <ListingReviewFrame
        listingId={profileId}
        profile={profile}
        step="confirm"
      >
        <Card className={`${styles.editor} ${styles.summary}`}>
          <h2>Business details</h2>
          <p className={styles.helper}>
            Use the six sections above to make any last changes.
          </p>
          <dl>
            {LISTING_REVIEW_STEPS.map((step, index) => (
              <div key={step.key}>
                <dt>
                  {index + 1}. {step.label}
                </dt>
                <dd>
                  {summary(step.key)}
                  {step.key === 'images' && photos.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-3">
                      {photos.map((url, position) => (
                        <img
                          key={`${position}-${url}`}
                          src={url}
                          alt={`${profile.name}, photo ${position + 1}`}
                          className="h-20 w-20 rounded-xl object-cover"
                        />
                      ))}
                    </div>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </Card>
      </ListingReviewFrame>
    </>
  );
}

function ListingReview() {
  const params = useSearchParams();
  const profileId = params?.get('id');
  const { status } = useSession();
  if (!profileId) {
    return (
      <main className="auth-surface space-y-4 px-4 py-16 text-center">
        <h1 className="text-2xl font-black">No listing selected</h1>
        <p role="alert">
          Open the review link for your business, or find it in the directory.
        </p>
        <Link href="/d" className="font-bold underline">
          Back to the directory
        </Link>
      </main>
    );
  }
  if (status === 'loading') return <ListingReviewLoading />;
  if (status !== 'authenticated') {
    const returnHref =
      params?.get('complete') === '1'
        ? `${listingReviewFinishPath(profileId)}${params?.get('confirmed') === '1' ? '&confirmed=1' : ''}`
        : listingReviewPath(profileId);
    return (
      <ListingReviewAccess listingId={profileId} returnHref={returnHref} />
    );
  }
  return (
    <OwnedListingReview
      key={profileId}
      profileId={profileId}
      complete={params?.get('complete') === '1'}
    />
  );
}

export default function ListingReviewPage() {
  return (
    <Suspense fallback={<ListingReviewLoading />}>
      <ListingReview />
    </Suspense>
  );
}
