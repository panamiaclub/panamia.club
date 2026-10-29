'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  Clock3,
  Globe,
  Info,
  MessageCircle,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import {
  groupMessages,
  REFUSAL_COPY,
  type MockChatMessage,
  type MockChatThread,
} from '../_data/mock-dm-chat';
import {
  ChatAvatar,
  ChatName,
  ChatWaveform,
  DeliveryMark,
  ExpiryChip,
  GifArt,
} from './chat-primitives';
import styles from '@/components/messages/workspace.module.css';

export function Transcript({
  thread,
  detailOpen,
  onBack,
  onAccept,
  onDelete,
  onRetry,
}: {
  thread: MockChatThread;
  detailOpen: boolean;
  onBack: () => void;
  onAccept: () => void;
  onDelete: () => void;
  onRetry: (messageId: string) => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [newMessages, setNewMessages] = useState(0);
  const historyRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const lastIdRef = useRef<string | null>(null);
  const detailWasOpenRef = useRef(false);
  const messages = thread.messages;
  const groups = groupMessages(messages);

  const jumpToLatest = () => {
    const history = historyRef.current;
    if (!history) return;
    history.scrollTop = history.scrollHeight;
    nearBottomRef.current = true;
    setAtBottom(true);
    setNewMessages(0);
  };

  useLayoutEffect(() => {
    const history = historyRef.current;
    if (!history) return;
    const last = messages[messages.length - 1];
    const appended = !!last && last.id !== lastIdRef.current;
    const opening = detailOpen && !detailWasOpenRef.current;

    if (
      lastIdRef.current === null ||
      opening ||
      nearBottomRef.current ||
      (appended && last.from === 'me')
    ) {
      history.scrollTop = history.scrollHeight;
      nearBottomRef.current = true;
      setAtBottom(true);
      setNewMessages(0);
    } else if (appended && last.from === 'them') {
      setNewMessages((count) => count + 1);
    }

    lastIdRef.current = last?.id ?? null;
    detailWasOpenRef.current = detailOpen;
  }, [messages, detailOpen]);

  useEffect(() => {
    const history = historyRef.current;
    if (!history) return;
    const observer = new ResizeObserver(() => {
      if (nearBottomRef.current) history.scrollTop = history.scrollHeight;
    });
    observer.observe(history);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <header className={styles.conversationHeader}>
        <button
          type="button"
          className={`${styles.iconButton} ${styles.backButton}`}
          aria-label="Back to conversations"
          onClick={onBack}
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <ChatAvatar person={thread.person} size={42} />
        <div className="min-w-0 flex-1">
          <ChatName person={thread.person} className="text-[15px]" />
          <p className="text-pana-ink/55 mt-0.5 truncate text-[11px] font-medium">
            @{thread.person.handle}
          </p>
        </div>
        <span className="text-pana-ink/55 bg-pana-cream hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-semibold lg:inline-flex">
          <Clock3 className="h-3 w-3" aria-hidden="true" />
          30-day history
        </span>
        <button
          type="button"
          className={styles.iconButton}
          aria-label="Conversation details"
          aria-expanded={detailsOpen}
          onClick={() => setDetailsOpen((open) => !open)}
        >
          <Info className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>
      </header>

      {detailsOpen && (
        <div className="border-pana-ink/8 bg-pana-cream flex-none space-y-1 border-b px-6 py-3 text-xs leading-relaxed">
          <p className="font-bold">A little space, not a forever archive.</p>
          <p className="text-pana-ink/65">
            Each message disappears from view 30 days after it is sent. Sent
            means acknowledged, not read. There are no read receipts or online
            indicators.
          </p>
        </div>
      )}
      {thread.gate === 'hold' && (
        <HeldBanner thread={thread} onAccept={onAccept} onDelete={onDelete} />
      )}
      {thread.person.remoteHost && (
        <FederationBanner host={thread.person.remoteHost} />
      )}
      <div className={styles.historyArea}>
        <div
          ref={historyRef}
          className={styles.history}
          role="log"
          aria-label={`Conversation with ${thread.person.name}`}
          aria-live="off"
          tabIndex={0}
          onScroll={() => {
            const history = historyRef.current;
            if (!history) return;
            const near =
              history.scrollHeight - history.scrollTop - history.clientHeight <
              72;
            nearBottomRef.current = near;
            setAtBottom(near);
            if (near) setNewMessages(0);
          }}
        >
          {messages.length === 0 && (
            <div className="flex h-full min-h-40 flex-col items-center justify-center px-4 text-center">
              <span className="bg-pana-butter-2 mb-4 grid h-14 w-14 place-items-center rounded-[20px]">
                <MessageCircle
                  className="text-pana-indigo h-6 w-6"
                  aria-hidden="true"
                />
              </span>
              <p className="text-pana-ink text-xl font-black tracking-tight">
                Say a little hello.
              </p>
              <p className="text-pana-ink/60 mt-2 max-w-60 text-xs leading-relaxed">
                This is the start of your conversation with{' '}
                {thread.person.name.split(' ')[0]}.
              </p>
              <p className="text-pana-ink/50 mt-4 flex items-center gap-1.5 text-[10px]">
                <Clock3 className="h-3 w-3" aria-hidden="true" />
                Messages disappear after 30 days.
              </p>
            </div>
          )}
          {groups.map((group, groupIndex) => {
            const mine = group[0].from === 'me';
            const prior = groups[groupIndex - 1];
            const showDay = !prior || prior[0].day !== group[0].day;
            const last = group[group.length - 1];

            return (
              <div key={group[0].id} className="mb-5">
                {showDay && (
                  <div className="pt-2 pb-6 text-center">
                    <span className={styles.dayChip}>{group[0].day}</span>
                  </div>
                )}

                <div
                  className={`flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'}`}
                >
                  {!mine && <ChatAvatar person={thread.person} size={28} />}
                  <div
                    className={`flex max-w-[82%] flex-col gap-1.5 md:max-w-[76%] ${mine ? 'items-end' : 'items-start'}`}
                  >
                    {group.map((message) => (
                      <Bubble key={message.id} message={message} mine={mine} />
                    ))}

                    <span className="mt-0.5 flex flex-wrap items-center gap-2 px-1">
                      <span className={styles.messageTime}>{last.time}</span>
                      {mine && last.delivery && (
                        <DeliveryMark state={last.delivery} />
                      )}
                      {last.delivery === 'failed' && (
                        <button
                          type="button"
                          onClick={() => onRetry(last.id)}
                          className="text-pana-red-deep inline-flex min-h-11 items-center gap-1 text-xs font-extrabold underline underline-offset-2"
                        >
                          <RotateCcw className="h-3 w-3" aria-hidden="true" />
                          Retry
                        </button>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {!atBottom && (
          <button
            type="button"
            className={styles.jumpToLatest}
            onClick={jumpToLatest}
          >
            {newMessages > 0
              ? newMessages === 1
                ? '1 new message'
                : `${newMessages} new messages`
              : 'Back to latest'}
            <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
    </>
  );
}

function Bubble({
  message,
  mine,
}: {
  message: MockChatMessage;
  mine: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-1 ${mine ? 'items-end' : 'items-start'}`}
    >
      {message.voice ? (
        <div className={`${styles.bubble} w-64 max-w-full`} data-mine={mine}>
          <ChatWaveform
            peaks={message.voice.peaks}
            duration={message.voice.duration}
            tone={mine ? 'dark' : 'light'}
          />
          <p
            className={`mt-2 text-[10px] ${mine ? 'text-pana-cream/70' : 'text-pana-ink/55'}`}
          >
            Voice memo sample · No audio in this preview
          </p>
        </div>
      ) : (
        <>
          {message.body && (
            <div
              className={styles.bubble}
              data-mine={mine}
              data-failed={message.delivery === 'failed'}
            >
              {message.body}
            </div>
          )}
          {message.gif && (
            <span className="block w-48 max-w-full overflow-hidden rounded-2xl">
              <GifArt gif={message.gif} />
            </span>
          )}
        </>
      )}

      {message.expiresIn && <ExpiryChip expiresIn={message.expiresIn} />}
    </div>
  );
}

/* HELD, not delivered.
 *
 * The banner has to carry one specific fact - that nothing notified the
 * reader - because that is the property dm-gate.ts is actually enforcing, and
 * it is invisible by construction. Saying it out loud is also the only way a
 * reviewer can tell this apart from an ordinary unread thread. */
function HeldBanner({
  thread,
  onAccept,
  onDelete,
}: {
  thread: MockChatThread;
  onAccept: () => void;
  onDelete: () => void;
}) {
  const first = thread.person.name.split(' ')[0];
  return (
    <div className="bg-pana-butter-2 border-pana-ink/8 flex-none border-b px-5 py-4">
      <p className="text-pana-ink flex items-center gap-2 text-xs font-extrabold">
        <ShieldCheck className="h-4 w-4" aria-hidden="true" />A message request
        from {first}.
      </p>
      <p className="text-pana-ink/70 mt-1 text-xs leading-relaxed">
        This arrived quietly in Requests. Read it first, then decide if you want
        to open the conversation.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onAccept}
          className="bg-pana-indigo text-pana-cream min-h-11 rounded-xl px-3.5 py-1.5 text-xs font-extrabold"
        >
          Accept request
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="border-pana-ink/15 text-pana-ink min-h-11 rounded-xl border bg-white px-3.5 py-1.5 text-xs font-bold"
        >
          Delete request
        </button>
      </div>
    </div>
  );
}

/* The reason the substrate is worth keeping, and a limit at the same time.
 *
 * This conversation reaches a Mastodon server, which no Durable Object room
 * could do. It also cannot be live in the same way: delivery to a remote
 * inbox is a queued signed POST that may land minutes later, so the socket
 * accelerates our half of the exchange and nothing at all of theirs. */
function FederationBanner({ host }: { host: string }) {
  return (
    <div className="bg-pana-indigo/4 border-pana-ink/8 flex flex-none items-start gap-2 border-b px-6 py-2.5">
      <Globe
        className="text-pana-indigo/70 mt-px h-3.5 w-3.5 flex-none"
        aria-hidden="true"
      />
      <p className="text-pana-ink/65 text-[11px] leading-relaxed font-medium">
        <span className="font-extrabold">On {host}.</span> Messages are
        delivered to another server, so replies can take a little longer.
      </p>
    </div>
  );
}

/* REFUSED.
 *
 * Replaces the composer rather than erroring after a send, so nobody writes a
 * paragraph into a box that was never going to accept it.
 *
 * The copy is the single string dm-gate.ts returns for every refusal, and the
 * vagueness is the feature: a block and a closed inbox must be indistinguish-
 * able, or a blocked sender can detect the block by sending one message and
 * reading the wording. Friendlier per-case copy is the obvious design
 * improvement here and it is the one that breaks the safety property. */
export function RefusedComposer() {
  return (
    <footer className="border-pana-ink/8 bg-pana-cream flex-none border-t px-5 py-6">
      <p className="text-pana-ink/70 flex items-center justify-center gap-2 text-center text-sm font-bold">
        <ShieldAlert className="h-4 w-4 flex-none" aria-hidden="true" />
        {REFUSAL_COPY}
      </p>
    </footer>
  );
}
