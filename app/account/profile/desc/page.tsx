'use client';

import { useSession } from '@/lib/auth-client';
import { FormEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, Save } from 'lucide-react';

import PageMeta from '@/components/PageMeta';
import { ProfileInterface } from '@/lib/interfaces';
import Status401_Unauthorized from '@/components/Page/Status401_Unauthorized';
import { useProfile, useMutateProfileDesc } from '@/lib/query/profile';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { changedProfileTextFields } from '@/lib/profile';
import {
  ListingReviewAccess,
  ListingReviewStepHeader,
  useListingReviewStep,
} from '@/components/listings/review-step';

export default function AccountProfileDesc() {
  const { data: session, status } = useSession();
  const review = useListingReviewStep('desc');
  const mutation = useMutateProfileDesc(review.listingId);
  const { data, isLoading } = useProfile(review.listingId);
  const profile = data as ProfileInterface;

  const submitForm = (e: FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget as HTMLFormElement);

    const updates = {
      name: formData.get('name'),
      five_words: formData.get('five_words'),
      details: formData.get('details'),
      background: formData.get('background'),
      tags: formData.get('tags'),
    };

    const changes = review.active
      ? changedProfileTextFields(updates, {
          name: profile.name,
          five_words: profile.descriptions?.fiveWords ?? profile.five_words,
          details: profile.descriptions?.details ?? profile.details,
          background: profile.descriptions?.background ?? profile.background,
          tags: profile.descriptions?.tags ?? profile.tags,
        })
      : updates;
    if (review.active && !Object.keys(changes).length) {
      review.onSaved();
      return;
    }
    mutation.mutate(changes, { onSuccess: review.onSaved });
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
      <PageMeta title="Description | Edit Profile" desc="" />

      {review.active ? (
        <ListingReviewStepHeader
          listingId={review.listingId}
          name={profile.name}
          step="desc"
        />
      ) : (
        <h2 className="mb-8 text-3xl font-bold">Profile - Edit Description</h2>
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
              <Label htmlFor="name">
                {review.active ? 'Business name' : 'Name'}
              </Label>
              <Input
                id="name"
                name="name"
                type="text"
                defaultValue={profile.name}
                required={review.active}
                placeholder="Enter your name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="five_words">
                {review.active ? 'Short description' : 'Five Words'}
              </Label>
              <Input
                id="five_words"
                name="five_words"
                type="text"
                defaultValue={
                  profile.descriptions?.fiveWords ?? profile.five_words
                }
                placeholder="Describe yourself in five words"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="details">
                {review.active ? 'About this business' : 'Details'}
              </Label>
              <Textarea
                id="details"
                name="details"
                rows={4}
                maxLength={500}
                defaultValue={profile.descriptions?.details ?? profile.details}
                placeholder="Tell us about yourself"
              />
              <p className="text-sm text-gray-500">Maximum 500 characters</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="background">Background</Label>
              <Textarea
                id="background"
                name="background"
                rows={4}
                maxLength={500}
                defaultValue={
                  profile.descriptions?.background ?? profile.background
                }
                placeholder="Share your background"
              />
              <p className="text-sm text-gray-500">Maximum 500 characters</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tags">Tags</Label>
              <Textarea
                id="tags"
                name="tags"
                rows={4}
                maxLength={500}
                defaultValue={profile.descriptions?.tags ?? profile.tags}
                placeholder="Add tags (comma separated)"
              />
              <p className="text-sm text-gray-500">Maximum 500 characters</p>
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
