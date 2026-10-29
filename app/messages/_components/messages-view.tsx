'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, MessageCircle, ShieldCheck } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import styles from '@/components/messages/workspace.module.css';
import {
  useAcceptDmRequest,
  useConversation,
  useConversations,
  useDeleteDmRequest,
  useDmRequests,
  useSendDirectMessage,
} from '@/lib/query/social';
import {
  ConversationList,
  type ListEntry,
  type MessageFolder,
} from './conversation-list';
import { ChatAvatar, ChatName, type ChatActor } from './chat-primitives';
import { Transcript } from './transcript';
import { Composer } from './composer';
import { NewMessageDialog } from './new-message-dialog';
import { GroupMessagesWorkspace } from './group-messages-workspace';
import { useDmSocket } from '../_lib/use-dm-socket';
import { remoteHost } from '../_lib/format';
import {
  conversationUnavailable,
  EMPTY_MESSAGE_DRAFT,
  messageError,
  unconfirmedMessages,
  type MessageDraft,
  type OutgoingMessage,
} from '../_lib/workspace';

export function MessagesView({
  initialGroupHandle,
}: {
  initialGroupHandle?: string;
}) {
  const conversations = useConversations();
  // Changing the active profile clears the query cache. Remount all local DM
  // state as its actor changes, so drafts and sockets cannot cross identities.
  return (
    <MessagesWorkspace
      key={conversations.data?.viewerActorId ?? 'no-actor'}
      conversations={conversations}
      initialGroupHandle={initialGroupHandle}
    />
  );
}

