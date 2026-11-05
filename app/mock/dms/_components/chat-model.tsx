'use client';

import { useState } from 'react';
import { ArrowUp, Plus, ShieldQuestion, Search } from 'lucide-react';
import {
  MOCK_DM_THREADS,
  MOCK_DM_REQUESTS,
  groupMessages,
  threadSnippet,
  type MockDmThread,
} from '../_data/mock-dms';
import { DmAvatar, DmName, UnreadBadge } from './dm-primitives';

/* The CHAT model.
 *
 * Needs infrastructure that does not exist: a `chat_messages` table, a
 * Durable Object per room, and an authenticated websocket upgrade - the path
 * already sketched in docs/CHAT-ROADMAP.md, which is blocked on exactly the
 * question this mock exists to answer.
 *
 * The design argues its own case too. Bubbles, with yours on the right,
 * grouped when consecutive, and the clock time under the group rather than on
 * every line. Day separators instead of per-message dates. A single-line
 * composer, because the shape of the input is a promise about the length of
 * the reply.
 *
 * Your own bubble is indigo rather than the brand flame, and that is a
 * constraint rather than a taste: the contrast rule recorded in globals.css
 * measures cream on flame at 2.42:1, which fails even the 3:1 large-text bar.
 * Cream on indigo is 9.01:1. The warm colours in this palette carry ink text,
 * so the one colour that can hold a light-on-dark bubble is indigo.
 *
 * It also has to carry the things mail refuses to promise - presence and
 * typing - because without them this is just mail with rounded corners, and
 * with them it owes a websocket. That debt is the real decision. */
