import type { GroupChatConversation } from '@/lib/chat';
import type { SocialActorDisplay, SocialStatusDisplay } from '@/lib/interfaces';

export interface DirectInboxEntry {
  kind: 'direct';
  actor: Pick<
    SocialActorDisplay,
    'id' | 'username' | 'domain' | 'name' | 'iconUrl'
  >;
  lastMessage: SocialStatusDisplay | null;
  requestedAt?: string;
  startedAt?: string;
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
        ? (entry.lastMessage?.published ?? entry.requestedAt ?? entry.startedAt)
        : entry.group.lastMessage?.published;
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
