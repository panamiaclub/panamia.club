import { NextRequest, NextResponse } from 'next/server';

import { checkAdminAuth } from '@/lib/server/admin-auth';
import {
  offboardConnector,
  reactivateConnector,
  setHousesAndTier,
} from '@/lib/connectors/roster';
import {
  HOUSE_FOCUS_ERROR,
  TIERS,
  parseHouseFocus,
} from '@/lib/connectors/model';
import type { TierId } from '@/lib/connectors/model';

/**
 * Record an active connector's major/minor houses or change their tier.
 * House updates replace both roles together. Omitting both leaves existing
 * choices intact, so a tier-only edit never guesses legacy house roles.
 */

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

    const changesHouses =
      Object.hasOwn(payload, 'majorHouse') ||
      Object.hasOwn(payload, 'minorHouse') ||
      Object.hasOwn(payload, 'houses');
    const focus = parseHouseFocus(payload);
    if (changesHouses && !focus) {
      return NextResponse.json(
        {
          success: false,
          error: HOUSE_FOCUS_ERROR,
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

    const updated = await setHousesAndTier(profileId, focus, tier as TierId);

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
