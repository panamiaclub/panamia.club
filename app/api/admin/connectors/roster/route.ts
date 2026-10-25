import { NextRequest, NextResponse } from 'next/server';

import { checkAdminAuth } from '@/lib/server/admin-auth';
import {
  offboardConnector,
  reactivateConnector,
  setHousesAndTier,
} from '@/lib/connectors/roster';
import { HOUSES, TIERS } from '@/lib/connectors/model';
import type { HouseId, TierId } from '@/lib/connectors/model';

/**
 * Move a connector between houses, or change their tier.
 *
 * The mock called this "Assign a house" and listed people who had joined
 * without one. Nobody is ever in that state: `parseConnector` refuses a
 * membership with no recognised house, so somebody with none is not a
 * connector with a gap — they are not a connector at all. What staff actually
 * need is to *change* an existing answer, which is what this does.
 *
 * Houses are a set, not a single value, because the programme's own structure
 * says so: a pana who runs a reading group and books the venue for it is in
 * two houses and picking one would be a lie about half their work.
 */

const HOUSE_IDS = new Set<string>(HOUSES.map((h) => h.id));
const TIER_IDS = new Set<number>(TIERS.map((t) => t.id));

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

    const profileId =
      body &&
      typeof body === 'object' &&
      !Array.isArray(body) &&
      'profileId' in body &&
      typeof body.profileId === 'string'
        ? body.profileId.trim()
        : '';
    if (!profileId) {
      return NextResponse.json(
        { success: false, error: 'Which connector?' },
        { status: 400 }
      );
    }

    const updated = await reactivateConnector(profileId, admin.id);
    if (!updated) {
      return NextResponse.json(
        {
          success: false,
          error:
            'No offboarded connector with that profile. Refresh the roster.',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Error reactivating connector:', error);
    return NextResponse.json(
      { success: false, error: 'Could not reactivate that connector.' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
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
        { success: false, error: 'Which connector?' },
        { status: 400 }
      );
    }

    const houses = Array.isArray(payload.houses)
      ? payload.houses.filter(
          (h): h is HouseId => typeof h === 'string' && HOUSE_IDS.has(h)
        )
      : [];

    /* An empty set is rejected rather than stored. A membership with no house
     * does not parse, so saving one here would not clear somebody's houses —
     * it would delete their membership out from under them, and they would
     * open HQ to the join form with no idea why. */
    if (houses.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            'A connector has to be in at least one house. Pick the one that fits best rather than clearing them all.',
        },
        { status: 400 }
      );
    }

    const tier = payload.tier;
    if (typeof tier !== 'number' || !TIER_IDS.has(tier)) {
      return NextResponse.json(
        { success: false, error: 'That is not a tier.' },
        { status: 400 }
      );
    }

    const updated = await setHousesAndTier(profileId, houses, tier as TierId);

    /* `setHousesAndTier` refuses anything that is not already an accepted
     * member, so this also covers "that is a pending applicant" — which is
     * deliberate. Deciding on somebody happens in the queue, where the accept
     * and decline buttons are; quietly editing an applicant's houses here
     * would move them through the programme without a decision being made. */
    if (!updated) {
      return NextResponse.json(
        {
          success: false,
          error: 'No accepted connector with that profile.',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Error updating connector roster:', error);
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
    const reason =
      typeof payload.reason === 'string'
        ? payload.reason.trim().slice(0, 500)
        : '';

    if (!profileId) {
      return NextResponse.json(
        { success: false, error: 'Which connector?' },
        { status: 400 }
      );
    }
    if (!reason) {
      return NextResponse.json(
        {
          success: false,
          error: 'Record why they are leaving the programme.',
        },
        { status: 400 }
      );
    }

    const updated = await offboardConnector(profileId, admin.id, reason);
    if (!updated) {
      return NextResponse.json(
        { success: false, error: 'No active connector with that profile.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Error offboarding connector:', error);
    return NextResponse.json(
      { success: false, error: 'Could not offboard that connector.' },
      { status: 500 }
    );
  }
}
