/**
 * GET /api/social/messages/conversations/[actorId] - one DM thread
 *
 * Returns the transcript oldest-first, the counterparty for the header, and
 * whether the composer may send at all.
 *
 * ADDRESSED BY ACTOR ID, NOT USERNAME
 *
 * Every other actor route in this API keys on username, which is right for
 * them: they back shareable public pages. A DM thread is not shareable -- two
 * people can read it and nobody else -- so a pretty URL buys nothing, while
 * username routing would need local/remote disambiguation that has exactly one
 * wrong answer (resolving a remote handle to the local actor of the same name
 * would open the wrong person's thread).
 *
 * @see docs/CHAT-ROADMAP.md
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { socialActors } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { getActiveProfileWithActor } from '@/lib/server/active-profile';
import {
  getDirectConversation,
  evaluateDirectThreads,
  isBlockedEitherWay,
  getPublicActorById,
  socialConfig,
} from '@/lib/federation';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ actorId: string }> }
) {
  const { actorId: counterpartyActorId } = await params;

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
      { success: false, error: 'Not found' },
      { status: 404 }
    );
  }

  const viewerActorId = profile.socialActor.id;

  if (viewerActorId === counterpartyActorId) {
    return NextResponse.json(
      { success: false, error: 'Not found' },
      { status: 404 }
    );
  }

  const counterparty = await getPublicActorById(counterpartyActorId);
  if (!counterparty) {
    return NextResponse.json(
      { success: false, error: 'Not found' },
      { status: 404 }
    );
  }

  /**
   * A block hides the thread entirely rather than showing it read-only.
   *
   * getDirectConversation does not filter blocked actors -- it is deliberately
   * the raw transcript, because the Requests folder needs to read messages the
   * inbox is hiding. Blocks are the caller's job, and they are enforced here
   * so that direct navigation cannot contradict the conversation list, which
   * drops blocked threads via notHidden().
   *
   * 404 rather than 403: the response is the same one an unknown id gets, so
   * it does not confirm that a thread exists.
   */
  if (await isBlockedEitherWay(viewerActorId, counterpartyActorId)) {
    return NextResponse.json(
      { success: false, error: 'Not found' },
      { status: 404 }
    );
  }

  const [gate] = await evaluateDirectThreads(viewerActorId, [
    counterpartyActorId,
  ]);

  /**
   * 'hold' is reported to the sender as 'allow', on purpose.
   *
   * dm-gate.ts holds a stranger's message in the recipient's Requests folder
   * and does not notify, and it is explicit that the sender is not told --
   * "your message was filed as a request" is a disclosure about the
   * recipient's settings. A composer that said so would leak exactly the fact
   * the gate is protecting, and it would leak it before a word was typed,
   * which is worse than the error message that design was avoiding.
   *
   * So the sender sees two states, not three. The message really is delivered
   * on 'hold' -- that is what holding means -- so 'allow' is not a lie about
   * what happens, only a silence about where it lands.
   *
   * 'refuse' is safe to surface because its wording is already deliberately
   * ambiguous: one string for blocked, `nobody`, and `panas`-without-a-mutual,
   * so it distinguishes nothing. See DIRECT_THREAD_REFUSED.
   *
   * The Accept/Delete banner in the transcript is a different thing entirely:
   * it is driven by the viewer's OWN Requests folder, which is their data to
   * see.
   *
   * The fallback is 'allow' for a remote counterparty, whom the gate declines
   * to judge because ActivityPub carries no DM-policy field.
   */
  const canSend: 'allow' | 'refuse' =
    gate?.decision === 'refuse' ? 'refuse' : 'allow';

  const messages = await getDirectConversation(
    viewerActorId,
    counterpartyActorId
  );
  const [peerPolicy] = await db
    .select({
      required: socialActors.encryptedChatRequired,
    })
    .from(socialActors)
    .where(eq(socialActors.id, counterpartyActorId))
    .limit(1);

  return NextResponse.json({
    success: true,
    data: {
      counterparty,
      messages,
      viewerActorId,
      localDomain: socialConfig.domain,
      canSend,
      encryptionRequired:
        profile.socialActor.encryptedChatRequired === true ||
        peerPolicy?.required === true,
    },
  });
}
