/**
 * RSVP to an event — no Nostr key, and no account required.
 *
 *   POST   — RSVP. Logged-in users (auth email already verified) count
 *            immediately. Anonymous users submit {name,email,status}; the RSVP
 *            is held PENDING and a magic link is emailed. It only counts once
 *            the link is clicked — see ./confirm.
 *   DELETE — logged-in user withdraws their RSVP.
 *
 * Capacity (counted, verified 'going' RSVPs) is enforced transactionally at
 * min(event.attendeeCap, venue.fireCapacity), mirroring panamia.club.
 *
 * v2: optionally mirror RSVPs to Nostr as kind-31925 (relay-signed, or NIP-07
 * self-signed for enrolled users). Deliberately omitted in v1 — attendee PII is
 * never published to relays.
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import {
  events,
  eventAttendees,
  profiles,
  venues,
  verification,
} from '@/lib/schema';
import { and, eq, sql } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { sendTemplateEmail } from '@/lib/email';
import type { RsvpStatus } from '@/lib/schema';

interface RouteParams {
  params: Promise<{ slug: string }>;
}

const STATUSES: RsvpStatus[] = ['going', 'maybe', 'not_going'];
const STATUS_LABELS: Record<RsvpStatus, string> = {
  going: 'Going',
  maybe: 'Maybe',
  not_going: "Can't go",
};
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Hard cap = min(attendeeCap, venue.fireCapacity); either may be absent. Throws
// 'MAX_CAPACITY' when a new counted 'going' RSVP would exceed it.
async function assertCapacity(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  eventId: string
): Promise<void> {
  const current = await tx.query.events.findFirst({
    where: eq(events.id, eventId),
    columns: { attendeeCount: true, attendeeCap: true, venueId: true },
  });
  if (!current) return;
  const caps: number[] = [];
  if (current.attendeeCap !== null) caps.push(current.attendeeCap);
  if (current.venueId) {
    const venue = await tx.query.venues.findFirst({
      where: eq(venues.id, current.venueId),
      columns: { fireCapacity: true },
    });
    if (venue && venue.fireCapacity > 0) caps.push(venue.fireCapacity);
  }
  if (caps.length > 0 && current.attendeeCount >= Math.min(...caps)) {
    throw new Error('MAX_CAPACITY');
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { slug } = await params;
    const event = await db.query.events.findFirst({
      where: eq(events.slug, slug),
    });
    if (!event) {
      return NextResponse.json(
        { success: false, error: 'Event not found' },
        { status: 404 }
      );
    }
    if (event.status !== 'published') {
      return NextResponse.json(
        { success: false, error: 'Event is not available for RSVP' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const newStatus = body.status as RsvpStatus;
    if (!STATUSES.includes(newStatus)) {
      return NextResponse.json(
        { success: false, error: 'status must be going, maybe, or not_going' },
        { status: 400 }
      );
    }

    const session = await auth();
    const profile = session?.user?.id
      ? await db.query.profiles.findFirst({
          where: eq(profiles.userId, session.user.id),
        })
      : null;

    // -------------------------------------------------------------------
    // Logged-in path: email already verified by auth, so the RSVP counts now.
    // -------------------------------------------------------------------
    if (profile) {
      const existing = await db.query.eventAttendees.findFirst({
        where: and(
          eq(eventAttendees.eventId, event.id),
          eq(eventAttendees.profileId, profile.id)
        ),
      });
      const wasCountedGoing =
        !!existing?.emailVerifiedAt && existing.status === 'going';
      const willCount = newStatus === 'going';
      const now = new Date();

      try {
        await db.transaction(async (tx) => {
          if (willCount && !wasCountedGoing) {
            await assertCapacity(tx, event.id);
          }
          if (existing) {
            await tx
              .update(eventAttendees)
              .set({
                status: newStatus,
                name: profile.name,
                email: profile.email,
                emailVerifiedAt: existing.emailVerifiedAt ?? now,
                respondedAt: now,
              })
              .where(eq(eventAttendees.id, existing.id));
          } else {
            await tx.insert(eventAttendees).values({
              id: createId(),
              eventId: event.id,
              profileId: profile.id,
              email: profile.email,
              name: profile.name,
              status: newStatus,
              emailVerifiedAt: now,
              respondedAt: now,
            });
          }
          const delta = (willCount ? 1 : 0) - (wasCountedGoing ? 1 : 0);
          if (delta !== 0) {
            await tx
              .update(events)
              .set({ attendeeCount: sql`${events.attendeeCount} + ${delta}` })
              .where(eq(events.id, event.id));
          }
        });
      } catch (err) {
        if (err instanceof Error && err.message === 'MAX_CAPACITY') {
          return NextResponse.json(
            {
              success: false,
              error: 'This event is at capacity',
              code: 'MAX_CAPACITY',
            },
            { status: 409 }
          );
        }
        throw err;
      }

      return NextResponse.json({
        success: true,
        data: { status: newStatus, pending: false },
      });
    }

    // -------------------------------------------------------------------
    // Anonymous path: hold the RSVP pending and email a magic link.
    // -------------------------------------------------------------------
    const name = String(body.name || '').trim();
    const email = String(body.email || '')
      .trim()
      .toLowerCase();
    if (!name || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json(
        { success: false, error: 'A name and valid email are required' },
        { status: 400 }
      );
    }

    const existing = await db.query.eventAttendees.findFirst({
      where: and(
        eq(eventAttendees.eventId, event.id),
        eq(eventAttendees.email, email)
      ),
    });

    // Upsert as PENDING (emailVerifiedAt stays null until the link is clicked,
    // so it does not count yet). A re-RSVP before confirming just refreshes the
    // pending row + token.
    let attendeeId: string;
    if (existing) {
      attendeeId = existing.id;
      await db
        .update(eventAttendees)
        .set({
          name,
          status: newStatus,
          // Re-RSVP before confirming resets verification for the new choice.
          emailVerifiedAt: existing.emailVerifiedAt,
        })
        .where(eq(eventAttendees.id, existing.id));
    } else {
      attendeeId = createId();
      await db.insert(eventAttendees).values({
        id: attendeeId,
        eventId: event.id,
        profileId: null,
        email,
        name,
        status: newStatus,
        emailVerifiedAt: null,
      });
    }

    // Issue a fresh single-use token in verification_tokens.
    const token = randomToken();
    await db
      .delete(verification)
      .where(eq(verification.identifier, `event-rsvp:${attendeeId}`));
    await db.insert(verification).values({
      identifier: `event-rsvp:${attendeeId}`,
      value: token,
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    });

    const host = (process.env.NEXT_PUBLIC_HOST_URL ?? '').replace(/\/$/, '');
    const confirmUrl = `${host}/api/events/${event.slug}/rsvp/confirm?token=${token}`;
    await sendTemplateEmail(
      'event.rsvp_confirm',
      {
        name,
        eventTitle: event.title,
        statusLabel: STATUS_LABELS[newStatus],
        confirmUrl,
      },
      email
    );

    return NextResponse.json({
      success: true,
      data: { status: newStatus, pending: true },
      message: 'Check your email to confirm your RSVP.',
    });
  } catch (error) {
    console.error('Error RSVPing:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to RSVP' },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { slug } = await params;
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
        { success: false, error: 'Profile not found' },
        { status: 404 }
      );
    }
    const event = await db.query.events.findFirst({
      where: eq(events.slug, slug),
      columns: { id: true },
    });
    if (!event) {
      return NextResponse.json(
        { success: false, error: 'Event not found' },
        { status: 404 }
      );
    }
    const existing = await db.query.eventAttendees.findFirst({
      where: and(
        eq(eventAttendees.eventId, event.id),
        eq(eventAttendees.profileId, profile.id)
      ),
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'No RSVP found' },
        { status: 404 }
      );
    }

    await db.transaction(async (tx) => {
      const wasCountedGoing =
        !!existing.emailVerifiedAt && existing.status === 'going';
      await tx.delete(eventAttendees).where(eq(eventAttendees.id, existing.id));
      if (wasCountedGoing) {
        await tx
          .update(events)
          .set({ attendeeCount: sql`${events.attendeeCount} - 1` })
          .where(eq(events.id, event.id));
      }
    });

    return NextResponse.json({ success: true, message: 'RSVP withdrawn' });
  } catch (error) {
    console.error('Error withdrawing RSVP:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to withdraw RSVP' },
      { status: 500 }
    );
  }
}
