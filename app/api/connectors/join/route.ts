import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';

import { auth } from '@/auth';
import { db } from '@/lib/db';
import { profiles } from '@/lib/schema';
import { HOUSES, PODS } from '@/lib/connectors/model';
import {
  parseConnector,
  type ProfileConnector,
} from '@/lib/connectors/membership';
import {
  normalizeSmsPhone,
  requestIp,
  subscribeProfileToSms,
  unsubscribeProfileFromSms,
} from '@/lib/sms-subscriptions';

/**
 * Apply to the Connectors programme, or change what you picked.
 *
 * Applying is not joining. The programme accepts people rather than letting
 * anyone who finds this URL award themselves a place, so this writes a
 * `pending` record and staff decide on it from the admin queue. This is the
 * same shape as `venues.status`, which goes `pending_review` → `active`
 * through `app/api/admin/venues/[slug]/approve/route.ts`.
 *
 * Writes `profiles.connector` on the signed-in human's OWN profile — matched
 * on `profiles.userId`, not through `getActiveProfile`. That helper resolves
 * the profile somebody is acting as, which may be a business listing they
 * administer, and membership belongs to the person rather than their shop.
 *
 * Re-posting is an edit, not a second application: `appliedAt`, the decision
 * and any existing commitments are carried over from the current record. So
 * an accepted member changing their houses stays accepted, and an applicant
 * fixing a typo does not go to the back of the queue or quietly re-open a
 * decision staff have already made.
 *
 * Neither `status` nor `tier` is ever read from the request body. Both are
 * things the programme grants, not things you can ask for.
 */

const POD_IDS = new Set<string>(PODS.map((p) => p.id));
const HOUSE_IDS = new Set<string>(HOUSES.map((h) => h.id));

/** Long enough for a real answer, short enough not to be a storage endpoint. */
const BRING_MAX = 2000;

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: 'You need to be signed in to join.' },
      { status: 401 }
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

  const pod = payload.pod;
  if (typeof pod !== 'string' || !POD_IDS.has(pod)) {
    return NextResponse.json(
      { success: false, error: 'Pick the pod you can actually get to.' },
      { status: 400 }
    );
  }

  const houses = Array.isArray(payload.houses)
    ? [
        ...new Set(
          payload.houses.filter(
            (h): h is string => typeof h === 'string' && HOUSE_IDS.has(h)
          )
        ),
      ]
    : [];
  if (houses.length === 0) {
    return NextResponse.json(
      { success: false, error: 'Pick at least one house.' },
      { status: 400 }
    );
  }

  const bring =
    typeof payload.bring === 'string'
      ? payload.bring.trim().slice(0, BRING_MAX)
      : '';
  const smsOptIn =
    typeof payload.smsOptIn === 'boolean' ? payload.smsOptIn : null;
  const smsPhone =
    typeof payload.smsPhone === 'string' ? payload.smsPhone.trim() : '';
  if (smsOptIn === true && !normalizeSmsPhone(smsPhone)) {
    return NextResponse.json(
      {
        success: false,
        error: 'Enter a valid mobile number for text updates.',
      },
      { status: 400 }
    );
  }

  // The identity profile, not the one they may be acting as.
  const existing = await db.query.profiles.findFirst({
    where: eq(profiles.userId, session.user.id),
    columns: { id: true, connector: true },
  });

  if (!existing) {
    return NextResponse.json(
      { success: false, error: 'Your account does not have a profile yet.' },
      { status: 404 }
    );
  }

  const current = parseConnector(existing.connector);

  const membership: ProfileConnector = {
    // Carried over, never taken from the request: a decision staff made is
    // not something the applicant can edit their way out of.
    status: current?.status ?? 'pending',
    pod: pod as ProfileConnector['pod'],
    houses: houses as ProfileConnector['houses'],
    // Tier is never taken from the request. It is not a thing you ask for.
    tier: current?.tier ?? 1,
    bring,
    appliedAt: current?.appliedAt ?? new Date().toISOString(),
    decidedAt: current?.decidedAt ?? null,
    decidedBy: current?.decidedBy ?? null,
  };

  try {
    await db
      .update(profiles)
      .set({ connector: membership })
      .where(eq(profiles.id, existing.id));

    let sms = null;
    let smsError: string | null = null;
    try {
      sms =
        smsOptIn === true
          ? await subscribeProfileToSms({
              profileId: existing.id,
              phone: smsPhone,
              source: 'connectors_join',
              ip: requestIp(request),
            })
          : smsOptIn === false
            ? await unsubscribeProfileFromSms(existing.id)
            : null;
    } catch (error) {
      smsError =
        error instanceof Error
          ? error.message
          : 'Text-message preference could not be saved.';
      console.error('connectors/join SMS preference failed', error);
    }

    return NextResponse.json(
      { success: true, data: membership, sms, smsError },
      { status: 200 }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    console.error('connectors/join failed', message);
    return NextResponse.json(
      { success: false, error: 'Could not save that. Try again.' },
      { status: 500 }
    );
  }
}
