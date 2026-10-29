/**
 * Event helpers: slug generation, publish check, queries, iCalendar export.
 *
 * Mirrors the shape of lib/article.ts. Postgres is authoritative; the Nostr
 * (kind-31923) mirror is handled separately in lib/relay/crosspost-client.ts.
 */

import { db } from '@/lib/db';
import { events, eventAttendees } from '@/lib/schema';
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  lte,
  sql,
} from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { getFederationDomain } from '@/lib/federation/domain';
import { searchTsQuery } from '@/lib/server/search-kinds';
import type { Event, EventStatus } from '@/lib/schema';

export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 100);
}

export async function generateUniqueSlug(title: string): Promise<string> {
  const baseSlug = generateSlug(title);
  if (!baseSlug) return `event-${Date.now()}`;

  let slug = baseSlug;
  let counter = 1;
  while (await db.query.events.findFirst({ where: eq(events.slug, slug) })) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }
  return slug;
}

/**
 * Stable RFC 5545 UID for an event's VEVENT, so calendar apps update rather than
 * duplicate on re-import. Generated once at create time and stored on the row.
 */
export function buildIcalUid(): string {
  return `${createId()}@${getFederationDomain()}`;
}

export function isPublishable(eventDoc: {
  title?: string | null;
  startsAt?: Date | null;
  status?: EventStatus;
}): { publishable: boolean; reason?: string } {
  if (!eventDoc.title?.trim()) {
    return { publishable: false, reason: 'Event must have a title' };
  }
  if (!eventDoc.startsAt) {
    return { publishable: false, reason: 'Event must have a start time' };
  }
  if (eventDoc.status === 'published') {
    return { publishable: false, reason: 'Event is already published' };
  }
  if (eventDoc.status === 'cancelled') {
    return { publishable: false, reason: 'Event is cancelled' };
  }
  return { publishable: true };
}

export async function getEventBySlug(slug: string) {
  return await db.query.events.findFirst({
    where: eq(events.slug, slug),
    with: { venue: true, host: true },
  });
}

export const PUBLIC_EVENT_VENUE_COLUMNS = {
  name: true,
  city: true,
  state: true,
  slug: true,
  lat: true,
  lng: true,
} as const;

export async function getUpcomingEvents(
  options: { limit?: number; offset?: number } = {}
) {
  const { limit = 20, offset = 0 } = options;
  const now = new Date();
  return await db.query.events.findMany({
    where: and(
      eq(events.status, 'published' as EventStatus),
      eq(events.visibility, 'public'),
      gte(events.startsAt, now)
    ),
    orderBy: [asc(events.startsAt), asc(events.id)],
    offset,
    limit,
    with: {
      venue: { columns: PUBLIC_EVENT_VENUE_COLUMNS },
    },
  });
}

/**
 * Upcoming events matching a typed term.
 *
 * Deliberately returns the same rows as `getUpcomingEvents` — same filters,
 * same `with`, same order — so /e can render one `EventCard` grid whether it
 * is browsing or searching. The alternative was reusing `searchEvents` in
 * lib/server/search-kinds.ts, but that flattens an event into a
 * `ScopeSearchResult` and drops the cover art, attendance and venue object the
 * card is built around; the calendar would have visibly degraded the moment
 * someone typed into it.
 *
 * The term is matched against the same `search_vector` and the same
 * three-configuration tsquery that scope search uses, so a term that found an
 * event in the typeahead finds it here too.
 *
 * An empty term is the caller's business, not this function's: /e treats it as
 * "browse", which is `getUpcomingEvents`. Asked for nothing, this returns
 * nothing rather than quietly becoming an unfiltered listing.
 */
