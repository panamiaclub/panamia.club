'use client';

import { useSession } from '@/lib/auth-client';
import { useEffect, useState } from 'react';
import axios from 'axios';
import {
  Check,
  CheckSquare,
  ExternalLink,
  MapPin,
  Image as ImageIcon,
  User,
  UserCircle,
  Tag,
  BadgePercent,
} from 'lucide-react';
import Link from 'next/link';

import PageMeta from '@/components/PageMeta';
import { ProfileInterface } from '@/lib/interfaces';
import { displayPronouns, standardizeDateTime } from '@/lib/standardized';
import Status401_Unauthorized from '@/components/Page/Status401_Unauthorized';
import { listSelectedCategories } from '@/lib/profile';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { NpubQr } from '@/components/relay/NpubQr';
import { npubFromHex } from '@/lib/nostr/keys';
import { useIdentity } from '@/components/account/identity-provider';
import { listingPublicPath } from '@/lib/listing-url';

const SpanBlank = () => {
  return <span className="text-gray-400 italic">blank</span>;
};

const SpanUnselected = () => {
  return <span className="text-gray-400 italic">unselected</span>;
};

export default function AccountProfileEdit() {
  const { data: session, status } = useSession();
  const identity = useIdentity();
  const activeId = identity?.activeId;
  const [profileData, setProfileData] = useState<ProfileInterface | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setProfileData(null);
    setError('');
    if (status === 'authenticated') {
      setLoading(true);
      axios
        .get<{ data?: ProfileInterface }>('/api/getProfile')
        .then((response) => {
          if (!response.data.data)
            throw new Error(
              'No profile was found. Select your business from the account menu.'
            );
          if (!cancelled) setProfileData(response.data.data);
        })
        .catch((cause: unknown) => {
          if (cancelled) return;
          console.error('Could not load the business dashboard:', cause);
          setError(
            'Could not load your profile. Please refresh and try again.'
          );
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    } else if (status === 'unauthenticated') {
      // Without this, `loading` stays true forever for anonymous visitors and
      // the Status401_Unauthorized branch below is never reached.
      setLoading(false);
    }
    return () => {
      cancelled = true;
    };
  }, [status, session?.user?.id, activeId]);

  if (status === 'loading' || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!session) {
    return <Status401_Unauthorized />;
  }
  if (!profileData) {
    return (
      <main className="container mx-auto px-4 py-8">
        <p role="alert">{error}</p>
      </main>
    );
  }

  const isBusiness =
    profileData.userId === null ||
    profileData.status?.source === 'business_intake';
  const profileStatus = profileData.active
    ? 'Published'
    : profileData.status?.declined
      ? 'Declined'
      : isBusiness &&
          !profileData.status?.approved &&
          !profileData.status?.published
        ? 'Under review'
        : isBusiness
          ? 'Inactive'
          : 'Draft';
  const statusDate = profileData.active
    ? (profileData.status?.approved ?? profileData.status?.published)
    : (profileData.status?.declined ?? profileData.status?.submitted);
  const profileStatusDate = statusDate
    ? standardizeDateTime(
        statusDate instanceof Date ? statusDate : new Date(statusDate)
      )
    : '';
  const publicPath = profileData.id
    ? listingPublicPath({
        id: profileData.id,
        screenname: profileData.screenname,
      })
    : profileData.screenname
      ? listingPublicPath({
          id: profileData._id,
          screenname: profileData.screenname,
        })
      : null;
  const address = {
    ...profileData.primary_address,
    street1: profileData.addressLine1 ?? profileData.primary_address?.street1,
    street2: profileData.addressLine2 ?? profileData.primary_address?.street2,
    city: profileData.addressLocality ?? profileData.primary_address?.city,
    state: profileData.addressRegion ?? profileData.primary_address?.state,
    zipcode:
      profileData.addressPostalCode ?? profileData.primary_address?.zipcode,
    hours: profileData.addressHours ?? profileData.primary_address?.hours,
    lat: profileData.addressLat ?? profileData.primary_address?.lat,
    lng: profileData.addressLng ?? profileData.primary_address?.lng,
  };

  // Relay-enrolled profiles have a hex nostr_pubkey; encode to npub for display
  // (we never render raw hex). null when not enrolled or the key is malformed.
  let npub: string | null = null;
  if (profileData.nostrPubkey) {
    try {
      npub = npubFromHex(profileData.nostrPubkey);
    } catch {
      npub = null;
    }
  }

  return (
    <main className="container mx-auto max-w-5xl px-4 py-8">
      <PageMeta
        title={isBusiness ? 'Manage my business' : 'Edit Profile'}
        desc=""
      />

      <h2 className="mb-8 text-3xl font-bold">
        {isBusiness ? `Manage ${profileData.name}` : 'Your Pana Profile'}
      </h2>

      {/* Profile Status */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <CheckSquare className="h-5 w-5" />
              Profile Status
            </CardTitle>
            {publicPath &&
              (isBusiness ? profileData.active : profileData.screenname) && (
                <Button variant="outline" size="sm" asChild>
                  <Link href={publicPath}>
                    <ExternalLink className="mr-2 h-4 w-4" />
                    View
                  </Link>
                </Button>
              )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <span className="font-medium">Status:</span>
            <span>
              {profileStatus} {profileStatusDate}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Nostr identity (relay-enrolled accounts only) */}
      {npub && (
        <div className="mb-6">
          <NpubQr npub={npub} />
        </div>
      )}

      {/* Contact Info */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Contact Info
            </CardTitle>
            <Button variant="outline" size="sm" asChild>
              <Link href="/account/profile/contact">Edit</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <div>
            <span className="font-medium">Email:</span>{' '}
            <span>{profileData?.email}</span>
          </div>
          <div>
            <span className="font-medium">Phone Number:</span>{' '}
            <span>{profileData?.phoneNumber ?? profileData?.phone_number}</span>
          </div>
          <div>
            <span className="font-medium">Pronouns:</span>{' '}
            <span>{displayPronouns(profileData.pronouns)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Profile Descriptions */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <UserCircle className="h-5 w-5" />
              Profile Descriptions
            </CardTitle>
            <Button variant="outline" size="sm" asChild>
              <Link href="/account/profile/desc">Edit</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <div>
            <span className="font-medium">Name:</span>{' '}
            <span>{profileData?.name}</span>
          </div>
          <div>
            <span className="font-medium">Five Words:</span>{' '}
            <span>
              {profileData.descriptions?.fiveWords ?? profileData.five_words}
            </span>
          </div>
          <div>
            <span className="font-medium">Details:</span>{' '}
            <span>
              {profileData.descriptions?.details ?? profileData.details}
            </span>
          </div>
          <div>
            <span className="font-medium">Background:</span>{' '}
            <span>
              {profileData.descriptions?.background ?? profileData.background}
            </span>
          </div>
          <div>
            <span className="font-medium">Tags:</span>{' '}
            {(profileData.descriptions?.tags ?? profileData.tags) ? (
              <span>{profileData.descriptions?.tags ?? profileData.tags}</span>
            ) : (
              <SpanBlank />
            )}
          </div>
          {profileData?.screenname && (
            <div className="mt-4 rounded-md bg-gray-50 p-3 text-sm dark:bg-gray-800">
              <div className="font-medium">
                handle: /p/{profileData.screenname}
              </div>
              <div className="text-gray-600 dark:text-gray-400">
                This is the URL for your profile
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Images */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5" />
              Images
            </CardTitle>
            <Button variant="outline" size="sm" asChild>
              <Link href="/account/profile/images">Edit</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {profileData?.images?.primaryCDN && (
              <div className="space-y-2">
                <img
                  src={profileData.images.primaryCDN}
                  alt="Profile"
                  className="h-32 w-full rounded-md object-cover"
                />
                <small className="text-xs text-gray-600">Profile Image</small>
              </div>
            )}
            {profileData?.images?.gallery1CDN && (
              <div className="space-y-2">
                <img
                  src={profileData.images.gallery1CDN}
                  alt="Gallery 1"
                  className="h-32 w-full rounded-md object-cover"
                />
                <small className="text-xs text-gray-600">Gallery</small>
              </div>
            )}
            {profileData?.images?.gallery2CDN && (
              <div className="space-y-2">
                <img
                  src={profileData.images.gallery2CDN}
                  alt="Gallery 2"
                  className="h-32 w-full rounded-md object-cover"
                />
                <small className="text-xs text-gray-600">Gallery</small>
              </div>
            )}
            {profileData?.images?.gallery3CDN && (
              <div className="space-y-2">
                <img
                  src={profileData.images.gallery3CDN}
                  alt="Gallery 3"
                  className="h-32 w-full rounded-md object-cover"
                />
                <small className="text-xs text-gray-600">Gallery</small>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Links and Socials */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <ExternalLink className="h-5 w-5" />
              Links and Socials
            </CardTitle>
            <Button variant="outline" size="sm" asChild>
              <Link href="/account/profile/social">Edit</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div>
              <span className="font-medium">Website:</span>{' '}
              {(profileData?.socials?.website && (
                <span>{profileData?.socials?.website}</span>
              )) || <SpanBlank />}
            </div>
            <div>
              <span className="font-medium">Instagram:</span>{' '}
              {(profileData?.socials?.instagram && (
                <span>{profileData?.socials?.instagram}</span>
              )) || <SpanBlank />}
            </div>
            <div>
              <span className="font-medium">Facebook:</span>{' '}
              {(profileData?.socials?.facebook && (
                <span>{profileData?.socials?.facebook}</span>
              )) || <SpanBlank />}
            </div>
            <div>
              <span className="font-medium">TikTok:</span>{' '}
              {(profileData?.socials?.tiktok && (
                <span>{profileData?.socials?.tiktok}</span>
              )) || <SpanBlank />}
            </div>
            <div>
              <span className="font-medium">Twitter:</span>{' '}
              {(profileData?.socials?.twitter && (
                <span>{profileData?.socials?.twitter}</span>
              )) || <SpanBlank />}
            </div>
            <div>
              <span className="font-medium">Spotify:</span>{' '}
              {(profileData?.socials?.spotify && (
                <span>{profileData?.socials?.spotify}</span>
              )) || <SpanBlank />}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Address and GeoLocation */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Address and GeoLocation
            </CardTitle>
            <Button variant="outline" size="sm" asChild>
              <Link href="/account/profile/address">Edit</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="mb-2 font-medium">Primary Address:</div>
            <div className="space-y-1 text-sm">
              <div>
                <span className="font-medium">Street 1:</span>{' '}
                {(address.street1 && <span>{address.street1}</span>) || (
                  <SpanBlank />
                )}
              </div>
              <div>
                <span className="font-medium">Street 2:</span>{' '}
                {(address.street2 && <span>{address.street2}</span>) || (
                  <SpanBlank />
                )}
              </div>
              <div>
                <span className="font-medium">City:</span>{' '}
                {(address.city && <span>{address.city}</span>) || <SpanBlank />}
              </div>
              <div>
                <span className="font-medium">State:</span>{' '}
                {(address.state && <span>{address.state}</span>) || (
                  <SpanBlank />
                )}
              </div>
              <div>
                <span className="font-medium">Zip Code:</span>{' '}
                {(address.zipcode && <span>{address.zipcode}</span>) || (
                  <SpanBlank />
                )}
              </div>
              <div>
                <span className="font-medium">Location Hours:</span>{' '}
                {(address.hours && <span>{address.hours}</span>) || (
                  <SpanBlank />
                )}
              </div>
            </div>
          </div>
          <div>
            <div className="mb-2 font-medium">Geo Coordinates:</div>
            <div className="space-y-1 text-sm">
              <div>
                <span className="font-medium">Latitude:</span>{' '}
                {(address.lat && <span>{address.lat}</span>) || <SpanBlank />}
              </div>
              <div>
                <span className="font-medium">Longitude:</span>{' '}
                {(address.lng && <span>{address.lng}</span>) || <SpanBlank />}
              </div>
            </div>
          </div>
          <div>
            <div className="mb-2 font-medium">Servicing Counties:</div>
            <div className="space-y-1 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium">Palm Beach:</span>
                {profileData?.counties?.palm_beach ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <SpanUnselected />
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium">Broward:</span>
                {profileData?.counties?.broward ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <SpanUnselected />
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium">Miami-Dade:</span>
                {profileData?.counties?.miami_dade ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <SpanUnselected />
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Categories */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5" />
              Categories
            </CardTitle>
            <Button variant="outline" size="sm" asChild>
              <Link href="/account/profile/categories">Edit</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-2 font-medium">Selected Categories:</div>
          <p>
            {(profileData?.categories &&
              listSelectedCategories(profileData?.categories)) || (
              <small className="text-gray-400 italic">None</small>
            )}
          </p>
        </CardContent>
      </Card>

      {/* Gente dePana Offer */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <BadgePercent className="h-5 w-5" />
              Gente dePana Offer
            </CardTitle>
            <Button variant="outline" size="sm" asChild>
              <Link href="/account/profile/gentedepana">Edit</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <div>
            <span className="font-medium">Discount Code:</span>{' '}
            {(profileData?.gentedepana?.code && (
              <span>{profileData.gentedepana.code}</span>
            )) || <SpanBlank />}
          </div>
          <div>
            <span className="font-medium">Percentage:</span>{' '}
            {(profileData?.gentedepana?.percentage && (
              <span>{profileData?.gentedepana?.percentage}</span>
            )) || <SpanBlank />}
          </div>
          <div>
            <span className="font-medium">Details:</span>{' '}
            {(profileData?.gentedepana?.details && (
              <span>{profileData.gentedepana.details}</span>
            )) || <SpanBlank />}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
