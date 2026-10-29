'use client';

import type { RefObject } from 'react';
import {
  Clock3,
  MessageCircle,
  Search,
  ShieldCheck,
  SquarePen,
} from 'lucide-react';
import { DialogTrigger } from '@/components/ui/dialog';
import { MessageFolders, type MessageFolder } from './message-folders';
import styles from '@/components/messages/workspace.module.css';
import type { SocialStatusDisplay } from '@/lib/interfaces';
import { ChatAvatar, ChatName, type ChatActor } from './chat-primitives';
import {
  conversationSnippet,
  expiresToday,
  lastActiveLabel,
  remoteHost,
} from '../_lib/format';
import { filterConversations, normalizeSearchTerm } from '../_lib/search';
import type { MessageDraft, OutgoingMessage } from '../_lib/workspace';

export type { MessageFolder } from './message-folders';

export interface ListEntry {
  actor: ChatActor;
  lastMessage: SocialStatusDisplay | null;
  requestedAt?: string;
}

export function ConversationList({
  entries,
  view,
  onChangeView,
  viewerActorId,
  localDomain,
  activeActorId,
  activeRowRef,
  requestCount,
  onSelect,
  isLoading,
  error,
  onRetry,
  detailOpen,
  drafts,
  outgoing,
  query,
  onQueryChange,
}: {
  entries: ListEntry[];
  view: MessageFolder;
  onChangeView: (view: MessageFolder) => void;
  viewerActorId: string | null;
  localDomain: string | null;
  activeActorId: string | null;
  activeRowRef: RefObject<HTMLButtonElement | null>;
  requestCount: number;
  onSelect: (actorId: string) => void;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  detailOpen: boolean;
  drafts: Record<string, MessageDraft>;
  outgoing: OutgoingMessage[];
  query: string;
  onQueryChange: (value: string) => void;
}) {
  const term = normalizeSearchTerm(query);
  const visible = filterConversations(entries, term);
  const latestOutgoing = new Map(
    outgoing.map((message) => [message.recipientActorId, message])
  );
  const expiring = visible.filter(
    (entry) => entry.lastMessage && expiresToday(entry.lastMessage.expiresAt)
  ).length;

  return (
    <aside
      className={styles.sidebar}
      data-mobile-hidden={detailOpen}
      aria-label="Your messages"
    >
      <div className="px-5 pt-6 pb-4">
        <p className="text-pana-ink/55 text-[10px] font-extrabold tracking-[0.16em] uppercase">
          A little closer
        </p>
        <h1 className="text-pana-ink mt-1 text-[28px] leading-tight font-black tracking-tight">
          Messages<span className="text-pana-burnt">.</span>
        </h1>
        <p className="text-pana-ink/60 mt-1 text-xs font-medium">
          Good conversations start here.
        </p>
        <DialogTrigger asChild>
          <button
            type="button"
            className={styles.newMessage}
            disabled={!viewerActorId}
          >
            <SquarePen className="h-4 w-4" aria-hidden="true" />
            New message
          </button>
        </DialogTrigger>
        <label className={styles.search}>
          <Search className="h-4 w-4 flex-none" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Find a conversation"
            aria-label="Find a conversation by name or handle"
            className="min-w-0 flex-1 bg-transparent text-xs font-medium outline-none"
          />
        </label>
      </div>

      <MessageFolders
        view={view}
        requestCount={requestCount}
        onChange={onChangeView}
      />

      <div className={styles.threadList}>
        {error && (
          <div className={styles.inlineError} role="alert">
            {error}
            <button type="button" onClick={onRetry}>
              Try again
            </button>
          </div>
        )}
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
        {!isLoading && !error && visible.length === 0 && (
          <div className="px-6 py-10 text-center">
            <MessageCircle
              className="text-pana-ink/30 mx-auto mb-3 h-7 w-7"
              aria-hidden="true"
            />
            <p className="text-pana-ink/75 text-sm font-bold">
              {term
                ? 'No matching conversations.'
                : view === 'requests'
                  ? 'All quiet here.'
                  : 'Your conversations will live here.'}
            </p>
            <p className="text-pana-ink/60 mt-1 text-xs leading-relaxed">
              {term
                ? 'Try a name or @handle, or choose New message to find someone new.'
                : view === 'requests'
                  ? 'New message requests will appear in this folder.'
                  : 'Choose New message to say hello to a pana.'}
            </p>
          </div>
        )}
        <ul
          aria-label={
            view === 'requests' ? 'Message requests' : 'Conversations'
          }
        >
          {visible.map((entry) => {
            const actor = entry.actor;
            const draft = drafts[actor.id];
            const hasDraft = !!(
              draft?.text.trim() ||
              draft?.gif ||
              draft?.isMirroring ||
              draft?.gifError
            );
            const latest = latestOutgoing.get(actor.id);
            // Acknowledged local bubbles must not hide a newer server reply.
            const localMessage =
              latest?.delivery === 'sent' && entry.lastMessage
                ? undefined
                : latest;
            return (
              <li key={actor.id}>
                <button
                  type="button"
                  className={styles.threadRow}
                  ref={actor.id === activeActorId ? activeRowRef : undefined}
                  data-active={actor.id === activeActorId}
                  aria-current={actor.id === activeActorId ? 'true' : undefined}
                  onClick={() => onSelect(actor.id)}
                >
                  <ChatAvatar actor={actor} size={44} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <ChatName
                        actor={actor}
                        remoteHost={remoteHost(actor, localDomain)}
                        className="text-[13px]"
                      />
                      <span className="text-pana-ink/50 flex-none text-[10px] font-medium">
                        {lastActiveLabel(
                          entry.lastMessage?.published ??
                            entry.requestedAt ??
                            null
                        ) || 'New'}
                      </span>
                    </span>
                    <span className="text-pana-ink/60 mt-1 block truncate text-xs leading-relaxed">
                      {hasDraft ? (
                        <>
                          <span className="text-pana-red-deep font-bold">
                            Draft:{' '}
                          </span>
                          {draft.text ||
                            (draft.isMirroring
                              ? 'Saving GIF...'
                              : draft.gifError
                                ? 'GIF not saved'
                                : 'GIF')}
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
                      ) : entry.lastMessage ? (
                        conversationSnippet(entry.lastMessage, viewerActorId)
                      ) : view === 'requests' ? (
                        'No messages remaining in the 30-day window.'
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
