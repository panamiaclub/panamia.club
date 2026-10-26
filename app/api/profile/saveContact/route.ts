// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { profiles } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { getActiveProfile } from '@/lib/server/active-profile';
import { describeDbError } from '@/lib/server/db-error';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json(
      {
        success: false,
        error: 'No user session available',
      },
      { status: 401 }
    );
  }

  const { email, phone_number, pronouns } = body;

  // The profile being acted as - their own, or a business listing they administer
  const existingProfile = await getActiveProfile(session.user.id);

  if (!existingProfile) {
    return NextResponse.json(
      {
        success: false,
        error: 'Could not find profile',
      },
      { status: 404 }
    );
  }

  let contactEmail: string | undefined;
  if (email != null) {
    if (existingProfile.userId === session.user.id) {
      if (email !== existingProfile.email) {
        return NextResponse.json(
          {
            success: false,
            error: 'Change your Pana account email in account settings.',
          },
          { status: 400 }
        );
      }
    } else {
      if (
        typeof email !== 'string' ||
        email.trim().length > 100 ||
        !/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(email.trim())
      ) {
        return NextResponse.json(
          {
            success: false,
            error: 'Please enter a valid listing contact email.',
          },
          { status: 400 }
        );
      }
      contactEmail = email.trim().toLowerCase();
    }
  }

  // Convert pronouns object to string
  let pronounsStr: string | null = null;
  if (pronouns) {
    if (pronouns.sheher) pronounsStr = 'she/her';
    else if (pronouns.hehim) pronounsStr = 'he/him';
    else if (pronouns.theythem) pronounsStr = 'they/them';
    else if (pronouns.other && typeof pronouns.other === 'string')
      pronounsStr = pronouns.other;
  }

  try {
    const [updatedProfile] = await db
      .update(profiles)
      .set({
        ...(contactEmail ? { email: contactEmail } : {}),
        phoneNumber: phone_number || null,
        pronouns: pronounsStr,
      })
      .where(eq(profiles.id, existingProfile.id))
      .returning();

    return NextResponse.json(
      { success: true, data: updatedProfile },
      { status: 200 }
    );
  } catch (e) {
    console.error('[profile/saveContact] update failed', e);
    const details = describeDbError(e);
    if (
      details.code === '23505' &&
      details.constraint === 'profiles_listing_name_email_unique'
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'A listing with this name and contact email already exists.',
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      {
        success: false,
        error: 'Could not save your contact details. Please try again.',
      },
      { status: 500 }
    );
  }
}
