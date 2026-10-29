'use client';

import { useState, type RefObject } from 'react';
import {
  Clock3,
  MessageCircle,
  Search,
  ShieldCheck,
  SquarePen,
} from 'lucide-react';
import { DialogTrigger } from '@/components/ui/dialog';
import {
  actorMatchesTerm,
  normalizeSearchTerm,
} from '@/app/messages/_lib/search';
import {
  threadSnippet,
  type MockChatDraft,
  type MockChatThread,
} from '../_data/mock-dm-chat';
import { ChatAvatar, ChatName } from './chat-primitives';
import styles from '@/components/messages/workspace.module.css';

export type MessageFolder = 'messages' | 'requests';

export function ConversationList({
  threads,
  folder,
  activeId,
  activeRowRef,
  drafts,
  requestCount,
  detailOpen,
  onSelect,
  onFolderChange,
}: {
  threads: MockChatThread[];
  folder: MessageFolder;
  activeId: string | null;
  activeRowRef: RefObject<HTMLButtonElement | null>;
  drafts: Record<string, MockChatDraft>;
  requestCount: number;
  detailOpen: boolean;
  onSelect: (id: string) => void;
  onFolderChange: (folder: MessageFolder) => void;
}) {
  const [query, setQuery] = useState('');
  const term = normalizeSearchTerm(query);
  const visible = threads.filter(({ id, person }) =>
    actorMatchesTerm({ id, name: person.name, username: person.handle }, term)
  );

  const changeFolder = (next: MessageFolder) => {
    setQuery('');
    onFolderChange(next);
  };

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
          <button type="button" className={styles.newMessage}>
            <SquarePen className="h-4 w-4" aria-hidden="true" />
            New message
          </button>
        </DialogTrigger>
        <label className={styles.search}>
          <Search className="h-4 w-4 flex-none" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a conversation"
            aria-label="Find a conversation by name or handle"
            className="min-w-0 flex-1 bg-transparent text-xs font-medium outline-none"
          />
        </label>
      </div>

      <div className={styles.folders} role="group" aria-label="Message folders">
        <button
          type="button"
          aria-pressed={folder === 'messages'}
          onClick={() => changeFolder('messages')}
        >
          <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
          Messages
        </button>
        <button
          type="button"
          aria-pressed={folder === 'requests'}
          onClick={() => changeFolder('requests')}
        >
          Requests <span className="font-medium">({requestCount})</span>
        </button>
      </div>

      <div className={styles.threadList}>
        {folder === 'requests' && (
          <p className="text-pana-ink/65 flex gap-2 px-4 pt-4 pb-2 text-xs leading-relaxed">
            <ShieldCheck
              className="text-pana-indigo mt-0.5 h-4 w-4 flex-none"
              aria-hidden="true"
            />
            Your space, your choice. Read a request before deciding to accept
            it.
          </p>
        )}
        {visible.length === 0 && (
          <div className="px-6 py-10 text-center">
            <MessageCircle
              className="text-pana-ink/30 mx-auto mb-3 h-7 w-7"
              aria-hidden="true"
            />
            <p className="text-pana-ink/75 text-sm font-bold">
              {term
                ? 'No matching conversations.'
                : folder === 'requests'
                  ? 'All quiet here.'
                  : 'Your conversations will live here.'}
            </p>
            <p className="text-pana-ink/55 mt-1 text-xs leading-relaxed">
              {term
                ? 'Try a name or @handle.'
                : folder === 'requests'
                  ? 'New message requests will appear in this folder.'
                  : 'Choose New message to say hello to a pana.'}
            </p>
          </div>
        )}
        <ul
          aria-label={
            folder === 'requests' ? 'Message requests' : 'Conversations'
          }
        >
          {visible.map((thread) => {
            const draft = drafts[thread.id];
            const hasDraft = !!(draft?.text.trim() || draft?.gif);
            const last = thread.messages[thread.messages.length - 1];
            return (
              <li key={thread.id}>
                <button
                  type="button"
                  className={styles.threadRow}
                  ref={thread.id === activeId ? activeRowRef : undefined}
                  data-active={thread.id === activeId}
                  aria-current={thread.id === activeId ? 'true' : undefined}
                  onClick={() => onSelect(thread.id)}
                >
                  <ChatAvatar person={thread.person} size={44} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <ChatName
                        person={thread.person}
                        className="text-[13px]"
                      />
                      <span className="text-pana-ink/50 flex-none text-[10px] font-medium">
                        {thread.lastActive}
                      </span>
                    </span>
                    <span className="text-pana-ink/60 mt-1 block truncate text-xs leading-relaxed">
                      {hasDraft ? (
                        <>
                          <span className="text-pana-red-deep font-bold">
                            Draft:{' '}
                          </span>
                          {draft.text || 'GIF'}
                        </>
                      ) : last?.delivery === 'failed' ? (
                        <span className="text-pana-red-deep">
                          Not sent: {threadSnippet(thread)}
                        </span>
                      ) : (
                        threadSnippet(thread) || 'Say a little hello.'
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
