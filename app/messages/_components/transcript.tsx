'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  ArrowDown,
  ArrowLeft,
  Clock3,
  Globe,
  Info,
  MessageCircle,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { SafeHtml } from '@/components/safe-html';
import { AttachmentGrid } from '@/components/social/AttachmentGrid';
import styles from '@/components/messages/workspace.module.css';
import { DIRECT_THREAD_REFUSED } from '@/lib/dm-refusal';
import type {
  ChatMessage,
  GroupChatRoom,
  PendingChatMessage,
} from '@/lib/chat';
import {
  ChatAvatar,
  ChatName,
  DeliveryMark,
  ExpiryChip,
  type ChatActor,
} from './chat-primitives';
import {
  actorHandle,
  dayLabel,
  expiresInLabel,
  groupMessages,
  remoteHost,
  timeLabel,
} from '../_lib/format';

export function Transcript<T extends PendingChatMessage>({
  counterparty,
  messages,
  viewerActorId,
  localDomain,
  request,
  outgoing,
  detailOpen,
  onBack,
  onRetry,
  canRetry,
  isSending,
  refreshError,
  onRefresh,
  group,
  onRemoveMessage,
  hasOlder = false,
  isLoadingOlder = false,
  olderError,
  onLoadOlder,
  backLabel = 'Back to conversations',
  showBack = false,
  showOpenInMessages = false,
  latestMessageIds,
}: {
  counterparty: ChatActor;
  messages: ChatMessage[];
  viewerActorId: string;
  localDomain: string | null;
  request?: {
    onAccept: () => void;
    onDelete: () => void;
    isTriaging: boolean;
    error: string | null;
  };
  outgoing: T[];
  detailOpen: boolean;
  onBack: () => void;
  onRetry: (message: T) => void;
  canRetry: boolean;
  isSending: boolean;
  refreshError: string | null;
  onRefresh: () => void;
  group?: GroupChatRoom;
  onRemoveMessage?: (message: ChatMessage) => void;
  hasOlder?: boolean;
  isLoadingOlder?: boolean;
  olderError?: string | null;
  onLoadOlder?: () => void;
  backLabel?: string;
  showBack?: boolean;
  showOpenInMessages?: boolean;
  latestMessageIds?: ReadonlySet<string>;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [newMessages, setNewMessages] = useState(0);
  const historyRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const knownIdsRef = useRef<Set<string> | null>(null);
  const lastOutgoingRef = useRef<string | null>(null);
  const detailWasOpenRef = useRef(false);
  const anchorsRef = useRef<{ id: string; top: number }[]>([]);
  const groups = groupMessages(messages);
  const host = group ? null : remoteHost(counterparty, localDomain);
  const name = group?.name || counterparty.name || counterparty.username;
  const isInboundRequest = !!request;

  const rememberPosition = useCallback(() => {
    const history = historyRef.current;
    if (!history) return;
    const bounds = history.getBoundingClientRect();
    const anchors: { id: string; top: number }[] = [];
    for (const element of history.querySelectorAll<HTMLElement>(
      '[data-chat-message-id]'
    )) {
      const box = element.getBoundingClientRect();
      if (
        box.bottom > bounds.top &&
        box.top < bounds.bottom &&
        element.dataset.chatMessageId
      ) {
        anchors.push({
          id: element.dataset.chatMessageId,
          top: box.top - bounds.top,
        });
        if (anchors.length === 3) break;
      }
    }
    anchorsRef.current = anchors;
  }, []);

  const restorePosition = useCallback(() => {
    const history = historyRef.current;
    if (!history) return;
    for (const anchor of anchorsRef.current) {
      const element = history.querySelector<HTMLElement>(
        `[data-chat-message-id="${CSS.escape(anchor.id)}"]`
      );
      if (!element) continue;
      const delta =
        element.getBoundingClientRect().top -
        history.getBoundingClientRect().top -
        anchor.top;
      if (Math.abs(delta) > 0.5) history.scrollTop += delta;
      break;
    }
  }, []);

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
    const known = knownIdsRef.current;
    const incoming = known
      ? messages.filter(
          (message) =>
            !known.has(message.id) &&
            message.actor.id !== viewerActorId &&
            (!latestMessageIds || latestMessageIds.has(message.id))
        ).length
      : 0;
    const latestOutgoing = outgoing[outgoing.length - 1];
    const sending =
      latestOutgoing?.delivery === 'sending' &&
      latestOutgoing.id !== lastOutgoingRef.current;
    const opening = detailOpen && !detailWasOpenRef.current;

    if (!known || opening || nearBottomRef.current || sending) {
      history.scrollTop = history.scrollHeight;
      nearBottomRef.current = true;
      setAtBottom(true);
      setNewMessages(0);
    } else if (incoming > 0) {
      restorePosition();
      setNewMessages((count) => count + incoming);
    } else {
      restorePosition();
    }

    knownIdsRef.current = new Set(messages.map((message) => message.id));
    lastOutgoingRef.current = latestOutgoing?.id ?? null;
    detailWasOpenRef.current = detailOpen;
  }, [
    messages,
    outgoing,
    viewerActorId,
    detailOpen,
    restorePosition,
    latestMessageIds,
  ]);

  useEffect(() => {
    const history = historyRef.current;
    const content = contentRef.current;
    if (!history || !content) return;
    const observer = new ResizeObserver(() => {
      if (nearBottomRef.current) history.scrollTop = history.scrollHeight;
      else restorePosition();
    });
    observer.observe(history);
    observer.observe(content);
    return () => observer.disconnect();
  }, [restorePosition]);

  return (
    <>
      <header className={styles.conversationHeader}>
        <button
          type="button"
          className={`${styles.iconButton} ${showBack ? '' : styles.backButton}`}
          aria-label={backLabel}
          onClick={onBack}
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <ChatAvatar actor={counterparty} size={42} />
        <div className="min-w-0 flex-1">
          <ChatName
            actor={counterparty}
            remoteHost={host}
            className="text-[15px]"
          />
          {group ? (
            <Link
              href={`/g/${encodeURIComponent(group.handle)}`}
              className="text-pana-ink/65 mt-0.5 block truncate text-[11px] font-medium"
            >
              Group overview · {group.memberCount}{' '}
              {group.memberCount === 1 ? 'member' : 'members'}
            </Link>
          ) : host ? (
            <p className="text-pana-ink/60 mt-0.5 truncate text-[11px] font-medium">
              @{actorHandle(counterparty, localDomain)}
            </p>
          ) : (
            <Link
              href={`/p/${counterparty.username}`}
              className="text-pana-ink/60 hover:text-pana-ink mt-0.5 block truncate text-[11px] font-medium"
            >
              @{counterparty.username}
            </Link>
          )}
        </div>
        <span className="text-pana-ink/55 bg-pana-cream hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-semibold lg:inline-flex">
          <Clock3 className="h-3 w-3" aria-hidden="true" />
          30-day history
        </span>
        {group && showOpenInMessages && (
          <Link
            href={`/messages?group=${encodeURIComponent(group.handle)}`}
            className={styles.iconButton}
            aria-label="Open this group chat in Messages"
          >
            <MessageCircle className="h-5 w-5" aria-hidden="true" />
          </Link>
        )}
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
            means Pana accepted the message, not that it was read. There are no
            read receipts or online indicators.
          </p>
          {group && (
            <p className="text-pana-ink/65">
              Only active group members can read and post here. Admins and
              moderators can remove messages. Chat messages are separate from
              group posts and are not federated.
            </p>
          )}
        </div>
      )}
      {refreshError && (
        <div className={styles.inlineError} role="alert">
          {refreshError}
          <button type="button" onClick={onRefresh}>
            Try again
          </button>
        </div>
      )}
      {request && (
        <HeldBanner
          counterparty={counterparty}
          onAccept={request.onAccept}
          onDelete={request.onDelete}
          isTriaging={request.isTriaging}
          error={request.error}
        />
      )}
      {host && (
        <div className="bg-pana-indigo/8 border-pana-ink/10 flex flex-none items-start gap-2 border-b px-5 py-2.5">
          <Globe
            className="text-pana-indigo/70 mt-px h-3.5 w-3.5 flex-none"
            aria-hidden="true"
          />
          <p className="text-pana-ink/70 text-xs leading-relaxed">
            <span className="font-extrabold">On {host}.</span> Messages are
            delivered to their server, so replies can take a little longer.
          </p>
        </div>
      )}
      <div className={styles.historyArea}>
        <div
          ref={historyRef}
          className={styles.history}
          role="log"
          aria-label={`Conversation with ${name}`}
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
            if (near) anchorsRef.current = [];
            else rememberPosition();
          }}
        >
          <div ref={contentRef}>
            {hasOlder && onLoadOlder && (
              <div className="pb-5 text-center">
                <button
                  type="button"
                  disabled={isLoadingOlder}
                  className="text-pana-indigo border-pana-indigo/15 min-h-11 rounded-full border bg-white px-4 text-xs font-extrabold disabled:opacity-50"
                  onClick={() => {
                    rememberPosition();
                    onLoadOlder();
                  }}
                >
                  {isLoadingOlder
                    ? 'Loading older messages...'
                    : 'Load older messages'}
                </button>
                {olderError && (
                  <p className="text-pana-red-deep mt-2 text-xs" role="alert">
                    {olderError}
                  </p>
                )}
              </div>
            )}
            {messages.length === 0 && outgoing.length === 0 && (
              <div className="flex min-h-52 flex-col items-center justify-center px-4 py-8 text-center">
                {group ? (
                  <Users
                    className="text-pana-indigo mb-4 h-8 w-8"
                    aria-hidden="true"
                  />
                ) : (
                  <MessageCircle
                    className="text-pana-indigo mb-4 h-8 w-8"
                    aria-hidden="true"
                  />
                )}
                <p className="text-pana-ink text-xl font-black tracking-tight">
                  {isInboundRequest
                    ? 'A request is still waiting.'
                    : 'Say a little hello.'}
                </p>
                <p className="text-pana-ink/60 mt-2 max-w-64 text-xs leading-relaxed">
                  {isInboundRequest
                    ? 'The messages in this request have left the 30-day window. You can still accept or delete it.'
                    : group
                      ? 'Say hello to the group. Only members can see this chat.'
                      : `This is the start of your conversation with ${name.split(' ')[0]}.`}
                </p>
              </div>
            )}
            {groups.map((batch, groupIndex) => {
              const mine = batch[0].actor.id === viewerActorId;
              const prior = groups[groupIndex - 1];
              const day = dayLabel(batch[0].published);
              const showDay = !prior || dayLabel(prior[0].published) !== day;
              const last = batch[batch.length - 1];
              return (
                <div key={batch[0].id} className="mb-5">
                  {showDay && (
                    <div className="pt-2 pb-6 text-center">
                      <span className={styles.dayChip}>{day}</span>
                    </div>
                  )}
                  <div
                    className={`flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'}`}
                  >
                    {!mine && (
                      <ChatAvatar
                        actor={group ? batch[0].actor : counterparty}
                        size={28}
                      />
                    )}
                    <div
                      className={`flex max-w-[82%] flex-col gap-1.5 md:max-w-[76%] ${mine ? 'items-end' : 'items-start'}`}
                    >
                      {group && !mine && (
                        <Link
                          href={`/p/${encodeURIComponent(batch[0].actor.username)}`}
                          className="text-pana-indigo px-1 text-[11px] font-extrabold"
                        >
                          {batch[0].actor.name || batch[0].actor.username}
                        </Link>
                      )}
                      {batch.map((message) => (
                        <Bubble
                          key={message.id}
                          message={message}
                          mine={mine}
                          onRemove={onRemoveMessage}
                        />
                      ))}
                      <span className="mt-0.5 flex items-center gap-2 px-1">
                        <span className={styles.messageTime}>
                          {timeLabel(last.published)}
                        </span>
                        {mine && <DeliveryMark state="sent" />}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
            {outgoing.map((message) => (
              <div
                key={message.id}
                data-chat-message-id={message.id}
                className="mb-5 flex justify-end"
              >
                <div className="flex max-w-[82%] flex-col items-end gap-1.5 md:max-w-[76%]">
                  {message.content && (
                    <div
                      className={styles.bubble}
                      data-mine="true"
                      data-failed={message.delivery === 'failed'}
                    >
                      {message.content}
                    </div>
                  )}
                  {!!message.attachments?.length && (
                    <div
                      className={styles.attachmentBubble}
                      data-mine="true"
                      data-failed={message.delivery === 'failed'}
                    >
                      <AttachmentGrid
                        attachments={message.attachments.map(
                          (attachment, index) => ({
                            ...attachment,
                            id: `${message.id}-${index}`,
                          })
                        )}
                      />
                    </div>
                  )}
                  <span className="mt-0.5 flex flex-wrap items-center gap-2 px-1">
                    <span className={styles.messageTime}>
                      {timeLabel(message.published)}
                    </span>
                    <DeliveryMark state={message.delivery} />
                    {message.delivery === 'failed' &&
                      canRetry &&
                      message.error !== DIRECT_THREAD_REFUSED && (
                        <button
                          type="button"
                          disabled={isSending}
                          onClick={() => onRetry(message)}
                          className="text-pana-red-deep inline-flex min-h-11 items-center gap-1 text-xs font-extrabold underline underline-offset-2 disabled:opacity-50"
                        >
                          <RotateCcw className="h-3 w-3" aria-hidden="true" />
                          Retry
                        </button>
                      )}
                  </span>
                  {message.delivery === 'failed' && (
                    <p
                      className="text-pana-red-deep max-w-72 text-right text-xs leading-relaxed"
                      role="alert"
                    >
                      {message.error}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
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
  onRemove,
}: {
  message: ChatMessage;
  mine: boolean;
  onRemove?: (message: ChatMessage) => void;
}) {
  const expiresIn = expiresInLabel(message.expiresAt);
  return (
    <div
      data-chat-message-id={message.id}
      className={`flex max-w-full flex-col gap-1 ${mine ? 'items-end' : 'items-start'}`}
    >
      {!!message.content?.trim() && (
        <div className={styles.bubble} data-mine={mine}>
          <SafeHtml html={message.content} className="chat-bubble-body" />
        </div>
      )}
      {!!message.attachments?.length && (
        <div className={styles.attachmentBubble} data-mine={mine}>
          <AttachmentGrid attachments={message.attachments} />
        </div>
      )}
      <div className="flex max-w-full items-center gap-2">
        {expiresIn && <ExpiryChip expiresIn={expiresIn} />}
        {message.canDelete && onRemove && (
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Delete message"
            title="Delete for everyone"
            onClick={() => onRemove(message)}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}

function HeldBanner({
  counterparty,
  onAccept,
  onDelete,
  isTriaging,
  error,
}: {
  counterparty: ChatActor;
  onAccept: () => void;
  onDelete: () => void;
  isTriaging: boolean;
  error: string | null;
}) {
  const first = (counterparty.name || counterparty.username).split(' ')[0];
  return (
    <div className="bg-pana-butter border-pana-ink/10 flex-none border-b px-5 py-3">
      <p className="text-pana-ink text-xs leading-relaxed">
        <span className="font-extrabold">
          {first} is not one of your Panas.
        </span>{' '}
        This request did not notify you. Accept it to reply and let them message
        you from now on.
      </p>
      {error && (
        <p className="text-pana-red-deep mt-2 text-xs font-bold" role="alert">
          {error}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onAccept}
          disabled={isTriaging}
          aria-label="Accept request"
          className="bg-pana-indigo text-pana-cream inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-xs font-extrabold disabled:opacity-50"
        >
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Accept
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={isTriaging}
          aria-label="Delete request"
          className="border-pana-ink/15 text-pana-ink min-h-11 rounded-xl border bg-white px-3 text-xs font-bold disabled:opacity-50"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
