import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { socialActors, socialGroups, socialGroupMembers } from '@/lib/schema';
import { evaluateDirectThreads } from '@/lib/federation/wrappers/dm-gate';
import { DIRECT_THREAD_REFUSED } from '@/lib/dm-refusal';

const targetSchema = z.discriminatedUnion('kind', [
  z
    .object({ kind: z.literal('dm'), actorId: z.string().min(1).max(128) })
    .strict(),
  z
    .object({ kind: z.literal('group'), groupId: z.string().min(1).max(128) })
    .strict(),
]);
const required = {
  status: 409,
  error:
    'Use an updated messaging client and encrypted private uploads for this conversation. Public social uploads require an explicit social-post purpose.',
};

/** Old chat uploads were indistinguishable from public posts. Once encryption
 * exists, unmarked clients must update instead of leaking a private file first. */
export async function chatMediaRefusal(
  actorId: string,
  purpose: unknown,
  target: unknown
) {
  if (purpose === 'social-post') return null;
  if (purpose === undefined || purpose === null) {
    if (process.env.CHAT_E2EE_ENABLED === '1') return required;
    const [actor] = await db
      .select({ id: socialActors.id })
      .from(socialActors)
      .where(eq(socialActors.encryptedChatRequired, true))
      .limit(1);
    if (actor) return required;
    const [group] = await db
      .select({ id: socialGroups.id })
      .from(socialGroups)
      .where(eq(socialGroups.encryptedChatRequired, true))
      .limit(1);
    return group ? required : null;
  }
  if (purpose !== 'legacy-chat')
    return { status: 400, error: 'Invalid social media purpose.' };
  const parsed = targetSchema.safeParse(target);
  if (!parsed.success)
    return {
      status: 400,
      error: 'A private upload requires its explicit conversation target.',
    };
  const [actor] = await db
    .select({ required: socialActors.encryptedChatRequired })
    .from(socialActors)
    .where(eq(socialActors.id, actorId))
    .limit(1);
  if (!actor) return required;
  if (parsed.data.kind === 'dm') {
    const peerId = parsed.data.actorId;
    const [gate] = await evaluateDirectThreads(actorId, [peerId]);
    if (gate?.decision === 'refuse')
      return { status: 403, error: DIRECT_THREAD_REFUSED };
    const [peer] = await db
      .select({ required: socialActors.encryptedChatRequired })
      .from(socialActors)
      .where(eq(socialActors.id, peerId))
      .limit(1);
    if (actor.required || !peer || peer.required) return required;
    return null;
  }
  const [group] = await db
    .select({ required: socialGroups.encryptedChatRequired })
    .from(socialGroups)
    .innerJoin(
      socialGroupMembers,
      eq(socialGroupMembers.groupId, socialGroups.id)
    )
    .where(
      and(
        eq(socialGroups.id, parsed.data.groupId),
        eq(socialGroupMembers.actorId, actorId),
        eq(socialGroupMembers.status, 'active')
      )
    )
    .limit(1);
  return !group || group.required ? required : null;
}
