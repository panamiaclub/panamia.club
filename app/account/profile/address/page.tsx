'use client';

import { useSession } from '@/lib/auth-client';
import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Save } from 'lucide-react';
import axios from 'axios';
import { toast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';

import PageMeta from '@/components/PageMeta';
import { normalizeUsZip } from '@/lib/online-zip';
import Status401_Unauthorized from '@/components/Page/Status401_Unauthorized';
import { useProfile, useMutateProfileAddress } from '@/lib/query/profile';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { readMapPoint } from '@/lib/map/viewport';
import {
  ListingReviewAccess,
  ListingReviewStepHeader,
  useListingReviewStep,
} from '@/components/listings/review-step';

type ReviewLocationMode = 'keep' | 'storefront' | 'online' | 'mobile';

export default function AccountProfileAddress() {
  const { data: session, status } = useSession();
  const review = useListingReviewStep('address');
  const mutation = useMutateProfileAddress(review.listingId);
  const { data, isLoading } = useProfile(review.listingId);
  const profile = data;
  const [gettingCoords, setGettingCoords] = useState(false);
  const { t } = useTranslation('toast');
  const { t: tProfile } = useTranslation('profile');
  const profileId = profile?.id ?? profile?._id;
  const [onlineChoice, setOnlineChoice] = useState<{
    id: string | undefined;
    value: boolean;
  } | null>(null);
  const [locationChoice, setLocationChoice] = useState<{
    id: string | undefined;
    value: ReviewLocationMode;
  } | null>(null);
  const savedOnline =
    profile?.onlineOnly === true || profile?.online_only === true;
  const legacyCoordinates =
    profile?.geo &&
    'coordinates' in profile.geo &&
    Array.isArray(profile.geo.coordinates)
      ? readMapPoint(profile.geo.coordinates[1], profile.geo.coordinates[0])
      : null;
  const reviewMode: ReviewLocationMode =
    locationChoice?.id === profileId && locationChoice
      ? locationChoice.value
      : savedOnline
        ? 'online'
        : profile?.addressLine1 ||
            profile?.addressPostalCode ||
            profile?.primary_address?.street1 ||
            profile?.primary_address?.zipcode ||
            readMapPoint(profile?.addressLat, profile?.addressLng) ||
            legacyCoordinates
          ? 'storefront'
          : 'keep';
  const onlineOnly = review.active
    ? reviewMode === 'online'
    : onlineChoice && onlineChoice.id === profileId
      ? onlineChoice.value
      : savedOnline;
  const hideAddress =
    onlineOnly ||
    (review.active && (reviewMode === 'keep' || reviewMode === 'mobile'));

  // /api/getProfile returns the raw Drizzle row, which carries flat
  // addressLine1/addressLocality/... columns rather than the nested
  // primary_address shape this form was written against. Reading only the
  // nested shape left every field blank no matter what was stored, and saving
  // then wrote those blanks back over the real address. Prefer the flat
  // columns and fall back to the legacy shape for callers that send it.
  const saved = profile?.primary_address;
  const address = {
    street1: profile?.addressLine1 ?? saved?.street1 ?? '',
    street2: profile?.addressLine2 ?? saved?.street2 ?? '',
    city: profile?.addressLocality ?? saved?.city ?? '',
    state: profile?.addressRegion ?? saved?.state ?? '',
    zipcode: profile?.addressPostalCode ?? saved?.zipcode ?? '',
    hours: profile?.addressHours ?? saved?.hours ?? '',
    lat: profile?.addressLat ?? saved?.lat ?? legacyCoordinates?.lat ?? '',
    lng: profile?.addressLng ?? saved?.lng ?? legacyCoordinates?.lng ?? '',
  };

  const clickSetCoordsFromAddress = async () => {
    setGettingCoords(true);
    const form = document.getElementById('address_form') as HTMLFormElement;
    const formData = new FormData(form);

    const address = {
      street1: formData.get('street1'),
      street2: formData.get('street2'),
      city: formData.get('city'),
      state: formData.get('state'),
      zipcode: formData.get('zipcode'),
    };

    if (!(
      address.street1 &&
      address.city &&
      address.state &&
      address.zipcode
    )) {
      toast({
        title: t('missingFields'),
        description: t('missingFieldsDesc'),
        variant: 'destructive',
      });
      setGettingCoords(false);
      return false;
    }

    try {
      const response = await axios.post(
        '/api/geo/byAddress',
        { address },
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
        }
      );

      const coords = response.data.data?.[0];
      const point = readMapPoint(coords?.lat, coords?.lng);
      if (!point) throw new Error('No valid coordinates were returned.');
      const latInput = document.getElementById('geo_lat') as HTMLInputElement;
      latInput.value = String(point.lat);
      const lngInput = document.getElementById('geo_lng') as HTMLInputElement;
      lngInput.value = String(point.lng);
      toast({
        title: t('coordinatesSet'),
        description: t('coordinatesSetDesc'),
      });
    } catch {
      toast({
        title: t('error'),
        description: t('coordinatesFailed'),
        variant: 'destructive',
      });
    } finally {
      setGettingCoords(false);
    }
  };

  const submitForm = (e: FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget as HTMLFormElement);
    if (review.active && reviewMode === 'keep') {
      review.onSaved();
      return;
    }
    if (onlineOnly && !normalizeUsZip(formData.get('zipcode'))) {
      toast({
        title: t('missingFields'),
        description: tProfile('locationForm.invalidZip'),
        variant: 'destructive',
      });
      return;
    }

    const updates = {
      primary_address: {
        street1: formData.get('street1'),
        street2: formData.get('street2'),
        city: formData.get('city'),
        state: formData.get('state'),
        zipcode: formData.get('zipcode'),
        hours: formData.get('hours'),
        lat: formData.get('lat'),
        lng: formData.get('lng'),
      },
      counties: {
        ...profile?.counties,
        palm_beach: formData.get('county_palmbeach') ? true : false,
        broward: formData.get('county_broward') ? true : false,
        miami_dade: formData.get('county_miamidade') ? true : false,
      },
      online_only: onlineOnly,
    };

    if (review.active) {
      const primaryAddress: Record<string, unknown> = {};
      if (reviewMode === 'mobile') {
        Object.assign(primaryAddress, {
          name: '',
          street1: '',
          street2: '',
          street3: '',
          city: '',
          state: '',
          zipcode: '',
          country: '',
          hours: '',
          googlePlaceId: '',
          lat: '',
          lng: '',
        });
      } else {
        for (const [field, value] of Object.entries(updates.primary_address)) {
          if (hideAddress && field !== 'zipcode') continue;
          if (
            String(value ?? '') !==
            String(address[field as keyof typeof address])
          ) {
            primaryAddress[field] = value;
          }
        }
        // The API accepts coordinates only as a pair.
        if ('lat' in primaryAddress || 'lng' in primaryAddress) {
          primaryAddress.lat = updates.primary_address.lat;
          primaryAddress.lng = updates.primary_address.lng;
        }
      }
      const patch = {
        ...(Object.keys(primaryAddress).length
          ? { primary_address: primaryAddress }
          : {}),
        ...(onlineOnly !== savedOnline || reviewMode === 'mobile'
          ? { online_only: onlineOnly }
          : {}),
        ...(Object.entries(updates.counties).some(
          ([field, value]) =>
            Boolean(value) !==
            Boolean(profile?.counties?.[field as keyof typeof profile.counties])
        )
          ? { counties: updates.counties }
          : {}),
      };
      if (!Object.keys(patch).length) {
        review.onSaved();
        return;
      }
      mutation.mutate(patch, { onSuccess: review.onSaved });
    } else {
      mutation.mutate(updates);
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
      <PageMeta title="Address | Edit Profile" desc="" />

      {review.active ? (
        <ListingReviewStepHeader
          listingId={review.listingId}
          name={profile.name}
          step="address"
        />
      ) : (
        <h2 className="mb-8 text-3xl font-bold">
          Profile - Edit Address and Geolocation
        </h2>
      )}

      <Card>
        <CardContent className="pt-6">
          <form
            key={profileId}
            id="address_form"
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

            {review.active && (
              <>
                <fieldset className="space-y-3">
                  <legend className="mb-3 font-extrabold">
                    How can people find this business?
                  </legend>
                  <RadioGroup
                    value={reviewMode}
                    onValueChange={(value) => {
                      if (
                        value === 'keep' ||
                        value === 'storefront' ||
                        value === 'online' ||
                        value === 'mobile'
                      ) {
                        setLocationChoice({ id: profileId, value });
                      }
                    }}
                  >
                    {(
                      [
                        ['keep', 'Keep current location details for now'],
                        ['storefront', 'Public visiting address or ZIP area'],
                        [
                          'online',
                          'Online business, without a public storefront',
                        ],
                        [
                          'mobile',
                          'Mobile or by appointment, without a public address',
                        ],
                      ] as const
                    ).map(([value, label]) => (
                      <div key={value} className="flex items-center gap-3">
                        <RadioGroupItem
                          id={`review-location-${value}`}
                          value={value}
                        />
                        <Label htmlFor={`review-location-${value}`}>
                          {label}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </fieldset>
                <p className="text-muted-foreground text-sm">
                  Only enter a street address if visitors are welcome there.
                  Online listings show an approximate ZIP area, never a home
                  address or exact coordinates. Choosing mobile removes the
                  existing public address and map point; no ZIP is required.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full rounded-full font-bold"
                  onClick={review.onSaved}
                  disabled={mutation.isPending}
                >
                  Keep current location and continue
                </Button>
              </>
            )}

            <div className="rounded-md bg-blue-50 p-4 text-sm text-blue-900">
              {tProfile('locationForm.addressNote')}
            </div>

            {/* Declared rather than inferred from a blank address. Leaving the
                address empty is ambiguous — it also describes a storefront
                that has not finished onboarding — and only this checkbox says
                "there is nowhere to visit" clearly enough to hide distance
                without hiding it from businesses that simply have not entered
                an address yet. */}
            {!review.active && (
              <div className="flex items-start space-x-2">
                <Checkbox
                  id="online_only"
                  name="online_only"
                  checked={onlineOnly}
                  onCheckedChange={(checked) =>
                    setOnlineChoice({ id: profileId, value: checked === true })
                  }
                />
                <div className="space-y-1">
                  <Label htmlFor="online_only">
                    {tProfile('locationForm.onlineLabel')}
                  </Label>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {tProfile('locationForm.onlineNote')}
                  </p>
                </div>
              </div>
            )}

            {!(
              review.active &&
              (reviewMode === 'keep' || reviewMode === 'mobile')
            ) && (
              <div className="space-y-2">
                <Label htmlFor="zipcode">
                  {onlineOnly ? tProfile('locationForm.baseZip') : 'ZIP code'}
                  {onlineOnly && <span className="text-destructive"> *</span>}
                </Label>
                <Input
                  id="zipcode"
                  name="zipcode"
                  type="text"
                  defaultValue={address.zipcode}
                  placeholder="33138"
                  autoComplete="postal-code"
                  inputMode={
                    onlineOnly || review.active ? 'numeric' : undefined
                  }
                  required={onlineOnly}
                  maxLength={onlineOnly || review.active ? 10 : undefined}
                  pattern={
                    onlineOnly || review.active
                      ? '[0-9]{5}(-[0-9]{4})?'
                      : undefined
                  }
                  aria-describedby={onlineOnly ? 'base-zip-note' : undefined}
                />
                {onlineOnly && (
                  <p
                    id="base-zip-note"
                    className="text-sm text-gray-600 dark:text-gray-400"
                  >
                    {tProfile('locationForm.baseZipNote')}
                  </p>
                )}
              </div>
            )}

            <fieldset
              disabled={hideAddress}
              hidden={hideAddress}
              className="space-y-6"
            >
              <div className="space-y-2">
                <Label htmlFor="street1">Street 1</Label>
                <Input
                  id="street1"
                  name="street1"
                  type="text"
                  defaultValue={address.street1}
                  placeholder="123 Main Street"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="street2">Street 2</Label>
                <Input
                  id="street2"
                  name="street2"
                  type="text"
                  defaultValue={address.street2}
                  placeholder="Suite 100 (optional)"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  name="city"
                  type="text"
                  defaultValue={address.city}
                  placeholder="Miami"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="state">State</Label>
                <Input
                  id="state"
                  name="state"
                  type="text"
                  defaultValue={address.state}
                  placeholder="FL"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="hours">Hours</Label>
                <Textarea
                  id="hours"
                  name="hours"
                  rows={4}
                  maxLength={500}
                  defaultValue={address.hours}
                  placeholder="Mon-Fri: 9am-5pm"
                />
              </div>
              <div className="border-t pt-6">
                <div className="mb-4 rounded-md bg-blue-50 p-4 text-sm text-blue-900">
                  Your GeoLocation is used for mapping and showing users their
                  distance away from you. If you operate out of multiple areas,
                  choose a central point among those areas.
                </div>

                <Button
                  type="button"
                  variant="outline"
                  onClick={clickSetCoordsFromAddress}
                  disabled={gettingCoords}
                  className="mb-4"
                >
                  {gettingCoords
                    ? 'Getting coordinates...'
                    : 'Get GeoLocation using my address'}
                </Button>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="geo_lat">Latitude</Label>
                    <Input
                      id="geo_lat"
                      name="lat"
                      type="text"
                      defaultValue={address.lat}
                      placeholder="26.122582"
                    />
                    <p className="text-sm text-gray-500">Example: 26.122582</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="geo_lng">Longitude</Label>
                    <Input
                      id="geo_lng"
                      name="lng"
                      type="text"
                      defaultValue={address.lng}
                      placeholder="-80.137139"
                    />
                    <p className="text-sm text-gray-500">Example: -80.137139</p>
                  </div>
                </div>
              </div>
            </fieldset>
            {!(review.active && reviewMode === 'keep') && (
              <div className="border-t pt-6">
                <div className="mb-4 rounded-md bg-blue-50 p-4 text-sm text-blue-900">
                  Counties can be selected if you operate or service inside of
                  these areas. If you're not sure, it is okay to select all
                  counties.
                </div>

                <div className="space-y-4">
                  <Label>Servicing Counties:</Label>
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="county_palmbeach"
                        name="county_palmbeach"
                        defaultChecked={
                          profile.counties?.palm_beach ? true : false
                        }
                      />
                      <Label
                        htmlFor="county_palmbeach"
                        className="cursor-pointer font-normal"
                      >
                        Palm Beach
                      </Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="county_broward"
                        name="county_broward"
                        defaultChecked={
                          profile.counties?.broward ? true : false
                        }
                      />
                      <Label
                        htmlFor="county_broward"
                        className="cursor-pointer font-normal"
                      >
                        Broward
                      </Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="county_miamidade"
                        name="county_miamidade"
                        defaultChecked={
                          profile.counties?.miami_dade ? true : false
                        }
                      />
                      <Label
                        htmlFor="county_miamidade"
                        className="cursor-pointer font-normal"
                      >
                        Miami-Dade
                      </Label>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {mutation.isError && (
              <div
                role="alert"
                className="rounded-md bg-red-50 p-4 text-red-600"
              >
                {axios.isAxiosError<{ error?: string }>(mutation.error)
                  ? mutation.error.response?.data?.error ||
                    t('profileUpdateFailed')
                  : mutation.error.message}
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
