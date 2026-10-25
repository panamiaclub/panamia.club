import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { profiles } from '@/lib/schema';
import { checkAdminAuth } from '@/lib/server/admin-auth';
import { parseConnector } from '@/lib/connectors/membership';
import {
  assignableEventExists,
  countCommitments,
  createCommitment,
  removeCommitmentAsStaff,
  MAX_COMMITMENTS,
  WHAT_MAX,
  WHEN_MAX,
} from '@/lib/connectors/commitments';
import { eventColumns, parseEventValue } from '@/lib/connectors/event-link';
import type { EventKind } from '@/lib/connectors/event-link';
import { HOUSES } from '@/lib/connectors/model';
import type { HouseId } from '@/lib/connectors/model';
import { MAX_MINUTES } from '@/lib/connectors/hours';

/**
 * Put a task on somebody's board, or take one off.
 *
 * This is the second writer that drizzle/0056 existed to make safe. While
 * commitments lived in the membership blob, an admin adding a task and the
 * connector ticking something off at the same moment would have one of those
 * writes silently overwrite the other — no error, nothing logged, just a
 * change that did not happen. They are rows now, so they cannot.
 *
 * ## What staff can and cannot do
 *
 * Staff can create a task and delete any task. Staff cannot set progress:
 * that stays with the connector, because the only person who knows whether
 * the zines were dropped off is the person who did or did not drop them off,
 * and a programme where organisers mark their own asks complete is measuring
 * nothing.
 *
 * Deletion is the mirror image. A connector may delete what they wrote but
 * not what was assigned — otherwise an assignment is just a suggestion and
 * "done" cannot be told apart from "gone". Staff may delete either, because
 * an assignment made in error has to be retractable by whoever made it.
 */

const HOUSE_IDS = new Set<string>(HOUSES.map((h) => h.id));

export async function POST(request: NextRequest) {
  try {
    const admin = await checkAdminAuth();
    if (!admin) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Could not read that request.' },
        { status: 400 }
      );
    }

    const payload = (body ?? {}) as Record<string, unknown>;

    const profileId =
      typeof payload.profileId === 'string' ? payload.profileId : '';
    if (!profileId) {
      return NextResponse.json(
        { success: false, error: 'Who is this for?' },
        { status: 400 }
      );
    }

    const what =
      typeof payload.what === 'string'
        ? payload.what.trim().slice(0, WHAT_MAX)
        : '';
    if (!what) {
      return NextResponse.json(
        { success: false, error: 'Say what the task is.' },
        { status: 400 }
      );
    }

    const house = payload.house;
    if (typeof house !== 'string' || !HOUSE_IDS.has(house)) {
      return NextResponse.json(
        { success: false, error: 'Pick which house this is for.' },
        { status: 400 }
      );
    }

    const when =
      typeof payload.when === 'string' && payload.when.trim()
        ? payload.when.trim().slice(0, WHEN_MAX)
        : null;

    /* Re-validated rather than trusted. The form sends minutes it has already
     * parsed, but the form is not the only possible caller and the CHECK in
     * drizzle/0059 would otherwise reject bad input as a 500 instead of as the
     * 400 it is. Absent and null both mean "not estimated", which is a
     * legitimate answer and not a failure. */
    let estimatedMinutes: number | null = null;
    if (
      payload.estimatedMinutes !== null &&
      payload.estimatedMinutes !== undefined
    ) {
      const raw = payload.estimatedMinutes;
      if (
        typeof raw !== 'number' ||
        !Number.isInteger(raw) ||
        raw <= 0 ||
        raw > MAX_MINUTES
      ) {
        return NextResponse.json(
          {
            success: false,
            error: `How long has to be a whole number of minutes up to ${MAX_MINUTES}.`,
          },
          { status: 400 }
        );
      }
      estimatedMinutes = raw;
    }

    /* Parsed before the membership lookup so a malformed value costs nothing,
     * but existence is checked after it — see below. Absent, null and the
     * empty string all mean "no event", which is the common case and not an
     * error; only a non-empty value that does not decode is rejected. */
    const rawEvent = payload.event;
    let eventChoice: { kind: EventKind; id: string } | null = null;
    if (typeof rawEvent === 'string' && rawEvent !== '') {
      eventChoice = parseEventValue(rawEvent);
      if (!eventChoice) {
        return NextResponse.json(
          { success: false, error: 'That event is not one we recognise.' },
          { status: 400 }
        );
      }
    } else if (rawEvent !== null && rawEvent !== undefined && rawEvent !== '') {
      return NextResponse.json(
        { success: false, error: 'That event is not one we recognise.' },
        { status: 400 }
      );
    }

    /* The target has to be an accepted member. Assigning work to a pending
     * applicant would put a task on a board they cannot open, and the queue
     * would then show an application with work already logged against it —
     * which reads as though somebody had decided on them. */
    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.id, profileId),
      columns: { id: true, connector: true },
    });
    const membership = profile ? parseConnector(profile.connector) : null;
    if (!membership || membership.status !== 'active') {
      return NextResponse.json(
        { success: false, error: 'That person is not an active connector.' },
        { status: 404 }
      );
    }

    if ((await countCommitments(profileId)) >= MAX_COMMITMENTS) {
      return NextResponse.json(
        {
          success: false,
          error:
            'That board has reached its storage limit. Remove an old commitment before assigning more.',
        },
        { status: 409 }
      );
    }

    /* Checked here so a dropdown rendered before somebody cancelled the event
     * fails with a sentence instead of a foreign key violation. The FK is
     * still what guarantees the reference; this only decides the message. */
    if (
      eventChoice &&
      !(await assignableEventExists(eventChoice.kind, eventChoice.id))
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'That event is no longer open for assignments.',
        },
        { status: 409 }
      );
    }

    const commitment = await createCommitment({
      profileId,
      what,
      when,
      house: house as HouseId,
      assignedBy: admin.id,
      estimatedMinutes,
      ...eventColumns(eventChoice),
    });

    return NextResponse.json({ success: true, data: commitment });
  } catch (error) {
    console.error('Error assigning connector task:', error);
    return NextResponse.json(
      { success: false, error: 'Could not save that. Try again.' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const admin = await checkAdminAuth();
    if (!admin) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    const id = new URL(request.url).searchParams.get('id') ?? '';
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Which task?' },
        { status: 400 }
      );
    }

    const removed = await removeCommitmentAsStaff(id);
    if (!removed) {
      return NextResponse.json(
        { success: false, error: 'Could not find that task.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing connector task:', error);
    return NextResponse.json(
      { success: false, error: 'Could not remove that. Try again.' },
      { status: 500 }
    );
  }
}
