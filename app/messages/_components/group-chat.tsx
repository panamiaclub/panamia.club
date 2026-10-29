'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import Link from 'next/link';
import { ArrowLeft, Users } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import styles from '@/components/messages/workspace.module.css';
import {
  GROUP_CHAT_UNAVAILABLE,
  type ChatMessage,
  type GroupChatOutgoing,
  type GroupChatRoom,
} from '@/lib/chat';
import { Composer } from './composer';
import { Transcript } from './transcript';
import {
  mergeGroupChatPages,
  useDeleteGroupChatMessage,
  useSendGroupChatMessage,
  type useGroupChatThread,
} from '../_lib/group-chat-query';
import {
  conversationUnavailable,
  EMPTY_MESSAGE_DRAFT,
  messageError,
  unconfirmedMessages,
  type MessageDraft,
} from '../_lib/workspace';

export function useGroupChatState(
  viewerActorId: string | null,
  onAnnounce?: (message: string) => void
) {
  const [drafts, setDrafts] = useState<Record<string, MessageDraft>>({});
  const [outgoing, setOutgoing] = useState<GroupChatOutgoing[]>([]);
  const [sending, setSending] = useState<Set<string>>(new Set());
  const [announcement, setAnnouncement] = useState('');
  const locks = useRef(new Set<string>());
  const acknowledged = useRef(new Set<string>());
  const mutation = useSendGroupChatMessage();
  const announce = (message: string) => {
    setAnnouncement(message);
    onAnnounce?.(message);
  };

  const changeDraft = useCallback(
    (handle: string, patch: Partial<MessageDraft>) => {
      setDrafts((current) => ({
        ...current,
        [handle]: { ...(current[handle] ?? EMPTY_MESSAGE_DRAFT), ...patch },
      }));
    },
    []
  );

  const confirm = useCallback((handle: string, messages: ChatMessage[]) => {
    for (const message of messages) {
      if (message.clientId)
        acknowledged.current.add(`${handle}:${message.clientId}`);
    }
    setOutgoing((current) => {
      const remaining = new Set(
        unconfirmedMessages(
          current.filter((message) => message.handle === handle),
          messages
        ).map((message) => message.id)
      );
      const next = current.filter(
        (message) => message.handle !== handle || remaining.has(message.id)
      );
      return next.length === current.length ? current : next;
    });
  }, []);

  const transmit = async (message: GroupChatOutgoing) => {
    locks.current.add(message.handle);
    setSending((current) => new Set(current).add(message.handle));
    try {
      const posted = await mutation.mutateAsync({
        handle: message.handle,
        clientId: message.clientId,
        content: message.content,
        attachments: message.attachments,
      });
      if (
        posted.actor.id !== viewerActorId ||
        posted.groupId !== message.groupId ||
        posted.clientId !== message.clientId
      ) {
        throw new Error(
          'Your active profile changed. Reload this chat to confirm delivery.'
        );
      }
      acknowledged.current.add(`${message.handle}:${message.clientId}`);
      setOutgoing((current) =>
        current.map((entry) =>
          entry.id === message.id
            ? {
                ...entry,
                delivery: 'sent',
                serverId: posted.id,
                published: posted.published,
                error: undefined,
              }
            : entry
        )
      );
      announce(`Message to @${message.handle} sent.`);
    } catch (error) {
      if (acknowledged.current.has(`${message.handle}:${message.clientId}`)) {
        announce(`Message to @${message.handle} sent.`);
      } else {
        const detail = messageError(
          error,
          'Could not confirm delivery. Your message is kept; try again.'
        );
        setOutgoing((current) =>
          current.map((entry) =>
            entry.id === message.id
              ? { ...entry, delivery: 'failed', error: detail }
              : entry
          )
        );
        announce(`Message to @${message.handle} not sent. ${detail}`);
      }
    } finally {
      locks.current.delete(message.handle);
      setSending((current) => {
        const next = new Set(current);
        next.delete(message.handle);
        return next;
      });
    }
  };

  const send = (room: GroupChatRoom) => {
    const draft = drafts[room.handle] ?? EMPTY_MESSAGE_DRAFT;
    if (
      !viewerActorId ||
      locks.current.has(room.handle) ||
      draft.isMirroring ||
      (!draft.text.trim() && !draft.gif)
    )
      return;
    const clientId = crypto.randomUUID();
    const message: GroupChatOutgoing = {
      id: clientId,
      clientId,
      handle: room.handle,
      groupId: room.id,
      content: draft.text.trim(),
      published: new Date().toISOString(),
      delivery: 'sending',
      ...(draft.gif ? { attachments: [draft.gif] } : {}),
    };
    setOutgoing((current) => [...current, message]);
    setDrafts((current) => ({
      ...current,
      [room.handle]: EMPTY_MESSAGE_DRAFT,
    }));
    void transmit(message);
  };
  const retry = (message: GroupChatOutgoing) => {
    if (!viewerActorId || locks.current.has(message.handle)) return;
    setOutgoing((current) =>
      current.map((entry) =>
        entry.id === message.id
          ? { ...entry, delivery: 'sending', error: undefined }
          : entry
      )
    );
    void transmit(message);
  };
  return {
    drafts,
    outgoing,
    sending,
    announcement,
    changeDraft,
    confirm,
    send,
    retry,
  };
}

