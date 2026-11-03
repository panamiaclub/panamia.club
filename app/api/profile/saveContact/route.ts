// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { profiles, verification } from '@/lib/schema';
import { listingInvitationIdentifier } from '@/lib/listing-invitation';
import { eq } from 'drizzle-orm';
import { getEditableProfile } from '@/lib/server/active-profile';
import { describeDbError } from '@/lib/server/db-error';
import { revalidatePublicListing } from '@/lib/server/profile';

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

  const listingId = request.nextUrl.searchParams.get('listingId');
  const existingProfile = await getEditableProfile(session.user.id, listingId);

  if (!existingProfile) {
    return NextResponse.json(
      {
        success: false,
        error: 'You do not manage that profile.',
      },
      { status: listingId !== null ? 403 : 404 }
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
    const updatedProfile = await db.transaction(async (tx) => {
      const [current] = await tx
        .select({ email: profiles.email })
        .from(profiles)
        .where(eq(profiles.id, existingProfile.id))
        .for('update');
      if (!current) throw new Error('The edited profile no longer exists.');
      const [updated] = await tx
        .update(profiles)
        .set({
          ...(contactEmail ? { email: contactEmail } : {}),
          ...('phone_number' in body
            ? { phoneNumber: phone_number || null }
            : {}),
          ...('pronouns' in body ? { pronouns: pronounsStr } : {}),
        })
        .where(eq(profiles.id, existingProfile.id))
        .returning();
      if (contactEmail && contactEmail !== current.email.trim().toLowerCase()) {
        await tx
          .delete(verification)
          .where(
            eq(
              verification.identifier,
              listingInvitationIdentifier(existingProfile.id)
            )
          );
      }
      return updated;
    });

    revalidatePublicListing(existingProfile.id, existingProfile.screenname);
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
