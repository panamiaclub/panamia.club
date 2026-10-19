import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { events, eventAttendees, profiles } from '@/lib/schema';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { npubFromHex } from '@/lib/nostr/keys';
import type { RsvpStatus } from '@/lib/schema';
import { denyPublicRequest } from '@/lib/server/internal-auth';

// Events two-way sync, phase 2 (inbound). Receives a NIP-52 RSVP (kind 31925)
// forwarded from relay.panamia.club and applies it to the authoritative
// Postgres RSVP, so a member who changes their RSVP in a Nostr client sees it
// on panamia.club. Mirrors the abuse-report ingest at
// app/api/internal/relay/report — reached ONLY via Cloudflare Service Binding
// from panamia-nosflare's forwardRsvpToPana() (env.PANAMIA.fetch), which
// bypasses the public network, so no HTTP-level auth is enforced here.
//
// Contract (see docs/EVENTS-ROADMAP.md):
//   - Fire-and-forget from the relay; a 2xx/4xx only affects the relay's log.
//   - The relay already gated to RSVPs targeting our own kind-31923 listings.
//   - Identity: the signer pubkey maps to a profile via profiles.nostr_pubkey
//     when the member enrolled their key; otherwise the attendee is keyed by
//     nostr_pubkey alone (no email). The event signature IS the verification,
//     so the RSVP counts without an email magic link.
//   - Latest-wins: nostr_rsvp_at guards against applying a stale (out-of-order)
//     RSVP. attendee_count is recomputed from rows, never drifts.
//
// =============================================================================

interface RsvpRequest {
  event_id: string;
  rsvp_pubkey: string;
  created_at: number;
  event_dtag: string;
  status: string | null;
  content: string;
}

const isHex64 = (s: string): boolean => /^[0-9a-f]{64}$/.test(s);

// NIP-52 RSVP `status` → our rsvp_status. "waitlist" has no local equivalent;
// treat it as interest ("maybe"). Unknown/declined map sensibly.
function mapStatus(status: string | null): RsvpStatus | null {
  switch (status) {
    case 'accepted':
      return 'going';
    case 'tentative':
    case 'waitlist':
      return 'maybe';
    case 'declined':
      return 'not_going';
    default:
      return null;
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Refuse anything arriving from the public edge — see
  // lib/server/internal-auth.ts. The relay's Service Binding is unaffected.
  const denied = denyPublicRequest(request);
  if (denied) return denied;

  let body: Partial<RsvpRequest>;
  try {
    body = (await request.json()) as Partial<RsvpRequest>;
  } catch {
    return NextResponse.json(
      { stored: false, reason: 'invalid: malformed json' },
      { status: 400 }
    );
  }

  const { event_id, rsvp_pubkey, created_at, event_dtag, status } = body;

  if (!event_id || !isHex64(event_id)) {
    return NextResponse.json(
      { stored: false, reason: 'invalid: event_id' },
      { status: 400 }
    );
  }
  if (!rsvp_pubkey || !isHex64(rsvp_pubkey)) {
    return NextResponse.json(
      { stored: false, reason: 'invalid: rsvp_pubkey' },
      { status: 400 }
    );
  }
  if (typeof created_at !== 'number' || !Number.isFinite(created_at)) {
    return NextResponse.json(
      { stored: false, reason: 'invalid: created_at' },
      { status: 400 }
    );
  }
  if (!event_dtag || typeof event_dtag !== 'string') {
    return NextResponse.json(
      { stored: false, reason: 'invalid: event_dtag' },
      { status: 400 }
    );
  }

  const newStatus = mapStatus(status ?? null);
  if (!newStatus) {
    return NextResponse.json(
      { stored: false, reason: 'unsupported status' },
      { status: 200 }
    );
  }

  // Resolve the target event by its slug (the kind-31923 `d` tag). Only
  // published events accept RSVPs.
  const event = await db.query.events.findFirst({
    where: eq(events.slug, event_dtag),
    columns: { id: true, status: true },
  });
  if (!event || event.status !== 'published') {
    return NextResponse.json(
      { stored: false, reason: 'event not found' },
      { status: 200 }
    );
  }

  // Map the signer to an enrolled member profile, if any.
  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.nostrPubkey, rsvp_pubkey),
    columns: { id: true, name: true, email: true },
  });

  const rsvpAt = new Date(created_at * 1000);

  try {
    const result = await db.transaction(async (tx) => {
      // Find the existing attendee row: by profile when the signer is a member
      // (so this updates their web RSVP in place — the genuine two-way case),
      // else by the signer pubkey.
      const existing = profile
        ? await tx.query.eventAttendees.findFirst({
            where: and(
              eq(eventAttendees.eventId, event.id),
              eq(eventAttendees.profileId, profile.id)
            ),
          })
        : await tx.query.eventAttendees.findFirst({
            where: and(
              eq(eventAttendees.eventId, event.id),
              eq(eventAttendees.nostrPubkey, rsvp_pubkey)
            ),
          });

      // Latest-wins: ignore an RSVP older than the one we already applied.
      if (
        existing?.nostrRsvpAt &&
        existing.nostrRsvpAt.getTime() >= rsvpAt.getTime()
      ) {
        return { stored: false, reason: 'stale' };
      }

      if (existing) {
        await tx
          .update(eventAttendees)
          .set({
            status: newStatus,
            nostrPubkey: rsvp_pubkey,
            nostrRsvpAt: rsvpAt,
            nostrEventId: event_id,
            // The signature verifies the attendee; count it like a confirmed
            // RSVP. Preserve an earlier confirmation timestamp if present.
            emailVerifiedAt: existing.emailVerifiedAt ?? rsvpAt,
            respondedAt: rsvpAt,
            // Keep the member's real name; fall back to their npub otherwise.
            name: profile?.name ?? existing.name,
          })
          .where(eq(eventAttendees.id, existing.id));
      } else {
        await tx.insert(eventAttendees).values({
          id: createId(),
          eventId: event.id,
          profileId: profile?.id ?? null,
          email: profile?.email ?? null,
          name: profile?.name ?? npubFromHex(rsvp_pubkey),
          status: newStatus,
          nostrPubkey: rsvp_pubkey,
          nostrRsvpAt: rsvpAt,
          nostrEventId: event_id,
          emailVerifiedAt: rsvpAt,
          respondedAt: rsvpAt,
        });
      }

      // Recompute attendee_count from rows (confirmed + going) — robust against
      // drift and out-of-order delivery, unlike delta arithmetic.
      const [{ count }] = await tx
        .select({ count: sql<string>`count(*)` })
        .from(eventAttendees)
        .where(
          and(
            eq(eventAttendees.eventId, event.id),
            eq(eventAttendees.status, 'going'),
            isNotNull(eventAttendees.emailVerifiedAt)
          )
        );
      await tx
        .update(events)
        .set({ attendeeCount: Number(count) })
        .where(eq(events.id, event.id));

      return { stored: true, status: newStatus };
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('Error ingesting Nostr RSVP:', error);
    return NextResponse.json(
      { stored: false, reason: 'server error' },
      { status: 500 }
    );
  }
}
