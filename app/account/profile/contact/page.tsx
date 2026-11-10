'use client';

import { useSession } from '@/lib/auth-client';
import { FormEvent, useRef, useState } from 'react';
import { ProfileInterface } from '@/lib/interfaces';
import Status401_Unauthorized from '@/components/Page/Status401_Unauthorized';
import { useProfile, useMutateProfileContact } from '@/lib/query/profile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { changedProfileTextFields } from '@/lib/profile';
import {
  ListingReviewAccess,
  ListingReviewLoading,
  ProfileEditorActions,
  ProfileEditorFrame,
  useListingReviewStep,
} from '@/components/listings/review-step';
import reviewStyles from '@/components/listings/review.module.css';

export default function AccountProfileContact() {
  const { data: session, status } = useSession();
  const review = useListingReviewStep('contact');
  const mutation = useMutateProfileContact(review.listingId);
  const {
    data,
    isLoading,
    isError: profileError,
  } = useProfile(review.listingId);
  const profile = data as ProfileInterface;
  const emailInput = useRef<HTMLInputElement>(null);
  const isListing =
    review.active || Boolean(profile && profile.userId !== session?.user?.id);
  const [showOtherDesc, setShowOtherDesc] = useState(
    profile?.pronouns?.other || false
  );

  const submitForm = (e: FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget as HTMLFormElement);

    const updates = {
      email: formData.get('email'),
      phone_number: formData.get('phone_number'),
      ...(!review.active
        ? {
            pronouns: {
              sheher: formData.get('pronouns_sheher') ? true : false,
              hehim: formData.get('pronouns_hehim') ? true : false,
              theythem: formData.get('pronouns_theythem') ? true : false,
              none: formData.get('pronouns_none') ? true : false,
              other: formData.get('pronouns_other') ? true : false,
              other_desc: formData.get('pronouns_otherdesc'),
            },
          }
        : {}),
    };

    const changes = review.active
      ? changedProfileTextFields(updates, {
          email: profile.email,
          phone_number: profile.phoneNumber ?? profile.phone_number,
        })
      : updates;
    if (review.active && !Object.keys(changes).length) {
      review.onSaved();
      return;
    }
    mutation.mutate(changes, { onSuccess: review.onSaved });
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

  const actions = (
    <ProfileEditorActions
      review={review}
      pending={isLoading || mutation.isPending}
    />
  );
  return (
    <ProfileEditorFrame
      listingId={review.listingId}
      profile={profile}
      step="contact"
      title="Profile - Edit Contact Info"
      pageTitle="Contact Info | Edit Profile"
    >
      <form
        key={profile.id ?? profile._id}
        onSubmit={submitForm}
        className="space-y-6"
      >
        {!review.active && actions}

        <div className="space-y-2">
          <Label htmlFor="email">
            {isListing ? 'Listing contact email' : 'Pana account email'}
          </Label>
          <Input
            key={profile.id ?? profile._id}
            ref={emailInput}
            id="email"
            name="email"
            type="email"
            defaultValue={profile.email}
            maxLength={100}
            required={isListing}
            disabled={!isListing}
            className={!isListing ? 'bg-gray-50' : undefined}
          />
          {isListing && session.user.email && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={review.active ? reviewStyles.secondary : undefined}
              onClick={() => {
                if (emailInput.current) {
                  emailInput.current.value = session.user.email ?? '';
                }
              }}
            >
              Use my Pana email
            </Button>
          )}
          <p className="text-sm text-gray-500">
            {isListing
              ? 'Application emails go to the owner account email, with a copy here when different. Sign-in links stay with the account email. This contact is not public, and changing it does not change your Pana login.'
              : 'Change your sign-in email in account settings. Listing contact emails are edited separately.'}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone_number">Phone Number</Label>
          <Input
            id="phone_number"
            name="phone_number"
            type="text"
            defaultValue={profile.phoneNumber ?? profile.phone_number}
            placeholder="(555) 123-4567"
          />
          <p className="text-sm text-gray-500">
            Used for contacting you, not displayed on profile
          </p>
        </div>

        {!review.active && (
          <div className="space-y-4">
            <Label>Pronouns:</Label>
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="pronouns_sheher"
                  name="pronouns_sheher"
                  defaultChecked={profile.pronouns?.sheher ? true : false}
                />
                <Label
                  htmlFor="pronouns_sheher"
                  className="cursor-pointer font-normal"
                >
                  She/Her
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="pronouns_hehim"
                  name="pronouns_hehim"
                  defaultChecked={profile.pronouns?.hehim ? true : false}
                />
                <Label
                  htmlFor="pronouns_hehim"
                  className="cursor-pointer font-normal"
                >
                  He/Him
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="pronouns_theythem"
                  name="pronouns_theythem"
                  defaultChecked={profile.pronouns?.theythem ? true : false}
                />
                <Label
                  htmlFor="pronouns_theythem"
                  className="cursor-pointer font-normal"
                >
                  They/Them
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="pronouns_none"
                  name="pronouns_none"
                  defaultChecked={profile.pronouns?.none ? true : false}
                />
                <Label
                  htmlFor="pronouns_none"
                  className="cursor-pointer font-normal"
                >
                  No Preference
                </Label>
              </div>

              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="pronouns_other"
                    name="pronouns_other"
                    defaultChecked={profile.pronouns?.other ? true : false}
                    onCheckedChange={(checked) => setShowOtherDesc(!!checked)}
                  />
                  <Label
                    htmlFor="pronouns_other"
                    className="cursor-pointer font-normal"
                  >
                    Other:
                  </Label>
                </div>
                {showOtherDesc && (
                  <Input
                    id="pronouns_otherdesc"
                    name="pronouns_otherdesc"
                    type="text"
                    defaultValue={profile.pronouns?.other_desc}
                    placeholder="Please specify"
                    className="ml-6"
                  />
                )}
              </div>
            </div>
          </div>
        )}

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
              ? 'Could not save this business contact information. Please try again.'
              : 'Failed to update profile. Please try again.'}
          </div>
        )}

        {mutation.isSuccess && !review.active && (
          <div className="rounded-md bg-green-50 p-4 text-green-600">
            Profile updated successfully!
          </div>
        )}
        {review.active && actions}
      </form>
    </ProfileEditorFrame>
  );
}
