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
import {
  isListingLocationMode,
  publicVisitingAddressIssue,
  type ListingLocationMode,
} from '@/lib/listing-review';
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

type ReviewLocationMode = 'keep' | ListingLocationMode;
type LocationField = 'mode' | 'street1' | 'city' | 'state' | 'zipcode';

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
  const [fieldIssue, setFieldIssue] = useState<{
    id: string | undefined;
    field: LocationField;
    message: string;
  } | null>(null);
  const issue = fieldIssue?.id === profileId ? fieldIssue : null;
  const serverField =
    mutation.isError && axios.isAxiosError<{ field?: string }>(mutation.error)
      ? mutation.error.response?.data?.field === 'location_mode'
        ? 'mode'
        : mutation.error.response?.data?.field
      : undefined;
  const savedOnline =
    profile?.onlineOnly === true || profile?.online_only === true;
  const savedZipArea = readOnlineZipArea(
    profile?.geo,
    profile?.addressPostalCode ?? profile?.primary_address?.zipcode,
    profile?.addressCountry
  );
  const legacyCoordinates =
    profile?.geo &&
    'coordinates' in profile.geo &&
    Array.isArray(profile.geo.coordinates)
      ? readMapPoint(profile.geo.coordinates[1], profile.geo.coordinates[0])
      : null;
  const reviewMode: ReviewLocationMode | null =
    locationChoice?.id === profileId && locationChoice
      ? locationChoice.value === 'keep' && !savedZipArea
        ? null
        : locationChoice.value
      : savedZipArea
        ? 'keep'
        : null;
  const onlineOnly = review.active
    ? reviewMode === 'keep' || reviewMode === null
      ? savedOnline
      : reviewMode === 'online'
    : onlineChoice && onlineChoice.id === profileId
      ? onlineChoice.value
      : savedOnline;
  const hideAddress = review.active ? reviewMode !== 'storefront' : onlineOnly;
  const publicAddressRequired = review.active && reviewMode === 'storefront';
  const zipOnly = reviewMode === 'online' || reviewMode === 'mobile';
  const pending = mutation.isPending || gettingCoords;

  // /api/getProfile returns the raw Drizzle row, which carries flat
  // addressLine1/addressLocality/... columns rather than the nested
  // primary_address shape this form was written against. Reading only the
  // nested shape left every field blank no matter what was stored, and saving
  // then wrote those blanks back over the real address. Prefer the flat
  // columns and fall back to the legacy shape for callers that send it.
  const saved = profile?.primary_address;
  const hideSavedStreet = review.active && savedOnline;
  const address = {
    street1: hideSavedStreet
      ? ''
      : (profile?.addressLine1 ?? saved?.street1 ?? ''),
    street2: hideSavedStreet
      ? ''
      : (profile?.addressLine2 ?? saved?.street2 ?? ''),
    city: profile?.addressLocality ?? saved?.city ?? '',
    state: profile?.addressRegion ?? saved?.state ?? '',
    zipcode: profile?.addressPostalCode ?? saved?.zipcode ?? '',
    hours: hideSavedStreet ? '' : (profile?.addressHours ?? saved?.hours ?? ''),
    lat: hideSavedStreet
      ? ''
      : (profile?.addressLat ?? saved?.lat ?? legacyCoordinates?.lat ?? ''),
    lng: hideSavedStreet
      ? ''
      : (profile?.addressLng ?? saved?.lng ?? legacyCoordinates?.lng ?? ''),
  };
  const enteredZip =
    zipChoice?.id === profileId && zipChoice
      ? zipChoice.value
      : address.zipcode;

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
    if (pending) return;
    const formData = new FormData(e.currentTarget as HTMLFormElement);
    if (review.active) {
      if (!reviewMode) {
        setFieldIssue({
          id: profileId,
          field: 'mode',
          message: 'Choose how people can find this business.',
        });
        document.getElementById('review-location-storefront')?.focus();
        return;
      }
      if (reviewMode === 'keep') {
        review.onSaved();
        return;
      }
      if (reviewMode === 'storefront') {
        const addressIssue = publicVisitingAddressIssue({
          street1: formData.get('street1'),
          city: formData.get('city'),
          state: formData.get('state'),
        });
        if (addressIssue) {
          setFieldIssue({ id: profileId, ...addressIssue });
          document.getElementById(addressIssue.field)?.focus();
          return;
        }
      }
    }
    const zip = normalizeUsZip(formData.get('zipcode'));
    if (review.active && !zip) {
      setFieldIssue({
        id: profileId,
        field: 'zipcode',
        message: US_ZIP_REQUIRED_MESSAGE,
      });
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
      const primaryAddress: Record<string, unknown> = { zipcode: zip };
      if (reviewMode === 'storefront') {
        for (const [field, value] of Object.entries(updates.primary_address)) {
          if (
            String(value ?? '') !==
            String(address[field as keyof typeof address])
          ) {
            primaryAddress[field] = value;
          }
        }
        for (const field of ['street1', 'city', 'state'] as const) {
          primaryAddress[field] = String(formData.get(field) ?? '').trim();
        }
        // The API accepts coordinates only as a pair.
        if ('lat' in primaryAddress || 'lng' in primaryAddress) {
          primaryAddress.lat = updates.primary_address.lat;
          primaryAddress.lng = updates.primary_address.lng;
        }
      }
      const patch = {
        location_mode: reviewMode,
        primary_address: primaryAddress,
        ...(reviewMode === 'storefront' &&
        Object.entries(updates.counties).some(
          ([field, value]) =>
            Boolean(value) !==
            Boolean(profile?.counties?.[field as keyof typeof profile.counties])
        )
          ? { counties: updates.counties }
          : {}),
      };
      mutation.mutate(patch, {
        onSuccess: review.onSaved,
        onError: (error) => {
          const current = new URL(window.location.href);
          if (
            current.pathname === '/account/profile/address' &&
            current.searchParams.get('listingId') === review.listingId
          ) {
            const field = axios.isAxiosError<{ field?: string }>(error)
              ? error.response?.data?.field
              : undefined;
            document
              .getElementById(
                field === 'street1' || field === 'city' || field === 'state'
                  ? field
                  : 'zipcode'
              )
              ?.focus();
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
      pending={pending}
      continueLabel={
        reviewMode === 'keep'
          ? 'Keep location and continue'
          : zipOnly
            ? 'Save ZIP and continue'
            : reviewMode
              ? 'Save and continue'
              : 'Continue'
      }
      pendingLabel={
        gettingCoords
          ? 'Getting coordinates...'
          : zipOnly
            ? 'Saving ZIP...'
            : 'Saving...'
      }
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
  const fieldProps = (field: LocationField, description?: string) => ({
    'aria-invalid':
      Boolean(issue?.field === field || serverField === field) || undefined,
    'aria-describedby':
      [
        description,
        issue?.field === field ? `${field}-error` : '',
        serverField === field ? 'address-save-error' : '',
      ]
        .filter(Boolean)
        .join(' ') || undefined,
  });
  const fieldError = (field: LocationField) => (
    <>
      {issue?.field === field && (
        <p id={`${field}-error`} role="alert" className={reviewStyles.error}>
          {issue.message}
        </p>
      )}
      {serverField === field && saveError}
    </>
  );
  const zipField = (
    <div className="space-y-2">
      <Label htmlFor="zipcode">
        {zipOnly || (!review.active && onlineOnly)
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
        value={enteredZip}
        placeholder={review.active ? 'Enter a five-digit US ZIP' : '33138'}
        autoComplete="postal-code"
        inputMode={onlineOnly || review.active ? 'numeric' : undefined}
        required={review.active || onlineOnly}
        readOnly={pending}
        maxLength={onlineOnly || review.active ? 10 : undefined}
        pattern={
          onlineOnly || review.active ? '[0-9]{5}(-[0-9]{4})?' : undefined
        }
        {...fieldProps(
          'zipcode',
          review.active || onlineOnly ? 'base-zip-note' : undefined
        )}
        onChange={(event) => {
          setZipChoice({ id: profileId, value: event.target.value });
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
            ? zipOnly
              ? 'Required: a recognized five-digit US ZIP. ZIP+4 is accepted. This is only an approximate base area, not directions or a service/delivery boundary. Do not enter a private home address or make up a ZIP.'
              : 'Required: a recognized five-digit US ZIP for the public visiting address. ZIP+4 is accepted and saved as five digits.'
            : tProfile('locationForm.baseZipNote')}
        </p>
      )}
      {fieldError('zipcode')}
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
        onChange={() => {
          setFieldIssue(null);
          if (mutation.isError) mutation.reset();
        }}
      >
        {!review.active && actions}

        {review.active && (
          <>
            <fieldset disabled={pending} className="space-y-3">
              <legend className="mb-3 text-xl font-extrabold">
                How can people find this business?
              </legend>
              <p id="location-choice-note" className={reviewStyles.helper}>
                Choose a public visiting address, or a ZIP-only base for an
                online or mobile business. Every business needs a recognized US
                ZIP to finish the review. Changes are saved only when you
                continue.
              </p>
              <RadioGroup
                value={reviewMode ?? ''}
                disabled={pending}
                {...fieldProps('mode', 'location-choice-note')}
                onValueChange={(value) => {
                  if (value === 'keep' || isListingLocationMode(value)) {
                    setLocationChoice({ id: profileId, value });
                    setFieldIssue(null);
                    if (mutation.isError) mutation.reset();
                  }
                }}
              >
                {(
                  [
                    ['keep', 'Keep current location details for now'],
                    ['storefront', 'Public visiting address'],
                    ['online', 'Online business, without a public storefront'],
                    [
                      'mobile',
                      'Mobile or by appointment, without a public address',
                    ],
                  ] as const
                )
                  .filter(([value]) => value !== 'keep' || savedZipArea)
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
              {fieldError('mode')}
            </fieldset>
            {reviewMode === 'keep' && savedZipArea && (
              <p className={reviewStyles.note}>
                Keep saved ZIP {savedZipArea.postalCode} and your current
                location details unchanged. Choose another option above to
                update them.
              </p>
            )}
            {reviewMode === 'storefront' && (
              <p className={reviewStyles.note}>
                Enter the public street address, city, state and ZIP where
                visitors are welcome. Do not enter a private home address. An
                exact map point is optional.
              </p>
            )}
            {zipOnly && (
              <p className={reviewStyles.note}>
                Only a business base ZIP is needed. No street or home address or
                exact map point is requested. Saving this choice removes any
                previous public street address and exact map point.
              </p>
            )}
          </>
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

        {(!review.active || zipOnly) && zipField}

        <fieldset
          disabled={hideAddress}
          hidden={hideAddress}
          className="space-y-6"
        >
          <div className="space-y-2">
            <Label htmlFor="street1">
              {review.active ? 'Street address' : 'Street 1'}
              {publicAddressRequired && (
                <span className="text-destructive" aria-hidden="true">
                  {' '}
                  *
                </span>
              )}
            </Label>
            <Input
              id="street1"
              name="street1"
              type="text"
              defaultValue={address.street1}
              placeholder="123 Main Street"
              required={publicAddressRequired}
              readOnly={pending}
              autoComplete="address-line1"
              {...fieldProps('street1')}
            />
            {fieldError('street1')}
          </div>

          <div className="space-y-2">
            <Label htmlFor="street2">Street 2</Label>
            <Input
              id="street2"
              name="street2"
              type="text"
              defaultValue={address.street2}
              placeholder="Suite 100 (optional)"
              readOnly={pending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="city">
              City
              {publicAddressRequired && (
                <span className="text-destructive" aria-hidden="true">
                  {' '}
                  *
                </span>
              )}
            </Label>
            <Input
              id="city"
              name="city"
              type="text"
              defaultValue={address.city}
              placeholder="Miami"
              required={publicAddressRequired}
              readOnly={pending}
              autoComplete="address-level2"
              {...fieldProps('city')}
            />
            {fieldError('city')}
          </div>

          <div className="space-y-2">
            <Label htmlFor="state">
              State
              {publicAddressRequired && (
                <span className="text-destructive" aria-hidden="true">
                  {' '}
                  *
                </span>
              )}
            </Label>
            <Input
              id="state"
              name="state"
              type="text"
              defaultValue={address.state}
              placeholder="FL"
              required={publicAddressRequired}
              readOnly={pending}
              autoComplete="address-level1"
              {...fieldProps('state')}
            />
            {fieldError('state')}
          </div>

          {publicAddressRequired && zipField}

          <div className="space-y-2">
            <Label htmlFor="hours">Hours</Label>
            <Textarea
              id="hours"
              name="hours"
              rows={4}
              maxLength={500}
              defaultValue={address.hours}
              placeholder="Mon-Fri: 9am-5pm"
              readOnly={pending}
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
              disabled={pending}
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
                  readOnly={pending}
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
                  readOnly={pending}
                />
                <p className="text-sm text-gray-500">Example: -80.137139</p>
              </div>
            </div>
          </div>
        </fieldset>
        {(!review.active || reviewMode === 'storefront') && (
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

        {!['mode', 'street1', 'city', 'state', 'zipcode'].includes(
          serverField ?? ''
        ) && saveError}

        {review.active && actions}

        {mutation.isSuccess && !review.active && (
          <div className="rounded-md bg-green-50 p-4 text-green-600">
            Profile updated successfully!
          </div>
        )}
      </form>
    </ProfileEditorFrame>
  );
}
