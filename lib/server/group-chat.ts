import { Buffer } from 'node:buffer';
import {
  and,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  notInArray,
  or,
  sql,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '@/lib/db';
import {
  socialActors,
  socialGroups,
  socialGroupMembers,
  socialGroupChatMessages,
} from '@/lib/schema';
import { getFederationDomain } from '@/lib/federation/domain';
import { getHiddenActorIds } from '@/lib/federation/wrappers/block-filter';
import { renderStatusMarkdown } from '@/lib/federation/markdown';
import { bucketKeysFor } from '@/lib/blob/api';
import { notifyGroupChat } from '@/lib/group-chat-notify';
import {
  GROUP_CHAT_EXPIRY_DAYS,
  GROUP_CHAT_MAX_ATTACHMENTS,
  GROUP_CHAT_MAX_CONTENT,
  GROUP_CHAT_PAGE_SIZE,
  GROUP_CHAT_UNAVAILABLE,
  type ChatAttachment,
  type GroupChatInput,
  type GroupChatList,
  type GroupChatMessage,
  type GroupChatPage,
  type GroupChatRoom,
} from '@/lib/chat';

type Failure = { success: false; error: string; status: 400 | 403 | 404 | 409 };
type Result<T> = { success: true; data: T } | Failure;
type Reader = Pick<typeof db, 'select'>;
const groupActor = alias(socialActors, 'chat_group_actor');
const author = alias(socialActors, 'chat_message_author');
const fail = (
  error = GROUP_CHAT_UNAVAILABLE,
  status: Failure['status'] = 404
): Failure => ({ success: false, error, status });
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const moderates = (role: GroupChatRoom['role']) =>
  role === 'admin' || role === 'moderator';

const roomColumns = {
  id: socialGroups.id,
  actorId: socialGroups.actorId,
  handle: groupActor.username,
  name: groupActor.name,
  iconUrl: groupActor.iconUrl,
  memberCount: socialGroups.memberCount,
  visibility: socialGroups.visibility,
  role: socialGroupMembers.role,
};

async function lockWriter(actorId: string, reader: Reader): Promise<boolean> {
  const [actor] = await reader
    .select({ id: socialActors.id })
    .from(socialActors)
    .where(eq(socialActors.id, actorId))
    .limit(1)
    .for('key share');
  return !!actor;
}

/** Lock the parent before its membership, so leaving/removal and group deletion
 * cannot commit between authorization and a chat read/write. */
async function roomFor(
  handle: string,
  actorId: string,
  reader: Reader
): Promise<GroupChatRoom | null> {
  const [group] = await reader
    .select({
      id: socialGroups.id,
      actorId: socialGroups.actorId,
      handle: groupActor.username,
      name: groupActor.name,
      iconUrl: groupActor.iconUrl,
      memberCount: socialGroups.memberCount,
      visibility: socialGroups.visibility,
    })
    .from(socialGroups)
    .innerJoin(groupActor, eq(groupActor.id, socialGroups.actorId))
    .where(
      and(
        eq(groupActor.username, handle),
        eq(groupActor.domain, getFederationDomain()),
        eq(groupActor.type, 'Group')
      )
    )
    .limit(1)
    .for('key share', { of: socialGroups });
  if (!group) return null;
  const [member] = await reader
    .select({ role: socialGroupMembers.role })
    .from(socialGroupMembers)
    .where(
      and(
        eq(socialGroupMembers.groupId, group.id),
        eq(socialGroupMembers.actorId, actorId),
        eq(socialGroupMembers.status, 'active')
      )
    )
    .limit(1)
    .for('share');
  return member
    ? { ...group, name: group.name || group.handle, role: member.role }
    : null;
}

function visibleMessages(actorId: string, hidden: string[], now: Date) {
  return and(
    isNull(socialGroupChatMessages.deletedAt),
    gt(socialGroupChatMessages.expiresAt, now),
    hidden.length
      ? notInArray(socialGroupChatMessages.actorId, hidden)
      : undefined,
    sql`EXISTS (SELECT 1 FROM social_group_members chat_membership
      WHERE chat_membership.group_id = ${socialGroupChatMessages.groupId}
        AND chat_membership.actor_id = ${actorId}
        AND chat_membership.status = 'active')`
  );
}

const messageColumns = {
  id: socialGroupChatMessages.id,
  groupId: socialGroupChatMessages.groupId,
  actorId: socialGroupChatMessages.actorId,
  clientId: socialGroupChatMessages.clientId,
  body: socialGroupChatMessages.body,
  attachments: socialGroupChatMessages.attachments,
  createdAt: socialGroupChatMessages.createdAt,
  expiresAt: socialGroupChatMessages.expiresAt,
  username: author.username,
  domain: author.domain,
  name: author.name,
  iconUrl: author.iconUrl,
};
function messageQuery(reader: Reader) {
  return reader
    .select(messageColumns)
    .from(socialGroupChatMessages)
    .innerJoin(author, eq(author.id, socialGroupChatMessages.actorId));
}
type MessageRow = Awaited<ReturnType<typeof messageQuery>>[number];

async function displayMessage(
  row: MessageRow,
  viewer: string,
  role: GroupChatRoom['role']
): Promise<GroupChatMessage> {
  return {
    id: row.id,
    groupId: row.groupId,
    // Only the sender needs the retry nonce; other members cannot echo it to
    // reconcile somebody else's pending message.
    clientId: row.actorId === viewer ? row.clientId : null,
    actor: {
      id: row.actorId,
      username: row.username,
      domain: row.domain,
      name: row.name,
      iconUrl: row.iconUrl,
    },
    content: await renderStatusMarkdown(row.body),
    published: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    attachments: row.attachments.map((attachment, index) => ({
      ...attachment,
      id: `${row.id}-${index}`,
    })),
    canDelete: row.actorId === viewer || moderates(role),
  };
}

function parseInput(value: unknown): GroupChatInput | Failure {
  if (
    !isRecord(value) ||
    Object.keys(value).some(
      (key) => !['clientId', 'content', 'attachments'].includes(key)
    )
  ) {
    return fail('Invalid message fields.', 400);
  }
  if (
    typeof value.clientId !== 'string' ||
    !/^[A-Za-z0-9_-]{8,128}$/.test(value.clientId)
  ) {
    return fail('A valid message retry ID is required.', 400);
  }
  if (
    typeof value.content !== 'string' ||
    value.content.length > GROUP_CHAT_MAX_CONTENT
  ) {
    return fail(
      `Messages must be ${GROUP_CHAT_MAX_CONTENT} characters or fewer.`,
      400
    );
  }
  const supplied = value.attachments ?? [];
  if (
    !Array.isArray(supplied) ||
    supplied.length > GROUP_CHAT_MAX_ATTACHMENTS
  ) {
    return fail(
      `Attach no more than ${GROUP_CHAT_MAX_ATTACHMENTS} files.`,
      400
    );
  }
  const attachments: ChatAttachment[] = [];
  for (const attachment of supplied) {
    if (
      !isRecord(attachment) ||
      typeof attachment.type !== 'string' ||
      typeof attachment.mediaType !== 'string' ||
      typeof attachment.url !== 'string' ||
      attachment.mediaType.length > 128 ||
      attachment.url.length > 2048 ||
      !['image', 'audio', 'video'].includes(attachment.type) ||
      !attachment.mediaType.startsWith(`${attachment.type}/`) ||
      ![
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/avif',
        'image/gif',
        'audio/ogg',
        'audio/webm',
        'audio/mp4',
        'audio/wav',
        'video/mp4',
        'video/webm',
      ].includes(attachment.mediaType.split(';')[0]) ||
      (attachment.name != null &&
        (typeof attachment.name !== 'string' || attachment.name.length > 500))
    ) {
      return fail('Invalid attachment metadata.', 400);
    }
    let url: URL;
    try {
      url = new URL(attachment.url);
    } catch {
      return fail('Invalid attachment URL.', 400);
    }
    const base = (process.env.R2_PUBLIC_URL ?? '').replace(/\/+$/, '');
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      bucketKeysFor([url.href], base).length !== 1
    ) {
      return fail('Attachments must use Pana media storage.', 400);
    }
    const normalized: ChatAttachment = {
      type: attachment.type,
      mediaType: attachment.mediaType,
      url: url.href,
      name: typeof attachment.name === 'string' ? attachment.name.trim() : null,
    };
    for (const key of ['width', 'height'] as const) {
      if (attachment[key] != null) {
        const dimension = attachment[key];
        if (
          typeof dimension !== 'number' ||
          !Number.isInteger(dimension) ||
          dimension < 1 ||
          dimension > 10_000
        ) {
          return fail('Invalid attachment dimensions.', 400);
        }
        normalized[key] = dimension;
      }
    }
    if (attachment.peaks != null) {
      if (
        !Array.isArray(attachment.peaks) ||
        attachment.peaks.length > 256 ||
        !attachment.peaks.every(
          (peak: unknown) =>
            typeof peak === 'number' &&
            Number.isFinite(peak) &&
            peak >= 0 &&
            peak <= 1
        )
      ) {
        return fail('Invalid audio waveform.', 400);
      }
      normalized.peaks = attachment.peaks;
    }
    attachments.push(normalized);
  }
  const content = value.content.trim();
  if (!content && attachments.length === 0)
    return fail('Write a message or choose an attachment.', 400);
  return { clientId: value.clientId, content, attachments };
}

