'use client';

import { MessageAvatar } from '@/components/messages/message-avatar';
import styles from '@/components/messages/workspace.module.css';
import { Check, CircleAlert, Clock3, Globe, ShieldAlert } from 'lucide-react';
import type { SocialActorDisplay } from '@/lib/interfaces';
import { DIRECT_THREAD_REFUSED } from '@/lib/dm-refusal';

/**
 * The slice of an actor these components actually render.
 *
 * Narrower than SocialActorDisplay on purpose. The Requests folder's payload
 * carries a sender without follower counts -- it is a different endpoint
 * answering a different question -- and demanding the full display type here
 * would force that call site to invent three numbers it does not have. The
 * numbers would then be rendered nowhere, which is the tell that the
 * constraint was wrong rather than the data.
 */
export type ChatActor = Pick<
  SocialActorDisplay,
  'id' | 'username' | 'domain'
> & {
  name?: string | null;
  iconUrl?: string | null;
};

/* Primitives for the DM chat view, promoted from /mock/dm-chat.
 *
 * `ChatAvatar` still takes no `online` prop. Presence is out of scope per
 * CHAT-ROADMAP, and the cheapest way to keep a thing out of scope is to make
 * the component unable to express it: a boolean nobody passes today is a
 * boolean somebody passes next quarter.
 *
 * Two badges from the mock are gone rather than guessed. It drew a Pana check
 * and a storefront marker, and the conversation endpoint carries neither fact
 * -- an actor payload has a name, a handle, a domain and a county. Rendering a
 * verification mark from a field that does not exist is worse than rendering
 * nothing, so the globe (which `domain` does answer) is the only badge left.
 *
 * Colour follows the contrast rule recorded in app/globals.css, which is a
 * constraint rather than a preference: cream on flame measures 2.42:1 and
 * fails even the 3:1 large-text bar, while cream on indigo is 9.01:1. The warm
 * tokens carry ink text; only indigo and ink carry cream. That is why the
 * viewer's own bubble is indigo and not the brand orange. */

export function ChatAvatar({
  actor,
  size = 40,
}: {
  actor: ChatActor;
  size?: number;
}) {
  return (
    <MessageAvatar
      identity={actor.id}
      name={actor.name || actor.username || '?'}
      imageUrl={actor.iconUrl}
      size={size}
    />
  );
}

export function ChatName({
  actor,
  remoteHost,
  className = '',
}: {
  actor: ChatActor;
  remoteHost: string | null;
  className?: string;
}) {
  return (
    <span className={`flex min-w-0 items-center gap-1.5 ${className}`}>
      <span className="text-pana-ink truncate font-extrabold">
        {actor.name || actor.username}
      </span>
      {/* Remote actors are marked because it changes what the product can
          promise. Delivery to another server is a queued POST that can fail
          hours later, not a socket push. */}
      {remoteHost && (
        <Globe
          className="text-pana-indigo/60 h-3.5 w-3.5 flex-none"
          aria-label={`Federated — ${remoteHost}`}
        />
      )}
    </span>
  );
}

/* Delivery state, rendered next to the timestamp of the viewer's own bubble
   group.
 *
   There is no "read" state here, and that is deliberate rather than
   unfinished. Read receipts are the same class of promise as presence: they
   need a second message per message per reader, and once shown they cannot be
   withdrawn without looking like a bug. CHAT-ROADMAP scopes this release to
   delivery, and delivery is something the server actually knows. */
export function DeliveryMark({
  state,
}: {
  state: 'sent' | 'sending' | 'failed';
}) {
  if (state === 'failed') {
    return (
      <span className={styles.deliveryMark} data-state="failed">
        <CircleAlert className="h-3 w-3" aria-hidden="true" />
        Not sent
      </span>
    );
  }
  if (state === 'sending') {
    return (
      <span className={styles.deliveryMark} data-state="sending">
        <Clock3
          className="h-3 w-3 motion-safe:animate-pulse"
          aria-hidden="true"
        />
        Sending
      </span>
    );
  }

  return (
    <span className={styles.deliveryMark} data-state="sent">
      <Check className="h-3 w-3" aria-hidden="true" />
      Sent
    </span>
  );
}

/* The expiry, made visible.
 *
   status.ts stamps every direct status with `expiresAt = now +
   DM_EXPIRY_DAYS` and timeline.ts hides it after that, so this is not a
   hypothetical: it is what the product does to every DM. Mail could get away
   with not mentioning it. A transcript cannot, because a transcript that
   silently loses its own first page is indistinguishable from data loss.

   The window is thirty days. The chip does not retire at thirty: the stamp is
   per row, so a conversation erodes from its oldest message forward at any
   window, which is why this renders per message rather than per thread. */
export function ExpiryChip({ expiresIn }: { expiresIn: string }) {
  const urgent = expiresIn.includes('hour');
  return (
    <span
      className={styles.expiryChip}
      data-urgent={urgent}
      title="Messages are hidden 30 days after they are sent"
    >
      <Clock3 className="h-2.5 w-2.5" aria-hidden="true" />
      Disappears in {expiresIn}
    </span>
  );
}

/* REFUSED.
 *
 * Replaces the composer rather than erroring after a send, so nobody writes a
 * paragraph into a box that was never going to accept it.
 *
 * The copy is the single string dm-gate.ts returns for every refusal, and the
 * vagueness is the feature: a block and a closed inbox must be indistinguish-
 * able, or a blocked sender can detect the block by sending one message and
 * reading the wording. Friendlier per-case copy is the obvious design
 * improvement here and it is the one that breaks the safety property. */
export function RefusedComposer() {
  return (
    <footer className="border-pana-ink/10 bg-pana-cream flex-none border-t px-5 py-4">
      <p className="text-pana-ink/70 flex items-center justify-center gap-2 text-center text-sm font-bold">
        <ShieldAlert className="h-4 w-4 flex-none" aria-hidden="true" />
        {DIRECT_THREAD_REFUSED}
      </p>
    </footer>
  );
}