export async function searchUpcomingEvents(options: {
  term: string;
  limit?: number;
  offset?: number;
}) {
  const { term, limit = 24, offset = 0 } = options;
  const trimmed = term.trim();
  if (!trimmed) return [];

  const now = new Date();
  return await db.query.events.findMany({
    where: and(
      eq(events.status, 'published' as EventStatus),
      eq(events.visibility, 'public'),
      gte(events.startsAt, now),
      sql`"events"."search_vector" @@ ${searchTsQuery(trimmed)}`
    ),
    orderBy: [asc(events.startsAt), asc(events.id)],
    offset,
    limit,
    with: {
      venue: { columns: PUBLIC_EVENT_VENUE_COLUMNS },
    },
  });
}

/**
 * A group's events, for the group page.
 *
 * `includeUnpublished` is the manager's view: admins and moderators need to
 * see the draft they are still writing, and an unlisted event they have to be
 * able to find in order to manage. Everyone else gets the published, public
 * ones, which is what "the group's calendar" means to a reader.
 *
 * Access to the group itself is decided by the caller. This function answers
 * "which of this group's events", not "may you see this group" -- collapsing
 * the two is how a private group's calendar would leak through a listing that
 * forgot to ask.
 */
export async function getEventsForGroup(
  hostGroupId: string,
  options: { includeUnpublished?: boolean; limit?: number } = {}
) {
  const { includeUnpublished = false, limit = 20 } = options;

  const filters = [eq(events.hostGroupId, hostGroupId)];
  if (!includeUnpublished) {
    filters.push(eq(events.status, 'published' as EventStatus));
    filters.push(eq(events.visibility, 'public'));
  }

  return await db.query.events.findMany({
    where: and(...filters),
    orderBy: [asc(events.startsAt)],
    limit,
    with: {
      venue: { columns: { name: true, city: true, state: true } },
    },
  });
}

export async function getEventsByHost(hostProfileId: string) {
  return await db.query.events.findMany({
    where: eq(events.hostProfileId, hostProfileId),
    orderBy: [desc(events.startsAt)],
    with: {
      venue: { columns: { name: true, city: true, state: true } },
    },
  });
}

/**
 * Published, public events a profile is hosting between now and a horizon.
 *
 * Distinct from getEventsByHost, which is the owner's own management view and
 * deliberately returns drafts and past events. This one is what the public
 * profile page shows, so it filters to what a stranger is allowed to see and
 * drops anything already over.
 *
 * The horizon exists because "upcoming" with no bound is a promise the page
 * cannot keep: a venue with a date eleven months out would push the next two
 * weekends off the screen. Three months is roughly how far ahead people plan
 * going somewhere.
 *
 * Venue coordinates come back with the row so the caller can offer distance
 * without a second round trip.
 */
export async function getUpcomingEventsForHost(
  hostProfileId: string,
  options: { withinMonths?: number; limit?: number } = {}
) {
  const { withinMonths = 3, limit = 12 } = options;

  const now = new Date();
  const horizon = new Date(now);
  horizon.setMonth(horizon.getMonth() + withinMonths);

  return await db.query.events.findMany({
    where: and(
      eq(events.hostProfileId, hostProfileId),
      eq(events.status, 'published' as EventStatus),
      eq(events.visibility, 'public'),
      gte(events.startsAt, now),
      lte(events.startsAt, horizon)
    ),
    orderBy: [asc(events.startsAt)],
    limit,
    with: {
      venue: {
        columns: {
          name: true,
          city: true,
          state: true,
          slug: true,
          lat: true,
          lng: true,
        },
      },
    },
  });
}

/**
 * The events half of a personal profile: what this pana is hosting, and — when
 * they are the one looking — what they have RSVP'd to.
 *
 * Hosting and attending are deliberately NOT treated as one public list.
 * Hosting is already public: the event page names its host, so surfacing it on
 * the host's profile reveals nothing new. Attending is not. `event_attendees`
 * has no per-row visibility column, so there is no way for a pana to have
 * consented to publishing a given RSVP — and a profile that listed every event
 * someone is going to would be a location history assembled from rows they
 * only ever agreed to share with the organizer.
 *
 * So attendance comes back only for the owner's own view, and the profile
 * renders it as "your RSVPs". Making it public is a product decision that
 * needs a visibility column and a setting, not a query change.
 *
 * Past events are returned alongside upcoming ones because a profile showing
 * only what is scheduled reads the same whether someone turns up constantly or
 * RSVP'd once — the recent past is what distinguishes a habit from a plan.
 */
