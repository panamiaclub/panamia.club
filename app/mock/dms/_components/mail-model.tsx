'use client';

import { useState } from 'react';
import { Inbox, Send, Clock, ShieldQuestion, Lock } from 'lucide-react';
import {
  MOCK_DM_THREADS,
  MOCK_DM_REQUESTS,
  threadSnippet,
  type MockDmThread,
} from '../_data/mock-dms';
import { DmAvatar, DmName, UnreadBadge } from './dm-primitives';

/* The MAIL model.
 *
 * Built on what already exists: a DM is a `socialStatuses` row addressed to
 * one actor, and a thread is its reply chain walked through `inReplyToId`.
 * Nothing new is stored.
 *
 * The design argues its own case. Messages are stacked letters with a sender
 * header and generous spacing, not bubbles - because a letter is a thing you
 * composed, and the layout should make composing feel normal rather than make
 * brevity feel normal. Times are absolute and day-grouped ("Tuesday at 9:14
 * AM"), which is what you want when the honest expectation is a reply
 * tomorrow.
 *
 * Deliberately absent: presence dots, typing indicators, read receipts. Not
 * because they are hard, but because promising them and not having them is
 * worse than not promising them. Mail's whole bargain is that nobody is
 * waiting. */
export function MailModel() {
  const [activeId, setActiveId] = useState<string>(MOCK_DM_THREADS[1].id);
  const [folder, setFolder] = useState<'inbox' | 'requests'>('inbox');

  const threads = folder === 'inbox' ? MOCK_DM_THREADS : MOCK_DM_REQUESTS;
  const active = threads.find((thread) => thread.id === activeId) ?? threads[0];

  return (
    <div className="grid gap-5 lg:grid-cols-[21rem_minmax(0,1fr)] lg:items-start">
      {/* Conversation list */}
      <aside className="profile-card overflow-hidden">
        <div className="border-pana-ink/14 flex gap-1 border-b-2 p-2">
          <FolderTab
            icon={Inbox}
            label="Inbox"
            count={MOCK_DM_THREADS.reduce((n, t) => n + t.unreadCount, 0)}
            active={folder === 'inbox'}
            onClick={() => {
              setFolder('inbox');
              setActiveId(MOCK_DM_THREADS[1].id);
            }}
          />
          <FolderTab
            icon={ShieldQuestion}
            label="Requests"
            count={MOCK_DM_REQUESTS.length}
            active={folder === 'requests'}
            onClick={() => {
              setFolder('requests');
              setActiveId(MOCK_DM_REQUESTS[0].id);
            }}
          />
        </div>

        <ul>
          {threads.map((thread) => {
            const isActive = thread.id === active?.id;
            return (
              <li
                key={thread.id}
                className="border-pana-ink/10 border-b last:border-b-0"
              >
                <button
                  type="button"
                  onClick={() => setActiveId(thread.id)}
                  className={`flex w-full items-start gap-3 px-3 py-3 text-left transition-colors ${
                    isActive ? 'bg-pana-butter-2' : 'hover:bg-pana-butter-2/50'
                  }`}
                >
                  <DmAvatar person={thread.person} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <DmName person={thread.person} />
                      <span className="text-pana-ink/45 flex-none text-[11px] font-bold">
                        {thread.lastActive}
                      </span>
                    </span>
                    {/* Two lines, not one. A mail list that truncates to a
                        single line is a chat list wearing a different font -
                        the point of mail is that you can triage from the
                        list without opening anything. */}
                    <span className="text-pana-ink/65 mt-0.5 line-clamp-2 block text-[13px] leading-snug font-medium">
                      {threadSnippet(thread)}
                    </span>
                  </span>
                  <UnreadBadge count={thread.unreadCount} />
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Reading pane */}
      <section className="profile-card overflow-hidden">
        {active && (
          <>
            <header className="border-pana-ink/14 flex items-center gap-3 border-b-2 px-5 py-4">
              <DmAvatar person={active.person} size={44} />
              <div className="min-w-0 flex-1">
                <DmName person={active.person} className="text-base" />
                <p className="text-pana-ink/55 truncate text-sm font-semibold">
                  @{active.person.handle}
                  {active.person.county ? ` · ${active.person.county}` : ''}
                </p>
              </div>
              {/* No presence. Mail does not claim to know. */}
              <span className="text-pana-ink/45 hidden items-center gap-1.5 text-xs font-bold sm:flex">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                Usually replies in a day
              </span>
            </header>

            {active.isRequest && <RequestBanner thread={active} />}

            <div>
              {active.messages.map((message) => (
                <article
                  key={message.id}
                  className="border-pana-ink/10 border-b px-5 py-5 last:border-b-0"
                >
                  <header className="mb-2 flex items-baseline gap-2">
                    <span className="text-pana-ink text-sm font-extrabold">
                      {message.from === 'me' ? 'You' : active.person.name}
                    </span>
                    {/* Absolute, not relative. "2h ago" is a chat affordance:
                        it implies you are meant to be current. */}
                    <span className="text-pana-ink/45 text-xs font-bold">
                      {message.day} at {message.time}
                    </span>
                  </header>

                  <p className="text-pana-ink/85 text-[15px] leading-relaxed font-medium whitespace-pre-line">
                    {message.body}
                  </p>
                </article>
              ))}
            </div>

            {!active.isRequest && (
              <footer className="border-pana-ink/14 border-t-2 p-4">
                {/* A block composer, sized for a paragraph. The size of the
                    input is the single loudest signal about what length of
                    message is expected, which is why this is tall and chat's
                    is a single line. */}
                <textarea
                  rows={4}
                  placeholder={`Write to ${active.person.name.split(' ')[0]}...`}
                  className="composer-prompt placeholder:text-pana-ink/40"
                />
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="text-pana-ink/45 flex items-center gap-1.5 text-xs font-bold">
                    <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                    Private to you and {active.person.name.split(' ')[0]}
                  </span>
                  <button
                    type="button"
                    className="bg-pana-indigo text-pana-cream flex items-center gap-2 rounded-full px-5 py-2 text-sm font-extrabold"
                  >
                    <Send className="h-4 w-4" aria-hidden="true" />
                    Send
                  </button>
                </div>
              </footer>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function FolderTab({
  icon: Icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: typeof Inbox;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-[13px] font-extrabold tracking-wide uppercase transition-colors ${
        active
          ? 'bg-pana-butter text-pana-ink'
          : 'text-pana-ink/55 hover:bg-pana-butter-2/60'
      }`}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
      {count > 0 && <span className="profile-tab-count">{count}</span>}
    </button>
  );
}

/* The C1 decision, made visible. Anette is not a Pana, so her message is here
   instead of the inbox and produced no notification. Accepting is an explicit
   act, and the buttons say what actually happens rather than "Accept/Decline",
   which tells you nothing about whether she learns the outcome. */
function RequestBanner({ thread }: { thread: MockDmThread }) {
  const first = thread.person.name.split(' ')[0];
  return (
    <div className="bg-pana-butter border-pana-ink/14 border-b-2 px-5 py-4">
      <p className="text-pana-ink text-sm font-extrabold">
        {first} is not one of your Panas
      </p>
      <p className="text-pana-ink/75 mt-1 text-sm font-medium">
        This message is waiting here instead of your inbox, and you were not
        notified. {first} cannot tell whether you have seen it.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="bg-pana-indigo text-pana-cream rounded-full px-4 py-1.5 text-sm font-extrabold"
        >
          Move to inbox
        </button>
        <button
          type="button"
          className="border-pana-ink/20 text-pana-ink rounded-full border-2 bg-white px-4 py-1.5 text-sm font-bold"
        >
          Delete without replying
        </button>
        <button
          type="button"
          className="border-pana-ink/20 text-pana-ink rounded-full border-2 bg-white px-4 py-1.5 text-sm font-bold"
        >
          Block {first}
        </button>
      </div>
    </div>
  );
}
