'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Loader2, MapPin, Store } from 'lucide-react';
import { useSession } from '@/lib/auth-client';
import { useProfile } from '@/lib/query/profile';
import { listingPublicPath } from '@/lib/listing-url';
import {
  LISTING_REVIEW_STEPS,
  listingReviewStepPath,
  type ListingReviewStep,
} from '@/lib/listing-review';
import { listSelectedCategories } from '@/lib/profile';
import { ListingReviewAccess } from '@/components/listings/review-step';
import { ListingReviewConfirmation } from '@/components/listings/review-confirmation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

function OwnedListingReview({
  profileId,
  complete,
}: {
  profileId: string;
  complete: boolean;
}) {
  const { data: session } = useSession();
  const { data: profile, isLoading } = useProfile(profileId);

  if (isLoading) {
    return <LoadingReview />;
  }
  if (!profile || profile.id !== profileId) {
    return <ListingReviewAccess listingId={profileId} signedIn />;
  }

  const address = profile.primary_address;
  const zip = profile.addressPostalCode ?? address?.zipcode;
  const street = profile.addressLine1 ?? address?.street1;
  const city = profile.addressLocality ?? address?.city;
  const region = profile.addressRegion ?? address?.state;
  const online = profile.onlineOnly === true || profile.online_only === true;
  const location = online
    ? zip
      ? `Online business - based near ZIP ${zip} (approximate area, not a visiting address)`
      : 'Online business - base ZIP not added'
    : [street, city, region, zip].filter(Boolean).join(', ') ||
      'No public location confirmed. You can manage this business without adding an address.';
  const description = profile.descriptions?.details ?? profile.details;
  const shortDescription =
    profile.descriptions?.fiveWords ?? profile.five_words;
  const publicPath = listingPublicPath({
    id: profileId,
    screenname: profile.screenname,
  });
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
    <main className="surface-cream min-h-[70vh] px-4 py-10 sm:py-14">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="space-y-4">
          <p className="section-eyebrow text-pana-burnt dark:text-pana-flame">
            {complete
              ? 'Confirm your listing review'
              : 'Your business on Pana MIA'}
          </p>
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
            {complete
              ? `Looking good, ${profile.name}`
              : `Review ${profile.name}`}
          </h1>
          <p className="text-muted-foreground">
            Signed in as {session?.user?.email}. This review edits only{' '}
            <strong>{profile.name}</strong>, not your personal profile or other
            businesses. Your business contact email can stay different.
          </p>
        </header>

        <ListingReviewConfirmation
          key={`${profileId}:${session?.user?.id}`}
          profileId={profileId}
          name={profile.name}
          publicPath={publicPath}
          active={Boolean(profile.active)}
          finish={complete}
        />
        {!complete && (
          <Card className="border-pana-ink/10 rounded-2xl">
            <CardContent className="space-y-4 pt-6">
              {zip ? (
                <Store
                  className="text-pana-indigo h-7 w-7"
                  aria-hidden="true"
                />
              ) : (
                <MapPin
                  className="text-pana-burnt h-7 w-7"
                  aria-hidden="true"
                />
              )}
              <h2 className="text-xl font-extrabold">
                {zip
                  ? 'A quick check, one section at a time'
                  : 'Start with where people can find you'}
              </h2>
              <p>
                {zip
                  ? 'Your existing details are prefilled. Save each section to continue, or return here to choose one.'
                  : 'Your listing has no ZIP yet. Confirm a public visiting address, an approximate online base ZIP, or a mobile/service option. A missing ZIP does not mean your business is online-only.'}
              </p>
              <p className="text-muted-foreground text-sm">
                Never add a private home address. You can keep your current
                location unchanged and still manage the rest of the listing.
              </p>
              <Button
                asChild
                className="bg-pana-flame text-pana-ink hover:bg-pana-burnt rounded-full font-extrabold"
              >
                <Link href={listingReviewStepPath(profileId, 'address')}>
                  Review location first
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        <section aria-label="Current business details" className="space-y-3">
          {LISTING_REVIEW_STEPS.map((step, index) => (
            <Card key={step.key} className="border-pana-ink/10 rounded-2xl">
              <CardContent className="space-y-3 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-extrabold">
                    {index + 1}. {step.label}
                  </h2>
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="rounded-full font-bold"
                  >
                    <Link href={listingReviewStepPath(profileId, step.key)}>
                      Review {step.label.toLowerCase()}
                    </Link>
                  </Button>
                </div>
                <p className="text-muted-foreground text-sm break-words whitespace-pre-wrap">
                  {summary(step.key)}
                </p>
                {step.key === 'images' && photos.length > 0 && (
                  <div className="flex flex-wrap gap-3">
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
              </CardContent>
            </Card>
          ))}
        </section>
        {profile.active && !complete && (
          <Link
            href={publicPath}
            className="text-pana-indigo dark:text-pana-flame inline-block font-bold underline"
          >
            View the public listing
          </Link>
        )}
      </div>
    </main>
  );
}

function LoadingReview() {
  return (
    <main
      className="auth-surface flex justify-center gap-2 px-4 py-20"
      role="status"
    >
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
      Loading your listing...
    </main>
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
  if (status === 'loading') return <LoadingReview />;
  if (status !== 'authenticated') {
    return <ListingReviewAccess listingId={profileId} />;
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
    <Suspense fallback={<LoadingReview />}>
      <ListingReview />
    </Suspense>
  );
}
