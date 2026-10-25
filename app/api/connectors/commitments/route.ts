import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';

import { auth } from '@/auth';
import { db } from '@/lib/db';
import { profiles } from '@/lib/schema';
import { HOUSES } from '@/lib/connectors/model';
import type { HouseId } from '@/lib/connectors/model';
import { parseConnector } from '@/lib/connectors/membership';
import { MAX_MINUTES } from '@/lib/connectors/hours';
import {
  countCommitments,
  createCommitment,
  findCommitment,
  isProgress,
  removeOwnCommitment,
  setCommitmentProgress,
  MAX_COMMITMENTS,
  WHAT_MAX,
  WHEN_MAX,
} from '@/lib/connectors/commitments';

/**
 * Say you will do something, or mark it done.
 *
 * This route used to read the membership blob, change it, and write the whole
 * thing back. That was safe only while a connector was the single writer of
 * their own record, and it said as much: "if a second writer ever appears,
 * this needs to move to its own table rather than grow a lock." The admin
 * console setting a task is that second writer, so drizzle/0056 moved the
 * data and this now writes rows.
 *
 * The practical difference is that two people editing the same board no
 * longer overwrite each other. Under the blob, an admin assigning a task
 * while the connector ticked something off would have one of those writes
 * silently lose — no error, nothing in a log, just a change that did not
 * happen. Row-level writes cannot do that to each other.
 *
 * ## This endpoint is only ever the connector themselves
 *
 * Everything here is scoped to the signed-in member's own profile. Staff
 * writes live under /api/admin/connectors, are gated separately, and are not
 * reachable from here by sending a different id — ownership is in the WHERE
 * clause of each write rather than checked beforehand, so a guessed id
 * belonging to somebody else updates nothing rather than being caught.
 */

const HOUSE_IDS = new Set<string>(HOUSES.map((h) => h.id));

/**
 * The signed-in member's profile, but only if they are actually in.
 *
 * Returns `null` for a pending or declined application as well as for no
 * application at all. Recording commitments is a thing connectors do, so
 * somebody still waiting on a decision must not be able to write them — and
 * the admin queue would then be showing an application with work already
 * logged against it, which reads as though the decision had been made.
 */
async function loadConnectorProfileId(userId: string): Promise<string | null> {
  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.userId, userId),
    columns: { id: true, connector: true },
  });
  if (!profile) return null;

  const membership = parseConnector(profile.connector);
  if (!membership || membership.status !== 'active') return null;

  return profile.id;
}

function unauthorized() {
  return NextResponse.json(
    { success: false, error: 'You need to be signed in.' },
    { status: 401 }
  );
}

function notAConnector() {
  return NextResponse.json(
    { success: false, error: 'You are not a connector yet.' },
    { status: 403 }
  );
}

async function readJson(request: NextRequest): Promise<unknown | undefined> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  const body = await readJson(request);
  if (body === undefined) {
    return NextResponse.json(
      { success: false, error: 'Could not read that request.' },
      { status: 400 }
    );
  }

  const payload = (body ?? {}) as Record<string, unknown>;

  const what =
    typeof payload.what === 'string'
      ? payload.what.trim().slice(0, WHAT_MAX)
      : '';
  if (!what) {
    return NextResponse.json(
      { success: false, error: 'Say what you will do.' },
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

  const profileId = await loadConnectorProfileId(session.user.id);
  if (!profileId) return notAConnector();

  const estimatedMinutes = payload.estimatedMinutes ?? null;
  if (
    estimatedMinutes !== null &&
    (typeof estimatedMinutes !== 'number' ||
      !Number.isInteger(estimatedMinutes) ||
      estimatedMinutes <= 0 ||
      estimatedMinutes > MAX_MINUTES)
  ) {
    return NextResponse.json(
      {
        success: false,
        error: `Estimated effort must be a whole number of minutes from 1 to ${MAX_MINUTES}.`,
      },
      { status: 400 }
    );
  }

  if ((await countCommitments(profileId)) >= MAX_COMMITMENTS) {
    return NextResponse.json(
      {
        success: false,
        error:
          'Your board has reached its storage limit. Remove an old self-directed commitment or ask a coordinator for help.',
      },
      { status: 409 }
    );
  }

  try {
    const commitment = await createCommitment({
      profileId,
      what,
      when,
      house: house as HouseId,
      estimatedMinutes,
      assignedBy: null,
    });

    return NextResponse.json(
      { success: true, data: commitment },
      { status: 200 }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    console.error('connectors/commitments POST failed', message);
    return NextResponse.json(
      { success: false, error: 'Could not save that. Try again.' },
      { status: 500 }
    );
  }
}

/** Move a commitment along, or drop it. */
export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  const body = await readJson(request);
  if (body === undefined) {
    return NextResponse.json(
      { success: false, error: 'Could not read that request.' },
      { status: 400 }
    );
  }

  const payload = (body ?? {}) as Record<string, unknown>;
  const id = typeof payload.id === 'string' ? payload.id : '';
  if (!id) {
    return NextResponse.json(
      { success: false, error: 'Which commitment?' },
      { status: 400 }
    );
  }

  const remove = payload.remove === true;
  const progress = payload.progress;
  if (!remove && !isProgress(progress)) {
    return NextResponse.json(
      { success: false, error: 'That is not a progress value.' },
      { status: 400 }
    );
  }

  const profileId = await loadConnectorProfileId(session.user.id);
  if (!profileId) return notAConnector();

  try {
    /* Two separate writes rather than one with a flag, so that a malformed
     * progress value can never fall through into the delete branch. The
     * validation above already rejects that case; this makes it structurally
     * impossible rather than true-by-reading. */
    let changed: boolean;
    if (remove) {
      changed = await removeOwnCommitment(profileId, id);
    } else if (isProgress(progress)) {
      changed = await setCommitmentProgress(profileId, id, progress);
    } else {
      return NextResponse.json(
        { success: false, error: 'That is not a progress value.' },
        { status: 400 }
      );
    }

    if (!changed) {
      /* The write declined. Work out which of the two reasons it was, purely
       * so the message is useful — the decision has already been made and is
       * not revisited here. */
      const existing = await findCommitment(profileId, id);

      if (!existing) {
        return NextResponse.json(
          { success: false, error: 'Could not find that commitment.' },
          { status: 404 }
        );
      }

      /* Only reachable on remove: progress updates do not care who assigned
       * it, so they cannot fail on an existing row. */
      return NextResponse.json(
        {
          success: false,
          error:
            'That task was assigned to you, so it is not yours to remove. Talk to an organizer if it should come off your board.',
        },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    console.error('connectors/commitments PATCH failed', message);
    return NextResponse.json(
      { success: false, error: 'Could not save that. Try again.' },
      { status: 500 }
    );
  }
}
