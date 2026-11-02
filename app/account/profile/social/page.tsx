'use client';

import { useSession } from '@/lib/auth-client';
import { FormEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, Save } from 'lucide-react';

import PageMeta from '@/components/PageMeta';
import { ProfileInterface } from '@/lib/interfaces';
import Status401_Unauthorized from '@/components/Page/Status401_Unauthorized';
import { useProfile, useMutateProfileSocial } from '@/lib/query/profile';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { changedProfileTextFields } from '@/lib/profile';
import {
  ListingReviewAccess,
  ListingReviewStepHeader,
  useListingReviewStep,
} from '@/components/listings/review-step';

export default function AccountProfileSocial() {
  const { data: session, status } = useSession();
  const review = useListingReviewStep('social');
  const mutation = useMutateProfileSocial(review.listingId);
  const { data, isLoading } = useProfile(review.listingId);
  const profile = data as ProfileInterface;

  const submitForm = (e: FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget as HTMLFormElement);

    const updates = {
      socials: {
        website: formData.get('website'),
        facebook: formData.get('facebook'),
        instagram: formData.get('instagram'),
        tiktok: formData.get('tiktok'),
        twitter: formData.get('twitter'),
        spotify: formData.get('spotify'),
      },
    };

    const changes = review.active
      ? changedProfileTextFields(updates.socials, { ...profile.socials })
      : updates.socials;
    if (review.active && !Object.keys(changes).length) {
      review.onSaved();
      return;
    }
    mutation.mutate({ socials: changes }, { onSuccess: review.onSaved });
  };

  if (status === 'loading' || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!session) {
    if (review.active)
      return <ListingReviewAccess listingId={review.listingId} />;
    return <Status401_Unauthorized />;
  }

  if (!profile) {
    if (review.active)
      return <ListingReviewAccess listingId={review.listingId} signedIn />;
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-gray-500">No profile found</div>
      </div>
    );
  }

  return (
    <main className="container mx-auto max-w-3xl px-4 py-8">
      <PageMeta title="Profile Socials | Edit Profile" desc="" />

      {review.active ? (
        <ListingReviewStepHeader
          listingId={review.listingId}
          name={profile.name}
          step="social"
        />
      ) : (
        <h2 className="mb-8 text-3xl font-bold">
          Profile - Edit Links and Socials
        </h2>
      )}

      <Card>
        <CardContent className="pt-6">
          <form
            key={profile.id ?? profile._id}
            onSubmit={submitForm}
            className="space-y-6"
          >
            <div className="mb-6 flex justify-between gap-4">
              <Button variant="outline" asChild>
                <Link href={review.backHref}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Link>
              </Button>
              <Button type="submit" disabled={isLoading || mutation.isPending}>
                <Save className="mr-2 h-4 w-4" />
                {mutation.isPending
                  ? 'Saving...'
                  : review.active
                    ? 'Save and continue'
                    : 'Save Changes'}
              </Button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                name="website"
                type="text"
                defaultValue={profile.socials?.website}
                placeholder="https://yourwebsite.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="facebook">Facebook</Label>
              <Input
                id="facebook"
                name="facebook"
                type="text"
                defaultValue={profile.socials?.facebook}
                placeholder="Facebook profile or page URL"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="instagram">Instagram</Label>
              <Input
                id="instagram"
                name="instagram"
                type="text"
                defaultValue={profile.socials?.instagram}
                placeholder="Instagram username or URL"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tiktok">TikTok</Label>
              <Input
                id="tiktok"
                name="tiktok"
                type="text"
                defaultValue={profile.socials?.tiktok}
                placeholder="TikTok username or URL"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="twitter">Twitter</Label>
              <Input
                id="twitter"
                name="twitter"
                type="text"
                defaultValue={profile.socials?.twitter}
                placeholder="Twitter/X username or URL"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="spotify">Spotify</Label>
              <Input
                id="spotify"
                name="spotify"
                type="text"
                defaultValue={profile.socials?.spotify}
                placeholder="Spotify profile or playlist URL"
              />
            </div>

            {mutation.isError && (
              <div
                role="alert"
                className="rounded-md bg-red-50 p-4 text-red-600"
              >
                Failed to update profile. Please try again.
              </div>
            )}

            {mutation.isSuccess && (
              <div className="rounded-md bg-green-50 p-4 text-green-600">
                Profile updated successfully!
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