export async function getProfileEventsFeed(
  profileId: string,
  options: { includeAttending?: boolean; limit?: number } = {}
) {
  const { includeAttending = false, limit = 12 } = options;

  const now = new Date();
  const pastHorizon = new Date(now);
  pastHorizon.setMonth(pastHorizon.getMonth() - 3);

  const withVenue = {
    venue: { columns: { name: true, city: true, state: true } },
  } as const;

  const hosted = await db.query.events.findMany({
    where: and(
      eq(events.hostProfileId, profileId),
      eq(events.status, 'published' as EventStatus),
      eq(events.visibility, 'public'),
      gte(events.startsAt, pastHorizon)
    ),
    orderBy: [asc(events.startsAt)],
    limit,
    with: withVenue,
  });

  if (!includeAttending) {
    return hosted.map((event) => ({ ...event, role: 'hosting' as const }));
  }

  /* Only verified, going RSVPs. An unverified row is someone who started the
     magic-link flow and never finished, which is not a commitment to show. */
  const rsvps = await db
    .select({ eventId: eventAttendees.eventId })
    .from(eventAttendees)
    .where(
      and(
        eq(eventAttendees.profileId, profileId),
        eq(eventAttendees.status, 'going'),
        isNotNull(eventAttendees.emailVerifiedAt)
      )
    );

  const attendingIds = rsvps
    .map((row) => row.eventId)
    /* An event you host and also RSVP'd to is one row, flagged hosting: it is
       the stronger claim, and listing it twice would double-count it. */
    .filter((id) => !hosted.some((event) => event.id === id));

  const attending = attendingIds.length
    ? await db.query.events.findMany({
        where: and(
          inArray(events.id, attendingIds),
          eq(events.status, 'published' as EventStatus),
          gte(events.startsAt, pastHorizon)
        ),
        orderBy: [asc(events.startsAt)],
        limit,
        with: withVenue,
      })
    : [];

  return [
    ...hosted.map((event) => ({ ...event, role: 'hosting' as const })),
    ...attending.map((event) => ({ ...event, role: 'going' as const })),
  ].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

// -----------------------------------------------------------------------------
// iCalendar (RFC 5545) export for the /api/events/[slug]/calendar.ics route.
// -----------------------------------------------------------------------------
function icsEscape(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function icsDate(date: Date): string {
  // UTC, basic format: YYYYMMDDTHHMMSSZ
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

interface IcsVenue {
  name?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
}

export function eventToICS(
  event: Pick<
    Event,
    | 'title'
    | 'description'
    | 'startsAt'
    | 'endsAt'
    | 'icalUid'
    | 'slug'
    | 'createdAt'
    | 'updatedAt'
  >,
  venue?: IcsVenue | null
): string {
  const host = (process.env.NEXT_PUBLIC_HOST_URL ?? '').replace(/\/$/, '');
  const url = host ? `${host}/e/${event.slug}` : undefined;

  const location = venue
    ? [venue.name, venue.address, venue.city, venue.state]
        .filter(Boolean)
        .join(', ')
    : undefined;

  // Default duration of 2h when no end time was given, matching the UI hint.
  const end =
    event.endsAt ?? new Date(event.startsAt.getTime() + 2 * 60 * 60 * 1000);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Pana MIA//Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.icalUid}`,
    `DTSTAMP:${icsDate(event.updatedAt ?? event.createdAt ?? new Date())}`,
    `DTSTART:${icsDate(event.startsAt)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsEscape(event.title)}`,
    ...(event.description
      ? [`DESCRIPTION:${icsEscape(event.description)}`]
      : []),
    ...(location ? [`LOCATION:${icsEscape(location)}`] : []),
    ...(url ? [`URL:${icsEscape(url)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  // RFC 5545 line endings are CRLF.
  return lines.join('\r\n') + '\r\n';
}