interface Cursor {
  at: Date;
  id: string;
}
function parseCursor(value: string): Cursor | null {
  if (value.length > 512) return null;
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (
    !isRecord(decoded) ||
    typeof decoded.at !== 'string' ||
    typeof decoded.id !== 'string' ||
    decoded.id.length === 0 ||
    decoded.id.length > 128
  )
    return null;
  const at = new Date(decoded.at);
  return Number.isFinite(at.getTime()) ? { at, id: decoded.id } : null;
}
function cursorFor(row: MessageRow) {
  return Buffer.from(
    JSON.stringify({ at: row.createdAt.toISOString(), id: row.id })
  ).toString('base64url');
}

export async function listGroupChats(actorId: string): Promise<GroupChatList> {
  const hidden = await getHiddenActorIds(actorId);
  const rooms = await db
    .select(roomColumns)
    .from(socialGroupMembers)
    .innerJoin(socialGroups, eq(socialGroups.id, socialGroupMembers.groupId))
    .innerJoin(groupActor, eq(groupActor.id, socialGroups.actorId))
    .where(
      and(
        eq(socialGroupMembers.actorId, actorId),
        eq(socialGroupMembers.status, 'active'),
        eq(groupActor.type, 'Group'),
        eq(groupActor.domain, getFederationDomain())
      )
    );
  const ids = rooms.map((room) => room.id);
  const latest = ids.length
    ? await db
        .selectDistinctOn([socialGroupChatMessages.groupId], messageColumns)
        .from(socialGroupChatMessages)
        .innerJoin(author, eq(author.id, socialGroupChatMessages.actorId))
        .where(
          and(
            inArray(socialGroupChatMessages.groupId, ids),
            visibleMessages(actorId, hidden, new Date())
          )
        )
        .orderBy(
          socialGroupChatMessages.groupId,
          desc(socialGroupChatMessages.createdAt),
          desc(socialGroupChatMessages.id)
        )
    : [];
  const last = new Map(latest.map((message) => [message.groupId, message]));
  const groups = await Promise.all(
    rooms.map(async (room) => {
      const message = last.get(room.id);
      return {
        ...room,
        name: room.name || room.handle,
        lastMessage: message
          ? await displayMessage(message, actorId, room.role)
          : null,
      };
    })
  );
  groups.sort(
    (a, b) =>
      (b.lastMessage?.published ?? '').localeCompare(
        a.lastMessage?.published ?? ''
      ) ||
      a.name.localeCompare(b.name) ||
      a.id.localeCompare(b.id)
  );
  return { groups, viewerActorId: actorId, localDomain: getFederationDomain() };
}

