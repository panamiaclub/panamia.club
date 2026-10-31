// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { profiles } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { getActiveProfile } from '@/lib/server/active-profile';
import { normalizeUsZip } from '@/lib/online-zip';
import {
  getOnlineZipArea,
  ZipLookupUnavailableError,
} from '@/lib/server/online-zip';

export async function POST(request: NextRequest) {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Could not read that address update.' },
      { status: 400 }
    );
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return NextResponse.json(
      { success: false, error: 'Please provide an address update.' },
      { status: 400 }
    );
  }
  const body = parsed as Record<string, unknown>;
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({
      success: false,
      error: 'No user session available',
    });
  }

  const { primary_address, online_only } = body;

  // The profile being acted as - their own, or a business listing they administer
  const existingProfile = await getActiveProfile(session.user.id);

  if (!existingProfile) {
    return NextResponse.json({
      success: false,
      error: 'Could not find profile',
    });
  }

  if (online_only !== undefined && typeof online_only !== 'boolean') {
    return NextResponse.json(
      {
        success: false,
        error: 'The online-business choice must be true or false.',
      },
      { status: 400 }
    );
  }
  if (
    primary_address != null &&
    (typeof primary_address !== 'object' || Array.isArray(primary_address))
  ) {
    return NextResponse.json(
      { success: false, error: 'Please provide address fields as an object.' },
      { status: 400 }
    );
  }
  const address = primary_address as Record<string, unknown> | null | undefined;
  const online =
    typeof online_only === 'boolean' ? online_only : existingProfile.onlineOnly;

  try {
    const updateData: Partial<typeof profiles.$inferInsert> = {};
    if ('counties' in body) updateData.counties = body.counties ?? null;
    if (typeof online_only === 'boolean') updateData.onlineOnly = online_only;

    // Preserve both existing address vocabularies and fields omitted by a caller.
    const fields = [
      ['addressName', ['name']],
      ['addressLine1', ['street1', 'line1']],
      ['addressLine2', ['street2', 'line2']],
      ['addressLine3', ['street3', 'line3']],
      ['addressLocality', ['city', 'locality']],
      ['addressRegion', ['state', 'region']],
      ['addressPostalCode', ['zipcode', 'postalCode']],
      ['addressCountry', ['country']],
      ['addressHours', ['hours']],
    ] as const;
    for (const [column, keys] of fields) {
      const key = keys.find((candidate) => address?.[candidate] !== undefined);
      if (!key) continue;
      const value = address?.[key];
      if (value !== null && typeof value !== 'string') {
        return NextResponse.json(
          { success: false, error: 'Address fields must be text or empty.' },
          { status: 400 }
        );
      }
      updateData[column] =
        typeof value === 'string' ? value.trim() || null : null;
    }

    if (online) {
      const zip = normalizeUsZip(
        updateData.addressPostalCode !== undefined
          ? updateData.addressPostalCode
          : existingProfile.addressPostalCode
      );
      if (!zip) {
        return NextResponse.json(
          {
            success: false,
            error:
              'Online businesses require a valid five-digit base ZIP code.',
          },
          { status: 400 }
        );
      }
      if (
        updateData.addressCountry &&
        updateData.addressCountry.toUpperCase() !== 'US'
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              'Please provide the US ZIP where this online business is based.',
          },
          { status: 400 }
        );
      }
      const zipArea = await getOnlineZipArea(zip);
      if (!zipArea) {
        return NextResponse.json(
          {
            success: false,
            error:
              'We could not find a map location for that ZIP. Check the code or contact us.',
          },
          { status: 400 }
        );
      }
      Object.assign(updateData, {
        addressName: null,
        addressLine1: null,
        addressLine2: null,
        addressLine3: null,
        addressGooglePlaceId: null,
        addressHours: null,
        addressLocality: zipArea.city,
        addressRegion: zipArea.region,
        addressCountry: 'US',
        addressPostalCode: zip,
        addressLat: null,
        addressLng: null,
        geo: { zipArea },
      });
    } else {
      if (existingProfile.onlineOnly && online_only === false)
        updateData.geo = null;
      if (address?.lat !== undefined || address?.lng !== undefined) {
        const empty = (value: unknown) =>
          value == null || (typeof value === 'string' && value.trim() === '');
        if (empty(address?.lat) && empty(address?.lng)) {
          updateData.addressLat = null;
          updateData.addressLng = null;
          updateData.geo = null;
        } else {
          const lat =
            typeof address?.lat === 'string' || typeof address?.lat === 'number'
              ? Number(address.lat)
              : NaN;
          const lng =
            typeof address?.lng === 'string' || typeof address?.lng === 'number'
              ? Number(address.lng)
              : NaN;
          if (
            empty(address?.lat) ||
            empty(address?.lng) ||
            !Number.isFinite(lat) ||
            !Number.isFinite(lng) ||
            Math.abs(lat) > 90 ||
            Math.abs(lng) > 180
          ) {
            return NextResponse.json(
              {
                success: false,
                error:
                  'Provide valid latitude and longitude together, or leave both empty.',
              },
              { status: 400 }
            );
          }
          updateData.addressLat = String(lat);
          updateData.addressLng = String(lng);
          updateData.geo = null;
        }
      }
    }

    const [updatedProfile] = await db
      .update(profiles)
      .set(updateData)
      .where(eq(profiles.id, existingProfile.id))
      .returning();

    return NextResponse.json(
      { success: true, data: updatedProfile },
      { status: 200 }
    );
  } catch (e) {
    if (e instanceof ZipLookupUnavailableError) {
      console.error('Profile ZIP location lookup failed:', e);
      return NextResponse.json(
        {
          success: false,
          error:
            'ZIP location lookup is temporarily unavailable. Please try again.',
        },
        { status: 503 }
      );
    }
    if (e instanceof Error) {
      console.log(e.message);
      return NextResponse.json(
        { success: false, error: e.message },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Unknown error' },
      { status: 500 }
    );
  }
}
