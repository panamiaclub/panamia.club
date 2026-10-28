import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getActiveProfileId } from '@/lib/server/active-profile';
import { saveEvent, unsaveEvent } from '@/lib/events/bookmarks';

type Context = { params: Promise<{ slug: string }> };

async function updateSavedEvent(context: Context, saved: boolean) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    const profileId = await getActiveProfileId(session.user.id);
    if (!profileId) {
      return NextResponse.json(
        { success: false, error: 'Set up your profile to save events' },
        { status: 403 }
      );
    }
    const { slug } = await context.params;
    const found = saved
      ? await saveEvent(profileId, slug)
      : await unsaveEvent(profileId, slug);
    if (!found) {
      return NextResponse.json(
        { success: false, error: 'Event not found' },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, data: { saved } });
  } catch (error) {
    console.error('Error saving event:', error);
    return NextResponse.json(
      { success: false, error: 'Could not update saved event' },
      { status: 500 }
    );
  }
}

export async function POST(_request: Request, context: Context) {
  return updateSavedEvent(context, true);
}

export async function DELETE(_request: Request, context: Context) {
  return updateSavedEvent(context, false);
}
