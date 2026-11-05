'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, MessageCircle, ShieldCheck } from 'lucide-react';
import styles from '@/components/messages/workspace.module.css';
import { useNativeConversation } from '@/components/mobile/native-app-context';
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
  type InboxIssue,
  type MessageFolder,
} from './conversation-list';
import { ChatAvatar, ChatName, type ChatActor } from './chat-primitives';
import { Transcript } from './transcript';
import { Composer } from './composer';
import { GroupConversation, useGroupChatState } from './group-chat';
import { useGroupChats, useGroupChatThread } from '../_lib/group-chat-query';
import {
  inboxKey,
  inboxSelection,
  mergeInboxEntries,
  type DirectInboxEntry,
  type InboxEntry,
  type InboxSelection,
} from '../_lib/inbox';
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
  initialActorId,
}: {
  initialGroupHandle?: string;
  initialActorId?: string;
}) {
  const conversations = useConversations();
  // Changing the active profile clears the query cache. Remount all local DM
  // state as its actor changes, so drafts and sockets cannot cross identities.
  return (
    <MessagesWorkspace
      key={conversations.data?.viewerActorId ?? 'no-actor'}
      conversations={conversations}
      initialGroupHandle={initialGroupHandle}
      initialActorId={initialActorId}
    />
  );
}

