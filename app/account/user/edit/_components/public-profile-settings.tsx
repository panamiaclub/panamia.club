'use client';

import axios from 'axios';
import { useRef, useState, type FormEvent } from 'react';
import { Loader2, MapPin, Save, Upload } from 'lucide-react';

import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import type {
  CategoryInterface,
  ProfileDescriptions,
  ProfileInterface,
  PronounsInterface,
} from '@/lib/interfaces';
import { profileCategoryList } from '@/lib/lists';
import { profileQueryKey, useProfile } from '@/lib/query/profile';
import { useQueryClient } from '@tanstack/react-query';

import { SettingsCard, SettingsRow } from './settings-primitives';

type RawProfile = ProfileInterface & {
  descriptions?: ProfileDescriptions | null;
  phoneNumber?: string | null;
  pronouns?: PronounsInterface | string | null;
  onlineOnly?: boolean;
};

function checked(formData: FormData, name: string) {
  return formData.get(name) !== null;
}

async function postJson(url: string, body: unknown) {
  const response = await axios.post(url, body);
  if (!response.data?.success) {
    throw new Error(response.data?.error || 'Profile update failed');
  }
}

export function PublicProfileSettings() {
  const { data, isLoading, error, refetch } = useProfile();
  const profile = data as RawProfile | undefined;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const profileFormRef = useRef<HTMLFormElement>(null);
  const [saving, setSaving] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [uploading, setUploading] = useState(false);

  if (isLoading) {
    return (
      <SettingsCard>
        <div className="settings-row settings-note flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading your public profile…
        </div>
      </SettingsCard>
    );
  }

  if (!profile || error) {
    return (
      <SettingsCard>
        <div className="settings-row settings-note">
          Your public profile is not available yet. Finish account setup, then
          return here.
        </div>
      </SettingsCard>
    );
  }

  const descriptions = profile.descriptions ?? {};
  const socials = profile.socials ?? {};
  const categories = profile.categories ?? ({} as CategoryInterface);
  const counties = profile.counties ?? {
    palm_beach: false,
    broward: false,
    miami_dade: false,
  };
  const discounts = profile.gentedepana ?? {};
  const legacyAddress = profile.primary_address;
  const pronouns =
    typeof profile.pronouns === 'string' ? profile.pronouns.toLowerCase() : '';
  const otherPronouns =
    typeof profile.pronouns === 'object'
      ? (profile.pronouns?.other_desc ?? '')
      : !['she/her', 'he/him', 'they/them'].includes(pronouns)
        ? (profile.pronouns ?? '')
        : '';

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const formData = new FormData(event.currentTarget);

    const other = String(formData.get('pronouns_otherdesc') ?? '').trim();
    const categoryValues = Object.fromEntries(
      profileCategoryList.map((item) => [
        item.value,
        checked(formData, item.value),
      ])
    );

    try {
      await Promise.all([
        postJson('/api/profile/saveContact', {
          phone_number: formData.get('phone_number'),
          pronouns: {
            sheher: checked(formData, 'pronouns_sheher'),
            hehim: checked(formData, 'pronouns_hehim'),
            theythem: checked(formData, 'pronouns_theythem'),
            other: other || false,
          },
        }),
        postJson('/api/profile/saveDesc', {
          name: formData.get('profile_name'),
          five_words: formData.get('five_words'),
          details: formData.get('details'),
          background: formData.get('background'),
          tags: formData.get('tags'),
        }),
        postJson('/api/profile/saveSocial', {
          socials: {
            website: formData.get('website'),
            facebook: formData.get('facebook'),
            instagram: formData.get('instagram'),
            tiktok: formData.get('tiktok'),
            twitter: formData.get('twitter'),
            spotify: formData.get('spotify'),
          },
        }),
        postJson('/api/profile/saveAddress', {
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
            palm_beach: checked(formData, 'county_palmbeach'),
            broward: checked(formData, 'county_broward'),
            miami_dade: checked(formData, 'county_miamidade'),
          },
          online_only: checked(formData, 'online_only'),
        }),
        postJson('/api/profile/saveCategories', {
          categories: categoryValues,
        }),
        postJson('/api/profile/saveGenteDePana', {
          discount_code: formData.get('discount_code'),
          discount_percentage: formData.get('discount_percentage'),
          discount_details: formData.get('discount_details'),
        }),
      ]);

      await queryClient.invalidateQueries({
        queryKey: profileQueryKey,
        exact: true,
      });
      toast({
        title: 'Profile saved',
        description: 'Your public profile has been updated.',
      });
    } catch (saveError) {
      console.error('Could not save public profile', saveError);
      toast({
        title: 'Could not save profile',
        description:
          'Some sections may have saved before the error. Reload, review the fields, and try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }

  async function findCoordinates() {
    const form = profileFormRef.current;
    if (!form) return;
    const formData = new FormData(form);
    const address = {
      street1: formData.get('street1'),
      street2: formData.get('street2'),
      city: formData.get('city'),
      state: formData.get('state'),
      zipcode: formData.get('zipcode'),
    };

    if (
      !address.street1 ||
      !address.city ||
      !address.state ||
      !address.zipcode
    ) {
      toast({
        title: 'Address incomplete',
        description:
          'Add street, city, state, and ZIP before finding coordinates.',
        variant: 'destructive',
      });
      return;
    }

    setGeocoding(true);
    try {
      const response = await axios.post('/api/geo/byAddress', { address });
      const coordinates = response.data?.data?.[0];
      if (!coordinates?.lat || !coordinates?.lng) {
        throw new Error('No coordinates returned');
      }
      const lat = form.elements.namedItem('lat') as HTMLInputElement | null;
      const lng = form.elements.namedItem('lng') as HTMLInputElement | null;
      if (lat) lat.value = String(coordinates.lat);
      if (lng) lng.value = String(coordinates.lng);
      toast({
        title: 'Coordinates found',
        description: 'Save your profile to keep this map location.',
      });
    } catch (geocodeError) {
      console.error('Could not geocode profile address', geocodeError);
      toast({
        title: 'Could not find that address',
        description:
          'Check the address or enter latitude and longitude manually.',
        variant: 'destructive',
      });
    } finally {
      setGeocoding(false);
    }
  }

  async function uploadImages(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUploading(true);
    try {
      const response = await axios.post(
        '/api/profile/upload',
        new FormData(event.currentTarget),
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      if (!response.data?.success) {
        throw new Error(response.data?.error || 'Upload failed');
      }
      event.currentTarget.reset();
      await refetch();
      toast({
        title: 'Images saved',
        description: 'Your public profile images have been updated.',
      });
    } catch (uploadError) {
      console.error('Could not upload profile images', uploadError);
      toast({
        title: 'Could not upload images',
        description: 'Use JPG, PNG, or WebP files and try again.',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-5">
      <form ref={profileFormRef} onSubmit={saveProfile} className="space-y-5">
        <div className="flex justify-end">
          <button type="submit" className="settings-btn" disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="h-4 w-4" aria-hidden="true" />
            )}
            {saving ? 'Saving…' : 'Save public profile'}
          </button>
        </div>

        <SettingsCard>
          <SettingsRow
            label="About"
            note="The name and short description people see on your public profile and in directory results."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Profile name"
                name="profile_name"
                defaultValue={profile.name}
              />
              <Field
                label="In a few words"
                name="five_words"
                defaultValue={profile.five_words ?? descriptions.fiveWords}
              />
            </div>
            <div className="mt-4 grid gap-4">
              <Area
                label="About you or your work"
                name="details"
                defaultValue={profile.details ?? descriptions.details}
              />
              <Area
                label="Background"
                name="background"
                defaultValue={profile.background ?? descriptions.background}
              />
              <Area
                label="Search tags"
                name="tags"
                defaultValue={profile.tags ?? descriptions.tags}
              />
            </div>
          </SettingsRow>

          <SettingsRow
            label="Private contact"
            note="Used by Pana staff when needed. These fields are not printed on your public profile."
          >
            <Field
              label="Phone number"
              name="phone_number"
              defaultValue={profile.phoneNumber ?? profile.phone_number}
              type="tel"
            />
            <fieldset className="mt-4">
              <legend className="settings-label">Pronouns</legend>
              <div className="mt-2 flex flex-wrap gap-4">
                <Check
                  name="pronouns_sheher"
                  label="She/her"
                  defaultChecked={
                    pronouns === 'she/her' || profile.pronouns?.sheher === true
                  }
                />
                <Check
                  name="pronouns_hehim"
                  label="He/him"
                  defaultChecked={
                    pronouns === 'he/him' || profile.pronouns?.hehim === true
                  }
                />
                <Check
                  name="pronouns_theythem"
                  label="They/them"
                  defaultChecked={
                    pronouns === 'they/them' ||
                    profile.pronouns?.theythem === true
                  }
                />
              </div>
              <div className="mt-3">
                <Field
                  label="Other pronouns"
                  name="pronouns_otherdesc"
                  defaultValue={otherPronouns}
                />
              </div>
            </fieldset>
          </SettingsRow>

          <SettingsRow
            label="Links"
            note="Public places where panas can find you."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              {(
                [
                  ['Website', 'website', socials.website],
                  ['Instagram', 'instagram', socials.instagram],
                  ['Facebook', 'facebook', socials.facebook],
                  ['TikTok', 'tiktok', socials.tiktok],
                  ['X / Twitter', 'twitter', socials.twitter],
                  ['Spotify', 'spotify', socials.spotify],
                ] satisfies Array<[string, string, string | undefined]>
              ).map(([label, name, value]) => (
                <Field
                  key={name}
                  label={label}
                  name={name}
                  defaultValue={value}
                />
              ))}
            </div>
          </SettingsRow>

          <SettingsRow
            label="Categories"
            note="Choose every category people should be able to find you under."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {profileCategoryList.map((item) => (
                <Check
                  key={item.value}
                  name={item.value}
                  label={item.desc}
                  defaultChecked={
                    categories[item.value as keyof CategoryInterface] === true
                  }
                />
              ))}
            </div>
          </SettingsRow>

          <SettingsRow
            label="Location"
            note="Leave the address empty for a mobile service, or mark the profile online-only when there is nowhere to visit."
          >
            <Check
              name="online_only"
              label="This profile operates online only"
              defaultChecked={
                profile.onlineOnly === true || profile.online_only === true
              }
            />
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field
                label="Street"
                name="street1"
                defaultValue={profile.addressLine1 ?? legacyAddress?.street1}
              />
              <Field
                label="Suite or unit"
                name="street2"
                defaultValue={profile.addressLine2 ?? legacyAddress?.street2}
              />
              <Field
                label="City"
                name="city"
                defaultValue={profile.addressLocality ?? legacyAddress?.city}
              />
              <Field
                label="State"
                name="state"
                defaultValue={profile.addressRegion ?? legacyAddress?.state}
              />
              <Field
                label="ZIP code"
                name="zipcode"
                defaultValue={
                  profile.addressPostalCode ?? legacyAddress?.zipcode
                }
              />
              <Field
                label="Hours"
                name="hours"
                defaultValue={profile.addressHours ?? legacyAddress?.hours}
              />
              <Field
                label="Latitude"
                name="lat"
                defaultValue={profile.addressLat ?? legacyAddress?.lat}
              />
              <Field
                label="Longitude"
                name="lng"
                defaultValue={profile.addressLng ?? legacyAddress?.lng}
              />
            </div>
            <button
              type="button"
              className="settings-btn mt-4"
              onClick={findCoordinates}
              disabled={geocoding}
            >
              {geocoding ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <MapPin className="h-4 w-4" aria-hidden="true" />
              )}
              Find coordinates from address
            </button>
            <fieldset className="mt-5">
              <legend className="settings-label">Counties served</legend>
              <div className="mt-2 flex flex-wrap gap-4">
                <Check
                  name="county_miamidade"
                  label="Miami-Dade"
                  defaultChecked={counties.miami_dade}
                />
                <Check
                  name="county_broward"
                  label="Broward"
                  defaultChecked={counties.broward}
                />
                <Check
                  name="county_palmbeach"
                  label="Palm Beach"
                  defaultChecked={counties.palm_beach}
                />
              </div>
            </fieldset>
          </SettingsRow>

          <SettingsRow
            label="Gente de Pana offer"
            note="Optional discount details shown to eligible supporters."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Discount code"
                name="discount_code"
                defaultValue={discounts.code}
              />
              <Field
                label="Discount percentage"
                name="discount_percentage"
                defaultValue={discounts.percentage}
              />
            </div>
            <div className="mt-4">
              <Area
                label="Discount details"
                name="discount_details"
                defaultValue={discounts.details}
              />
            </div>
          </SettingsRow>
        </SettingsCard>
      </form>

      <form id="profile-images" onSubmit={uploadImages}>
        <SettingsCard>
          <SettingsRow
            label="Profile images"
            note="The primary image appears in search. Gallery images appear on the public profile."
            control={
              <button
                type="submit"
                className="settings-btn"
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Upload className="h-4 w-4" aria-hidden="true" />
                )}
                {uploading ? 'Uploading…' : 'Upload selected images'}
              </button>
            }
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <ImageField
                label="Primary image"
                name="primary"
                current={profile.images?.primaryCDN}
              />
              <ImageField
                label="Gallery image 1"
                name="gallery1"
                current={profile.images?.gallery1CDN}
              />
              <ImageField
                label="Gallery image 2"
                name="gallery2"
                current={profile.images?.gallery2CDN}
              />
              <ImageField
                label="Gallery image 3"
                name="gallery3"
                current={profile.images?.gallery3CDN}
              />
            </div>
          </SettingsRow>
        </SettingsCard>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = 'text',
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="settings-label">{label}</span>
      <Input
        className="settings-input mt-2"
        name={name}
        type={type}
        defaultValue={defaultValue ?? ''}
      />
    </label>
  );
}

function Area({
  label,
  name,
  defaultValue,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
}) {
  return (
    <label className="block">
      <span className="settings-label">{label}</span>
      <Textarea
        className="settings-input mt-2 min-h-24"
        name={name}
        maxLength={500}
        defaultValue={defaultValue ?? ''}
      />
    </label>
  );
}

function Check({
  label,
  name,
  defaultChecked,
}: {
  label: string;
  name: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-sm font-semibold">
      <Checkbox name={name} defaultChecked={defaultChecked} />
      {label}
    </label>
  );
}

function ImageField({
  label,
  name,
  current,
}: {
  label: string;
  name: string;
  current?: string;
}) {
  return (
    <div>
      <Label htmlFor={`profile-${name}`}>{label}</Label>
      <Input
        id={`profile-${name}`}
        className="mt-2"
        name={name}
        type="file"
        accept="image/png,image/jpeg,image/webp"
      />
      {current && (
        <img
          src={current}
          alt=""
          className="border-pana-ink/10 mt-3 max-h-40 rounded-lg border object-cover"
        />
      )}
    </div>
  );
}