export function ChatModel() {
  const [activeId, setActiveId] = useState<string>(MOCK_DM_THREADS[0].id);
  const [showRequests, setShowRequests] = useState(false);

  const threads = showRequests ? MOCK_DM_REQUESTS : MOCK_DM_THREADS;
  const active = threads.find((t) => t.id === activeId) ?? threads[0];
  const groups = active ? groupMessages(active.messages) : [];

  return (
    <div className="profile-card overflow-hidden">
      <div className="grid lg:grid-cols-[19rem_minmax(0,1fr)]">
        {/* Conversation list */}
        <aside className="border-pana-ink/14 border-b-2 lg:border-r-2 lg:border-b-0">
          <div className="border-pana-ink/10 border-b p-3">
            <div className="bg-pana-butter-2/70 border-pana-ink/10 flex items-center gap-2 rounded-full border px-3 py-2">
              <Search
                className="text-pana-ink/40 h-4 w-4 flex-none"
                aria-hidden="true"
              />
              <span className="text-pana-ink/45 text-sm font-bold">
                Search messages
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setShowRequests(!showRequests);
              setActiveId(
                showRequests ? MOCK_DM_THREADS[0].id : MOCK_DM_REQUESTS[0].id
              );
            }}
            className="border-pana-ink/10 text-pana-ink/70 hover:bg-pana-butter-2/60 flex w-full items-center gap-2 border-b px-3 py-2.5 text-left text-[13px] font-extrabold tracking-wide uppercase"
          >
            <ShieldQuestion
              className="text-pana-ink/40 h-4 w-4"
              aria-hidden="true"
            />
            {showRequests ? 'Back to messages' : 'Message requests'}
            {!showRequests && <UnreadBadge count={MOCK_DM_REQUESTS.length} />}
          </button>

          <ul>
            {threads.map((thread) => {
              const isActive = thread.id === active?.id;
              return (
                <li key={thread.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(thread.id)}
                    className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                      isActive
                        ? 'bg-pana-butter-2'
                        : 'hover:bg-pana-butter-2/50'
                    }`}
                  >
                    {/* Presence, which only this model claims to know. */}
                    <DmAvatar
                      person={thread.person}
                      size={40}
                      online={thread.id === 'jdowns'}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <DmName person={thread.person} />
                        <span className="text-pana-ink/45 flex-none text-[11px] font-bold">
                          {thread.lastActive}
                        </span>
                      </span>
                      {/* One line. Chat lists are for recognising a person,
                          not for triaging content - you open the thread. */}
                      <span className="text-pana-ink/60 mt-0.5 block truncate text-[13px] font-medium">
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

        {/* Transcript */}
        <section className="flex min-h-[32rem] flex-col">
          {active && (
            <>
              <header className="border-pana-ink/14 flex items-center gap-3 border-b-2 px-5 py-3">
                <DmAvatar
                  person={active.person}
                  size={38}
                  online={active.id === 'jdowns'}
                />
                <div className="min-w-0 flex-1">
                  <DmName person={active.person} />
                  <p className="text-pana-ink/55 truncate text-xs font-bold">
                    {active.id === 'jdowns'
                      ? 'Active now'
                      : `Active ${active.lastActive}`}
                  </p>
                </div>
              </header>

              {active.isRequest && <RequestBar thread={active} />}

              <div className="bg-pana-cream/70 flex-1 space-y-1 px-5 py-5">
                {groups.map((group, groupIndex) => {
                  const mine = group[0].from === 'me';
                  const prior = groups[groupIndex - 1];
                  const showDay = !prior || prior[0].day !== group[0].day;

                  return (
                    <div key={group[0].id}>
                      {showDay && (
                        <div className="py-3 text-center">
                          <span className="bg-pana-ink/8 text-pana-ink/60 rounded-full px-3 py-1 text-[11px] font-extrabold">
                            {group[0].day}
                          </span>
                        </div>
                      )}

                      <div
                        className={`flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'}`}
                      >
                        {!mine && <DmAvatar person={active.person} size={28} />}
                        <div
                          className={`flex max-w-[78%] flex-col gap-1 ${mine ? 'items-end' : 'items-start'}`}
                        >
                          {group.map((message) => (
                            <div
                              key={message.id}
                              className={`rounded-2xl px-3.5 py-2 text-[15px] leading-relaxed font-medium whitespace-pre-line ${
                                mine
                                  ? 'bg-pana-indigo text-pana-cream'
                                  : 'border-pana-ink/14 text-pana-ink border-2 bg-white'
                              }`}
                            >
                              {message.body}
                            </div>
                          ))}
                          {/* One time per group, not per message. */}
                          <span className="text-pana-ink/45 px-1 text-[11px] font-bold">
                            {group[group.length - 1].time}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* The promise this model makes and mail does not. It is also
                    the reason this model needs a websocket: a typing dot that
                    is not live is a lie with an animation on it. */}
                {active.id === 'jdowns' && (
                  <div className="flex items-end gap-2 pt-2">
                    <DmAvatar person={active.person} size={28} />
                    <div className="border-pana-ink/14 flex gap-1 rounded-2xl border-2 bg-white px-3.5 py-3">
                      <Dot delay="0ms" />
                      <Dot delay="150ms" />
                      <Dot delay="300ms" />
                    </div>
                  </div>
                )}
              </div>

              {!active.isRequest && (
                <footer className="border-pana-ink/14 border-t-2 p-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="text-pana-ink/50 hover:bg-pana-butter-2 flex h-9 w-9 flex-none items-center justify-center rounded-full"
                      aria-label="Add attachment"
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                    <div className="bg-pana-butter-2/70 border-pana-ink/10 flex flex-1 items-center rounded-full border px-4 py-2">
                      <span className="text-pana-ink/45 text-sm font-bold">
                        Message
                      </span>
                    </div>
                    <button
                      type="button"
                      className="bg-pana-indigo text-pana-cream flex h-9 w-9 flex-none items-center justify-center rounded-full"
                      aria-label="Send"
                    >
                      <ArrowUp className="h-5 w-5" />
                    </button>
                  </div>
                </footer>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="bg-pana-ink/40 h-1.5 w-1.5 animate-bounce rounded-full"
      style={{ animationDelay: delay }}
    />
  );
}

/* Same decision as mail's banner, but the chat framing makes the cost of
   getting it wrong more obvious: in a model built around presence, an
   ungated stranger lands in a list that implies you are available. */
function RequestBar({ thread }: { thread: MockDmThread }) {
  const first = thread.person.name.split(' ')[0];
  return (
    <div className="bg-pana-butter border-pana-ink/14 border-b-2 px-5 py-3">
      <p className="text-pana-ink text-sm font-medium">
        <span className="font-extrabold">
          {first} is not one of your Panas.
        </span>{' '}
        Replying lets them message you from now on.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          className="bg-pana-indigo text-pana-cream rounded-full px-3.5 py-1.5 text-xs font-extrabold"
        >
          Accept
        </button>
        <button
          type="button"
          className="border-pana-ink/20 text-pana-ink rounded-full border-2 bg-white px-3.5 py-1.5 text-xs font-bold"
        >
          Delete
        </button>
        <button
          type="button"
          className="border-pana-ink/20 text-pana-ink rounded-full border-2 bg-white px-3.5 py-1.5 text-xs font-bold"
        >
          Block
        </button>
      </div>
    </div>
  );
}
