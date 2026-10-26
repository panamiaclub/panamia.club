/**
 * POST /api/social/stories - Post a story (24h, one photo or video)
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getActiveProfileWithActor } from '@/lib/server/active-profile';
import { createStory } from '@/lib/federation';

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const profile = await getActiveProfileWithActor(session.user.id);

  if (!profile?.socialActor) {
    return NextResponse.json(
      {
        success: false,
        error: 'Social features are unavailable for this profile',
      },
      { status: 403 }
    );
  }

  let body: {
    media?: { type?: string; mediaType?: string; url?: string; name?: string };
    caption?: string;
    contentWarning?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid request body' },
      { status: 400 }
    );
  }

  const media = body.media;
  if (!media?.url || !media?.type) {
    return NextResponse.json(
      { success: false, error: 'A story needs a photo or video' },
      { status: 400 }
    );
  }

  const result = await createStory(
    profile.socialActor.id,
    {
      type: media.type,
      mediaType: media.mediaType ?? '',
      url: media.url,
      name: media.name,
    },
    body.caption,
    body.contentWarning
  );

  if (!result.success) {
    return NextResponse.json(
      { success: false, error: result.error, gateResult: result.gateResult },
      { status: result.gateResult ? 403 : 400 }
    );
  }

  return NextResponse.json({
    success: true,
    data: { story: result.story },
  });
}
