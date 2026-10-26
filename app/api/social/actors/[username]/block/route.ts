/**
 * POST   /api/social/actors/[username]/block - Block or mute an actor
 * DELETE /api/social/actors/[username]/block - Unblock or unmute an actor
 *
 * Both take ?kind=block|mute (default "block") so one route covers the pair.
 * They are the same shape of decision about the same person, and splitting
 * them into two routes would mean duplicating the whole lookup for a one-word
 * difference.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getActiveProfileWithActor } from '@/lib/server/active-profile';
import {
  getActorByScreenname,
  createBlock,
  removeBlock,
} from '@/lib/federation';
import type { SocialBlockKind } from '@/lib/schema';

function parseKind(request: NextRequest): SocialBlockKind | null {
  const raw = request.nextUrl.searchParams.get('kind') ?? 'block';
  return raw === 'block' || raw === 'mute' ? raw : null;
}

type ResolveResult =
  | {
      ok: true;
      viewerActorId: string;
      targetActorId: string;
      kind: SocialBlockKind;
    }
  | { ok: false; response: NextResponse };

/**
 * Shared setup for both verbs.
 *
 * Returns 404 for an unknown username in both directions, which also means a
 * blocked viewer poking at this route learns nothing new.
 */
async function resolve(
  request: NextRequest,
  username: string
): Promise<ResolveResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      ),
    };
  }

  const kind = parseKind(request);
  if (!kind) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: 'kind must be "block" or "mute"' },
        { status: 400 }
      ),
    };
  }

  const targetActor = await getActorByScreenname(username);
  if (!targetActor) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: 'Actor not found' },
        { status: 404 }
      ),
    };
  }

  const profile = await getActiveProfileWithActor(session.user.id);
  if (!profile?.socialActor) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          error: 'Social features are unavailable for this profile',
        },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true,
    viewerActorId: profile.socialActor.id,
    targetActorId: targetActor.id,
    kind,
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;
  const ctx = await resolve(request, username);
  if (!ctx.ok) return ctx.response;

  const result = await createBlock(
    ctx.viewerActorId,
    ctx.targetActorId,
    ctx.kind
  );

  if (!result.success) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    data: { block: result.block, kind: ctx.kind },
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;
  const ctx = await resolve(request, username);
  if (!ctx.ok) return ctx.response;

  await removeBlock(ctx.viewerActorId, ctx.targetActorId, ctx.kind);

  return NextResponse.json({
    success: true,
    data: { removed: true, kind: ctx.kind },
  });
}
