/**
 * Publish an event and mirror it to Nostr as a NIP-52 (kind-31923) time-based
 * calendar event via the panamia-nosflare relay worker. The relay holds the
 * signing key and the list of target relays — see
 * external/nosflare/src/event-crosspost.ts. Mirrors the article publish route.
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { events, profiles } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { isPublishable } from '@/lib/event';
import { crosspostEvent } from '@/lib/relay/crosspost-client';
import { canManageEvent } from '@/lib/server/event-host';
import { notifyGroupEventPublished } from '@/lib/federation/wrappers/group-notify';
import type { EventStatus } from '@/lib/schema';

interface RouteParams {
  params: Promise<{ slug: string }>;
}

// Mirror of the article publish route's coverImage normalizer: unwrap the Vite
// image-optimizer proxy and absolutize site-relative paths so external Nostr
// clients can load the banner.
function normalizeImageUrl(
  raw: string | null | undefined,
  host: string
): string | undefined {
  if (!raw) return undefined;
  let u = raw;
  if (u.includes('/_vinext/image')) {
    const m = u.match(/[?&]url=([^&]+)/);
    if (m) u = decodeURIComponent(m[1]);
  }
  if (u.startsWith('/') && host) u = host.replace(/\/$/, '') + u;
  return u;
}

// This instance's authoritative home relay; must match the relay worker's
// NOSTR_HOME_RELAY. nostr_event_id is recorded only when THIS relay accepted
// the event — mirror relays in the crosspost list don't count.
const NOSTR_HOME_RELAY =
  process.env.NOSTR_HOME_RELAY ?? 'wss://relay.pana.social';

function isHomeRelay(url: string): boolean {
  try {
    return new URL(url).host === new URL(NOSTR_HOME_RELAY).host;
  } catch {
    return false;
  }
}

export async function POST(_request: NextRequest, { params }: RouteParams) {
  try {
    const { slug } = await params;
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const event = await db.query.events.findFirst({
      where: eq(events.slug, slug),
      with: {
        venue: true,
        hostGroup: {
          columns: { id: true },
          with: { actor: { columns: { username: true, name: true } } },
        },
      },
    });
    if (!event) {
      return NextResponse.json(
        { success: false, error: 'Event not found' },
        { status: 404 }
      );
    }

    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, session.user.id),
      columns: { id: true, name: true },
    });
    if (!profile || !(await canManageEvent(event, profile.id))) {
      return NextResponse.json(
        { success: false, error: 'Only the host can publish this event' },
        { status: 403 }
      );
    }

    const publishCheck = isPublishable({
      title: event.title,
      startsAt: event.startsAt,
      status: event.status as EventStatus,
    });
    if (!publishCheck.publishable) {
      return NextResponse.json(
        { success: false, error: publishCheck.reason },
        { status: 400 }
      );
    }

    const host = process.env.NEXT_PUBLIC_HOST_URL ?? '';
    const canonicalUrl = host
      ? `${host.replace(/\/$/, '')}/e/${event.slug}`
      : undefined;

    // Geohash isn't a first-class column yet; derive from the venue if present
    // (venues carry lat/lng but not a geohash today — left undefined for v1).
    const venue = event.venue;

    // Unlisted events are Postgres-only: NIP-52 calendar events (kind 31923) are
    // public, world-readable by spec, so there is no way to publish an unlisted
    // one to a relay. We therefore never crosspost an unlisted event — it lives
    // only on pana.social. See docs/EVENTS-ROADMAP.md → Unlisted events.
    const isUnlisted = event.visibility === 'unlisted';

    let nostrEventId: string | null = null;
    let crosspost: Awaited<ReturnType<typeof crosspostEvent>> | null = null;
    let crosspostError: string | null = null;
    if (!isUnlisted) {
      try {
        crosspost = await crosspostEvent({
          slug: event.slug,
          title: event.title,
          description: event.description || undefined,
          startsAt: Math.floor(event.startsAt.getTime() / 1000),
          endsAt: event.endsAt
            ? Math.floor(event.endsAt.getTime() / 1000)
            : undefined,
          timezone: event.timezone || undefined,
          mode: event.mode,
          venueName: venue?.name || undefined,
          city: venue?.city || undefined,
          capacity: event.attendeeCap || undefined,
          image: normalizeImageUrl(event.coverImage, host),
          imageAlt: event.coverImageAlt || undefined,
          tags: event.tags || [],
          // The host, not whoever pressed publish. Before groups could host
          // these were always the same person; for a group event the admin
          // publishing it is not the host, and putting their name on the
          // Nostr event would credit the wrong party off-platform.
          hostName: event.hostGroup
            ? (event.hostGroup.actor?.name ??
              event.hostGroup.actor?.username ??
              undefined)
            : profile.name || undefined,
          canonicalUrl,
        });
      } catch (err) {
        // Crosspost failure must not block local publish; surface as a warning.
        crosspostError =
          err instanceof Error ? err.message : 'crosspost request failed';
        console.error('Event crosspost failed:', err);
      }
    }

    const homeAccepted =
      !!crosspost && crosspost.results.some((r) => r.ok && isHomeRelay(r.url));
    nostrEventId = homeAccepted ? crosspost!.eventId : null;

    const delivered = !!crosspost && crosspost.results.some((r) => r.ok);
    const crosspostStatus: 'delivered' | 'no-targets' | 'failed' | 'unlisted' =
      isUnlisted
        ? 'unlisted'
        : delivered
          ? 'delivered'
          : crosspost && crosspost.results.length === 0
            ? 'no-targets'
            : 'failed';
    const crosspostDetail = isUnlisted
      ? 'Unlisted event — kept on pana.social only, not published to Nostr.'
      : (crosspostError ??
        crosspost?.results.find((r) => !r.ok)?.error ??
        crosspost?.note ??
        null);

    const [updated] = await db
      .update(events)
      .set({ status: 'published', nostrEventId })
      .where(eq(events.id, event.id))
      .returning();

    /**
     * A group's event going live is news for its members.
     *
     * Gated on the event not already being published, because this route is
     * reachable again on an event that is live -- republishing is how a host
     * re-mirrors to Nostr after a relay failure, and that must not ring every
     * member a second time for an event they were already told about.
     *
     * Announced here rather than at creation: events are born as drafts, and
     * the group's event list shows drafts only to its managers. Notifying on
     * create would send most of the group to something they cannot open.
     *
     * Awaited, and internally failure-swallowing. The event is published and
     * mirrored by this point; a notification problem must not be reported as
     * a publish problem.
     */
    if (event.hostGroup?.id && event.status !== 'published') {
      await notifyGroupEventPublished({
        groupId: event.hostGroup.id,
        publisherUserId: session.user.id,
        eventId: event.id,
        eventSlug: updated.slug,
        eventTitle: updated.title,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        slug: updated.slug,
        status: updated.status,
        nostrEventId: updated.nostrEventId,
        crosspost: {
          status: crosspostStatus,
          detail: crosspostDetail,
          acceptedRelays: (crosspost?.results ?? [])
            .filter((r) => r.ok)
            .map((r) => r.url),
        },
      },
    });
  } catch (error) {
    console.error('Error publishing event:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to publish event' },
      { status: 500 }
    );
  }
}
