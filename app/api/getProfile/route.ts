import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { ensureProfile } from '@/lib/server/profile';
import {
  getActiveProfileId,
  getEditableProfile,
} from '@/lib/server/active-profile';
import { db } from '@/lib/db';
import { profiles } from '@/lib/schema';
import { eq } from 'drizzle-orm';

/* ProfileInterface promises a nested `images` object, and the settings avatar
   and the images page both read it, but this route answers with the raw
   Drizzle row -- where the picture is a flat `primary_image_cdn` column and
   the rest live in `gallery_images`. Nothing ever built `images`, so every one
   of those reads came back undefined and no uploaded picture could appear
   anywhere, however correctly it had been stored. useQuery<ProfileInterface>
   is an unchecked assertion, so the type promised a field the response never
   carried and the compiler had no reason to object.

   The row is still spread through untouched: other pages read the flat
   camelCase columns straight off it, and those keep working. This only adds
   the shape the interface already describes. */
function withLegacyImages<
  T extends {
    primaryImageId?: string | null;
    primaryImageCdn?: string | null;
    galleryImages?: unknown;
  },
>(profile: T) {
  const gallery = (profile.galleryImages ?? {}) as Record<
    string,
    string | undefined
  >;

  return {
    ...profile,
    images: {
      primary: profile.primaryImageId ?? undefined,
      primaryCDN: profile.primaryImageCdn ?? undefined,
      gallery1: gallery.gallery1,
      gallery1CDN: gallery.gallery1CDN,
      gallery2: gallery.gallery2,
      gallery2CDN: gallery.gallery2CDN,
      gallery3: gallery.gallery3,
      gallery3CDN: gallery.gallery3CDN,
    },
  };
}

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json(
      { error: 'No user session available' },
      { status: 401 }
    );
  }

  const listingId = request.nextUrl.searchParams.get('listingId');
  if (listingId !== null) {
    const listing = await getEditableProfile(session.user.id, listingId);
    if (!listing) {
      return NextResponse.json(
        { success: false, error: 'You do not manage that business listing.' },
        { status: 403, headers: { 'Cache-Control': 'private, no-store' } }
      );
    }
    return NextResponse.json(
      { success: true, data: withLegacyImages(listing) },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  }

  // If they've switched to a business listing they administer, serve that
  // instead. getActiveProfileId re-validates ownership, so an edited cookie
  // can't pull someone else's listing.
  const activeId = await getActiveProfileId(session.user.id);
  if (activeId) {
    const active = await db.query.profiles.findFirst({
      where: eq(profiles.id, activeId),
    });
    if (active) {
      return NextResponse.json({
        success: true,
        data: withLegacyImages(active),
      });
    }
  }

  // Breadcrumb pair around the profile read. This route hung in production
  // with no error and no response (CF ray a2776034e8199aa6); a "start" with no
  // "done" pins the stall to ensureProfile rather than to auth() above it.
  console.log('[getProfile] ensureProfile start', { userId: session.user.id });

  // Use userId for profile lookup, with email fallback for unclaimed profiles
  const existingProfile = await ensureProfile(
    session.user.id,
    session.user.email
  );

  console.log('[getProfile] ensureProfile done', {
    userId: session.user.id,
    found: Boolean(existingProfile),
  });

  if (existingProfile) {
    return NextResponse.json({
      success: true,
      data: withLegacyImages(existingProfile),
    });
  }

  return NextResponse.json({ success: true });
}
