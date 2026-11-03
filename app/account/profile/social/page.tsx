'use client';

import { useSession } from '@/lib/auth-client';
import { FormEvent } from 'react';
import { ProfileInterface } from '@/lib/interfaces';
import Status401_Unauthorized from '@/components/Page/Status401_Unauthorized';
import { useProfile, useMutateProfileSocial } from '@/lib/query/profile';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { changedProfileTextFields } from '@/lib/profile';
import {
  ListingReviewAccess,
  ListingReviewLoading,
  ProfileEditorActions,
  ProfileEditorFrame,
  useListingReviewStep,
} from '@/components/listings/review-step';
import reviewStyles from '@/components/listings/review.module.css';

export default function AccountProfileSocial() {
  const { data: session, status } = useSession();
  const review = useListingReviewStep('social');
  const mutation = useMutateProfileSocial(review.listingId);
  const {
    data,
    isLoading,
    isError: profileError,
  } = useProfile(review.listingId);
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
    if (review.active) return <ListingReviewLoading />;
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!session) {
    if (review.active)
      return (
        <ListingReviewAccess
          listingId={review.listingId}
          returnHref={review.returnHref}
        />
      );
    return <Status401_Unauthorized />;
  }

  if (!profile || (review.active && profileError)) {
    if (review.active)
      return (
        <ListingReviewAccess
          listingId={review.listingId}
          returnHref={review.returnHref}
          signedIn
        />
      );
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-gray-500">No profile found</div>
      </div>
    );
  }

  return (
    <ProfileEditorFrame
      listingId={review.listingId}
      profile={profile}
      step="social"
      title="Profile - Edit Links and Socials"
      pageTitle="Profile Socials | Edit Profile"
    >
      <form
        key={profile.id ?? profile._id}
        onSubmit={submitForm}
        className="space-y-6"
      >
        <ProfileEditorActions
          review={review}
          pending={isLoading || mutation.isPending}
        />
        {review.active && (
          <p className={reviewStyles.note}>
            These links are public. Use the private contact section for an email
            address or phone number you do not want displayed.
          </p>
        )}

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
            className={
              review.active
                ? reviewStyles.error
                : 'rounded-md bg-red-50 p-4 text-red-600'
            }
          >
            {review.active
              ? 'Could not save the public links for this business. Please try again.'
              : 'Failed to update profile. Please try again.'}
          </div>
        )}

        {mutation.isSuccess && !review.active && (
          <div className="rounded-md bg-green-50 p-4 text-green-600">
            Profile updated successfully!
          </div>
        )}
      </form>
    </ProfileEditorFrame>
  );
}
