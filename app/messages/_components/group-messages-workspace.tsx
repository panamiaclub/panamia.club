'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Clock3, Search, SquarePen, Users } from 'lucide-react';
import { DialogTrigger } from '@/components/ui/dialog';
import { MessageAvatar } from '@/components/messages/message-avatar';
import styles from '@/components/messages/workspace.module.css';
import type { GroupChatConversation } from '@/lib/chat';
import { MessageFolders, type MessageFolder } from './message-folders';
import {
  GroupChatPlaceholder,
  GroupConversation,
  useGroupChatState,
} from './group-chat';
import { useGroupChats, useGroupChatThread } from '../_lib/group-chat-query';
import {
  conversationUnavailable,
  unconfirmedMessages,
  EMPTY_MESSAGE_DRAFT,
} from '../_lib/workspace';
import { conversationSnippet, lastActiveLabel } from '../_lib/format';
import { normalizeSearchTerm } from '../_lib/search';

export function GroupMessagesWorkspace({
  active,
  viewerActorId,
  initialHandle,
  requestCount,
  onChangeView,
  onAnnounce,
}: {
  active: boolean;
  viewerActorId: string | null;
  initialHandle?: string;
  requestCount: number;
  onChangeView: (view: MessageFolder) => void;
  onAnnounce: (message: string) => void;
}) {
  const groups = useGroupChats(active && !!viewerActorId);
  const [handle, setHandle] = useState<string | null>(initialHandle ?? null);
  const [detailOpen, setDetailOpen] = useState(!!initialHandle);
  const [query, setQuery] = useState('');
  const rowRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const conversationRef = useRef<HTMLElement>(null);
  const state = useGroupChatState(viewerActorId, onAnnounce);
  const thread = useGroupChatThread(handle, active && !!viewerActorId);
  const entries = conversationUnavailable(groups.error)
    ? []
    : (groups.data?.groups ?? []);
  const term = normalizeSearchTerm(query);
  const visible = entries.filter((group) =>
    [group.name, group.handle].some((value) =>
      normalizeSearchTerm(value).includes(term)
    )
  );
  const mismatch = !!groups.data && groups.data.viewerActorId !== viewerActorId;

  useEffect(() => {
    if (active && handle === null && entries.length)
      setHandle(entries[0].handle);
  }, [active, handle, entries]);

  const select = (next: string) => {
    setHandle(next);
    setDetailOpen(true);
    requestAnimationFrame(() =>
      conversationRef.current?.focus({ preventScroll: true })
    );
  };
  const back = () => {
    setDetailOpen(false);
    requestAnimationFrame(() =>
      (rowRef.current ?? searchRef.current)?.focus({ preventScroll: true })
    );
  };
  const preview = (group: GroupChatConversation) => {
    const draft = state.drafts[group.handle] ?? EMPTY_MESSAGE_DRAFT;
    if (draft.text.trim() || draft.gif || draft.isMirroring || draft.gifError) {
      return `Draft: ${draft.text || (draft.isMirroring ? 'Saving GIF...' : draft.gifError ? 'GIF not saved' : 'GIF')}`;
    }
    const pending = unconfirmedMessages(
      state.outgoing.filter((message) => message.handle === group.handle),
      group.lastMessage ? [group.lastMessage] : []
    );
    const latest = pending[pending.length - 1];
    if (latest && (latest.delivery !== 'sent' || !group.lastMessage)) {
      return `${latest.delivery === 'failed' ? 'Not sent' : latest.delivery === 'sending' ? 'Sending' : 'You'}: ${latest.content || 'Attachment'}`;
    }
    if (!group.lastMessage) return 'Say hello to the group.';
    const message = group.lastMessage;
    return message.actor.id === viewerActorId
      ? conversationSnippet(message, viewerActorId)
      : `${message.actor.name || message.actor.username}: ${conversationSnippet(message, viewerActorId)}`;
  };

  return (
    <div
      className={`profile-card ${styles.workspace}`}
      data-inactive={!active}
      data-group-workspace
    >
      <aside
        className={styles.sidebar}
        data-mobile-hidden={detailOpen}
        aria-label="Your group chats"
      >
        <div className="px-5 pt-6 pb-4">
          <p className="text-pana-ink/55 text-[10px] font-extrabold tracking-[0.16em] uppercase">
            A little closer
          </p>
          <h1 className="text-pana-ink mt-1 text-[28px] leading-tight font-black tracking-tight">
            Messages<span className="text-pana-burnt">.</span>
          </h1>
          <p className="text-pana-ink/60 mt-1 text-xs font-medium">
            Your people, your groups.
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
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a group chat"
              aria-label="Find a group chat by name or handle"
              className="min-w-0 flex-1 bg-transparent font-medium outline-none"
            />
          </label>
        </div>
        <MessageFolders
          view="groups"
          requestCount={requestCount}
          onChange={onChangeView}
        />
        <div className={styles.threadList}>
          {groups.isError && (
            <div className={styles.inlineError} role="alert">
              Could not load group chats.
              <button
                type="button"
                onClick={() => {
                  void groups.refetch();
                }}
              >
                Try again
              </button>
            </div>
          )}
          {groups.isLoading && (
            <p
              className="text-pana-ink/60 px-5 py-8 text-center text-sm"
              role="status"
            >
              Loading group chats...
            </p>
          )}
          {!viewerActorId && (
            <p className="text-pana-ink/65 px-5 py-5 text-sm">
              Open Pana Social to finish setting up messaging for this profile.
            </p>
          )}
          {mismatch ? (
            <div className={styles.inlineError} role="alert">
              Your active profile changed.
              <button type="button" onClick={() => window.location.reload()}>
                Reload Messages
              </button>
            </div>
          ) : (
            <ul aria-label="Group chats">
              {visible.map((group) => (
                <li key={group.id}>
                  <button
                    type="button"
                    className={styles.threadRow}
                    data-active={handle === group.handle}
                    aria-current={handle === group.handle ? 'true' : undefined}
                    ref={handle === group.handle ? rowRef : undefined}
                    onClick={() => select(group.handle)}
                  >
                    <MessageAvatar
                      identity={group.actorId}
                      name={group.name}
                      imageUrl={group.iconUrl}
                      size={44}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-pana-ink flex min-w-0 items-center gap-1.5 text-[13px] font-extrabold">
                          <span className="truncate">{group.name}</span>
                          <Users
                            className="text-pana-indigo/65 h-3.5 w-3.5 flex-none"
                            aria-hidden="true"
                          />
                        </span>
                        <span className="text-pana-ink/55 flex-none text-[10px]">
                          {lastActiveLabel(
                            group.lastMessage?.published ?? null
                          ) || 'New'}
                        </span>
                      </span>
                      <span className="text-pana-ink/65 mt-1 block truncate text-xs leading-relaxed">
                        {preview(group)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {viewerActorId &&
            !groups.isLoading &&
            !groups.isError &&
            !mismatch &&
            visible.length === 0 && (
              <div className="px-6 py-10 text-center">
                <Users
                  className="text-pana-indigo mx-auto mb-3 h-7 w-7"
                  aria-hidden="true"
                />
                <p className="text-sm font-bold">
                  {term
                    ? 'No matching group chats.'
                    : 'Your groups can talk here.'}
                </p>
                <p className="text-pana-ink/65 mt-2 text-xs leading-relaxed">
                  {term
                    ? 'Try another group name or handle.'
                    : 'Joining a group gives you access to its members-only chat.'}
                </p>
                <Link
                  href="/groups"
                  className="text-pana-indigo mt-3 inline-flex min-h-11 items-center text-xs font-extrabold underline"
                >
                  Find a group
                </Link>
              </div>
            )}
        </div>
        <p className="text-pana-ink/65 border-pana-ink/8 flex flex-none items-center gap-2 border-t px-5 py-4 text-[11px]">
          <Clock3 className="h-3.5 w-3.5 flex-none" aria-hidden="true" />
          Members-only, with a 30-day history.
        </p>
      </aside>
      <section
        ref={conversationRef}
        tabIndex={-1}
        className={styles.conversation}
        data-mobile-hidden={!detailOpen}
        aria-label="Open conversation"
      >
        {handle && !mismatch ? (
          <GroupConversation
            key={handle}
            handle={handle}
            viewerActorId={viewerActorId}
            thread={thread}
            state={state}
            enabled={active}
            detailOpen={detailOpen}
            onBack={back}
            conversationRef={conversationRef}
          />
        ) : (
          <GroupChatPlaceholder loading={groups.isLoading} onBack={back} />
        )}
      </section>
    </div>
  );
}
