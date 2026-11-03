'use client';

import { useSession } from '@/lib/auth-client';
import { FormEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, Save } from 'lucide-react';

import PageMeta from '@/components/PageMeta';
import { CategoryInterface, ProfileInterface } from '@/lib/interfaces';
import Status401_Unauthorized from '@/components/Page/Status401_Unauthorized';
import { useProfile, useMutateProfileCategories } from '@/lib/query/profile';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { profileCategoryList } from '@/lib/lists';
import {
  ListingReviewAccess,
  ListingReviewStepHeader,
  useListingReviewStep,
} from '@/components/listings/review-step';

export default function AccountProfileCategories() {
  const { data: session, status } = useSession();
  const review = useListingReviewStep('categories');
  const mutation = useMutateProfileCategories(review.listingId);
  const { data, isLoading } = useProfile(review.listingId);
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
      <PageMeta title="Categories | Edit Profile" desc="" />

      {review.active ? (
        <ListingReviewStepHeader
          listingId={review.listingId}
          name={profile.name}
          step="categories"
        />
      ) : (
        <h2 className="mb-8 text-3xl font-bold">Profile - Edit Categories</h2>
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

            <div className="rounded-md bg-blue-50 p-4 text-sm text-blue-900">
              Select the categories that best match your profile, these will
              help users find your profile.
            </div>

            <div className="space-y-4">
              <Label>Categories:</Label>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {profileCategoryList.map(
                  (item: { desc: string; value: string }, index: number) => {
                    return (
                      <div key={index} className="flex items-center space-x-2">
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
                          className="cursor-pointer font-normal"
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
