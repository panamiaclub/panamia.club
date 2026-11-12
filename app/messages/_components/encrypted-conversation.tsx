'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
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
import {
  ParticipantVerificationRequired,
  type ConversationView,
  type RootApproval,
} from '@/lib/e2ee/chat-client';
import type {
  ChatMessage,
  GroupChatRoom,
  PendingChatMessage,
} from '@/lib/chat';
import { ENCRYPTED_CHAT_UPDATE_EVENT } from '@/lib/chat';
import { isGifMediaUrl } from '@/lib/gifs/giphy';
import { openSafetyReport } from '@/lib/safety-report';
import type { DraftAttachment, GifResult } from '@/lib/query/social';
import {
  useEncryptionDevice,
  type EncryptionConnection,
} from '../_lib/encryption';
import {
  EMPTY_MESSAGE_DRAFT,
  messageDraftCanSend,
  type MessageDraft,
} from '../_lib/workspace';
import { CHAT_PHOTO_MAX_BYTES, prepareChatPhoto } from '../_lib/photos';
import { EncryptionControls } from './encryption-controls';
import { Composer } from './composer';
import { Transcript } from './transcript';
import type { ChatActor } from './chat-primitives';

type RequestActions = {
  onAccept: () => void;
  onDelete: () => void;
  isTriaging: boolean;
  error: string | null;
};
const button =
  'text-pana-indigo min-h-10 rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-50';
function sameDraft(a: MessageDraft, b: MessageDraft) {
  return (
    a.text === b.text &&
    a.photo?.url === b.photo?.url &&
    a.gif?.url === b.gif?.url
  );
}

async function privateGif(gif: GifResult): Promise<File> {
  if (!isGifMediaUrl(gif.url))
    throw new Error('This GIF source is not supported.');
  const response = await fetch(gif.url, {
    credentials: 'omit',
    redirect: 'error',
    referrerPolicy: 'no-referrer',
    signal: AbortSignal.timeout(30_000),
  });
  if (
    !response.ok ||
    response.headers.get('content-type')?.split(';')[0] !== 'image/gif' ||
    !response.body
  )
    throw new Error(
      'Could not load this public GIF for local encryption. Choose another GIF.'
    );
  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let length = 0;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    length += chunk.value.length;
    if (length > CHAT_PHOTO_MAX_BYTES) {
      await reader.cancel();
      throw new Error('Choose a GIF smaller than 10 MB.');
    }
    chunks.push(Uint8Array.from(chunk.value));
  }
  if (!length) throw new Error('This GIF is empty.');
  const creator = gif.creator?.replace(/\s+/g, ' ').trim().slice(0, 60);
  const description =
    gif.description.replace(/\s+/g, ' ').trim().slice(0, 180) || 'GIF';
  return new File(
    chunks,
    `${description}${creator ? ` by ${creator}` : ''} (via GIPHY)`,
    { type: 'image/gif' }
  );
}