export async function readGroupChat(
  handle: string,
  actorId: string,
  options: { cursor?: string; limit?: number } = {}
): Promise<Result<GroupChatPage>> {
  const limit = options.limit ?? GROUP_CHAT_PAGE_SIZE;
  const cursor = options.cursor ? parseCursor(options.cursor) : undefined;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50 || cursor === null)
    return fail('Invalid message page.', 400);
  const hidden = await getHiddenActorIds(actorId);
  return db.transaction(async (tx) => {
    const group = await roomFor(handle, actorId, tx);
    if (!group) return fail();
    const rows = await messageQuery(tx)
      .where(
        and(
          eq(socialGroupChatMessages.groupId, group.id),
          visibleMessages(actorId, hidden, new Date()),
          cursor
            ? or(
                lt(socialGroupChatMessages.createdAt, cursor.at),
                and(
                  eq(socialGroupChatMessages.createdAt, cursor.at),
                  lt(socialGroupChatMessages.id, cursor.id)
                )
              )
            : undefined
        )
      )
      .orderBy(
        desc(socialGroupChatMessages.createdAt),
        desc(socialGroupChatMessages.id)
      )
      .limit(limit + 1);
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const nextCursor = hasMore ? cursorFor(page[page.length - 1]) : null;
    const messages = await Promise.all(
      page.reverse().map((row) => displayMessage(row, actorId, group.role))
    );
    return {
      success: true as const,
      data: {
        group,
        messages,
        nextCursor,
        viewerActorId: actorId,
        localDomain: getFederationDomain(),
      },
    };
  });
}

