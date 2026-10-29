'use client';

import { useState } from 'react';
import { ArrowUpRight, Search } from 'lucide-react';
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  actorMatchesTerm,
  normalizeSearchTerm,
} from '@/app/messages/_lib/search';
import {
  MOCK_CHAT_CONTACTS,
  type MockChatContact,
  type MockChatThread,
} from '../_data/mock-dm-chat';
import { ChatAvatar, ChatName } from './chat-primitives';
import styles from '@/components/messages/workspace.module.css';

export function NewMessageDialog({
  threads,
  onChoose,
  onCloseAutoFocus,
}: {
  threads: MockChatThread[];
  onChoose: (contact: MockChatContact) => void;
  onCloseAutoFocus: (event: Event) => void;
}) {
  const [query, setQuery] = useState('');
  const term = normalizeSearchTerm(query);
  const matches = MOCK_CHAT_CONTACTS.filter(({ id, person }) =>
    actorMatchesTerm({ id, name: person.name, username: person.handle }, term)
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
          Find a pana by name or handle. These are sample people; nothing is
          sent to a real account.
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
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
      </label>
      <div className="min-h-0 overflow-y-auto">
        <p className="text-pana-ink/55 mb-2 text-[10px] font-bold tracking-wider uppercase">
          {term ? `${matches.length} matching panas` : 'Your panas'}
        </p>
        <ul className="max-h-[42dvh] space-y-1 overflow-y-auto">
          {matches.map((contact) => {
            const exists = threads.some((thread) => thread.id === contact.id);
            return (
              <li key={contact.id}>
                <button
                  type="button"
                  className="hover:bg-pana-butter-2/50 flex w-full items-center gap-3 rounded-xl p-2 text-left"
                  onClick={() => onChoose(contact)}
                >
                  <ChatAvatar person={contact.person} size={42} />
                  <span className="min-w-0 flex-1">
                    <ChatName person={contact.person} className="text-sm" />
                    <span className="text-pana-ink/60 mt-0.5 block truncate text-xs">
                      @{contact.person.handle}
                    </span>
                  </span>
                  <span className="text-pana-ink/50 flex items-center gap-1 text-[10px] font-semibold">
                    {exists ? 'Continue' : 'Say hello'}
                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {matches.length === 0 && (
          <p className="text-pana-ink/60 py-8 text-center text-sm">
            No panas match that. Try another name.
          </p>
        )}
      </div>
    </DialogContent>
  );
}
