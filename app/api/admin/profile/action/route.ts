import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { profiles, users } from '@/lib/schema';
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { DIRECTORY_ACCOUNT_TYPES } from '@/lib/accounts';
import {
  decideListing,
  type ListingStatus,
} from '@/lib/server/listing-decision';

/**
 * Approve or decline a listing from the link in a staff email.
 *
 * ## Why this has no session check
 *
 * Because it is clicked from an inbox, usually on a phone, usually by someone
 * who is not signed in. The access key in the URL is the credential. That is a
 * deliberate trade and it is the reason `app/admin/layout.tsx` carries no
 * server-side gate — see `components/Admin/gate.tsx`.
 *
 * ## Why the write is not here
 *
 * `/admin/listings` is the second door onto the same decision and it
 * authenticates completely differently. Keeping the write in
 * `lib/server/listing-decision` means the two cannot drift into disagreeing
 * about what approving a business does. This route keeps only what is actually
 * specific to it: the capability check, the membership count, and the response
 * shape the confirmation page expects.
 *
 * `expect` is left at its default here. The link in a decline email still works
 * after an approve, because reversing a decision is a real thing staff do and
 * that email is sometimes the only artefact they still have.
 */

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { email, access, action } = body;

  let totalProfiles = 0;
  try {
    const [countResult] = await db
      .select({ count: sql<string>`count(*)` })
      .from(profiles)
      .where(
        and(
          eq(profiles.active, true),
          // This count is the membership number in the welcome email. Now that
          // every signed-in member has an active profile, counting `active`
          // alone would report the whole user base rather than the listings.
          or(
            isNull(profiles.userId),
            inArray(
              profiles.userId,
              db
                .select({ id: users.id })
                .from(users)
                .where(inArray(users.accountType, DIRECTORY_ACCOUNT_TYPES))
            )
          )
        )
      );
    totalProfiles = Number(countResult?.count ?? 0);
  } catch {
    console.log('profile.count failed');
  }

  if (email) {
    const emailCheck = email.toString().toLowerCase();
    const existingProfile = await db.query.profiles.findFirst({
      where: eq(profiles.email, emailCheck),
    });

    if (!existingProfile) {
      return NextResponse.json({ success: false, error: 'Profile Not Found' });
    }

    const profileStatus = existingProfile.status as ListingStatus | null;

    if (profileStatus?.access !== access) {
      return NextResponse.json({ success: false, error: 'Invalid Access Key' });
    }

    if (action === 'approve' || action === 'decline') {
      const result = await decideListing({
        profileId: existingProfile.id,
        decision: action,
      });

      if (!result.ok) {
        return NextResponse.json({ success: false, error: 'Profile Not Found' });
      }

      return NextResponse.json(
        {
          success: true,
          data: [
            {
              message:
                result.mailFailed
                  ? action === 'approve'
                    ? 'Profile is active, but the notification email could not be sent'
                    : 'Profile is declined, but the notification email could not be sent'
                  : action === 'approve'
                    ? 'Profile has been set active'
                    : 'Profile has been declined',
              name: result.name,
              handle: null,
              total: totalProfiles,
            },
          ],
        },
        { status: 200 }
      );
    }
  }

  return NextResponse.json(
    { success: false, error: `No Profile Found` },
    { status: 200 }
  );
}
