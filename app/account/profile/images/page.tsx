'use client';

import { useSession } from '@/lib/auth-client';
import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Save, Upload } from 'lucide-react';
import axios from 'axios';

import PageMeta from '@/components/PageMeta';
import { ProfileInterface } from '@/lib/interfaces';
import Status401_Unauthorized from '@/components/Page/Status401_Unauthorized';
import { profileEditorUrl, useProfile } from '@/lib/query/profile';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  ListingReviewAccess,
  ListingReviewStepHeader,
  useListingReviewStep,
} from '@/components/listings/review-step';

export default function AccountProfileImages() {
  const { data: session, status } = useSession();
  const review = useListingReviewStep('images');
  const { data, isLoading, refetch } = useProfile(review.listingId);
  const profile = data as ProfileInterface;
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState(false);

  const submitForm = async (e: FormEvent) => {
    e.preventDefault();
    setUploading(true);
    setUploadError('');
    setUploadSuccess(false);

    const form = e.currentTarget as HTMLFormElement;
    const formData = new FormData(form);

    try {
      const { data: result } = await axios.post(
        profileEditorUrl('/api/profile/upload', review.listingId),
        formData,
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      /* A 200 from this endpoint does not on its own mean anything was
         stored, so the body is what decides. Reporting success on the
         absence of a thrown error is how uploads appeared to work here for
         a long time while saving nothing. */
      if (!result?.success) {
        setUploadError(
          result?.error || 'Failed to upload images. Please try again.'
        );
        return;
      }

      setUploadSuccess(true);
      await refetch();

      // Clear file inputs
      form.reset();
      review.onSaved();
    } catch (error) {
      console.error(error);
      const fromServer =
        axios.isAxiosError(error) &&
        typeof error.response?.data?.error === 'string'
          ? error.response.data.error
          : '';
      setUploadError(
        fromServer || 'Failed to upload images. Please try again.'
      );
    } finally {
      setUploading(false);
    }
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
      <PageMeta title="Images | Edit Profile" desc="" />

      {review.active ? (
        <ListingReviewStepHeader
          listingId={review.listingId}
          name={profile.name}
          step="images"
        />
      ) : (
        <h2 className="mb-8 text-3xl font-bold">Profile - Edit Images</h2>
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
              <Button type="submit" disabled={uploading}>
                <Save className="mr-2 h-4 w-4" />
                {uploading
                  ? 'Uploading...'
                  : review.active
                    ? 'Save photos and finish'
                    : 'Save Changes'}
              </Button>
            </div>

            {review.active && (
              <Button
                type="button"
                variant="outline"
                className="w-full rounded-full font-bold"
                onClick={review.onSaved}
                disabled={uploading}
              >
                Keep current photos and finish
              </Button>
            )}

            {/* Primary Picture */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Primary Picture</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-md bg-blue-50 p-4 text-sm text-blue-900">
                  Your primary picture is displayed on the directory search and
                  will usually be your logo, your storefront, or yourself.
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
                  />
                  <p className="text-sm text-gray-500">
                    Accepted images are jpg, png, and webp
                  </p>
                </div>

                {data?.images?.primaryCDN && (
                  <div className="rounded-md border p-4">
                    <p className="mb-2 text-sm font-medium">Current Image:</p>
                    <img
                      src={data.images.primaryCDN}
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
                role="alert"
                className="rounded-md bg-red-50 p-4 text-red-600"
              >
                {uploadError}
              </div>
            )}

            {uploadSuccess && (
              <div className="rounded-md bg-green-50 p-4 text-green-600">
                Images uploaded successfully!
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