function MessagesWorkspace({
  conversations,
  initialGroupHandle,
}: {
  conversations: ReturnType<typeof useConversations>;
  initialGroupHandle?: string;
}) {
  const viewerActorId = conversations.data?.viewerActorId ?? null;
  const localDomain = conversations.data?.localDomain ?? null;
  const [view, setView] = useState<MessageFolder>(
    initialGroupHandle ? 'groups' : 'inbox'
  );
  const [groupStarted, setGroupStarted] = useState(!!initialGroupHandle);
  const [activeActorId, setActiveActorId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [drafts, setDrafts] = useState<Record<string, MessageDraft>>({});
  const [outgoing, setOutgoing] = useState<OutgoingMessage[]>([]);
  const [newActors, setNewActors] = useState<ChatActor[]>([]);
  const [newMessageOpen, setNewMessageOpen] = useState(false);
  const [triageErrors, setTriageErrors] = useState<
    Record<string, string | null>
  >({});
  const [announcement, setAnnouncement] = useState('');
  const activeSelection = useRef<string | null>(null);
  const activeRowRef = useRef<HTMLButtonElement>(null);
  const conversationRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sending = useRef(new Set<string>());
  const focusComposerOnClose = useRef(false);
  const focusWhenLoaded = useRef<string | null>(null);

  const thread = useConversation(view === 'groups' ? null : activeActorId);
  const requests = useDmRequests(!!viewerActorId);
  const acceptRequest = useAcceptDmRequest();
  const deleteRequest = useDeleteDmRequest();
  const send = useSendDirectMessage();
  useDmSocket(!!viewerActorId);

  const requestList = requests.data ?? [];
  const requestEntries: ListEntry[] = requestList.map((entry) => ({
    actor: entry.sender,
    lastMessage: entry.messages[entry.messages.length - 1] ?? null,
    requestedAt: entry.requestedAt,
  }));
  const inboxEntries: ListEntry[] = (
    conversations.data?.conversations ?? []
  ).map((entry) => ({
    actor: entry.counterparty,
    lastMessage: entry.lastMessage,
  }));
  const existingIds = new Set(inboxEntries.map((entry) => entry.actor.id));
  const allInbox: ListEntry[] = [
    ...newActors
      .filter((actor) => !existingIds.has(actor.id))
      .map((actor) => ({ actor, lastMessage: null })),
    ...inboxEntries,
  ];
  const entries = view === 'requests' ? requestEntries : allInbox;
  const allEntries = [
    ...new Map(
      [...allInbox, ...requestEntries].map((entry) => [entry.actor.id, entry])
    ).values(),
  ];
  const isInboundRequest = requestList.some(
    (entry) => entry.sender.id === activeActorId
  );
  const isSending = outgoing.some(
    (message) =>
      message.recipientActorId === activeActorId &&
      message.delivery === 'sending'
  );
  const activeOutgoing = outgoing.filter(
    (message) => message.recipientActorId === activeActorId
  );
  const visibleOutgoing = unconfirmedMessages(
    activeOutgoing,
    thread.data?.messages ?? []
  );
  const requestsReady = !requests.isLoading && !requests.isError;
  const canReply =
    thread.data?.canSend === 'allow' && !isInboundRequest && requestsReady;
  const draft = activeActorId
    ? (drafts[activeActorId] ?? EMPTY_MESSAGE_DRAFT)
    : EMPTY_MESSAGE_DRAFT;
  const selectedActor = allEntries.find(
    (entry) => entry.actor.id === activeActorId
  )?.actor;
  const unavailable = conversationUnavailable(thread.error);

  const activate = useCallback((actorId: string | null) => {
    activeSelection.current = actorId;
    setActiveActorId(actorId);
  }, []);

  useEffect(() => {
    if (view !== 'groups' && activeActorId === null && entries.length > 0)
      activate(entries[0].actor.id);
  }, [view, activeActorId, entries, activate]);

  useEffect(() => {
    if (!thread.data || !activeActorId) return;
    const confirmed = new Set(
      thread.data.messages.map((message) => message.id)
    );
    setOutgoing((current) => {
      const next = current.filter(
        (message) =>
          message.recipientActorId !== activeActorId ||
          !message.serverId ||
          !confirmed.has(message.serverId)
      );
      return next.length === current.length ? current : next;
    });
  }, [thread.data, activeActorId, outgoing]);

  useEffect(() => {
    if (
      focusWhenLoaded.current !== activeActorId ||
      !thread.data ||
      !requestsReady
    )
      return;
    focusWhenLoaded.current = null;
    (inputRef.current ?? conversationRef.current)?.focus({
      preventScroll: true,
    });
  }, [activeActorId, thread.data, requestsReady]);

  const selectThread = (actorId: string) => {
    activate(actorId);
    setQuery('');
    setDetailOpen(true);
    requestAnimationFrame(() =>
      conversationRef.current?.focus({ preventScroll: true })
    );
  };

  const changeView = (next: MessageFolder) => {
    if (next === 'groups') setGroupStarted(true);
    setView(next);
    activate(null);
    setQuery('');
    setDetailOpen(false);
  };

  const backToList = () => {
    setDetailOpen(false);
    requestAnimationFrame(() =>
      activeRowRef.current?.focus({ preventScroll: true })
    );
  };

  const rememberActor = (actor: ChatActor) => {
    setNewActors((current) => [
      actor,
      ...current.filter((entry) => entry.id !== actor.id),
    ]);
  };

  const choosePerson = (actor: ChatActor) => {
    const request = requestList.some((entry) => entry.sender.id === actor.id);
    if (!request) rememberActor(actor);
    setView(request ? 'requests' : 'inbox');
    focusComposerOnClose.current = true;
    focusWhenLoaded.current = actor.id;
    selectThread(actor.id);
    setNewMessageOpen(false);
  };

  const transmit = async (message: OutgoingMessage) => {
    sending.current.add(message.recipientActorId);
    try {
      const status = await send.mutateAsync({
        recipientActorId: message.recipientActorId,
        content: message.content,
        attachments: message.attachments,
      });
      setOutgoing((current) =>
        current.map((entry) =>
          entry.id === message.id
            ? {
                ...entry,
                delivery: 'sent',
                serverId: status.id,
                error: undefined,
              }
            : entry
        )
      );
      setAnnouncement('Message sent.');
    } catch (error) {
      const detail = messageError(
        error,
        'Could not send. Check your connection and try again.'
      );
      setOutgoing((current) =>
        current.map((entry) =>
          entry.id === message.id
            ? { ...entry, delivery: 'failed', error: detail }
            : entry
        )
      );
      setAnnouncement(
        `Message not sent. ${detail} Your message is kept in the conversation.`
      );
    } finally {
      sending.current.delete(message.recipientActorId);
    }
  };

  const handleSend = () => {
    if (
      !activeActorId ||
      !canReply ||
      draft.isMirroring ||
      sending.current.has(activeActorId) ||
      (!draft.text.trim() && !draft.gif)
    )
      return;
    const message: OutgoingMessage = {
      id: crypto.randomUUID(),
      recipientActorId: activeActorId,
      content: draft.text.trim(),
      ...(draft.gif ? { attachments: [draft.gif] } : {}),
      published: new Date().toISOString(),
      delivery: 'sending',
    };
    setOutgoing((current) => [...current, message]);
    setDrafts((current) => ({
      ...current,
      [activeActorId]: EMPTY_MESSAGE_DRAFT,
    }));
    void transmit(message);
  };

  const handleRetry = (message: OutgoingMessage) => {
    if (
      !canReply ||
      message.recipientActorId !== activeActorId ||
      sending.current.has(message.recipientActorId)
    )
      return;
    setOutgoing((current) =>
      current.map((entry) =>
        entry.id === message.id
          ? { ...entry, delivery: 'sending', error: undefined }
          : entry
      )
    );
    void transmit(message);
  };

  const handleAccept = async (actor: ChatActor) => {
    setTriageErrors((current) => ({ ...current, [actor.id]: null }));
    try {
      await acceptRequest.mutateAsync(actor.id);
      rememberActor(actor);
      if (activeSelection.current === actor.id) {
        setView('inbox');
        setQuery('');
        setDetailOpen(true);
      }
      setAnnouncement(`Request from ${actor.name || actor.username} accepted.`);
    } catch (error) {
      setTriageErrors((current) => ({
        ...current,
        [actor.id]: messageError(
          error,
          'Could not accept this request. Please try again.'
        ),
      }));
    }
  };

  const handleDelete = async (actorId: string) => {
    setTriageErrors((current) => ({ ...current, [actorId]: null }));
    try {
      await deleteRequest.mutateAsync(actorId);
      if (activeSelection.current === actorId) {
        activate(null);
        setQuery('');
        setDetailOpen(false);
      }
      setNewActors((current) =>
        current.filter((actor) => actor.id !== actorId)
      );
      setDrafts((current) => {
        const next = { ...current };
        delete next[actorId];
        return next;
      });
      setAnnouncement('Message request deleted.');
    } catch (error) {
      setTriageErrors((current) => ({
        ...current,
        [actorId]: messageError(
          error,
          'Could not delete this request. Please try again.'
        ),
      }));
    }
  };

  return (
    <Dialog open={newMessageOpen} onOpenChange={setNewMessageOpen}>
      <div
        className={`profile-card ${styles.workspace}`}
        data-inactive={view === 'groups'}
      >
        <ConversationList
          entries={entries}
          view={view}
          onChangeView={changeView}
          viewerActorId={viewerActorId}
          localDomain={localDomain}
          activeActorId={activeActorId}
          activeRowRef={activeRowRef}
          requestCount={requestEntries.length}
          onSelect={selectThread}
          isLoading={
            view === 'requests' ? requests.isLoading : conversations.isLoading
          }
          error={
            (view === 'requests' ? requests.isError : conversations.isError)
              ? 'Could not load these conversations. Please try again.'
              : null
          }
          onRetry={() => {
            void (view === 'requests'
              ? requests.refetch()
              : conversations.refetch());
          }}
          detailOpen={detailOpen}
          drafts={drafts}
          outgoing={outgoing}
          query={query}
          onQueryChange={setQuery}
        />
        <section
          ref={conversationRef}
          tabIndex={-1}
          className={styles.conversation}
          data-mobile-hidden={!detailOpen}
          aria-label="Open conversation"
        >
          {thread.data && !unavailable ? (
            <>
              <Transcript
                key={activeActorId}
                counterparty={thread.data.counterparty}
                messages={thread.data.messages}
                viewerActorId={thread.data.viewerActorId}
                localDomain={thread.data.localDomain}
                outgoing={visibleOutgoing}
                detailOpen={detailOpen}
                onBack={backToList}
                request={
                  isInboundRequest
                    ? {
                        onAccept: () => {
                          if (thread.data)
                            void handleAccept(thread.data.counterparty);
                        },
                        onDelete: () => {
                          if (activeActorId) void handleDelete(activeActorId);
                        },
                        isTriaging:
                          acceptRequest.isPending || deleteRequest.isPending,
                        error: activeActorId
                          ? (triageErrors[activeActorId] ?? null)
                          : null,
                      }
                    : undefined
                }
                onRetry={handleRetry}
                canRetry={canReply}
                isSending={isSending}
                refreshError={
                  thread.isError
                    ? 'Could not refresh this conversation. Showing the last update.'
                    : null
                }
                onRefresh={() => {
                  void thread.refetch();
                }}
              />
              {isInboundRequest ? (
                <footer className="border-pana-ink/8 text-pana-ink/60 flex flex-none items-center justify-center gap-2 border-t px-5 py-5 text-xs">
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  Accept this request to reply.
                </footer>
              ) : !requestsReady ? (
                <footer
                  className="border-pana-ink/8 text-pana-ink/65 flex-none border-t px-5 py-4 text-xs"
                  role="status"
                >
                  {requests.isError ? (
                    <>
                      Could not check message requests.{' '}
                      <button
                        type="button"
                        className="font-bold underline"
                        onClick={() => requests.refetch()}
                      >
                        Try again
                      </button>{' '}
                      before replying.
                    </>
                  ) : (
                    'Checking message requests...'
                  )}
                </footer>
              ) : (
                <Composer
                  key={`composer-${activeActorId}`}
                  canSend={thread.data.canSend}
                  counterpartyName={
                    thread.data.counterparty.name ||
                    thread.data.counterparty.username
                  }
                  draft={draft}
                  onChange={(patch) => {
                    if (!activeActorId) return;
                    setDrafts((current) => ({
                      ...current,
                      [activeActorId]: {
                        ...(current[activeActorId] ?? EMPTY_MESSAGE_DRAFT),
                        ...patch,
                      },
                    }));
                  }}
                  onSend={handleSend}
                  isSending={isSending}
                  inputRef={inputRef}
                />
              )}
            </>
          ) : (
            <EmptyState
              actor={selectedActor}
              localDomain={localDomain}
              isLoading={
                (thread.isLoading && !!activeActorId) || conversations.isLoading
              }
              error={
                thread.isError
                  ? unavailable
                    ? 'This conversation is not available.'
                    : 'Could not open this conversation. Please try again.'
                  : null
              }
              onRetry={() => {
                void thread.refetch();
              }}
              onBack={backToList}
              view={view}
              needsProfile={conversations.isSuccess && !viewerActorId}
            />
          )}
        </section>
      </div>
      {groupStarted && (
        <GroupMessagesWorkspace
          active={view === 'groups'}
          viewerActorId={viewerActorId}
          initialHandle={initialGroupHandle}
          requestCount={requestEntries.length}
          onChangeView={changeView}
          onAnnounce={setAnnouncement}
        />
      )}
      <span role="status" className="sr-only">
        {announcement}
      </span>
      {newMessageOpen && (
        <NewMessageDialog
          entries={allEntries}
          viewerActorId={viewerActorId}
          localDomain={localDomain}
          onChoose={choosePerson}
          onCloseAutoFocus={(event) => {
            if (!focusComposerOnClose.current) return;
            event.preventDefault();
            focusComposerOnClose.current = false;
            requestAnimationFrame(() =>
              (inputRef.current ?? conversationRef.current)?.focus({
                preventScroll: true,
              })
            );
          }}
        />
      )}
    </Dialog>
  );
}

function EmptyState({
  actor,
  localDomain,
  isLoading,
  error,
  onRetry,
  onBack,
  view,
  needsProfile,
}: {
  actor: ChatActor | undefined;
  localDomain: string | null;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  onBack: () => void;
  view: MessageFolder;
  needsProfile: boolean;
}) {
  return (
    <>
      <header className={styles.conversationHeader}>
        <button
          type="button"
          onClick={onBack}
          className={`${styles.iconButton} ${styles.backButton}`}
          aria-label="Back to conversations"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        {actor && (
          <>
            <ChatAvatar actor={actor} size={42} />
            <ChatName
              actor={actor}
              remoteHost={remoteHost(actor, localDomain)}
              className="text-[15px]"
            />
          </>
        )}
      </header>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-8 py-8 text-center">
        <span className="bg-pana-butter-2 grid h-16 w-16 place-items-center rounded-3xl">
          <MessageCircle
            className="text-pana-indigo h-7 w-7"
            aria-hidden="true"
          />
        </span>
        <h2 className="mt-2 text-xl font-black tracking-tight">
          {isLoading
            ? 'Opening conversation...'
            : error
              ? 'A little trouble connecting.'
              : needsProfile
                ? 'Make yourself at home.'
                : view === 'requests'
                  ? 'All caught up.'
                  : 'Good conversations live here.'}
        </h2>
        <p
          className="text-pana-ink/65 max-w-72 text-sm leading-relaxed"
          role={error ? 'alert' : 'status'}
        >
          {error ??
            (isLoading
              ? 'Your messages are on their way.'
              : needsProfile
                ? 'Open Pana Social to finish setting up messaging for this profile.'
                : view === 'requests'
                  ? 'No message requests waiting for you.'
                  : 'Choose a conversation or start something new with a pana.')}
        </p>
        {error && (
          <button
            type="button"
            onClick={onRetry}
            className="text-pana-indigo min-h-10 px-4 text-sm font-bold underline"
          >
            Try again
          </button>
        )}
        {!isLoading && !error && needsProfile && (
          <Link
            href="/s"
            className="text-pana-indigo min-h-10 px-4 text-sm font-bold underline"
          >
            Open Pana Social
          </Link>
        )}
      </div>
    </>
  );
}
