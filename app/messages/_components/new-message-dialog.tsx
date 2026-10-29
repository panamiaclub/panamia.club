'use client';

import { useState } from 'react';
import { ArrowUpRight, Search } from 'lucide-react';
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import styles from '@/components/messages/workspace.module.css';
import { useDebounce } from '@/hooks/use-debounce';
import { usePanaSearch } from '@/lib/query/social';
import {
  filterConversations,
  newConversationCandidates,
  normalizeSearchTerm,
} from '../_lib/search';
import { messageError } from '../_lib/workspace';
import { ChatAvatar, ChatName, type ChatActor } from './chat-primitives';
import { actorHandle, remoteHost } from '../_lib/format';
import type { ListEntry } from './conversation-list';

export function NewMessageDialog({
  entries,
  viewerActorId,
  localDomain,
  onChoose,
  onCloseAutoFocus,
}: {
  entries: ListEntry[];
  viewerActorId: string | null;
  localDomain: string | null;
  onChoose: (actor: ChatActor) => void;
  onCloseAutoFocus: (event: Event) => void;
}) {
  const [query, setQuery] = useState('');
  const term = normalizeSearchTerm(query);
  const debouncedTerm = useDebounce(term, 200);
  const panas = usePanaSearch(debouncedTerm);
  const recent = filterConversations(entries, term).filter(
    (entry) => entry.actor.id !== viewerActorId
  );
  const candidates =
    term === debouncedTerm
      ? newConversationCandidates(panas.data ?? [], {
          existing: entries,
          viewerActorId,
        })
      : [];
  const searching = term !== debouncedTerm || panas.isFetching;

  const personRow = (actor: ChatActor, exists: boolean) => (
    <li key={actor.id}>
      <button
        type="button"
        className="hover:bg-pana-butter-2/50 flex w-full items-center gap-3 rounded-xl p-2 text-left"
        onClick={() => onChoose(actor)}
      >
        <ChatAvatar actor={actor} size={42} />
        <span className="min-w-0 flex-1">
          <ChatName
            actor={actor}
            remoteHost={remoteHost(actor, localDomain)}
            className="text-sm"
          />
          <span className="text-pana-ink/60 mt-0.5 block truncate text-xs">
            @{actorHandle(actor, localDomain)}
          </span>
        </span>
        <span className="text-pana-ink/55 flex items-center gap-1 text-[10px] font-semibold">
          {exists ? 'Continue' : 'Say hello'}
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      </button>
    </li>
  );

  return (
    <DialogContent
      onCloseAutoFocus={onCloseAutoFocus}
      className="text-pana-ink max-h-[85dvh] w-[calc(100%-2rem)] gap-5 rounded-2xl border-0 bg-white p-6 sm:max-w-md"
    >
      <DialogHeader className="text-left">
        <p className="text-pana-burnt mb-1 text-[10px] font-extrabold tracking-[0.14em] uppercase">
          Start something good
        </p>
        <DialogTitle className="text-2xl font-black tracking-tight">
          A new conversation.
        </DialogTitle>
        <DialogDescription className="text-pana-ink/65 text-xs leading-relaxed">
          Find a pana by name or handle, or pick up an existing conversation.
        </DialogDescription>
      </DialogHeader>
      <label className={styles.search}>
        <Search className="h-4 w-4 flex-none" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Name or @handle"
          aria-label="Find a pana"
          className="min-w-0 flex-1 bg-transparent text-base outline-none"
        />
      </label>
      <div className="max-h-[42dvh] min-h-0 overflow-y-auto">
        {recent.length > 0 && (
          <>
            <p className="text-pana-ink/55 mb-2 text-[10px] font-bold tracking-wider uppercase">
              {term ? 'Your conversations' : 'Recent conversations'}
            </p>
            <ul className="space-y-1">
              {recent.map((entry) => personRow(entry.actor, true))}
            </ul>
          </>
        )}
        {term ? (
          <div className={recent.length ? 'mt-4' : undefined}>
            <p className="text-pana-ink/55 mb-2 text-[10px] font-bold tracking-wider uppercase">
              Find a pana
            </p>
            {searching && (
              <p
                className="text-pana-ink/60 py-5 text-center text-sm"
                role="status"
              >
                Searching...
              </p>
            )}
            {!searching && panas.isError && (
              <div className={styles.inlineError} role="alert">
                {messageError(
                  panas.error,
                  'Could not find panas. Please try again.'
                )}
                <button type="button" onClick={() => panas.refetch()}>
                  Try again
                </button>
              </div>
            )}
            {!searching && !panas.isError && candidates.length === 0 && (
              <p className="text-pana-ink/60 py-5 text-center text-sm">
                {recent.length
                  ? 'No other panas match that.'
                  : 'No panas match that. Try another name.'}
              </p>
            )}
            <ul className="space-y-1">
              {candidates.map((pana) =>
                personRow(
                  {
                    id: pana.id,
                    username: pana.username,
                    name: pana.displayName,
                    iconUrl: pana.avatarUrl,
                    domain: localDomain ?? '',
                  },
                  false
                )
              )}
            </ul>
          </div>
        ) : (
          <p className="text-pana-ink/60 pt-4 text-xs leading-relaxed">
            Search by name or @handle to find someone new.
          </p>
        )}
      </div>
    </DialogContent>
  );
}
