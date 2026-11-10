'use client';

import { useSession } from '@/lib/auth-client';
import { FormEvent, useState } from 'react';
import { Upload } from 'lucide-react';
import axios from 'axios';

import { ProfileInterface } from '@/lib/interfaces';
import Status401_Unauthorized from '@/components/Page/Status401_Unauthorized';
import { profileEditorUrl, useProfile } from '@/lib/query/profile';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  hasListingPrimaryPhoto,
  LISTING_PRIMARY_PHOTO_REQUIRED_MESSAGE,
} from '@/lib/listing-review';
import {
  ListingReviewAccess,
  ListingReviewLoading,
  ProfileEditorActions,
  ProfileEditorFrame,
  useListingReviewStep,
} from '@/components/listings/review-step';
import reviewStyles from '@/components/listings/review.module.css';

export default function AccountProfileImages() {
  const { data: session, status } = useSession();
  const review = useListingReviewStep('images');
  const {
    data,
    isLoading,
    refetch,
    isError: profileError,
  } = useProfile(review.listingId);
  const profile = data as ProfileInterface;
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [photoChoice, setPhotoChoice] = useState<{
    id: string | undefined;
    selected: boolean;
  } | null>(null);
  const profileId = profile?.id ?? profile?._id;
  const hasNewPhotos =
    photoChoice?.id === profileId && photoChoice?.selected === true;
  const savedPrimaryPhoto = hasListingPrimaryPhoto(profile?.images?.primaryCDN);

  const submitForm = async (e: FormEvent) => {
    e.preventDefault();
    if (uploading) return;
    const form = e.currentTarget as HTMLFormElement;
    const formData = new FormData(form);
    const primary = formData.get('primary');
    const hasFiles = Array.from(formData.values()).some(
      (value) => value instanceof File && value.size > 0
    );
    if (
      review.active &&
      !savedPrimaryPhoto &&
      !(primary instanceof File && primary.size > 0)
    ) {
      setUploadError(LISTING_PRIMARY_PHOTO_REQUIRED_MESSAGE);
      form.querySelector<HTMLInputElement>('#images_primary')?.focus();
      return;
    }
    setUploading(true);
    setUploadError('');
    setUploadSuccess(false);

    try {
      if (!review.active || hasFiles) {
        const { data: result } = await axios.post<{
          success?: boolean;
          error?: string;
          data?: { id?: string; primaryImageCdn?: unknown };
        }>(
          profileEditorUrl('/api/profile/upload', review.listingId),
          formData,
          {
            headers: {
              Accept: 'application/json',
              'Content-Type': 'multipart/form-data',
            },
          }
        );

        if (!result?.success) {
          throw new Error(
            result?.error || 'Failed to upload images. Please try again.'
          );
        }
        if (
          review.active &&
          (result.success !== true ||
            result.data?.id !== review.listingId ||
            !hasListingPrimaryPhoto(result.data?.primaryImageCdn))
        ) {
          throw new Error(
            'The saved primary photo could not be verified. Reload Photos and try again.'
          );
        }
      }

      const saved = await refetch();
      if (review.active) {
        if (!saved.isSuccess || saved.data.id !== review.listingId) {
          throw new Error(
            'Could not check the saved photos for this business. Please try again.'
          );
        }
        if (!hasListingPrimaryPhoto(saved.data.images?.primaryCDN)) {
          setUploadError(LISTING_PRIMARY_PHOTO_REQUIRED_MESSAGE);
          form.querySelector<HTMLInputElement>('#images_primary')?.focus();
          return;
        }
      }
      setUploadSuccess(true);

      // Clear file inputs
      form.reset();
      setPhotoChoice((current) => (current?.id === profileId ? null : current));
      review.onSaved();
    } catch (error) {
      console.error(error);
      const fromServer =
        axios.isAxiosError(error) &&
        typeof error.response?.data?.error === 'string'
          ? error.response.data.error
          : '';
      setUploadError(
        fromServer ||
          (error instanceof Error
            ? error.message
            : 'Failed to upload images. Please try again.')
      );
    } finally {
      setUploading(false);
    }
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
      pending={uploading}
      continueLabel={
        hasNewPhotos ? 'Save and continue' : 'Continue to confirmation'
      }
      pendingLabel={
        review.active && !hasNewPhotos
          ? 'Checking saved photos...'
          : 'Uploading...'
      }
    />
  );
  return (
    <ProfileEditorFrame
      listingId={review.listingId}
      profile={profile}
      step="images"
      title="Profile - Edit Images"
      pageTitle="Images | Edit Profile"
    >
      <form
        key={profile.id ?? profile._id}
        onSubmit={submitForm}
        onChange={
          review.active
            ? (event) => {
                setUploadError('');
                setPhotoChoice({
                  id: profileId,
                  selected: Array.from(
                    new FormData(event.currentTarget).values()
                  ).some((value) => value instanceof File && value.size > 0),
                });
              }
            : undefined
        }
        className="space-y-6"
      >
        {!review.active && actions}

        {review.active && (
          <p className={reviewStyles.note}>
            A saved primary business photo is required to complete this review.
            An existing primary photo counts; you do not need to upload it
            again. Gallery photos are optional. Only the images you choose will
            be replaced.
          </p>
        )}

        {/* Primary Picture */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Primary Picture</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              className={
                review.active
                  ? reviewStyles.helper
                  : 'rounded-md bg-blue-50 p-4 text-sm text-blue-900'
              }
            >
              Your primary picture is displayed on the directory search and will
              usually be your logo, your storefront, or yourself.
            </div>

            <div className="space-y-2">
              <Label htmlFor="images_primary">
                <div className="flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Upload Primary Image
                </div>
              </Label>
              <Input
                type="file"
                id="images_primary"
                name="primary"
                accept="image/png, image/jpeg, image/webp"
                disabled={review.active && uploading}
                aria-required={review.active && !savedPrimaryPhoto}
                aria-invalid={
                  review.active && !savedPrimaryPhoto && Boolean(uploadError)
                    ? true
                    : undefined
                }
                aria-describedby={
                  review.active
                    ? `primary-photo-requirement${uploadError ? ' photo-upload-error' : ''}`
                    : undefined
                }
              />
              <p className="text-sm text-gray-500">
                Accepted images are jpg, png, and webp
              </p>
              {review.active && (
                <p
                  id="primary-photo-requirement"
                  className={reviewStyles.helper}
                >
                  {savedPrimaryPhoto
                    ? 'Your saved primary photo meets this requirement. Continue without a new upload to keep it.'
                    : 'Required: choose and save a primary photo for this business. Gallery photos alone do not meet this requirement.'}
                </p>
              )}
            </div>

            {(review.active ? savedPrimaryPhoto : data?.images?.primaryCDN) && (
              <div className="rounded-md border p-4">
                <p className="mb-2 text-sm font-medium">Current Image:</p>
                <img
                  src={data?.images?.primaryCDN}
                  alt="Primary"
                  className="max-h-48 w-auto rounded-md"
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Gallery Position 1 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Gallery - Position 1</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="images_gallery1">
                <div className="flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Upload Gallery Image 1
                </div>
              </Label>
              <Input
                type="file"
                id="images_gallery1"
                name="gallery1"
                accept="image/png, image/jpeg, image/webp"
                disabled={review.active && uploading}
              />
              <p className="text-sm text-gray-500">
                Accepted images are jpg, png, and webp
              </p>
            </div>

            {data?.images?.gallery1CDN && (
              <div className="rounded-md border p-4">
                <p className="mb-2 text-sm font-medium">Current Image:</p>
                <img
                  src={data.images.gallery1CDN}
                  alt="Gallery 1"
                  className="max-h-48 w-auto rounded-md"
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Gallery Position 2 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Gallery - Position 2</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="images_gallery2">
                <div className="flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Upload Gallery Image 2
                </div>
              </Label>
              <Input
                type="file"
                id="images_gallery2"
                name="gallery2"
                accept="image/png, image/jpeg, image/webp"
                disabled={review.active && uploading}
              />
              <p className="text-sm text-gray-500">
                Accepted images are jpg, png, and webp
              </p>
            </div>

            {data?.images?.gallery2CDN && (
              <div className="rounded-md border p-4">
                <p className="mb-2 text-sm font-medium">Current Image:</p>
                <img
                  src={data.images.gallery2CDN}
                  alt="Gallery 2"
                  className="max-h-48 w-auto rounded-md"
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Gallery Position 3 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Gallery - Position 3</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="images_gallery3">
                <div className="flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Upload Gallery Image 3
                </div>
              </Label>
              <Input
                type="file"
                id="images_gallery3"
                name="gallery3"
                accept="image/png, image/jpeg, image/webp"
                disabled={review.active && uploading}
              />
              <p className="text-sm text-gray-500">
                Accepted images are jpg, png, and webp
              </p>
            </div>

            {data?.images?.gallery3CDN && (
              <div className="rounded-md border p-4">
                <p className="mb-2 text-sm font-medium">Current Image:</p>
                <img
                  src={data.images.gallery3CDN}
                  alt="Gallery 3"
                  className="max-h-48 w-auto rounded-md"
                />
              </div>
            )}
          </CardContent>
        </Card>

        {uploadError && (
          <div
            id="photo-upload-error"
            role="alert"
            className={
              review.active
                ? reviewStyles.error
                : 'rounded-md bg-red-50 p-4 text-red-600'
            }
          >
            {uploadError}
          </div>
        )}

        {uploadSuccess && !review.active && (
          <div className="rounded-md bg-green-50 p-4 text-green-600">
            Images uploaded successfully!
          </div>
        )}
        {review.active && actions}
      </form>
    </ProfileEditorFrame>
  );
}