function MessagesWorkspace({
  conversations,
  initialGroupHandle,
  initialActorId,
}: {
  conversations: ReturnType<typeof useConversations>;
  initialGroupHandle?: string;
  initialActorId?: string;
}) {
  const viewerActorId = conversations.data?.viewerActorId ?? null;
  const localDomain = conversations.data?.localDomain ?? null;
  const initialSelection = useMemo<InboxSelection | null>(
    () =>
      initialGroupHandle
        ? { kind: 'group', id: initialGroupHandle }
        : initialActorId
          ? { kind: 'direct', id: initialActorId }
          : null,
    [initialGroupHandle, initialActorId]
  );
  const [view, setView] = useState<MessageFolder>('inbox');
  const [selection, setSelection] = useState(initialSelection);
  const activeActorId = selection?.kind === 'direct' ? selection.id : null;
  const activeGroupHandle = selection?.kind === 'group' ? selection.id : null;
  const [detailOpen, setDetailOpen] = useState(!!initialSelection);
  const [drafts, setDrafts] = useState<Record<string, MessageDraft>>({});
  const [outgoing, setOutgoing] = useState<OutgoingMessage[]>([]);
  const [newConversations, setNewConversations] = useState<DirectInboxEntry[]>(
    []
  );
  const [triageErrors, setTriageErrors] = useState<
    Record<string, string | null>
  >({});
  const [announcement, setAnnouncement] = useState('');
  const activeSelection = useRef(initialSelection);
  const previousInitialSelection = useRef(initialSelection);
  const pendingInitialActor = useRef(initialActorId ?? null);
  const activeRowRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLElement>(null);
  const conversationRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sending = useRef(new Set<string>());
  const focusWhenLoaded = useRef(initialActorId ?? null);

  const thread = useConversation(activeActorId);
  const groups = useGroupChats(!!viewerActorId);
  const groupThread = useGroupChatThread(activeGroupHandle, !!viewerActorId);
  const groupState = useGroupChatState(viewerActorId, setAnnouncement);
  const requests = useDmRequests(!!viewerActorId);
  const acceptRequest = useAcceptDmRequest();
  const deleteRequest = useDeleteDmRequest();
  const send = useSendDirectMessage();
  useDmSocket(!!viewerActorId);

  const requestList = requests.data ?? [];
  const requestEntries: DirectInboxEntry[] = requestList.map((entry) => ({
    kind: 'direct',
    actor: entry.sender,
    lastMessage: entry.messages[entry.messages.length - 1] ?? null,
    requestedAt: entry.requestedAt,
  }));
  const inboxEntries: DirectInboxEntry[] = (
    conversations.data?.conversations ?? []
  ).map((entry) => ({
    kind: 'direct',
    actor: entry.counterparty,
    lastMessage: entry.lastMessage,
  }));
  const existingIds = new Set(inboxEntries.map((entry) => entry.actor.id));
  const allInbox: DirectInboxEntry[] = [
    ...newConversations.filter((entry) => !existingIds.has(entry.actor.id)),
    ...inboxEntries,
  ];
  const groupMismatch =
    !!groups.data && groups.data.viewerActorId !== viewerActorId;
  const groupEntries =
    groupMismatch || conversationUnavailable(groups.error)
      ? []
      : (groups.data?.groups ?? []);
  useEffect(() => {
    if (
      !groups.data ||
      groups.data.viewerActorId !== viewerActorId ||
      conversationUnavailable(groups.error)
    )
      return;
    for (const group of groups.data.groups) {
      if (group.lastMessage)
        groupState.confirm(group.handle, [group.lastMessage]);
    }
  }, [groups.data, groups.error, viewerActorId, groupState.confirm]);

  const entries =
    view === 'requests'
      ? requestEntries
      : mergeInboxEntries(allInbox, groupEntries);
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
  const requestsReady = !!viewerActorId && requests.isSuccess;
  const canReply =
    thread.data?.canSend === 'allow' && !isInboundRequest && requestsReady;
  const draft = activeActorId
    ? (drafts[activeActorId] ?? EMPTY_MESSAGE_DRAFT)
    : EMPTY_MESSAGE_DRAFT;
  const selectedActor = allEntries.find(
    (entry) => entry.actor.id === activeActorId
  )?.actor;
  const unavailable = conversationUnavailable(thread.error);
  const isListLoading =
    view === 'requests'
      ? requests.isLoading
      : conversations.isLoading || (!!viewerActorId && groups.isLoading);
  const issues: InboxIssue[] = [];
  if (view === 'requests' ? requests.isError : conversations.isError) {
    issues.push({
      id: 'direct',
      message: 'Could not load these conversations. Please try again.',
      onRetry: () => {
        void (view === 'requests'
          ? requests.refetch()
          : conversations.refetch());
      },
    });
  }
  if (view === 'inbox' && (groups.isError || groupMismatch)) {
    issues.push({
      id: 'groups',
      message: groupMismatch
        ? 'Your active profile changed. Reload Messages to continue.'
        : 'Could not load group chats. Please try again.',
      onRetry: () => {
        if (groupMismatch) window.location.reload();
        else void groups.refetch();
      },
    });
  }

  const activate = useCallback((next: InboxSelection | null) => {
    activeSelection.current = next;
    setSelection(next);
  }, []);

  useEffect(() => {
    if (previousInitialSelection.current === initialSelection) return;
    previousInitialSelection.current = initialSelection;
    pendingInitialActor.current =
      initialSelection?.kind === 'direct' ? initialSelection.id : null;
    focusWhenLoaded.current = pendingInitialActor.current;
    activate(initialSelection);
    setView('inbox');
    setDetailOpen(!!initialSelection);
  }, [initialSelection, activate]);

  useEffect(() => {
    if (
      activeSelection.current === null &&
      !isListLoading &&
      entries.length > 0
    )
      activate(inboxSelection(entries[0]));
  }, [selection, isListLoading, entries, activate]);

  useEffect(() => {
    const actorId = pendingInitialActor.current;
    if (!actorId || !requestsReady) return;
    pendingInitialActor.current = null;
    if (
      activeSelection.current?.kind === 'direct' &&
      activeSelection.current.id === actorId &&
      requestList.some((entry) => entry.sender.id === actorId)
    ) {
      setView('requests');
    }
  }, [requestList, requestsReady]);

  const rememberActor = useCallback((actor: ChatActor) => {
    const entry: DirectInboxEntry = {
      kind: 'direct',
      actor,
      lastMessage: null,
      startedAt: new Date().toISOString(),
    };
    setNewConversations((current) =>
      current.some((candidate) => candidate.actor.id === actor.id)
        ? current
        : [entry, ...current]
    );
  }, []);

  useEffect(() => {
    if (
      initialActorId &&
      activeActorId === initialActorId &&
      thread.data?.counterparty.id === initialActorId &&
      requestsReady &&
      !isInboundRequest &&
      !unavailable
    )
      rememberActor(thread.data.counterparty);
  }, [
    initialActorId,
    activeActorId,
    thread.data,
    requestsReady,
    isInboundRequest,
    unavailable,
    rememberActor,
  ]);

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

  const selectThread = (entry: InboxEntry) => {
    pendingInitialActor.current = null;
    focusWhenLoaded.current = null;
    activate(inboxSelection(entry));
    setDetailOpen(true);
    requestAnimationFrame(() =>
      conversationRef.current?.focus({ preventScroll: true })
    );
  };

  const changeView = (next: MessageFolder) => {
    pendingInitialActor.current = null;
    focusWhenLoaded.current = null;
    setView(next);
    activate(null);
    setDetailOpen(false);
  };

  const backToList = useCallback(() => {
    setDetailOpen(false);
    requestAnimationFrame(() =>
      (activeRowRef.current ?? listRef.current)?.focus({
        preventScroll: true,
      })
    );
  }, []);

  useNativeConversation(detailOpen ? backToList : null);

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
      if (
        activeSelection.current?.kind === 'direct' &&
        activeSelection.current.id === actor.id
      ) {
        setView('inbox');
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
      if (
        activeSelection.current?.kind === 'direct' &&
        activeSelection.current.id === actorId
      ) {
        activate(null);
        setDetailOpen(false);
      }
      setNewConversations((current) =>
        current.filter((entry) => entry.actor.id !== actorId)
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
    <>
      <div className={`profile-card ${styles.workspace}`}>
        <ConversationList
          entries={entries}
          view={view}
          onChangeView={changeView}
          viewerActorId={viewerActorId}
          localDomain={localDomain}
          activeKey={selection ? inboxKey(selection) : null}
          activeRowRef={activeRowRef}
          listRef={listRef}
          requestCount={requestEntries.length}
          onSelect={selectThread}
          isLoading={isListLoading}
          issues={issues}
          detailOpen={detailOpen}
          drafts={drafts}
          outgoing={outgoing}
          groupDrafts={groupState.drafts}
          groupOutgoing={groupState.outgoing}
        />
        <section
          ref={conversationRef}
          tabIndex={-1}
          className={styles.conversation}
          data-mobile-hidden={!detailOpen}
          aria-label="Open conversation"
        >
          {activeGroupHandle ? (
            <GroupConversation
              key={activeGroupHandle}
              handle={activeGroupHandle}
              viewerActorId={viewerActorId}
              thread={groupThread}
              state={groupState}
              detailOpen={detailOpen}
              onBack={backToList}
              conversationRef={conversationRef}
            />
          ) : thread.data && !unavailable ? (
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
              isLoading={(thread.isLoading && !!activeActorId) || isListLoading}
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
      <span role="status" className="sr-only">
        {announcement}
      </span>
    </>
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
                  : "Choose a conversation, or open a pana's profile to say hello.")}
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
