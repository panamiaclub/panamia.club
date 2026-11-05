'use client';

import { MessageAvatar } from '@/components/messages/message-avatar';
import {
  AlertCircle,
  BadgeCheck,
  Check,
  Clock3,
  Globe,
  Sparkles,
  Store,
} from 'lucide-react';
import type {
  MockChatPerson,
  MockDeliveryState,
  MockGif,
} from '../_data/mock-dm-chat';
import styles from '@/components/messages/workspace.module.css';

/* Primitives for the DM chat view.
 *
 * Mostly a narrower copy of /mock/dms' primitives, and the narrowing is the
 * interesting part: `DmAvatar` there takes an `online` prop, and this one
 * does not. Presence is out of scope per CHAT-ROADMAP, and the cheapest way
 * to keep a thing out of scope is to make the component unable to express it.
 * A boolean nobody passes today is a boolean somebody passes next quarter.
 *
 * Colour follows the contrast rule recorded in app/globals.css, which is a
 * constraint rather than a preference: flame is a high-luminance orange, so
 * cream on flame measures 2.42:1 and fails even the 3:1 large-text bar, while
 * cream on indigo is 9.01:1. The warm tokens carry ink text; only indigo and
 * ink carry cream. That is why the viewer's own bubble is indigo and not the
 * brand orange. */

export function ChatAvatar({
  person,
  size = 40,
}: {
  person: MockChatPerson;
  size?: number;
}) {
  return (
    <MessageAvatar
      identity={person.handle}
      name={person.name}
      imageUrl={person.avatar}
      size={size}
    />
  );
}

/** Name plus the badges that change how a thread should be read. */
export function ChatName({
  person,
  className = '',
}: {
  person: MockChatPerson;
  className?: string;
}) {
  return (
    <span className={`flex min-w-0 items-center gap-1.5 ${className}`}>
      <span className="text-pana-ink truncate font-extrabold">
        {person.name}
      </span>
      {person.isBusiness && (
        <Store
          className="text-pana-ink/45 h-3.5 w-3.5 flex-none"
          aria-label="Directory listing"
        />
      )}
      {person.isPana && !person.remoteHost && (
        <BadgeCheck
          className="text-pana-burnt h-3.5 w-3.5 flex-none"
          aria-label="Pana"
        />
      )}
      {/* Remote actors are marked because it changes what the product can
          promise. Delivery to another server is a queued POST that can fail
          hours later, not a socket push. */}
      {person.remoteHost && (
        <Globe
          className="text-pana-indigo/60 h-3.5 w-3.5 flex-none"
          aria-label={`Federated — ${person.remoteHost}`}
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
   need a second socket message per message per reader, and once shown they
   cannot be withdrawn without looking like a bug. CHAT-ROADMAP scopes this
   release to delivery, and delivery is something the server actually knows. */
export function DeliveryMark({ state }: { state: MockDeliveryState }) {
  if (state === 'sent') {
    return (
      <span className={styles.deliveryMark} data-state="sent">
        <Check className="h-3 w-3" aria-hidden="true" />
        Sent
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
    <span className={styles.deliveryMark} data-state="failed">
      <AlertCircle className="h-3 w-3" aria-hidden="true" />
      Not sent
    </span>
  );
}

/* The expiry, made visible.
 *
   `status.ts` stamps every direct status with `expiresAt = now +
   DM_EXPIRY_DAYS` and timeline.ts hides it after that, so this is not a
   hypothetical: it is what the product does right now, to every DM, today.
   Mail could get away with not mentioning it. A transcript cannot, because a
   transcript that silently loses its own first page is indistinguishable from
   data loss.

   The window is thirty days, raised from seven after this view was drawn
   against it. The chip is not a seven-day artefact and does not retire at
   thirty: the stamp is per row, so the conversation erodes from its oldest
   message forward at any window, which is why this renders per message rather
   than per thread. */
export function ExpiryChip({ expiresIn }: { expiresIn: string }) {
  const urgent = expiresIn.includes('hour');
  return (
    <span
      className={styles.expiryChip}
      data-urgent={urgent}
      title="Messages disappear from view 30 days after they are sent."
    >
      <Clock3 className="h-2.5 w-2.5" aria-hidden="true" />
      Disappears in {expiresIn}
    </span>
  );
}

export function GifArt({ gif }: { gif: MockGif }) {
  return (
    <span
      className={styles.gifArt}
      data-tone={gif.tone}
      role="img"
      aria-label={gif.label}
    >
      <Sparkles className={styles.gifSparkle} aria-hidden="true" />
      <span>{gif.word}</span>
      <Sparkles className={styles.gifSparkle} aria-hidden="true" />
    </span>
  );
}
