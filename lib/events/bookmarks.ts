import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { eventBookmarks, events } from '@/lib/schema';
import { PUBLIC_EVENT_VENUE_COLUMNS } from '@/lib/event';

export async function getSavedEvents(profileId: string) {
  const rows = await db.query.eventBookmarks.findMany({
    where: eq(eventBookmarks.profileId, profileId),
    orderBy: [desc(eventBookmarks.createdAt), desc(eventBookmarks.id)],
    with: {
      event: {
        columns: {
          id: true,
          slug: true,
          title: true,
          description: true,
          coverImage: true,
          coverImageAlt: true,
          startsAt: true,
          endsAt: true,
          timezone: true,
          mode: true,
          attendeeCount: true,
          status: true,
        },
        with: { venue: { columns: PUBLIC_EVENT_VENUE_COLUMNS } },
      },
    },
  });
  return rows
    .filter(({ event }) => event.status === 'published')
    .map(({ event }) => event);
}

export async function saveEvent(profileId: string, slug: string) {
  const event = await db.query.events.findFirst({
    where: and(eq(events.slug, slug), eq(events.status, 'published')),
    columns: { id: true },
  });
  if (!event) return false;
  await db
    .insert(eventBookmarks)
    .values({ profileId, eventId: event.id })
    .onConflictDoNothing({
      target: [eventBookmarks.profileId, eventBookmarks.eventId],
    });
  return true;
}

export async function unsaveEvent(profileId: string, slug: string) {
  const event = await db.query.events.findFirst({
    where: eq(events.slug, slug),
    columns: { id: true },
  });
  if (!event) return false;
  await db
    .delete(eventBookmarks)
    .where(
      and(
        eq(eventBookmarks.profileId, profileId),
        eq(eventBookmarks.eventId, event.id)
      )
    );
  return true;
}
