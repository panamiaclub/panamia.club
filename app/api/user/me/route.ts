/**
 * Current User API
 *
 * Returns the current authenticated user's information
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { administersOtherProfile } from '@/lib/server/profile-owners';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const [currentUser, hasManagedListings] = await Promise.all([
      db.query.users.findFirst({
        where: eq(users.id, session.user.id),
        columns: {
          id: true,
          screenname: true,
          accountType: true,
          notificationPreferences: true,
          createdAt: true,
        },
        with: {
          profile: {
            columns: {
              name: true,
            },
          },
        },
      }),
      administersOtherProfile(session.user.id),
    ]);

    if (!currentUser) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        _id: currentUser.id,
        screenname: currentUser.screenname,
        name: currentUser.profile?.name,
        accountType: currentUser.accountType,
        notificationPreferences: currentUser.notificationPreferences,
        hasManagedListings,
        // Lets the client tell a first-run account from one that has existed
        // for years without ever claiming a handle. The two want different
        // treatment: a welcome page for the former, a quiet nudge for the
        // latter. See components/ScreennameGate.tsx.
        createdAt: currentUser.createdAt,
      },
    });
  } catch (error) {
    console.error('Error fetching current user:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch user' },
      { status: 500 }
    );
  }
}
