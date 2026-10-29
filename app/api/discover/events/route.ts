import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getActiveProfileId } from '@/lib/server/active-profile';
import { getDiscoveryFeed } from '@/lib/events/discovery';

export async function GET() {
  try {
    const session = await auth();
    const profileId = session?.user?.id
      ? await getActiveProfileId(session.user.id)
      : null;
    const feed = await getDiscoveryFeed(profileId);
    return NextResponse.json(
      { success: true, data: { ...feed, signedIn: profileId !== null } },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    console.error('Error loading event discovery:', error);
    return NextResponse.json(
      { success: false, error: 'Could not load event recommendations' },
      { status: 500 }
    );
  }
}
