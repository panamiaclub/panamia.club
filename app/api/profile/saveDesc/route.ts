// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { profiles } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { getEditableProfile } from '@/lib/server/active-profile';
import { revalidatePublicListing } from '@/lib/server/profile';
import { ProfileDescriptions } from '@/lib/interfaces';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: 'No user session available' },
      { status: 401 }
    );
  }

  const { name } = body;

  const listingId = request.nextUrl.searchParams.get('listingId');
  const existingProfile = await getEditableProfile(session.user.id, listingId);

  if (!existingProfile) {
    return NextResponse.json(
      { success: false, error: 'You do not manage that profile.' },
      { status: listingId !== null ? 403 : 404 }
    );
  }

  // Build update data
  const updateData: Partial<typeof profiles.$inferInsert> = {};

  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) {
      return NextResponse.json(
        { success: false, error: 'Please enter a business or profile name.' },
        { status: 400 }
      );
    }
    updateData.name = name.trim();
  }

  // Merge with existing descriptions
  const existingDescriptions =
    existingProfile.descriptions as ProfileDescriptions | null;
  const descriptions: ProfileDescriptions = { ...existingDescriptions };
  const fields = [
    ['five_words', 'fiveWords'],
    ['details', 'details'],
    ['background', 'background'],
    ['tags', 'tags'],
  ] as const;
  for (const [field, key] of fields) {
    if (body[field] === undefined) continue;
    if (typeof body[field] !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Description fields must be text.' },
        { status: 400 }
      );
    }
    descriptions[key] = body[field];
  }
  updateData.descriptions = descriptions;

  try {
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
