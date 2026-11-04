'use client';

import { useSession } from '@/lib/auth-client';
import { FormEvent, useState } from 'react';
import axios from 'axios';
import { toast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';

import {
  normalizeUsZip,
  readOnlineZipArea,
  US_ZIP_REQUIRED_MESSAGE,
} from '@/lib/online-zip';
import Status401_Unauthorized from '@/components/Page/Status401_Unauthorized';
import { useProfile, useMutateProfileAddress } from '@/lib/query/profile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { readMapPoint } from '@/lib/map/viewport';
import {
  ListingReviewAccess,
  ListingReviewLoading,
  ProfileEditorActions,
  ProfileEditorFrame,
  useListingReviewStep,
} from '@/components/listings/review-step';
import reviewStyles from '@/components/listings/review.module.css';

type ReviewLocationMode = 'keep' | 'storefront' | 'online' | 'mobile';

export default function AccountProfileAddress() {
  const { data: session, status } = useSession();
  const review = useListingReviewStep('address');
  const mutation = useMutateProfileAddress(review.listingId);
  const {
    data,
    isLoading,
    isError: profileError,
  } = useProfile(review.listingId);
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
  const [zipChoice, setZipChoice] = useState<{
    id: string | undefined;
    value: string;
  } | null>(null);
  const [zipIssue, setZipIssue] = useState<{
    id: string | undefined;
    message: string;
  } | null>(null);
  const zipError = zipIssue?.id === profileId ? zipIssue?.message : undefined;
  const serverZipError =
    mutation.isError &&
    axios.isAxiosError<{ field?: string }>(mutation.error) &&
    mutation.error.response?.data?.field === 'zipcode';
  const savedOnline =
    profile?.onlineOnly === true || profile?.online_only === true;
  const savedZipArea = readOnlineZipArea(
    profile?.geo,
    profile?.addressPostalCode ?? profile?.primary_address?.zipcode,
    profile?.addressCountry
  );
  const needsZipEntry = review.active && !savedZipArea;
  const legacyCoordinates =
    profile?.geo &&
    'coordinates' in profile.geo &&
    Array.isArray(profile.geo.coordinates)
      ? readMapPoint(profile.geo.coordinates[1], profile.geo.coordinates[0])
      : null;
  // ZIP-only entry preserves saved fields until a location change is chosen.
  const reviewMode: ReviewLocationMode =
    locationChoice?.id === profileId && locationChoice
      ? locationChoice.value
      : needsZipEntry
        ? 'keep'
        : savedOnline
          ? 'online'
          : profile?.addressLine1 ||
              profile?.primary_address?.street1 ||
              readMapPoint(profile?.addressLat, profile?.addressLng) ||
              legacyCoordinates
            ? 'storefront'
            : 'keep';
  const onlineOnly = review.active
    ? reviewMode === 'keep'
      ? savedOnline
      : reviewMode === 'online'
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
  const enteredZip =
    zipChoice?.id === profileId && zipChoice
      ? zipChoice.value
      : address.zipcode;
  const keepingSavedZip =
    savedZipArea && normalizeUsZip(enteredZip) === savedZipArea.postalCode;

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
    const zip = normalizeUsZip(formData.get('zipcode'));
    if (review.active && !zip) {
      setZipIssue({ id: profileId, message: US_ZIP_REQUIRED_MESSAGE });
      document.getElementById('zipcode')?.focus();
      return;
    }
    if (onlineOnly && !zip) {
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
        zipcode: review.active ? zip : formData.get('zipcode'),
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
          zipcode: zip,
          country: 'US',
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
      if (!readOnlineZipArea(profile?.geo, zip, profile?.addressCountry)) {
        primaryAddress.zipcode = zip;
      }
      const patch = {
        ...(Object.keys(primaryAddress).length
          ? { primary_address: primaryAddress }
          : {}),
        ...(onlineOnly !== savedOnline || reviewMode === 'mobile'
          ? { online_only: onlineOnly }
          : {}),
        ...(reviewMode !== 'keep' &&
        Object.entries(updates.counties).some(
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
      mutation.mutate(patch, {
        onSuccess: review.onSaved,
        onError: () => {
          const current = new URL(window.location.href);
          if (
            current.pathname === '/account/profile/address' &&
            current.searchParams.get('listingId') === review.listingId
          ) {
            document.getElementById('zipcode')?.focus();
          }
        },
      });
    } else {
      mutation.mutate(updates);
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
      pending={isLoading || mutation.isPending}
      continueLabel={
        reviewMode === 'keep'
          ? keepingSavedZip
            ? 'Keep location and continue'
            : 'Save ZIP and continue'
          : 'Save and continue'
      }
      pendingLabel={reviewMode === 'keep' ? 'Saving ZIP...' : 'Saving...'}
    />
  );
  const saveError = mutation.isError && (
    <div
      id="address-save-error"
      role="alert"
      className={
        review.active
          ? reviewStyles.error
          : 'rounded-md bg-red-50 p-4 text-red-600'
      }
    >
      {axios.isAxiosError<{ error?: string }>(mutation.error)
        ? mutation.error.response?.data?.error || t('profileUpdateFailed')
        : mutation.error.message}
    </div>
  );

  return (
    <ProfileEditorFrame
      listingId={review.listingId}
      profile={profile}
      step="address"
      title="Profile - Edit Address and Geolocation"
      pageTitle="Address | Edit Profile"
    >
      <form
        key={profileId}
        id="address_form"
        onSubmit={submitForm}
        noValidate={review.active}
        className="space-y-6"
      >
        {!needsZipEntry && actions}

        {needsZipEntry && (
          <div className="space-y-2">
            <h2 className="text-xl font-extrabold">
              Add or check your business ZIP
            </h2>
            <p className={reviewStyles.helper}>
              Enter a real US ZIP to continue. A street or home address is not
              required. Your other location details stay unchanged unless you
              choose to update them below.
            </p>
          </div>
        )}

        {!review.active && (
          <div className="rounded-md bg-blue-50 p-4 text-sm text-blue-900">
            {tProfile('locationForm.addressNote')}
          </div>
        )}

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

        <div className="space-y-2">
          <Label htmlFor="zipcode">
            {onlineOnly || (review.active && reviewMode === 'mobile')
              ? tProfile('locationForm.baseZip')
              : 'ZIP code'}
            {(review.active || onlineOnly) && (
              <span className="text-destructive" aria-hidden="true">
                {' '}
                *
              </span>
            )}
          </Label>
          <Input
            id="zipcode"
            name="zipcode"
            type="text"
            defaultValue={address.zipcode}
            placeholder={review.active ? 'Enter a five-digit US ZIP' : '33138'}
            autoComplete="postal-code"
            inputMode={onlineOnly || review.active ? 'numeric' : undefined}
            required={review.active || onlineOnly}
            maxLength={onlineOnly || review.active ? 10 : undefined}
            pattern={
              onlineOnly || review.active ? '[0-9]{5}(-[0-9]{4})?' : undefined
            }
            aria-invalid={Boolean(zipError || serverZipError) || undefined}
            aria-describedby={
              [
                review.active || onlineOnly ? 'base-zip-note' : '',
                zipError ? 'zipcode-error' : '',
                serverZipError ? 'address-save-error' : '',
              ]
                .filter(Boolean)
                .join(' ') || undefined
            }
            onChange={(event) => {
              setZipChoice({ id: profileId, value: event.target.value });
              setZipIssue(null);
              if (mutation.isError) mutation.reset();
            }}
          />
          {(review.active || onlineOnly) && (
            <p
              id="base-zip-note"
              className={
                review.active
                  ? reviewStyles.helper
                  : 'text-sm text-gray-600 dark:text-gray-400'
              }
            >
              {review.active
                ? 'Required: a valid five-digit US ZIP. ZIP+4 is accepted and saved as five digits. Without a visiting address, this is only an approximate base area, not directions or a service/delivery boundary. Do not make up a ZIP.'
                : tProfile('locationForm.baseZipNote')}
            </p>
          )}
          {zipError && (
            <p id="zipcode-error" role="alert" className={reviewStyles.error}>
              {zipError}
            </p>
          )}
          {serverZipError && saveError}
        </div>

        {needsZipEntry && actions}

        {review.active && (
          <>
            <fieldset className="space-y-3">
              <legend className="mb-3 font-extrabold">
                {needsZipEntry
                  ? 'Optional: update other location details'
                  : 'How can people find this business?'}
              </legend>
              <RadioGroup
                value={needsZipEntry && reviewMode === 'keep' ? '' : reviewMode}
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
                    ['online', 'Online business, without a public storefront'],
                    [
                      'mobile',
                      'Mobile or by appointment, without a public address',
                    ],
                  ] as const
                )
                  .filter(([value]) => value !== 'keep' || !needsZipEntry)
                  .map(([value, label]) => (
                    <div
                      key={value}
                      className="flex min-h-11 items-center gap-3"
                    >
                      <RadioGroupItem
                        id={`review-location-${value}`}
                        value={value}
                      />
                      <Label
                        htmlFor={`review-location-${value}`}
                        className="cursor-pointer py-2.5"
                      >
                        {label}
                      </Label>
                    </div>
                  ))}
              </RadioGroup>
            </fieldset>
            <p className={reviewStyles.note}>
              Only enter a street address if visitors are welcome there.
              Choosing online or mobile removes the existing public address and
              map point, but keeps your ZIP as an approximate base area.
            </p>
          </>
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
            <div
              className={
                review.active
                  ? reviewStyles.note
                  : 'mb-4 rounded-md bg-blue-50 p-4 text-sm text-blue-900'
              }
            >
              {review.active
                ? 'This map point is public. Use only a location where visitors are welcome.'
                : 'Your GeoLocation is used for mapping and showing users their distance away from you. If you operate out of multiple areas, choose a central point among those areas.'}
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={clickSetCoordsFromAddress}
              disabled={gettingCoords}
              className={
                review.active ? `${reviewStyles.secondary} my-4` : 'mb-4'
              }
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
            <div
              className={
                review.active
                  ? `${reviewStyles.note} mb-4`
                  : 'mb-4 rounded-md bg-blue-50 p-4 text-sm text-blue-900'
              }
            >
              Counties can be selected if you operate or service inside of these
              areas. If you're not sure, it is okay to select all counties.
            </div>

            <div className="space-y-4">
              <Label>Servicing Counties:</Label>
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="county_palmbeach"
                    name="county_palmbeach"
                    defaultChecked={profile.counties?.palm_beach ? true : false}
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
                    defaultChecked={profile.counties?.broward ? true : false}
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
                    defaultChecked={profile.counties?.miami_dade ? true : false}
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

        {!serverZipError && saveError}

        {mutation.isSuccess && !review.active && (
          <div className="rounded-md bg-green-50 p-4 text-green-600">
            Profile updated successfully!
          </div>
        )}
      </form>
    </ProfileEditorFrame>
  );
}
