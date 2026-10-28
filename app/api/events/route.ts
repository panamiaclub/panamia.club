/**
 * Events collection API.
 *   GET  — public list of upcoming, published, public events.
 *   POST — create a draft event (auth + profile required). The host is either
 *          the caller's profile or a group they administer; venue is optional
 *          (online events have none).
 *
 * Postgres is authoritative. Crossposting to Nostr happens on publish, not on
 * create — see app/api/events/[slug]/publish/route.ts.
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { events, profiles, venues } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import {
  generateUniqueSlug,
  buildIcalUid,
  getUpcomingEvents,
  searchUpcomingEvents,
} from '@/lib/event';
import { listHostableGroups } from '@/lib/server/event-host';
import type { EventMode } from '@/lib/schema';

const MODES: EventMode[] = ['online', 'offline', 'hybrid'];

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, session.user.id),
    });
    if (!profile) {
      return NextResponse.json(
        { success: false, error: 'A profile is required to host events' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      title,
      description,
      coverImage,
      coverImageAlt,
      venueId,
      startsAt,
      endsAt,
      timezone,
      mode,
      attendeeCap,
      tags,
      visibility,
      hostGroupId,
    } = body;

    if (!title?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Title is required' },
        { status: 400 }
      );
    }
    if (!startsAt) {
      return NextResponse.json(
        { success: false, error: 'Start time is required' },
        { status: 400 }
      );
    }
    const resolvedMode: EventMode = MODES.includes(mode) ? mode : 'offline';

    // Validate venue when supplied. Offline/hybrid events should have one;
    // online events may omit it.
    let resolvedVenueId: string | null = null;
    if (venueId) {
      const venue = await db.query.venues.findFirst({
        where: eq(venues.id, venueId),
        columns: { id: true },
      });
      if (!venue) {
        return NextResponse.json(
          { success: false, error: 'Venue not found' },
          { status: 400 }
        );
      }
      resolvedVenueId = venue.id;
    }
    if (!resolvedVenueId && resolvedMode !== 'online') {
      return NextResponse.json(
        { success: false, error: 'A venue is required for in-person events' },
        { status: 400 }
      );
    }

    const slug = await generateUniqueSlug(title);

    // Hosting as a group. The client sends a group id; we never trust it --
    // listHostableGroups recomputes from the caller's own memberships, so a
    // forged id simply is not in the list.
    //
    // Exactly one host is set, matching the events_single_host CHECK. When a
    // group hosts, hostProfileId stays NULL on purpose: the event belongs to
    // the group, so it survives the organiser deleting their account.
    let resolvedHostGroupId: string | null = null;
    if (hostGroupId) {
      const hostable = await listHostableGroups(profile.id);
      if (!hostable.some((group) => group.id === hostGroupId)) {
        return NextResponse.json(
          {
            success: false,
            error: 'You can only host events as a group you administer',
          },
          { status: 403 }
        );
      }
      resolvedHostGroupId = hostGroupId;
    }

    const [newEvent] = await db
      .insert(events)
      .values({
        slug,
        title: title.trim(),
        description: description || null,
        coverImage: coverImage || null,
        coverImageAlt: coverImageAlt || null,
        hostProfileId: resolvedHostGroupId ? null : profile.id,
        hostGroupId: resolvedHostGroupId,
        venueId: resolvedVenueId,
        startsAt: new Date(startsAt),
        endsAt: endsAt ? new Date(endsAt) : null,
        timezone: timezone || 'America/New_York',
        mode: resolvedMode,
        visibility: visibility === 'unlisted' ? 'unlisted' : 'public',
        attendeeCap:
          typeof attendeeCap === 'number' && attendeeCap > 0
            ? attendeeCap
            : null,
        tags: Array.isArray(tags) ? tags : [],
        icalUid: buildIcalUid(),
        status: 'draft',
      })
      .returning();

    return NextResponse.json({
      success: true,
      data: {
        id: newEvent.id,
        slug: newEvent.slug,
        title: newEvent.title,
        status: newEvent.status,
      },
    });
  } catch (error) {
    console.error('Error creating event:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to create event';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = (request.nextUrl ?? new URL(request.url)).searchParams;
    const limit = Number(searchParams.get('limit') ?? '20');
    const offset = Number(searchParams.get('offset') ?? '0');
    const term = (searchParams.get('q') ?? '').trim();
    if (
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      term.length > 200
    ) {
      return NextResponse.json(
        { success: false, error: 'Invalid event search or pagination' },
        { status: 400 }
      );
    }

    const rows = term
      ? await searchUpcomingEvents({ term, limit: limit + 1, offset })
      : await getUpcomingEvents({ limit: limit + 1, offset });
    return NextResponse.json({
      success: true,
      data: { events: rows.slice(0, limit), hasMore: rows.length > limit },
    });
  } catch (error) {
    console.error('Error listing events:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to list events' },
      { status: 500 }
    );
  }
}
