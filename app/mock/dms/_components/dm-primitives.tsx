'use client';

import Image from 'next/image';
import { BadgeCheck, Store } from 'lucide-react';
import type { MockDmPerson } from '../_data/mock-dms';

/* Primitives shared by both DM models.
 *
 * Deliberately small. The conversation list, the transcript, and the composer
 * all live inside each model rather than here, because those three things ARE
 * the difference between the models - factoring them into one shared component
 * with a `variant` prop would quietly converge the two designs and defeat the
 * comparison. Only things that should look identical in both are here.
 *
 * Everything below uses the refresh palette (pana-ink, flame, indigo, butter)
 * rather than Tailwind's stock ramps, for two reasons. The first is that the
 * rest of this branch does - the feed mock uses almost no stock colour
 * utilities, leaning on the semantic classes in globals.css and the pana-*
 * tokens, and a DM surface painted in stock greys reads as a different
 * product bolted on.
 *
 * The second is the contrast rule recorded in globals.css, which is a real
 * constraint rather than a style note: flame is a high-luminance orange, so
 * cream on flame measures 2.42:1 and fails even the 3:1 large-text bar. Warm
 * surfaces here carry ink text; only indigo and ink carry cream. That is why
 * the viewer's chat bubble is indigo and not the brand orange. */

export function DmAvatar({
  person,
  size = 40,
  online = false,
}: {
  person: MockDmPerson;
  size?: number;
  /** Chat model only. Mail has no concept of presence. */
  online?: boolean;
}) {
  return (
    <span className="relative flex-none">
      <Image
        src={person.avatar}
        alt={person.name}
        width={size}
        height={size}
        className="chrome-avatar"
        style={{ width: size, height: size }}
      />
      {online && (
        <span
          className="bg-pana-indigo absolute right-0 bottom-0 block rounded-full border-2 border-white"
          style={{
            width: Math.max(9, size / 4),
            height: Math.max(9, size / 4),
          }}
          aria-label="Active now"
        />
      )}
    </span>
  );
}

/** Name plus the two badges that change how a thread should be read. */
export function DmName({
  person,
  className = '',
}: {
  person: MockDmPerson;
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
      {person.isPana && (
        <BadgeCheck
          className="text-pana-burnt h-3.5 w-3.5 flex-none"
          aria-label="Pana"
        />
      )}
    </span>
  );
}

/** Unread count pill. Both models need one; both should style it the same. */
export function UnreadBadge({ count }: { count: number }) {
  if (count < 1) return null;
  return (
    <span className="bg-pana-flame text-pana-ink flex h-5 min-w-5 flex-none items-center justify-center rounded-full px-1.5 text-[11px] font-extrabold">
      {count}
    </span>
  );
}