export async function sendGroupChatMessage(
  handle: string,
  actorId: string,
  value: unknown
): Promise<Result<GroupChatMessage>> {
  const input = parseInput(value);
  if ('success' in input) return input;
  const result = await db.transaction(async (tx) => {
    // Lock the author before membership so account deletion cannot strand a
    // write waiting on the same actor whose membership this transaction holds.
    if (!(await lockWriter(actorId, tx))) return fail();
    const group = await roomFor(handle, actorId, tx);
    if (!group) return fail();
    const now = new Date();
    const [inserted] = await tx
      .insert(socialGroupChatMessages)
      .values({
        groupId: group.id,
        actorId,
        clientId: input.clientId,
        body: input.content,
        attachments: input.attachments ?? [],
        createdAt: now,
        expiresAt: new Date(
          now.getTime() + GROUP_CHAT_EXPIRY_DAYS * 86_400_000
        ),
      })
      .onConflictDoNothing({
        target: [
          socialGroupChatMessages.groupId,
          socialGroupChatMessages.actorId,
          socialGroupChatMessages.clientId,
        ],
      })
      .returning({ id: socialGroupChatMessages.id });
    const [stored] = await tx
      .select({
        id: socialGroupChatMessages.id,
        deletedAt: socialGroupChatMessages.deletedAt,
        expiresAt: socialGroupChatMessages.expiresAt,
        samePayload: sql<boolean>`${socialGroupChatMessages.body} = ${input.content}
        AND ${socialGroupChatMessages.attachments} = ${JSON.stringify(input.attachments ?? [])}::jsonb`,
      })
      .from(socialGroupChatMessages)
      .where(
        and(
          eq(socialGroupChatMessages.groupId, group.id),
          eq(socialGroupChatMessages.actorId, actorId),
          eq(socialGroupChatMessages.clientId, input.clientId)
        )
      )
      .limit(1);
    if (!stored || stored.deletedAt || stored.expiresAt <= now)
      return fail('That message is no longer available.');
    if (!stored.samePayload) {
      return fail(
        'This retry ID was already used for a different message.',
        409
      );
    }
    const [row] = await messageQuery(tx)
      .where(eq(socialGroupChatMessages.id, stored.id))
      .limit(1);
    if (!row) throw new Error('Stored group message could not be read.');
    return {
      success: true as const,
      data: await displayMessage(row, actorId, group.role),
      inserted: !!inserted,
    };
  });
  if (!result.success) return result;
  if (result.inserted)
    await notifyGroupChat(result.data.groupId, {
      kind: 'message',
      messageId: result.data.id,
    });
  return { success: true, data: result.data };
}

export async function deleteGroupChatMessage(
  handle: string,
  actorId: string,
  messageId: string
): Promise<Result<{ id: string }>> {
  const result = await db.transaction(async (tx) => {
    if (!(await lockWriter(actorId, tx))) return fail();
    const group = await roomFor(handle, actorId, tx);
    if (!group) return fail();
    const [message] = await tx
      .select({
        actorId: socialGroupChatMessages.actorId,
        deletedAt: socialGroupChatMessages.deletedAt,
      })
      .from(socialGroupChatMessages)
      .where(
        and(
          eq(socialGroupChatMessages.groupId, group.id),
          eq(socialGroupChatMessages.id, messageId),
          gt(socialGroupChatMessages.expiresAt, new Date())
        )
      )
      .limit(1);
    if (!message) return fail('That message is no longer available.');
    if (message.actorId !== actorId && !moderates(group.role))
      return fail(
        'Only the author or a group moderator can remove this message.',
        403
      );
    if (!message.deletedAt) {
      await tx
        .update(socialGroupChatMessages)
        .set({ deletedAt: new Date(), deletedByActorId: actorId })
        .where(
          and(
            eq(socialGroupChatMessages.id, messageId),
            eq(socialGroupChatMessages.groupId, group.id),
            isNull(socialGroupChatMessages.deletedAt)
          )
        );
    }
    return {
      success: true as const,
      data: { id: messageId },
      groupId: group.id,
    };
  });
  if (!result.success) return result;
  await notifyGroupChat(result.groupId, { kind: 'message', messageId });
  return { success: true, data: result.data };
}
