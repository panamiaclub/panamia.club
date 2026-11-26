import { and, eq, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { Parser } from 'htmlparser2';
import { db } from '@/lib/db';
import {
  profiles,
  socialActors,
  socialDmRequests,
  socialStatuses,
} from '@/lib/schema';
import { notExpired } from '@/lib/federation/wrappers/visibility';
import { getVisibilityFromRecipients } from '@/lib/utils/getVisibility';
import type { PushMessagePreview } from './payload';

function previewText(html: string, limit: number) {
  const parts: string[] = [];
  const hidden = new Set(['script', 'style', 'iframe', 'textarea', 'noscript']);
  const blocks = new Set(['p', 'div', 'br', 'li']);
  let hiddenDepth = 0;
  const parser = new Parser({
    onopentag(name) {
      if (hidden.has(name)) hiddenDepth++;
      if (blocks.has(name)) parts.push(' ');
    },
    onclosetag(name) {
      if (hidden.has(name)) hiddenDepth = Math.max(0, hiddenDepth - 1);
      if (blocks.has(name)) parts.push(' ');
    },
    ontext(text) {
      if (!hiddenDepth) parts.push(text);
    },
  });
  parser.end(html);
  const text = parts
    .join('')
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, '[link]')
    .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const characters = Array.from(text);
  return characters.length > limit
    ? characters.slice(0, limit - 3).join('') + '...'
    : text;
}

export function formatMessagePreview(
  sender: string,
  content: string
): PushMessagePreview | undefined {
  const name = previewText(sender, 48);
  const excerpt = previewText(content, 120);
  return name && excerpt ? { sender: name, excerpt } : undefined;
}

export async function resolveMessagePush(
  notification: { object: string | null; actor: string; target: string },
  messagePreviews: boolean
): Promise<{ preview?: PushMessagePreview } | null> {
  if (!notification.object) return null;
  const recipient = alias(socialActors, 'push_recipient');
  const recipientProfile = alias(profiles, 'push_recipient_profile');
  const [row] = await db
    .select({
      status: socialStatuses,
      senderName: socialActors.name,
      senderUsername: socialActors.username,
      recipientActorId: recipient.id,
    })
    .from(socialStatuses)
    .innerJoin(socialActors, eq(socialActors.id, socialStatuses.actorId))
    .innerJoin(profiles, eq(profiles.id, socialActors.profileId))
    .innerJoin(
      recipient,
      sql`${socialStatuses.recipientTo} @> to_jsonb(${recipient.uri})`
    )
    .innerJoin(recipientProfile, eq(recipientProfile.id, recipient.profileId))
    .where(
      and(
        eq(socialStatuses.id, notification.object),
        eq(profiles.userId, notification.actor),
        eq(recipientProfile.userId, notification.target),
        eq(socialStatuses.isDraft, false),
        isNull(socialStatuses.groupId),
        notExpired()
      )
    )
    .limit(1);
  if (!row) return null;
  const { status } = row;
  if (
    !Array.isArray(status.recipientTo) ||
    !status.recipientTo.every((value) => typeof value === 'string') ||
    !Array.isArray(status.recipientCc) ||
    status.recipientCc.length !== 0 ||
    getVisibilityFromRecipients(
      status.recipientTo,
      status.recipientCc,
      status.type
    ) !== 'direct'
  )
    return null;
  const request = await db.query.socialDmRequests.findFirst({
    where: and(
      eq(socialDmRequests.senderActorId, status.actorId),
      eq(socialDmRequests.recipientActorId, row.recipientActorId),
      eq(socialDmRequests.state, 'pending')
    ),
    columns: { id: true },
  });
  if (request) return null;
  // Only ordinary ActivityPub Notes are plaintext. Relay ciphertext and
  // content-warning-protected messages must never become preview text.
  if (!messagePreviews || status.type !== 'Note' || status.contentWarning)
    return {};
  return {
    preview: formatMessagePreview(
      row.senderName || row.senderUsername,
      status.content || ''
    ),
  };
}
