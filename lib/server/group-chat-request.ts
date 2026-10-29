import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getActiveProfileWithActor } from '@/lib/server/active-profile';

export function groupChatResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      Vary: 'Cookie, Authorization',
    },
  });
}

export async function groupChatActor(): Promise<
  { actorId: string } | { response: NextResponse }
> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      response: groupChatResponse(
        { success: false, error: 'Unauthorized' },
        401
      ),
    };
  }
  const profile = await getActiveProfileWithActor(session.user.id);
  const actorId = profile?.socialActor?.id;
  if (!actorId) {
    return {
      response: groupChatResponse(
        {
          success: false,
          error: 'Social features are unavailable for this profile',
        },
        403
      ),
    };
  }
  return { actorId };
}