export function GroupConversation({
  handle,
  viewerActorId,
  thread,
  state,
  detailOpen,
  onBack,
  conversationRef,
  enabled = true,
  standalone = false,
}: {
  handle: string;
  viewerActorId: string | null;
  thread: ReturnType<typeof useGroupChatThread>;
  state: ReturnType<typeof useGroupChatState>;
  detailOpen: boolean;
  onBack: () => void;
  conversationRef: RefObject<HTMLElement | null>;
  enabled?: boolean;
  standalone?: boolean;
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const deleteTriggerRef = useRef<HTMLElement | null>(null);
  const messages = useMemo(
    () => mergeGroupChatPages(thread.data?.pages),
    [thread.data]
  );
  const page = thread.data?.pages[0];
  const latestMessageIds = useMemo(
    () => new Set(page?.messages.map((message) => message.id) ?? []),
    [page?.messages]
  );
  const unavailable = conversationUnavailable(thread.error);
  const mismatch = !!page && page.viewerActorId !== viewerActorId;
  const [selected, setSelected] = useState<string | null>(null);
  const [deletionError, setDeletionError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const deletion = useDeleteGroupChatMessage();

  useEffect(() => {
    if (enabled && page && !unavailable && !mismatch)
      state.confirm(handle, messages);
  }, [enabled, page, unavailable, mismatch, handle, messages, state.confirm]);

  if (!enabled) return null;
  if (!page || unavailable || mismatch) {
    return (
      <GroupChatPlaceholder
        loading={thread.isLoading}
        message={
          mismatch
            ? 'Your active profile changed. Reload this chat.'
            : thread.isError
              ? unavailable
                ? GROUP_CHAT_UNAVAILABLE
                : 'Could not open this group chat. Please try again.'
              : undefined
        }
        onBack={onBack}
        onRetry={() =>
          mismatch ? window.location.reload() : void thread.refetch()
        }
        standalone={standalone}
        handle={handle}
      />
    );
  }

  const room = page.group;
  const draft = state.drafts[handle] ?? EMPTY_MESSAGE_DRAFT;
  const outgoing = unconfirmedMessages(
    state.outgoing.filter((message) => message.handle === handle),
    messages
  );
  const remove = async () => {
    if (!selected || deletion.isPending) return;
    setDeletionError(null);
    try {
      await deletion.mutateAsync({ handle, messageId: selected });
      setSelected(null);
      setAnnouncement('Message removed for the group.');
    } catch (error) {
      setDeletionError(
        messageError(error, 'Could not remove this message. Try again.')
      );
    }
  };

  return (
    <>
      <Transcript
        key={handle}
        counterparty={{
          id: room.actorId,
          username: room.handle,
          name: room.name,
          iconUrl: room.iconUrl,
          domain: page.localDomain,
        }}
        group={room}
        messages={messages}
        latestMessageIds={latestMessageIds}
        viewerActorId={viewerActorId ?? page.viewerActorId}
        localDomain={page.localDomain}
        outgoing={outgoing}
        detailOpen={detailOpen}
        onBack={onBack}
        backLabel={standalone ? 'Back to group' : 'Back to conversations'}
        showBack={standalone}
        showOpenInMessages={standalone}
        onRetry={state.retry}
        canRetry={!unavailable}
        isSending={state.sending.has(handle)}
        onRemoveMessage={(message) => {
          setDeletionError(null);
          deleteTriggerRef.current =
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null;
          setSelected(message.id);
        }}
        hasOlder={thread.hasNextPage}
        isLoadingOlder={thread.isFetchingNextPage}
        olderError={
          thread.isFetchNextPageError
            ? 'Could not load older messages. Try again.'
            : null
        }
        onLoadOlder={() => {
          void thread.fetchNextPage();
        }}
        refreshError={
          thread.isRefetchError
            ? 'Could not refresh this group chat. Showing the last update.'
            : null
        }
        onRefresh={() => {
          void thread.refetch();
        }}
      />
      <Composer
        key={`group-composer-${handle}`}
        canSend="allow"
        counterpartyName={room.name}
        draft={draft}
        onChange={(patch) => state.changeDraft(handle, patch)}
        onSend={() => state.send(room)}
        isSending={state.sending.has(handle)}
        inputRef={inputRef}
      />
      <span className="sr-only" role="status">
        {announcement}
      </span>
      <AlertDialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open && !deletion.isPending) setSelected(null);
        }}
      >
        <AlertDialogContent
          className="w-[calc(100%-2rem)] rounded-2xl bg-white"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const target = deleteTriggerRef.current?.isConnected
              ? deleteTriggerRef.current
              : (inputRef.current ?? conversationRef.current);
            target?.focus({ preventScroll: true });
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this message?</AlertDialogTitle>
            <AlertDialogDescription>
              It will be removed for everyone in {room.name}. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deletionError && (
            <p className="text-pana-red-deep text-sm" role="alert">
              {deletionError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletion.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deletion.isPending}
              className="bg-pana-red-deep text-white"
              onClick={(event) => {
                event.preventDefault();
                void remove();
              }}
            >
              {deletion.isPending ? 'Removing...' : 'Remove message'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function GroupChatPlaceholder({
  loading = false,
  message,
  onBack,
  onRetry,
  standalone = false,
  handle,
}: {
  loading?: boolean;
  message?: string;
  onBack: () => void;
  onRetry?: () => void;
  standalone?: boolean;
  handle?: string;
}) {
  return (
    <>
      <header className={styles.conversationHeader}>
        <button
          type="button"
          className={`${styles.iconButton} ${standalone ? '' : styles.backButton}`}
          aria-label={standalone ? 'Back to group' : 'Back to conversations'}
          onClick={onBack}
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <h1 className="text-pana-ink text-sm font-extrabold">Group chat</h1>
      </header>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <Users className="text-pana-indigo h-8 w-8" aria-hidden="true" />
        <h2 className="text-xl font-black">
          {loading
            ? 'Opening group chat...'
            : message
              ? 'This chat is not available.'
              : 'Good conversations belong here.'}
        </h2>
        <p
          className="text-pana-ink/65 max-w-80 text-sm"
          role={message ? 'alert' : 'status'}
        >
          {message ??
            (loading
              ? 'Your messages are on their way.'
              : 'Choose one of your groups. Only active members can read and post in its chat.')}
        </p>
        {message && onRetry && (
          <button
            type="button"
            className="text-pana-indigo min-h-11 px-4 text-sm font-extrabold underline"
            onClick={onRetry}
          >
            Try again
          </button>
        )}
        {!loading && (
          <Link
            href={handle ? `/g/${encodeURIComponent(handle)}` : '/groups'}
            className="text-pana-indigo min-h-11 px-4 py-3 text-sm font-extrabold underline"
          >
            {handle ? 'View the group' : 'Find a group'}
          </Link>
        )}
      </div>
    </>
  );
}
