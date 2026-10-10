/**
 * GET /api/social/statuses - Get public feed
 * POST /api/social/statuses - Create a new post
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { socialActors } from '@/lib/schema';
import { inArray } from 'drizzle-orm';
import { getActiveProfileWithActor } from '@/lib/server/active-profile';
import { createStatus, getPublicTimeline } from '@/lib/federation';
import { createNotification } from '@/lib/notifications';

export async function GET(request: NextRequest) {
  // Get viewer's actor if authenticated
  let viewerActorId: string | undefined;
  const session = await auth();

  if (session?.user?.id) {
    const profile = await getActiveProfileWithActor(session.user.id);
    viewerActorId = profile?.socialActor?.id;
  }

  const { searchParams } = request.nextUrl;
  const cursor = searchParams.get('cursor') || undefined;
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);

  const result = await getPublicTimeline(viewerActorId, cursor, limit);

  return NextResponse.json({
    success: true,
    data: result,
  });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  // Get user's actor
  const profile = await getActiveProfileWithActor(session.user.id);

  if (!profile?.socialActor) {
    return NextResponse.json(
      { success: false, error: 'You must enable social features first' },
      { status: 403 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON' },
      { status: 400 }
    );
  }

  const {
    content,
    contentWarning,
    inReplyTo,
    visibility,
    attachments,
    recipientActorIds,
    location,
    ccLicense,
  } = body;

  // Validate ccLicense if provided
  const validLicenses = ['cc-by-4', 'cc-by-sa-4', 'cc-0'] as const;
  const resolvedLicense =
    ccLicense && validLicenses.includes(ccLicense) ? ccLicense : 'cc-by-4';

  /* A status needs *something* in it, and an attachment is something.
     Requiring text meant a GIF with no caption -- or a photo posted without
     one, which is an ordinary thing to want -- was rejected as empty. The
     check now asks whether the status carries anything at all, which is the
     question it was always trying to ask. */
  const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
  const text = typeof content === 'string' ? content : '';

  if (!text.trim() && !hasAttachments) {
    return NextResponse.json(
      { success: false, error: 'Content is required' },
      { status: 400 }
    );
  }

  if (typeof content !== 'string' && content != null) {
    return NextResponse.json(
      { success: false, error: 'Content is required' },
      { status: 400 }
    );
  }

  // Validate visibility if provided
  const validVisibilities = [
    'public',
    'unlisted',
    'private',
    'direct',
  ] as const;
  const resolvedVisibility =
    visibility && validVisibilities.includes(visibility)
      ? visibility
      : 'unlisted';

  // Direct messages require recipientActorIds
  if (resolvedVisibility === 'direct') {
    if (!Array.isArray(recipientActorIds) || recipientActorIds.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Direct messages require at least one recipient',
        },
        { status: 400 }
      );
    }
  }

  // Validate location if provided
  let validatedLocation = undefined;
  if (location && typeof location === 'object') {
    const hasCoordinates =
      typeof location.latitude === 'number' &&
      typeof location.longitude === 'number' &&
      location.latitude >= -90 &&
      location.latitude <= 90 &&
      location.longitude >= -180 &&
      location.longitude <= 180;
    const hasName =
      typeof location.name === 'string' && location.name.trim().length > 0;

    // Accept locations with coordinates OR name (or both)
    if (hasCoordinates || hasName) {
      validatedLocation = {
        type: 'Place' as const,
        ...(hasCoordinates && {
          latitude: location.latitude,
          longitude: location.longitude,
        }),
        ...(hasName && { name: location.name.trim() }),
        ...(location.precision === 'precise' || location.precision === 'general'
          ? { precision: location.precision }
          : {}),
      };
    }
  }

  const result = await createStatus(
    profile.socialActor.id,
    // `text`, not `content`: an attachment-only status arrives with content
    // absent, and createStatus expects a string to run through the markdown
    // and sanitiser pipeline.
    text,
    contentWarning,
    inReplyTo,
    resolvedVisibility,
    Array.isArray(attachments) ? attachments : undefined,
    resolvedVisibility === 'direct' ? recipientActorIds : undefined,
    validatedLocation,
    resolvedLicense
  );

  if (!result.success) {
    return NextResponse.json(
      { success: false, error: result.error, gateResult: result.gateResult },
      { status: 400 }
    );
  }

  // Create notifications for DM recipients
  if (resolvedVisibility === 'direct' && recipientActorIds?.length > 0) {
    // Recipients whose thread is held in Requests get no notification. This is
    // the entire point of the Requests folder: the harm being prevented was
    // never "a stranger wrote to me", it was "a stranger can make my phone
    // buzz eight times". Filing the message somewhere quieter while still
    // ringing the bell would prevent nothing. See docs/SOCIAL-GRAPH.md C1.
    const heldActorIds = new Set(result.heldRecipientActorIds ?? []);
    const notifiableActorIds = recipientActorIds.filter(
      (id: string) => !heldActorIds.has(id)
    );

    if (notifiableActorIds.length > 0) {
      // Look up recipient actors to get their user IDs
      const recipientActors = await db.query.socialActors.findMany({
        where: inArray(socialActors.id, notifiableActorIds),
        with: { profile: { with: { user: true } } },
      });

      // Create a notification for each recipient
      for (const recipientActor of recipientActors) {
        const recipientUserId = recipientActor.profile?.userId;
        if (recipientUserId) {
          await createNotification({
            type: 'Create',
            actorId: session.user.id,
            targetId: recipientUserId,
            context: 'message',
            objectId: result.status?.id,
            objectUrl: `/updates`,
          });
        }
      }
    }
  }

  return NextResponse.json({
    success: true,
    data: { status: result.status },
  });
}
