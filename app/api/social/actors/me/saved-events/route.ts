import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getActiveProfileId } from '@/lib/server/active-profile';
import { getSavedEvents } from '@/lib/events/bookmarks';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    const profileId = await getActiveProfileId(session.user.id);
    const events = profileId ? await getSavedEvents(profileId) : [];
    return NextResponse.json(
      { success: true, data: { events } },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    console.error('Error loading saved events:', error);
    return NextResponse.json(
      { success: false, error: 'Could not load saved events' },
      { status: 500 }
    );
  }
}
