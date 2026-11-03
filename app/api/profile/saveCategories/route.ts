// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { profiles } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { getEditableProfile } from '@/lib/server/active-profile';
import { revalidatePublicListing } from '@/lib/server/profile';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: 'No user session available' },
      { status: 401 }
    );
  }

  const { categories } = body;

  const listingId = request.nextUrl.searchParams.get('listingId');
  const existingProfile = await getEditableProfile(session.user.id, listingId);

  if (!existingProfile) {
    return NextResponse.json(
      { success: false, error: 'You do not manage that profile.' },
      { status: listingId !== null ? 403 : 404 }
    );
  }

  if (
    !categories ||
    typeof categories !== 'object' ||
    Array.isArray(categories) ||
    Object.values(categories).some((value) => typeof value !== 'boolean')
  ) {
    return NextResponse.json(
      { success: false, error: 'Please provide category selections.' },
      { status: 400 }
    );
  }

  try {
    const [updatedProfile] = await db
      .update(profiles)
      .set({
        categories: {
          ...((existingProfile.categories as Record<string, boolean> | null) ??
            {}),
          ...categories,
        },
      })
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
