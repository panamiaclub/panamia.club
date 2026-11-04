// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { profiles } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { getEditableProfile } from '@/lib/server/active-profile';
import { revalidatePublicListing } from '@/lib/server/profile';
import { withOnlineZipArea, type OnlineZipArea } from '@/lib/online-zip';
import { validateBusinessZip } from '@/lib/server/online-zip';

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
    return NextResponse.json(
      { success: false, error: 'No user session available' },
      { status: 401 }
    );
  }

  const { primary_address, online_only } = body;

  const listingId = request.nextUrl.searchParams.get('listingId');
  const existingProfile = await getEditableProfile(session.user.id, listingId);

  if (!existingProfile) {
    return NextResponse.json(
      { success: false, error: 'You do not manage that profile.' },
      { status: listingId !== null ? 403 : 404 }
    );
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
      ['addressGooglePlaceId', ['googlePlaceId']],
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

    let zipArea: OnlineZipArea | undefined;
    if (listingId !== null || online) {
      const verified = await validateBusinessZip({
        addressPostalCode:
          updateData.addressPostalCode !== undefined
            ? updateData.addressPostalCode
            : existingProfile.addressPostalCode,
        addressCountry:
          updateData.addressCountry !== undefined
            ? updateData.addressCountry
            : listingId !== null && updateData.addressPostalCode !== undefined
              ? 'US'
              : existingProfile.addressCountry,
        geo: existingProfile.geo,
      });
      if (!verified.success)
        return NextResponse.json(verified, { status: verified.status });
      zipArea = verified.area;
      updateData.addressPostalCode = zipArea.postalCode;
      updateData.addressCountry = 'US';
    }

    if (online && zipArea) {
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
        addressPostalCode: zipArea.postalCode,
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

    if (zipArea && !online) {
      updateData.geo = withOnlineZipArea(
        updateData.geo !== undefined ? updateData.geo : existingProfile.geo,
        zipArea
      );
    }

    const [updatedProfile] = await db
      .update(profiles)
      .set(updateData)
      .where(eq(profiles.id, existingProfile.id))
      .returning();

    revalidatePublicListing(existingProfile.id, existingProfile.screenname);
    return NextResponse.json(
      { success: true, data: updatedProfile },
      { status: 200 }
    );
  } catch (e) {
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
