import type { GroupChatConversation } from '@/lib/chat';
import type { SocialActorDisplay, SocialStatusDisplay } from '@/lib/interfaces';
import type { EncryptedRoomList } from '@/lib/e2ee/client-contract';

export interface DirectInboxEntry {
  kind: 'direct';
  actor: Pick<
    SocialActorDisplay,
    'id' | 'username' | 'domain' | 'name' | 'iconUrl'
  >;
  lastMessage: SocialStatusDisplay | null;
  requestedAt?: string;
  startedAt?: string;
  encryptedRoomId?: string;
  encryptedUpdatedAt?: string;
}

export type InboxEntry =
  DirectInboxEntry | { kind: 'group'; group: GroupChatConversation };

export interface InboxSelection {
  kind: InboxEntry['kind'];
  id: string;
}

export function inboxSelection(entry: InboxEntry): InboxSelection {
  return {
    kind: entry.kind,
    id: entry.kind === 'direct' ? entry.actor.id : entry.group.handle,
  };
}

export function inboxKey(selection: InboxSelection): string {
  return `${selection.kind}:${selection.id}`;
}

export function mergeInboxEntries(
  direct: DirectInboxEntry[],
  groups: GroupChatConversation[]
): InboxEntry[] {
  const entries: InboxEntry[] = [
    ...direct,
    ...groups.map<InboxEntry>((group) => ({ kind: 'group', group })),
  ];
  const activity = (entry: InboxEntry) => {
    const published =
      entry.kind === 'direct'
        ? (entry.encryptedUpdatedAt ??
          entry.lastMessage?.published ??
          entry.requestedAt ??
          entry.startedAt)
        : (entry.group.encryptedUpdatedAt ??
          entry.group.lastMessage?.published);
    return published ? new Date(published).getTime() : 0;
  };
  return entries.sort(
    (a, b) =>
      activity(b) - activity(a) ||
      inboxKey(inboxSelection(a)).localeCompare(inboxKey(inboxSelection(b)))
  );
}

export function directMessageHref(actorId: string): string {
  return `/messages?${new URLSearchParams({ to: actorId })}`;
}

export function mergeEncryptedDirectEntries(
  entries: DirectInboxEntry[],
  rooms: EncryptedRoomList,
  folder: 'inbox' | 'requests'
) {
  const result = new Map(entries.map((entry) => [entry.actor.id, entry]));
  for (const room of rooms) {
    if (room.kind !== 'dm' || !room.peer) continue;
    if (room.folder !== folder) {
      result.delete(room.peer.id);
      continue;
    }
    const previous = result.get(room.peer.id);
    result.set(room.peer.id, {
      ...previous,
      kind: 'direct',
      actor: room.peer,
      lastMessage: previous?.lastMessage ?? null,
      encryptedRoomId: room.id,
      encryptedUpdatedAt: room.updatedAt,
      ...(folder === 'requests'
        ? { requestedAt: previous?.requestedAt ?? room.updatedAt }
        : {}),
    });
  }
  return [...result.values()];
}
