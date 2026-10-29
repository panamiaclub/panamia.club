/**
 * Turning status rows into the things a chat view draws.
 *
 * The mock at /mock/dm-chat carried pre-formatted strings in its fixtures --
 * `day: 'Yesterday'`, `expiresIn: '4 hours'`, `from: 'me'`. Those were the
 * spec for this file: every one of them is a derivation the server does not
 * do, and collecting them here keeps the components renderers rather than
 * half-owners of the date logic.
 *
 * @see docs/CHAT-ROADMAP.md
 */

import {
  differenceInCalendarDays,
  differenceInHours,
  format,
  isThisYear,
  isToday,
  isYesterday,
} from 'date-fns';
import type { SocialActorDisplay, SocialStatusDisplay } from '@/lib/interfaces';
import type { ChatMessage } from '@/lib/chat';

export function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** The separator above a run of messages: Today, Yesterday, or a date. */
export function dayLabel(published: string | Date | null): string {
  const date = toDate(published);
  if (!date) return '';
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return isThisYear(date) ? format(date, 'MMMM d') : format(date, 'MMMM d, y');
}

/** The clock time printed once per bubble group. */
export function timeLabel(published: string | Date | null): string {
  const date = toDate(published);
  return date ? format(date, 'h:mm a') : '';
}

/**
 * How long this message has left, or null when it does not expire.
 *
 * Hours below a day and days above it, which is the resolution the chip needs:
 * "29 days" is background information and "4 hours" is a prompt to act, and
 * the switch between them is where the difference shows up.
 *
 * Already-expired messages return null rather than a negative count. The
 * server hides them on read, so a client holding one is looking at a cached
 * response, and a countdown reading "-2 hours" would be a worse answer than
 * no chip at all.
 */
export function expiresInLabel(
  expiresAt: string | Date | null | undefined
): string | null {
  const date = toDate(expiresAt);
  if (!date) return null;

  const now = new Date();
  if (date.getTime() <= now.getTime()) return null;

  const hours = differenceInHours(date, now);
  if (hours < 24) {
    const whole = Math.max(1, hours);
    return whole === 1 ? '1 hour' : `${whole} hours`;
  }

  const days = Math.max(1, Math.round(hours / 24));
  return days === 1 ? '1 day' : `${days} days`;
}

/** True when something in this thread goes in under a day. */
export function expiresToday(
  expiresAt: string | Date | null | undefined
): boolean {
  const date = toDate(expiresAt);
  if (!date) return false;
  const now = new Date();
  return date > now && differenceInCalendarDays(date, now) < 1;
}

/** Relative time for the conversation list's right-hand column. */
export function lastActiveLabel(published: string | Date | null): string {
  const date = toDate(published);
  if (!date) return '';
  if (isToday(date)) return format(date, 'h:mm a');
  if (isYesterday(date)) return 'Yesterday';
  return isThisYear(date) ? format(date, 'MMM d') : format(date, 'MMM d, y');
}

/**
 * `@handle`, with the domain kept for anyone who is not local.
 *
 * A bare username is ambiguous across servers and the ambiguity is not
 * cosmetic: two different people can hold the same username on two hosts, and
 * which one you are talking to is decided by the domain.
 */
export function actorHandle(
  actor: Pick<SocialActorDisplay, 'username' | 'domain'>,
  localDomain: string | null
): string {
  if (!localDomain || actor.domain === localDomain) return actor.username;
  return `${actor.username}@${actor.domain}`;
}

export function remoteHost(
  actor: Pick<SocialActorDisplay, 'domain'>,
  localDomain: string | null
): string | null {
  if (!localDomain || !actor.domain) return null;
  return actor.domain === localDomain ? null : actor.domain;
}

/**
 * Plain text for the list snippet.
 *
 * Status bodies are HTML. The list renders one truncated line inside a button,
 * so it strips rather than sanitising-and-rendering: markup inside a clickable
 * row buys nothing, and a nested anchor inside a button is invalid besides.
 * Transcript bubbles go through SafeHtml, which is the sanctioned path.
 */
export function plainTextSnippet(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * What to call a message that is only an attachment.
 *
 * This used to be the single string "Sent a voice memo", which was true for
 * as long as a voice memo was the only thing that could be attached. It is
 * not any more: a GIF announcing itself in the sidebar as a voice memo is a
 * small lie, but it is the kind that makes someone distrust the rest of the
 * screen. The label now comes from what was actually sent.
 */
export function attachmentLabel(
  attachments: SocialStatusDisplay['attachments']
): string {
  const first = attachments?.[0];
  if (!first) return 'Message';

  const mediaType = (first.mediaType ?? '').toLowerCase();
  const type = (first.type ?? '').toLowerCase();

  if (mediaType === 'image/gif') return 'GIF';
  if (type === 'audio' || mediaType.startsWith('audio/'))
    return 'Sent a voice memo';
  if (type === 'video' || mediaType.startsWith('video/')) return 'Video';
  if (type === 'image' || mediaType.startsWith('image/')) return 'Photo';
  return 'Attachment';
}

export function conversationSnippet(
  message: ChatMessage,
  viewerActorId: string | null
): string {
  const mine = !!viewerActorId && message.actor.id === viewerActorId;
  const body = plainTextSnippet(message.content);
  const text = body || attachmentLabel(message.attachments);
  return mine ? `You: ${text}` : text;
}

/**
 * Consecutive messages from the same person on the same day.
 *
 * Split on the day as well as the author so a run cannot straddle a date
 * separator, which would put the separator inside a bubble group and print the
 * group's single timestamp under the wrong date.
 */
export function groupMessages<T extends ChatMessage>(messages: T[]): T[][] {
  const groups: T[][] = [];

  for (const message of messages) {
    const current = groups[groups.length - 1];
    const previous = current?.[current.length - 1];
    const sameAuthor = previous?.actor.id === message.actor.id;
    const sameDay =
      !!previous &&
      dayLabel(previous.published) === dayLabel(message.published);

    if (current && sameAuthor && sameDay) {
      current.push(message);
    } else {
      groups.push([message]);
    }
  }

  return groups;
}
