import { auth } from '@/auth';
import { getActiveProfileWithActor } from '@/lib/server/active-profile';
import { encryptionResponse } from '@/lib/server/encryption-request';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id)
    return encryptionResponse({ success: false, error: 'Unauthorized' }, 401);
  const profile = await getActiveProfileWithActor(session.user.id);
  const actor = profile?.socialActor;
  return encryptionResponse({
    success: true,
    data:
      actor && profile
        ? {
            userId: session.user.id,
            profileId: profile.id,
            actorId: actor.id,
            enabled: process.env.CHAT_E2EE_ENABLED === '1',
            required: actor.encryptedChatRequired === true,
            actor: {
              id: actor.id,
              username: actor.username,
              name: actor.name,
              iconUrl: actor.iconUrl,
              domain: actor.domain,
            },
          }
        : null,
  });
}
