'use client';

import type { RefObject } from 'react';
import { Clock3, MessageCircle, ShieldCheck, Users } from 'lucide-react';
import { MessageFolders, type MessageFolder } from './message-folders';
import styles from '@/components/messages/workspace.module.css';
import type { GroupChatOutgoing } from '@/lib/chat';
import { ChatAvatar, ChatName } from './chat-primitives';
import {
  conversationSnippet,
  expiresToday,
  lastActiveLabel,
  remoteHost,
} from '../_lib/format';
import { inboxKey, inboxSelection, type InboxEntry } from '../_lib/inbox';
import {
  unconfirmedMessages,
  messageDraftPreview,
  type MessageDraft,
  type OutgoingMessage,
} from '../_lib/workspace';

export type { MessageFolder } from './message-folders';

export interface InboxIssue {
  id: string;
  message: string;
  onRetry: () => void;
}

export function ConversationList({
  entries,
  view,
  onChangeView,
  viewerActorId,
  localDomain,
  activeKey,
  activeRowRef,
  listRef,
  requestCount,
  onSelect,
  isLoading,
  issues,
  detailOpen,
  drafts,
  outgoing,
  groupDrafts,
  groupOutgoing,
}: {
  entries: InboxEntry[];
  view: MessageFolder;
  onChangeView: (view: MessageFolder) => void;
  viewerActorId: string | null;
  localDomain: string | null;
  activeKey: string | null;
  activeRowRef: RefObject<HTMLButtonElement | null>;
  listRef: RefObject<HTMLElement | null>;
  requestCount: number;
  onSelect: (entry: InboxEntry) => void;
  isLoading: boolean;
  issues: InboxIssue[];
  detailOpen: boolean;
  drafts: Record<string, MessageDraft>;
  outgoing: OutgoingMessage[];
  groupDrafts: Record<string, MessageDraft>;
  groupOutgoing: GroupChatOutgoing[];
}) {
  const latestOutgoing = new Map(
    outgoing.map((message) => [message.recipientActorId, message])
  );
  const expiring = entries.filter((entry) => {
    const message =
      entry.kind === 'direct' ? entry.lastMessage : entry.group.lastMessage;
    return message && expiresToday(message.expiresAt);
  }).length;

  return (
    <aside
      ref={listRef}
      tabIndex={-1}
      className={styles.sidebar}
      data-mobile-hidden={detailOpen}
      aria-label="Your messages"
    >
      <h1 className="sr-only">Messages</h1>
      <MessageFolders
        view={view}
        requestCount={requestCount}
        onChange={onChangeView}
      />
      <div className={styles.threadList}>
        {issues.map((issue) => (
          <div key={issue.id} className={styles.inlineError} role="alert">
            {issue.message}
            <button type="button" onClick={issue.onRetry}>
              Try again
            </button>
          </div>
        ))}
        {view === 'requests' && (
          <p className="text-pana-ink/65 flex gap-2 px-4 pt-4 pb-2 text-xs leading-relaxed">
            <ShieldCheck
              className="text-pana-indigo mt-0.5 h-4 w-4 flex-none"
              aria-hidden="true"
            />
            Your space, your choice. Read a request before deciding to accept
            it.
          </p>
        )}
        {expiring > 0 && (
          <p className="bg-pana-butter text-pana-ink mx-1 mb-2 rounded-lg px-3 py-2 text-[11px] leading-relaxed">
            {expiring === 1
              ? '1 conversation has messages disappearing today.'
              : `${expiring} conversations have messages disappearing today.`}
          </p>
        )}
        {isLoading && (
          <p
            className="text-pana-ink/60 px-5 py-8 text-center text-sm"
            role="status"
          >
            Loading conversations...
          </p>
        )}
        {!isLoading && issues.length === 0 && entries.length === 0 && (
          <div className="px-6 py-10 text-center">
            <MessageCircle
              className="text-pana-ink/30 mx-auto mb-3 h-7 w-7"
              aria-hidden="true"
            />
            <p className="text-pana-ink/75 text-sm font-bold">
              {view === 'requests'
                ? 'All quiet here.'
                : 'Your conversations will live here.'}
            </p>
            <p className="text-pana-ink/60 mt-1 text-xs leading-relaxed">
              {view === 'requests'
                ? 'New message requests will appear in this folder.'
                : "Open a pana's profile to say hello. Your group chats appear here too."}
            </p>
          </div>
        )}
        <ul
          aria-label={
            view === 'requests' ? 'Message requests' : 'Conversations'
          }
        >
          {entries.map((entry) => {
            const selection = inboxSelection(entry);
            const key = inboxKey(selection);
            const actor =
              entry.kind === 'direct'
                ? entry.actor
                : {
                    id: entry.group.actorId,
                    username: entry.group.handle,
                    name: entry.group.name,
                    iconUrl: entry.group.iconUrl,
                    domain: localDomain ?? '',
                  };
            const lastMessage =
              entry.kind === 'direct'
                ? entry.lastMessage
                : entry.group.lastMessage;
            const encrypted =
              entry.kind === 'direct'
                ? !!entry.encryptedRoomId
                : !!entry.group.encryptedRoomId;
            const encryptedUpdatedAt =
              entry.kind === 'direct'
                ? entry.encryptedUpdatedAt
                : entry.group.encryptedUpdatedAt;
            const draft =
              entry.kind === 'direct'
                ? drafts[entry.actor.id]
                : groupDrafts[entry.group.handle];
            const draftPreview = draft ? messageDraftPreview(draft) : null;
            const latest =
              entry.kind === 'direct'
                ? latestOutgoing.get(entry.actor.id)
                : unconfirmedMessages(
                    groupOutgoing.filter(
                      (message) => message.handle === entry.group.handle
                    ),
                    lastMessage ? [lastMessage] : []
                  ).at(-1);
            // Acknowledged local bubbles must not hide a newer server reply.
            const localMessage =
              latest?.delivery === 'sent' && lastMessage ? undefined : latest;
            const selected = key === activeKey;
            return (
              <li key={key}>
                <button
                  type="button"
                  className={styles.threadRow}
                  ref={selected ? activeRowRef : undefined}
                  data-active={selected}
                  data-conversation-kind={entry.kind}
                  aria-current={selected ? 'true' : undefined}
                  onClick={() => onSelect(entry)}
                >
                  <ChatAvatar actor={actor} size={44} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <ChatName
                          actor={actor}
                          remoteHost={
                            entry.kind === 'direct'
                              ? remoteHost(actor, localDomain)
                              : null
                          }
                          className="text-[13px]"
                        />
                        {entry.kind === 'group' && (
                          <span className="text-pana-indigo/65">
                            <Users className="h-3.5 w-3.5" aria-hidden="true" />
                            <span className="sr-only">Group chat</span>
                          </span>
                        )}
                      </span>
                      <span className="text-pana-ink/50 flex-none text-[10px] font-medium">
                        {lastActiveLabel(
                          encryptedUpdatedAt ??
                            lastMessage?.published ??
                            (entry.kind === 'direct'
                              ? (entry.requestedAt ?? entry.startedAt)
                              : null) ??
                            null
                        ) || 'New'}
                      </span>
                    </span>
                    <span className="text-pana-ink/60 mt-1 block truncate text-xs leading-relaxed">
                      {draftPreview ? (
                        <>
                          <span className="text-pana-red-deep font-bold">
                            Draft:{' '}
                          </span>
                          {draftPreview}
                        </>
                      ) : localMessage ? (
                        <span
                          className={
                            localMessage.delivery === 'failed'
                              ? 'text-pana-red-deep'
                              : undefined
                          }
                        >
                          {localMessage.delivery === 'failed'
                            ? 'Not sent: '
                            : localMessage.delivery === 'sending'
                              ? 'Sending: '
                              : 'You: '}
                          {localMessage.content || 'GIF'}
                        </span>
                      ) : encrypted ? (
                        'End-to-end encrypted conversation'
                      ) : lastMessage ? (
                        <>
                          {entry.kind === 'group' &&
                            lastMessage.actor.id !== viewerActorId &&
                            `${lastMessage.actor.name || lastMessage.actor.username}: `}
                          {conversationSnippet(lastMessage, viewerActorId)}
                        </>
                      ) : view === 'requests' ? (
                        'No messages remaining in the 30-day window.'
                      ) : entry.kind === 'group' ? (
                        'Say hello to the group.'
                      ) : (
                        'Say a little hello.'
                      )}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <p className="text-pana-ink/60 border-pana-ink/8 flex flex-none items-center gap-2 border-t px-5 py-4 text-[11px] leading-relaxed">
        <Clock3 className="h-3.5 w-3.5 flex-none" aria-hidden="true" />A 30-day
        window for your conversations.
      </p>
    </aside>
  );
}
