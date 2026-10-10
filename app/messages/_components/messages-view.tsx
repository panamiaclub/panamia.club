'use client';

import { useEffect, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import {
  useAcceptDmRequest,
  useConversation,
  useConversations,
  useDeleteDmRequest,
  useDmRequests,
  useSendDirectMessage,
  type DraftAttachment,
} from '@/lib/query/social';
import { ConversationList, type ListEntry } from './conversation-list';
import { Transcript } from './transcript';
import { Composer } from './composer';
import { useDmSocket } from '../_lib/use-dm-socket';

/* The container: which thread is open, and what is in flight.
 *
 * Selection lives in component state rather than the URL. A DM thread is not
 * a shareable address -- the only person who can open it is the one already
 * signed in as a participant -- so a route segment would add a path that reads
 * like a permalink and is not one. It also keeps the list mounted, which is
 * what makes switching threads feel like a chat app instead of a navigation.
 *
 * The one piece of local state that is not selection is `pending`: the text of
 * a message that has been submitted and not yet come back from the server. The
 * send hook deliberately does not insert optimistically into the cache, so
 * this is held here and rendered as a distinct "Sending" bubble, then dropped
 * when the refetch returns the real row. */
export function MessagesView() {
  const [view, setView] = useState<'inbox' | 'requests'>('inbox');
  const [activeActorId, setActiveActorId] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const conversations = useConversations();
  const thread = useConversation(activeActorId);
  const requests = useDmRequests();
  const acceptRequest = useAcceptDmRequest();
  const deleteRequest = useDeleteDmRequest();
  const send = useSendDirectMessage(activeActorId);

  // One socket for the whole view, not one per thread. The mailbox is scoped to
  // the actor, so a single connection covers every conversation plus Requests —
  // which is also why switching threads does not reconnect anything.
  useDmSocket(true);

  const requestList = requests.data ?? [];

  // Whether the open thread is one the viewer has not accepted yet. Derived
  // from their own Requests folder rather than from the send gate: the gate
  // answers "may I write to them", which is a fact about the counterparty's
  // settings and is deliberately not disclosed. This answers "did I accept
  // them", which is the viewer's own.
  const isInboundRequest = requestList.some(
    (entry) => entry.sender.id === activeActorId
  );

  // Both folders render through the same row, so a request looks like what it
  // is -- a conversation you have not answered -- rather than a different kind
  // of object. A request entry carries its own messages, newest last.
  const entries: ListEntry[] =
    view === 'requests'
      ? requestList
          .filter((entry) => entry.messages.length > 0)
          .map((entry) => ({
            actor: entry.sender,
            lastMessage: entry.messages[entry.messages.length - 1],
          }))
      : (conversations.data?.conversations ?? []).map((conversation) => ({
          actor: conversation.counterparty,
          lastMessage: conversation.lastMessage,
        }));

  // Open the first thread in the current folder so the view is never an empty
  // frame for someone who does have conversations. Only when nothing is
  // selected: re-running it after every refetch would yank the reader out of
  // whatever they opened the moment a message arrived elsewhere.
  useEffect(() => {
    if (activeActorId === null && entries.length > 0) {
      setActiveActorId(entries[0].actor.id);
    }
  }, [activeActorId, entries]);

  // A thread switch has to clear both, or the next thread opens showing the
  // previous one's unsent text as a pending bubble and its refusal as an error.
  const selectThread = (actorId: string) => {
    setActiveActorId(actorId);
    setPending(null);
    setSendError(null);
  };

  const changeView = (next: 'inbox' | 'requests') => {
    setView(next);
    setActiveActorId(null);
    setPending(null);
    setSendError(null);
  };

  const handleSend = (text: string, attachments?: DraftAttachment[]) => {
    // A GIF sent with no caption has no text to echo, so the pending bubble
    // says what is actually in flight. Without this it would be an empty
    // bubble, which reads as a bug rather than as a message on its way.
    setPending(text || (attachments?.length ? 'GIF' : ''));
    setSendError(null);
    send.mutate(
      { content: text, attachments },
      {
        onSuccess: () => setPending(null),
        onError: (error) => {
          // createStatus answers a refused thread with 400 and the gate's single
          // refusal string. Surfacing the server's own words rather than a
          // generic failure matters because this is the one case where the
          // message is not going to be delivered no matter how many times it is
          // retried -- and the pending bubble has to go, or it implies a queue.
          setPending(null);
          setSendError(
            (error as { response?: { data?: { error?: string } } })?.response
              ?.data?.error ?? 'Could not send. Try again.'
          );
        },
      }
    );
  };

  // Accepting moves the thread out of Requests and into Messages, so the view
  // follows it rather than leaving the reader staring at the folder it just
  // left. Deleting withdraws it entirely, so there is nowhere to follow to.
  const handleAccept = (actorId: string) => {
    acceptRequest.mutate(actorId, {
      onSuccess: () => {
        setView('inbox');
        setActiveActorId(actorId);
        setPending(null);
      },
    });
  };

  const handleDelete = (actorId: string) => {
    deleteRequest.mutate(actorId, {
      onSuccess: () => {
        setActiveActorId(null);
        setPending(null);
      },
    });
  };

  return (
    <div className="border-pana-ink/14 overflow-hidden rounded-2xl border-2 bg-white lg:grid lg:grid-cols-[20rem_1fr]">
      <ConversationList
        entries={entries}
        view={view}
        onChangeView={changeView}
        viewerActorId={conversations.data?.viewerActorId ?? null}
        localDomain={conversations.data?.localDomain ?? null}
        activeActorId={activeActorId}
        requestCount={requestList.length}
        onSelect={selectThread}
        isLoading={
          view === 'requests' ? requests.isLoading : conversations.isLoading
        }
      />

      {thread.data ? (
        <div className="flex flex-col">
          <Transcript
            counterparty={thread.data.counterparty}
            messages={thread.data.messages}
            viewerActorId={thread.data.viewerActorId}
            localDomain={thread.data.localDomain}
            isInboundRequest={isInboundRequest}
            pending={pending}
            onAccept={() => handleAccept(thread.data!.counterparty.id)}
            onDelete={() => handleDelete(thread.data!.counterparty.id)}
            isTriaging={acceptRequest.isPending || deleteRequest.isPending}
          />
          <Composer
            canSend={thread.data.canSend}
            counterpartyName={
              thread.data.counterparty.name || thread.data.counterparty.username
            }
            onSend={handleSend}
            isSending={send.isPending}
            error={sendError}
          />
        </div>
      ) : (
        <EmptyState isLoading={thread.isLoading && !!activeActorId} />
      )}
    </div>
  );
}

function EmptyState({ isLoading }: { isLoading: boolean }) {
  return (
    <div className="flex min-h-[20rem] flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <MessageSquare className="text-pana-ink/25 h-9 w-9" aria-hidden="true" />
      <p className="text-pana-ink/55 text-sm font-bold">
        {isLoading ? 'Opening conversation…' : 'Pick a conversation.'}
      </p>
      {!isLoading && (
        <p className="text-pana-ink/45 max-w-sm text-sm font-medium">
          Messages here disappear 30 days after they are sent. To start a new
          one, search for a pana in the box on the left.
        </p>
      )}
    </div>
  );
}
