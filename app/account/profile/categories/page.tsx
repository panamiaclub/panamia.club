'use client';

import { useSession } from '@/lib/auth-client';
import { FormEvent } from 'react';
import { CategoryInterface, ProfileInterface } from '@/lib/interfaces';
import Status401_Unauthorized from '@/components/Page/Status401_Unauthorized';
import { useProfile, useMutateProfileCategories } from '@/lib/query/profile';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { profileCategoryList } from '@/lib/lists';
import {
  ListingReviewAccess,
  ListingReviewLoading,
  ProfileEditorActions,
  ProfileEditorFrame,
  useListingReviewStep,
} from '@/components/listings/review-step';
import reviewStyles from '@/components/listings/review.module.css';

export default function AccountProfileCategories() {
  const { data: session, status } = useSession();
  const review = useListingReviewStep('categories');
  const mutation = useMutateProfileCategories(review.listingId);
  const {
    data,
    isLoading,
    isError: profileError,
  } = useProfile(review.listingId);
  const profile = data as ProfileInterface;

  const submitForm = (e: FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget as HTMLFormElement);

    const categories: { [k: string]: boolean } = {};
    profileCategoryList.forEach((item) => {
      categories[item.value] = formData.get(item.value) ? true : false;
    });

    const changes = review.active
      ? Object.fromEntries(
          Object.entries(categories).filter(
            ([field, value]) =>
              value !==
              Boolean(profile.categories?.[field as keyof CategoryInterface])
          )
        )
      : categories;
    if (review.active && !Object.keys(changes).length) {
      review.onSaved();
      return;
    }

    mutation.mutate({ categories: changes }, { onSuccess: review.onSaved });
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
      step="categories"
      title="Profile - Edit Categories"
      pageTitle="Categories | Edit Profile"
    >
      <form
        key={profile.id ?? profile._id}
        onSubmit={submitForm}
        className="space-y-6"
      >
        {!review.active && actions}

        <div
          className={
            review.active
              ? reviewStyles.note
              : 'rounded-md bg-blue-50 p-4 text-sm text-blue-900'
          }
        >
          {review.active
            ? 'Choose the categories that help people discover this business.'
            : 'Select the categories that best match your profile, these will help users find your profile.'}
        </div>

        <div className="space-y-4">
          <Label>Categories:</Label>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {profileCategoryList.map(
              (item: { desc: string; value: string }, index: number) => {
                return (
                  <div
                    key={index}
                    className={
                      review.active
                        ? 'flex min-h-11 items-center gap-3'
                        : 'flex items-center space-x-2'
                    }
                  >
                    <Checkbox
                      id={item.value}
                      name={item.value}
                      defaultChecked={
                        profile.categories?.[
                          item.value as keyof CategoryInterface
                        ]
                          ? true
                          : false
                      }
                    />
                    <Label
                      htmlFor={item.value}
                      className={
                        review.active
                          ? 'flex min-h-11 flex-1 cursor-pointer items-center font-normal'
                          : 'cursor-pointer font-normal'
                      }
                    >
                      {item.desc}
                    </Label>
                  </div>
                );
              }
            )}
          </div>
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
              ? 'Could not save this business category selection. Please try again.'
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