export function EncryptedConversation({
  connection,
  counterparty,
  group,
  legacyMessages,
  draft,
  onChange,
  onBack,
  detailOpen,
  canSend = 'allow',
  request,
  standalone = false,
  initialRoomId,
  viewerActorId,
}: {
  connection: EncryptionConnection;
  counterparty: ChatActor;
  group?: GroupChatRoom;
  legacyMessages: ChatMessage[];
  draft: MessageDraft;
  onChange: (patch: Partial<MessageDraft>) => void;
  onBack: () => void;
  detailOpen: boolean;
  canSend?: 'allow' | 'refuse';
  request?: RequestActions;
  standalone?: boolean;
  initialRoomId?: string;
  viewerActorId: string;
}) {
  const client = connection.client;
  const device = useEncryptionDevice(connection);
  const queryClient = useQueryClient();
  const ready =
    !!client &&
    device.data?.approved &&
    device.data.status.identity?.encryptionRequired === true &&
    !device.data.status.identity.rotationRequired;
  const [view, setView] = useState<ConversationView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [verifications, setVerifications] = useState<
    ParticipantVerificationRequired['participants']
  >([]);
  const [verificationOpen, setVerificationOpen] = useState(false);
  const verificationRequest = useRef('');
  const requireVerification = useCallback(
    (participants: ParticipantVerificationRequired['participants']) => {
      const request = participants
        .map((entry) => `${entry.actorId}:${entry.rootPublicKey}`)
        .sort()
        .join('|');
      setVerifications(participants);
      if (verificationRequest.current !== request) setVerificationOpen(true);
      verificationRequest.current = request;
    },
    []
  );
  const [selectedDeletion, setSelectedDeletion] = useState<string | null>(null);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [mediaErrors, setMediaErrors] = useState<Record<string, string>>({});
  const [mediaLoading, setMediaLoading] = useState<string[]>([]);
  const [, setMediaVersion] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const roomId = useRef<string | null>(initialRoomId ?? null);
  const currentDraft = useRef(draft);
  currentDraft.current = draft;
  const draftChange = useRef(onChange);
  draftChange.current = onChange;
  const submitted = useRef<{
    clientId: string;
    deviceId: string;
    draft: MessageDraft;
  } | null>(null);
  const alive = useRef(true);
  const synchronizing = useRef(false);
  const sendLock = useRef(false);
  const historyFloor = useRef<number | null>(null);
  const loadedMedia = useRef(
    new Map<string, { url: string; name: string; mediaType: string }>()
  );
  const groupId = group?.id;
  const peerId = counterparty.id;
  const target = useMemo(
    () =>
      groupId
        ? { kind: 'group' as const, groupId }
        : { kind: 'dm' as const, peerActorId: peerId },
    [groupId, peerId]
  );

  const refresh = useCallback(
    async (approvals: RootApproval[] = []) => {
      if (!client || !ready || synchronizing.current) return;
      synchronizing.current = true;
      try {
        const next = roomId.current
          ? await client.conversation(roomId.current, approvals)
          : await client.openConversation(target, approvals);
        if (historyFloor.current !== null) {
          let pages = 0;
          while (
            next.nextHistoryBefore !== null &&
            next.nextHistoryBefore > historyFloor.current
          ) {
            if (++pages > 100)
              throw new Error(
                'This expanded history exceeds the supported local page window. Reopen the conversation to start from recent messages.'
              );
            const before = next.nextHistoryBefore;
            const older = await client.olderHistory(next.room.id, before);
            if (
              older.nextHistoryBefore !== null &&
              older.nextHistoryBefore >= before
            )
              throw new Error(
                'The retained encrypted history cursor did not advance.'
              );
            next.history = [...older.history, ...next.history];
            next.nextHistoryBefore = older.nextHistoryBefore;
          }
        }
        if (!alive.current) return;
        roomId.current = next.room.id;
        const previous = submitted.current;
        if (
          previous &&
          next.history.some(
            (entry) =>
              entry.message.clientId === previous.clientId &&
              entry.message.deviceId === previous.deviceId
          )
        ) {
          submitted.current = null;
          if (sameDraft(currentDraft.current, previous.draft))
            draftChange.current({ ...EMPTY_MESSAGE_DRAFT, privateFiles: {} });
        }
        const retained = new Set(
          next.history.flatMap((entry) =>
            entry.message.attachments.map((file) => file.id)
          )
        );
        for (const [id, file] of loadedMedia.current)
          if (!retained.has(id)) {
            URL.revokeObjectURL(file.url);
            loadedMedia.current.delete(id);
          }
        setView(next);
        setError(null);
        setVerifications([]);
        setVerificationOpen(false);
        verificationRequest.current = '';
      } catch (failure) {
        if (!alive.current) return;
        if (failure instanceof ParticipantVerificationRequired)
          requireVerification(failure.participants);
        else {
          setView(null);
          setError(
            failure instanceof Error
              ? failure.message
              : 'Could not open the encrypted conversation.'
          );
        }
      } finally {
        synchronizing.current = false;
      }
    },
    [client, ready, target, requireVerification]
  );

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      for (const file of loadedMedia.current.values())
        URL.revokeObjectURL(file.url);
      loadedMedia.current.clear();
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    void refresh();
    const wake = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const interval = window.setInterval(wake, 5_000);
    const notified = (event: Event) => {
      if (
        event instanceof CustomEvent &&
        (event.detail?.roomId === roomId.current ||
          (groupId && event.detail?.groupId === groupId))
      )
        void refresh();
    };
    addEventListener(ENCRYPTED_CHAT_UPDATE_EVENT, notified);
    addEventListener('focus', wake);
    document.addEventListener('visibilitychange', wake);
    return () => {
      clearInterval(interval);
      removeEventListener('focus', wake);
      document.removeEventListener('visibilitychange', wake);
      removeEventListener(ENCRYPTED_CHAT_UPDATE_EVENT, notified);
    };
  }, [ready, refresh, groupId]);

  const messages: ChatMessage[] = (view?.history ?? []).map((entry) => ({
    id: entry.id,
    clientId: entry.message.clientId,
    content: entry.message.content,
    encrypted: true,
    actor: view!.room.actors.find(
      (actor) => actor.id === entry.message.actorId
    ) ?? {
      id: entry.message.actorId,
      username: entry.message.actorId,
      domain: counterparty.domain,
      name: 'Former participant',
    },
    published: entry.createdAt,
    expiresAt: entry.expiresAt,
    canDelete:
      entry.message.actorId === connection.context?.actorId ||
      ['admin', 'moderator'].includes(view?.room.role ?? ''),
    attachments: entry.message.attachments.flatMap((file) => {
      const loaded = loadedMedia.current.get(file.id);
      return loaded
        ? [
            {
              id: file.id,
              type: file.mediaType.startsWith('video/') ? 'video' : 'image',
              ...loaded,
            },
          ]
        : [];
    }),
    encryptedAttachments: entry.message.attachments.map(
      ({ id, name, mediaType }) => ({ id, name, mediaType })
    ),
    attachmentErrors: mediaErrors,
    loadingAttachments: mediaLoading,
  }));
  const outgoing: PendingChatMessage[] = (view?.pending ?? []).map((entry) => ({
    id: entry.clientId,
    clientId: entry.clientId,
    content: entry.content || 'Encrypted attachment',
    published: entry.createdAt,
    delivery: sending ? 'sending' : 'failed',
    error:
      'Delivery is not yet confirmed. The exact encrypted attempt is saved on this device.',
  }));
  const change = (patch: Partial<MessageDraft>) => {
    const privateFiles = { ...draft.privateFiles, ...patch.privateFiles };
    if (patch.photo === null) delete privateFiles.photo;
    if (patch.gif === null) delete privateFiles.gif;
    onChange({ ...patch, privateFiles });
  };
  const run = async (operation: () => Promise<void>, refreshAfter = true) => {
    if (sendLock.current || !client) return;
    sendLock.current = true;
    setSending(true);
    setActionError(null);
    setNotice(null);
    try {
      await operation();
    } catch (failure) {
      if (alive.current) {
        if (failure instanceof ParticipantVerificationRequired)
          requireVerification(failure.participants);
        else
          setActionError(
            failure instanceof Error
              ? failure.message
              : 'The encrypted action failed.'
          );
      }
    } finally {
      sendLock.current = false;
      if (alive.current) {
        setSending(false);
        if (refreshAfter) await refresh();
      }
    }
  };
  const send = () =>
    void run(async () => {
      if (
        !client ||
        !view ||
        !messageDraftCanSend(draft) ||
        canSend !== 'allow' ||
        request
      )
        return;
      const files: File[] = [];
      for (const kind of ['photo', 'gif'] as const)
        if (draft[kind]) {
          const file = draft.privateFiles?.[kind];
          if (!file)
            throw new Error(
              'Remove the old public attachment and choose it again for local encryption.'
            );
          files.push(file);
        }
      const previous = submitted.current;
      if (
        previous &&
        sameDraft(previous.draft, draft) &&
        view.pending.some((entry) => entry.clientId === previous.clientId)
      )
        await client.retry(previous.clientId);
      else {
        const clientId =
          previous && sameDraft(previous.draft, draft)
            ? previous.clientId
            : crypto.randomUUID();
        const deviceId = device.data?.localDeviceId;
        if (!deviceId)
          throw new Error('This approved device identity is unavailable.');
        submitted.current = { clientId, deviceId, draft };
        await client.send(view.room.id, clientId, draft.text.trim(), files);
      }
      if (alive.current && sameDraft(currentDraft.current, draft))
        onChange({ ...EMPTY_MESSAGE_DRAFT, privateFiles: {} });
      await queryClient.invalidateQueries({
        queryKey: ['encrypted-messaging-rooms'],
      });
    });
  const openAttachment = (messageId: string, attachmentId: string) => {
    if (!client || !view || mediaLoading.includes(attachmentId)) return;
    const entry = view.history.find((entry) => entry.id === messageId);
    const manifest = entry?.message.attachments.find(
      (file) => file.id === attachmentId
    );
    if (!entry || !manifest) {
      setError('The selected encrypted attachment is no longer available.');
      return;
    }
    setMediaLoading((current) => [...current, attachmentId]);
    void client
      .attachment(view.room.id, manifest, entry.expiresAt)
      .then(
        (file) => {
          try {
            if (!alive.current || Date.parse(entry.expiresAt) <= Date.now())
              return;
            const url = URL.createObjectURL(
              new Blob([Uint8Array.from(file.bytes).buffer], {
                type: file.mediaType,
              })
            );
            const previous = loadedMedia.current.get(manifest.id);
            if (previous) URL.revokeObjectURL(previous.url);
            loadedMedia.current.set(manifest.id, {
              url,
              name: file.name,
              mediaType: file.mediaType,
            });
            setMediaErrors((current) => {
              const next = { ...current };
              delete next[manifest.id];
              return next;
            });
            setMediaVersion((current) => current + 1);
          } finally {
            file.bytes.fill(0);
          }
        },
        (failure) => {
          if (alive.current)
            setMediaErrors((current) => ({
              ...current,
              [attachmentId]:
                failure instanceof Error
                  ? failure.message
                  : 'Could not decrypt this attachment.',
            }));
        }
      )
      .finally(() => {
        if (alive.current)
          setMediaLoading((current) =>
            current.filter((id) => id !== attachmentId)
          );
      });
  };
  if (!ready || !client || !connection.context)
    return (
      <>
        <Transcript
          counterparty={counterparty}
          group={group}
          messages={[]}
          legacyMessages={legacyMessages}
          viewerActorId={viewerActorId}
          localDomain={counterparty.domain}
          outgoing={[]}
          detailOpen={detailOpen}
          onBack={onBack}
          showBack={standalone}
          backLabel={standalone ? 'Back to group' : 'Back to conversations'}
          onRetry={() =>
            setError(
              'An approved encryption device is required before retrying.'
            )
          }
          canRetry={false}
          isSending={false}
          refreshError={null}
          onRefresh={() => void device.refetch()}
        />
        <p className="px-5 py-3 text-sm font-bold">
          This conversation requires end-to-end encryption.
        </p>
        <EncryptionControls connection={connection} />
        {device.error && (
          <p className="px-5 text-xs" role="alert">
            {device.error instanceof Error
              ? device.error.message
              : 'Device approval is unavailable.'}
          </p>
        )}
      </>
    );
  return (
    <>
      <Transcript
        counterparty={counterparty}
        group={group}
        messages={messages}
        legacyMessages={legacyMessages}
        encrypted={!!view}
        viewerActorId={viewerActorId}
        localDomain={connection.context!.actor.domain}
        outgoing={outgoing}
        detailOpen={detailOpen}
        onBack={onBack}
        backLabel={standalone ? 'Back to group' : 'Back to conversations'}
        showBack={standalone}
        showOpenInMessages={standalone}
        onRetry={(message) =>
          void run(async () => {
            await client!.retry(message.clientId ?? message.id);
          })
        }
        canRetry={canSend === 'allow' && !request}
        isSending={sending}
        refreshError={error ?? actionError}
        onRefresh={() => void refresh()}
        request={request}
        onOpenAttachment={openAttachment}
        onRemoveMessage={(message) => setSelectedDeletion(message.id)}
        onReportMessage={(message) =>
          openSafetyReport({
            type: 'content',
            url: `${location.origin}${location.pathname}${location.search}#message-${encodeURIComponent(message.id)}`,
            ...(message.content.trim() && view
              ? {
                  encryptedMessage: {
                    profileId: connection.context!.profileId,
                    actorId: connection.context!.actorId,
                    roomId: view.room.id,
                    eventId: message.id,
                    quote: message.content,
                  },
                }
              : {}),
          })
        }
        hasOlder={
          view?.nextHistoryBefore !== null &&
          view?.nextHistoryBefore !== undefined
        }
        onLoadOlder={() =>
          void run(async () => {
            if (!view || view.nextHistoryBefore === null) return;
            const older = await client!.olderHistory(
              view.room.id,
              view.nextHistoryBefore
            );
            historyFloor.current = older.nextHistoryBefore ?? 0;
            if (alive.current)
              setView({
                ...view,
                history: [...older.history, ...view.history],
                nextHistoryBefore: older.nextHistoryBefore,
              });
          }, false)
        }
      />
      {!view && !error && (
        <p className="px-5 py-3 text-xs" role="status">
          Opening the approved secure session...
        </p>
      )}
      {!!verifications.length && !verificationOpen && (
        <p className="px-5 py-3 text-xs" role="status">
          Verify participant identities before continuing.{' '}
          <button
            type="button"
            className={button}
            onClick={() => setVerificationOpen(true)}
          >
            Verify identities
          </button>
        </p>
      )}
      {notice && (
        <p className="px-5 py-2 text-xs" role="status">
          {notice}
        </p>
      )}
      {!!view && (
        <div className="flex flex-none flex-wrap items-center gap-2 border-t px-4 py-1">
          {view.room.canRestart && (
            <button
              type="button"
              className={button}
              disabled={sending}
              onClick={() => setConfirmRestart(true)}
            >
              Start a fresh secure session
            </button>
          )}
          <button
            type="button"
            className={button}
            disabled={sending || !device.data?.recoveryKeyAvailable}
            onClick={() =>
              void run(async () => {
                await client!.backupConversation(view.room.id);
                setNotice('An encrypted backup of retained history was saved.');
              })
            }
          >
            Save encrypted history backup
          </button>
          <p className="text-pana-ink/60 text-[11px]">
            History backups are manual. Messages since the last saved backup
            cannot be recovered if this device is lost.
          </p>
          {!view.room.joined && (
            <p className="text-xs">
              Waiting for an existing participant to invite this device. No
              earlier group history will be shared.
            </p>
          )}
        </div>
      )}
      {request ? (
        <p className="px-5 py-4 text-xs">Accept this request to reply.</p>
      ) : (
        <Composer
          canSend={canSend}
          counterpartyName={
            group?.name || counterparty.name || counterparty.username
          }
          draft={draft}
          onChange={change}
          onSend={send}
          isSending={
            sending || !view?.room.joined || view.room.state !== 'active'
          }
          inputRef={inputRef}
          privateMedia={{
            photo: async (
              source
            ): Promise<DraftAttachment & { file: File }> => {
              const file = await prepareChatPhoto(source);
              if (!alive.current)
                throw new Error(
                  'The active conversation changed while preparing this photo.'
                );
              return {
                type: 'image',
                mediaType: file.type,
                url: URL.createObjectURL(file),
                name: file.name,
                file,
              };
            },
            gif: async (gif): Promise<DraftAttachment & { file: File }> => {
              const file = await privateGif(gif);
              if (!alive.current)
                throw new Error(
                  'The active conversation changed while preparing this GIF.'
                );
              return {
                type: 'image',
                mediaType: file.type,
                url: URL.createObjectURL(file),
                name: file.name,
                file,
              };
            },
          }}
        />
      )}
      <AlertDialog
        open={verificationOpen && verifications.length > 0}
        onOpenChange={setVerificationOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Verify participant encryption identities
            </AlertDialogTitle>
            <AlertDialogDescription>
              Compare these public identity keys through a trusted channel. A
              key directory alone is not proof of who controls a profile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-64 space-y-3 overflow-y-auto text-xs">
            {verifications.map((participant) => (
              <div key={participant.actorId}>
                <p className="font-bold">
                  {participant.actorId === counterparty.id
                    ? counterparty.name || counterparty.username
                    : participant.actorId}
                  {participant.changed ? ' - identity changed' : ''}
                </p>
                <code className="block break-all">
                  {participant.rootPublicKey}
                </code>
              </div>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Not verified yet</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const approvals = verifications.map(
                  ({ actorId, rootPublicKey }) => ({ actorId, rootPublicKey })
                );
                setVerifications([]);
                setVerificationOpen(false);
                verificationRequest.current = '';
                void refresh(approvals);
              }}
            >
              I verified these exact keys
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={!!selectedDeletion}
        onOpenChange={(open) => {
          if (!open) setSelectedDeletion(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove encrypted message?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove the retained message and attachment access for this
              conversation. This cannot erase copies somebody already read or
              saved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                void run(async () => {
                  if (!selectedDeletion || !view) return;
                  await client!.removeMessage(view.room.id, selectedDeletion);
                  setSelectedDeletion(null);
                })
              }
            >
              Remove for everyone
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirmRestart} onOpenChange={setConfirmRestart}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start a fresh secure session?</AlertDialogTitle>
            <AlertDialogDescription>
              No approved existing participant can resume this session, or its
              empty setup timed out. Fresh invitations use new room keys. This
              does not decrypt old messages or share pre-join history. Your own
              retained local history and personal-key backups remain separate.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                void run(async () => {
                  if (!view) return;
                  await client.restartConversation(view.room.id, true);
                  setConfirmRestart(false);
                })
              }
            >
              Start fresh with new room keys
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
