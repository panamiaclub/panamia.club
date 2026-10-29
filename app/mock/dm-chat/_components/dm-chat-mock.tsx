'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowDownToLine,
  Bell,
  CircleAlert,
  MessageCircle,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { ConversationList, type MessageFolder } from './conversation-list';
import { Transcript, RefusedComposer } from './transcript';
import { Composer } from './composer';
import { NewMessageDialog } from './new-message-dialog';
import {
  MOCK_CHAT_THREADS,
  MOCK_CHAT_REQUESTS,
  MOCK_CHAT_VIEWER,
  INCOMING_LIVE_MESSAGE,
  type MockChatContact,
  type MockChatDraft,
  type MockChatMessage,
  type MockChatThread,
} from '../_data/mock-dm-chat';
import styles from '@/components/messages/workspace.module.css';

const EMPTY_DRAFT: MockChatDraft = { text: '', gif: null };

function initialThreads(): MockChatThread[] {
  return [...MOCK_CHAT_THREADS, ...MOCK_CHAT_REQUESTS].map((thread) => ({
    ...thread,
    messages: [...thread.messages],
  }));
}

function clockTime(): string {
  return new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function DmChatMock() {
  const [threads, setThreads] = useState(initialThreads);
  const [folder, setFolder] = useState<MessageFolder>('messages');
  const [activeId, setActiveId] = useState<string | null>('jdowns');
  const [detailOpen, setDetailOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, MockChatDraft>>({});
  const [newMessageOpen, setNewMessageOpen] = useState(false);
  const [failNext, setFailNext] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [revision, setRevision] = useState(0);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const activeRowRef = useRef<HTMLButtonElement>(null);
  const conversationRef = useRef<HTMLElement>(null);
  const focusComposerOnClose = useRef(false);

  const active = threads.find((thread) => thread.id === activeId);
  const requests = threads.filter((thread) => thread.gate === 'hold');
  const visible = threads.filter((thread) =>
    folder === 'requests' ? thread.gate === 'hold' : thread.gate !== 'hold'
  );
  const draft = activeId ? (drafts[activeId] ?? EMPTY_DRAFT) : EMPTY_DRAFT;
  const isSending =
    active?.messages.some((message) => message.delivery === 'sending') ?? false;

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  const appendMessage = (threadId: string, message: MockChatMessage) => {
    setThreads((current) => {
      const thread = current.find((entry) => entry.id === threadId);
      if (!thread) return current;
      return [
        {
          ...thread,
          lastActive: 'Now',
          messages: [...thread.messages, message],
        },
        ...current.filter((entry) => entry.id !== threadId),
      ];
    });
  };

  const settleMessage = (
    threadId: string,
    messageId: string,
    shouldFail: boolean
  ) => {
    const timer = setTimeout(() => {
      timers.current.delete(messageId);
      setThreads((current) =>
        current.map((thread) =>
          thread.id !== threadId
            ? thread
            : {
                ...thread,
                messages: thread.messages.map((message) =>
                  message.id === messageId
                    ? { ...message, delivery: shouldFail ? 'failed' : 'sent' }
                    : message
                ),
              }
        )
      );
      setAnnouncement(
        shouldFail
          ? 'Message not sent. Your message is kept in the conversation. Choose Retry to send it again.'
          : 'Sample message sent.'
      );
    }, 900);
    timers.current.set(messageId, timer);
  };

  const handleSend = () => {
    if (
      !active ||
      active.gate !== 'allow' ||
      isSending ||
      (!draft.text.trim() && !draft.gif)
    )
      return;
    const message: MockChatMessage = {
      id: crypto.randomUUID(),
      from: 'me',
      body: draft.text.trim(),
      ...(draft.gif ? { gif: draft.gif } : {}),
      day: 'Today',
      time: clockTime(),
      expiresIn: '30 days',
      delivery: 'sending',
    };
    const shouldFail = failNext;
    setFailNext(false);
    setDrafts((current) => ({ ...current, [active.id]: EMPTY_DRAFT }));
    appendMessage(active.id, message);
    settleMessage(active.id, message.id, shouldFail);
  };

  const handleRetry = (messageId: string) => {
    if (!active) return;
    const shouldFail = failNext;
    setFailNext(false);
    setThreads((current) =>
      current.map((thread) =>
        thread.id !== active.id
          ? thread
          : {
              ...thread,
              messages: thread.messages.map((message) =>
                message.id === messageId
                  ? { ...message, delivery: 'sending' }
                  : message
              ),
            }
      )
    );
    settleMessage(active.id, messageId, shouldFail);
  };

  const receiveMessage = () => {
    if (!active || active.gate !== 'allow') return;
    appendMessage(active.id, {
      ...INCOMING_LIVE_MESSAGE,
      id: crypto.randomUUID(),
      body:
        active.id === 'jdowns'
          ? INCOMING_LIVE_MESSAGE.body
          : 'Thanks, that sounds good! A little update from the other side.',
      time: clockTime(),
      expiresIn: '30 days',
    });
    setAnnouncement(`A sample message arrived from ${active.person.name}.`);
  };

  const changeFolder = (next: MessageFolder) => {
    setFolder(next);
    setActiveId(
      threads.find((thread) =>
        next === 'requests' ? thread.gate === 'hold' : thread.gate !== 'hold'
      )?.id ?? null
    );
    setDetailOpen(false);
  };

  const choosePerson = (contact: MockChatContact) => {
    const existing = threads.find((thread) => thread.id === contact.id);
    if (!existing) {
      setThreads((current) => [
        {
          id: contact.id,
          person: contact.person,
          gate: 'allow',
          messages: [],
          lastActive: 'New',
          unreadCount: 0,
        },
        ...current,
      ]);
    }
    setFolder(existing?.gate === 'hold' ? 'requests' : 'messages');
    setActiveId(contact.id);
    setDetailOpen(true);
    setRevision((value) => value + 1);
    focusComposerOnClose.current = true;
    setNewMessageOpen(false);
  };

  const acceptRequest = () => {
    if (!active) return;
    setThreads((current) =>
      current.map((thread) =>
        thread.id === active.id ? { ...thread, gate: 'allow' } : thread
      )
    );
    setFolder('messages');
    setAnnouncement(
      `Request from ${active.person.name} accepted in this preview.`
    );
  };

  const deleteRequest = () => {
    if (!active) return;
    setThreads((current) =>
      current.filter((thread) => thread.id !== active.id)
    );
    setActiveId(requests.find((thread) => thread.id !== active.id)?.id ?? null);
    setDetailOpen(false);
    setAnnouncement('Message request deleted in this preview.');
  };

  const reset = () => {
    timers.current.forEach(clearTimeout);
    timers.current.clear();
    setThreads(initialThreads());
    setFolder('messages');
    setActiveId('jdowns');
    setDetailOpen(false);
    setDrafts({});
    setFailNext(false);
    setAnnouncement('Preview reset.');
    setRevision((value) => value + 1);
  };

  return (
    <Dialog open={newMessageOpen} onOpenChange={setNewMessageOpen}>
      <div className={styles.page}>
        <div className={styles.toolbar} aria-label="Design preview controls">
          <span className="flex flex-none items-center gap-1.5 font-extrabold">
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            <span className="hidden sm:inline">Design </span>preview
          </span>
          <span className="text-pana-ink/60 hidden lg:inline">
            Try the conversation, not just the screenshot.
          </span>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={receiveMessage}
              disabled={active?.gate !== 'allow'}
              aria-label="Receive a sample message"
            >
              <ArrowDownToLine className="h-3 w-3" aria-hidden="true" />
              <span className="hidden sm:inline">Receive message</span>
              <span className="sm:hidden">Receive</span>
            </button>
            <button
              type="button"
              onClick={() => setFailNext((value) => !value)}
              aria-pressed={failNext}
            >
              <CircleAlert className="h-3 w-3" aria-hidden="true" />
              Fail next send
            </button>
            <button type="button" onClick={reset} aria-label="Reset preview">
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              <span className="hidden sm:inline">Reset</span>
            </button>
          </div>
        </div>

        <header className={styles.masthead}>
          <Link href="/mock/compact-feed" aria-label="Pana Social home">
            <Image
              src="/logos/pana_social_long_orange.png"
              alt="Pana Social"
              width={190}
              height={52}
              className="h-7 w-auto sm:h-8"
            />
          </Link>
          <nav
            className="hidden items-center gap-1 sm:flex"
            aria-label="Preview navigation"
          >
            <Link
              href="/mock/compact-feed"
              className="text-pana-ink/60 rounded-lg px-3 py-2 text-xs font-bold"
            >
              Community
            </Link>
            <Link
              href="/mock/dm-chat"
              aria-current="page"
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-extrabold"
            >
              <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
              Messages
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-2 sm:gap-4">
            <Link
              href="/mock/community-notifications"
              aria-label="Example notifications"
              className={styles.iconButton}
            >
              <Bell className="h-[18px] w-[18px]" aria-hidden="true" />
            </Link>
            <Link
              href="/mock/profile"
              aria-label="Example profile"
              className="flex items-center gap-2"
            >
              <Image
                src={MOCK_CHAT_VIEWER.avatar}
                alt=""
                width={34}
                height={34}
                className="h-8.5 w-8.5 rounded-full object-cover"
              />
              <span className="text-pana-ink/70 hidden text-xs font-bold lg:inline">
                Claribel
              </span>
            </Link>
          </div>
        </header>

        <main className={styles.body}>
          <div className={`profile-card ${styles.workspace}`}>
            <ConversationList
              key={revision}
              threads={visible}
              folder={folder}
              activeId={activeId}
              activeRowRef={activeRowRef}
              drafts={drafts}
              requestCount={requests.length}
              detailOpen={detailOpen}
              onSelect={(id) => {
                setActiveId(id);
                setDetailOpen(true);
                requestAnimationFrame(() =>
                  conversationRef.current?.focus({ preventScroll: true })
                );
              }}
              onFolderChange={changeFolder}
            />
            <section
              ref={conversationRef}
              tabIndex={-1}
              className={styles.conversation}
              data-mobile-hidden={!detailOpen}
              aria-label="Open conversation"
            >
              {active ? (
                <>
                  <Transcript
                    key={`transcript-${revision}-${active.id}`}
                    thread={active}
                    detailOpen={detailOpen}
                    onBack={() => {
                      setDetailOpen(false);
                      requestAnimationFrame(() =>
                        activeRowRef.current?.focus()
                      );
                    }}
                    onAccept={acceptRequest}
                    onDelete={deleteRequest}
                    onRetry={handleRetry}
                  />
                  {active.gate === 'refuse' ? (
                    <RefusedComposer />
                  ) : active.gate === 'hold' ? (
                    <footer className="border-pana-ink/8 text-pana-ink/60 flex flex-none items-center justify-center gap-2 border-t px-5 py-5 text-xs">
                      <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                      Accept this request to reply.
                    </footer>
                  ) : (
                    <Composer
                      key={`composer-${revision}-${active.id}`}
                      draft={draft}
                      onChange={(next) =>
                        setDrafts((current) => ({
                          ...current,
                          [active.id]: next,
                        }))
                      }
                      onSend={handleSend}
                      isSending={isSending}
                      recipientName={active.person.name}
                      inputRef={inputRef}
                    />
                  )}
                </>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
                  <span className="bg-pana-butter-2 grid h-16 w-16 place-items-center rounded-3xl">
                    <MessageCircle
                      className="text-pana-indigo h-7 w-7"
                      aria-hidden="true"
                    />
                  </span>
                  <h2 className="mt-2 text-xl font-black tracking-tight">
                    {folder === 'requests'
                      ? 'All caught up.'
                      : 'Good conversations live here.'}
                  </h2>
                  <p className="text-pana-ink/60 max-w-64 text-sm leading-relaxed">
                    {folder === 'requests'
                      ? 'No message requests waiting for you.'
                      : 'Choose a conversation or start something new with a pana.'}
                  </p>
                </div>
              )}
            </section>
          </div>
        </main>

        <p className="text-pana-ink/55 flex-none px-3 py-2.5 text-center text-[9px] font-medium">
          /mock/dm-chat · Sample conversations only. Nothing is sent or saved.
        </p>
        <span role="status" className="sr-only">
          {announcement}
        </span>
      </div>

      {newMessageOpen && (
        <NewMessageDialog
          threads={threads}
          onChoose={choosePerson}
          onCloseAutoFocus={(event) => {
            if (focusComposerOnClose.current) {
              event.preventDefault();
              focusComposerOnClose.current = false;
              requestAnimationFrame(() =>
                (inputRef.current ?? conversationRef.current)?.focus({
                  preventScroll: true,
                })
              );
            }
          }}
        />
      )}
    </Dialog>
  );
}
