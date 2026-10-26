import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { profiles } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { getActiveProfileId } from '@/lib/server/active-profile';
import { canAdministerProfile } from '@/lib/server/profile-owners';
import { sendListingSubmissionEmails } from '@/lib/server/listing-submission';

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: 'Sign in to resend a listing submission.' },
      { status: 401 }
    );
  }

  const body = await request.json();
  const profileId =
    typeof body.profileId === 'string'
      ? body.profileId
      : await getActiveProfileId(session.user.id);
  if (
    !profileId ||
    (!session.user.isAdmin &&
      !(await canAdministerProfile(session.user.id, profileId)))
  ) {
    return NextResponse.json(
      { success: false, error: 'You cannot manage that listing.' },
      { status: 403 }
    );
  }

  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.id, profileId),
  });
  if (!profile) {
    return NextResponse.json(
      { success: false, error: 'Could not find profile' },
      { status: 404 }
    );
  }
  if (profile.active) {
    return NextResponse.json(
      { success: false, error: 'Profile already active' },
      { status: 409 }
    );
  }

  try {
    await sendListingSubmissionEmails(profile);
    return NextResponse.json({ success: true, data: [] });
  } catch (error) {
    console.error('[profile/sendSubmission] notification email failed', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Could not send the submission emails. Please try again.',
      },
      { status: 500 }
    );
  }
}
