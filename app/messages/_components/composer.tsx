'use client';

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { ArrowUp, ImagePlus, LoaderCircle, X } from 'lucide-react';
import styles from '@/components/messages/workspace.module.css';
import { RefusedComposer } from './chat-primitives';
import { GifPicker, GifPreview } from './gif-picker';
import {
  useGifSearch,
  useMirrorGif,
  type GifResult,
  type DraftAttachment,
} from '@/lib/query/social';
import {
  messageDraftCanSend,
  composerEnterSends,
  messageError,
  type MessageDraft,
} from '../_lib/workspace';
import {
  CHAT_PHOTO_ACCEPT,
  chatPhotoError,
  uploadChatPhoto,
} from '../_lib/photos';
import { useIsNativeApp } from '@/lib/mobile/use-native-app';
import type { LegacyChatMediaTarget } from '@/lib/chat';

export function Composer({
  canSend,
  counterpartyName,
  draft,
  onChange,
  onSend,
  isSending,
  inputRef,
  privateMedia,
  legacyTarget,
}: {
  canSend: 'allow' | 'refuse';
  counterpartyName: string;
  draft: MessageDraft;
  onChange: (patch: Partial<MessageDraft>) => void;
  onSend: () => void;
  isSending: boolean;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  privateMedia?: {
    photo: (file: File) => Promise<DraftAttachment & { file: File }>;
    gif: (gif: GifResult) => Promise<DraftAttachment & { file: File }>;
  };
  legacyTarget?: LegacyChatMediaTarget;
}) {
  const native = useIsNativeApp();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [localPhoto, setLocalPhoto] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const photoBusy = useRef(false);
  const hintId = useId();
  const photoHintId = useId();
  const mirror = useMirrorGif();
  const gifAvailability = useGifSearch('', canSend === 'allow');
  const gifsEnabled = gifAvailability.data?.enabled ?? false;
  const savingGif = draft.isMirroring || mirror.isPending;
  const savingPhoto = draft.isUploadingPhoto;
  const canSubmit = messageDraftCanSend(draft) && !isSending && !savingGif;

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 128)}px`;
  }, [draft.text, inputRef]);

  useEffect(() => {
    setPreviewFailed(false);
    if (!draft.photoFile || chatPhotoError(draft.photoFile)) {
      setLocalPhoto(null);
      return;
    }
    const url = URL.createObjectURL(draft.photoFile);
    setLocalPhoto(url);
    return () => URL.revokeObjectURL(url);
  }, [draft.photoFile, draft.photo?.url]);

  if (canSend === 'refuse') return <RefusedComposer />;

  const closePicker = () => {
    setPickerOpen(false);
    inputRef.current?.focus();
  };
  const submit = () => {
    if (!canSubmit) return;
    setPickerOpen(false);
    onSend();
  };
  const pick = async (chosen: GifResult) => {
    if (savingGif || savingPhoto) return;
    const input = inputRef.current;
    onChange({ isMirroring: true, gifError: null });
    try {
      if (privateMedia) {
        const { file, ...attachment } = await privateMedia.gif(chosen);
        onChange({
          gif: attachment,
          privateFiles: { ...draft.privateFiles, gif: file },
          isMirroring: false,
        });
      } else {
        const attachment = await mirror.mutateAsync({
          ...chosen,
          chatTarget: legacyTarget,
        });
        onChange({ gif: attachment, isMirroring: false });
      }
      setPickerOpen(false);
      if (input?.isConnected && inputRef.current === input) input.focus();
    } catch (error) {
      onChange({
        isMirroring: false,
        gifError: messageError(error, 'Could not save that GIF. Try another.'),
      });
    }
  };
  const attachPhoto = async (file: File) => {
    if (photoBusy.current || savingGif) return;
    photoBusy.current = true;
    const input = inputRef.current;
    onChange({ photoFile: file, isUploadingPhoto: true, photoError: null });
    try {
      if (privateMedia) {
        const { file: prepared, ...photo } = await privateMedia.photo(file);
        onChange({
          photo,
          privateFiles: { ...draft.privateFiles, photo: prepared },
          photoFile: null,
          photoError: null,
          isUploadingPhoto: false,
        });
      } else {
        const photo = await uploadChatPhoto(file, legacyTarget);
        onChange({
          photo,
          photoFile: null,
          photoError: null,
          isUploadingPhoto: false,
        });
      }
      if (input?.isConnected && inputRef.current === input) input.focus();
    } catch (error) {
      onChange({
        isUploadingPhoto: false,
        photoError: messageError(
          error,
          'Could not upload this photo. Try again.'
        ),
      });
    } finally {
      photoBusy.current = false;
    }
  };
  const photoPreview = draft.photoFile ? localPhoto : draft.photo?.url;

  return (
    <footer className={`${styles.composer} ${styles.compactComposer}`}>
      {pickerOpen && (
        <GifPicker
          onPick={pick}
          onClose={closePicker}
          isSaving={savingGif}
          error={draft.gifError}
        />
      )}
      {(draft.gif || draft.photo || draft.photoFile) && (
        <div className={styles.compactAttachments}>
          {(draft.photo || draft.photoFile) && (
            <figure className={styles.photoPreview}>
              {photoPreview && !previewFailed ? (
                <img
                  src={photoPreview}
                  alt="Attached photo"
                  onError={() => setPreviewFailed(true)}
                />
              ) : (
                <span aria-label="Photo preview">
                  <ImagePlus size={24} aria-hidden="true" />
                </span>
              )}
              <button
                type="button"
                aria-label="Remove photo"
                disabled={savingPhoto}
                onClick={() =>
                  onChange({
                    photo: null,
                    photoFile: null,
                    photoError: null,
                  })
                }
              >
                <X size={16} aria-hidden="true" />
              </button>
            </figure>
          )}
          {draft.gif && (
            <GifPreview
              url={draft.gif.url}
              onRemove={() => onChange({ gif: null, gifError: null })}
            />
          )}
        </div>
      )}
      {gifAvailability.isError && (
        <p className="text-pana-ink/65 mb-2 text-xs" role="status">
          GIFs are temporarily unavailable.{' '}
          <button
            type="button"
            className="font-bold underline"
            onClick={() => gifAvailability.refetch()}
          >
            Try again
          </button>
        </p>
      )}
      {savingPhoto && (
        <p className="text-pana-ink/65 mb-2 text-xs" role="status">
          {privateMedia
            ? 'Preparing photo for encryption...'
            : 'Uploading photo...'}
        </p>
      )}
      {previewFailed && !draft.photoError && (
        <p className="text-pana-ink/65 mb-2 text-xs" role="status">
          The photo preview is unavailable. You can remove it and choose the
          photo again.
        </p>
      )}
      {draft.photoError && (
        <p className="text-pana-red-deep mb-2 text-xs" role="alert">
          {draft.photoError}{' '}
          {draft.photoFile && !chatPhotoError(draft.photoFile) && (
            <button
              type="button"
              className="font-bold underline"
              onClick={() => {
                if (draft.photoFile) void attachPhoto(draft.photoFile);
              }}
            >
              Retry photo upload
            </button>
          )}
        </p>
      )}
      {!pickerOpen && savingGif && (
        <p className="text-pana-ink/65 mb-2 text-xs" role="status">
          Saving your GIF...
        </p>
      )}
      {!pickerOpen && draft.gifError && (
        <p className="text-pana-red-deep mb-2 text-xs" role="alert">
          {draft.gifError}
        </p>
      )}
      <form
        aria-label="Message composer"
        className={styles.composeRow}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <input
          ref={fileInput}
          type="file"
          accept={CHAT_PHOTO_ACCEPT}
          aria-label="Choose a photo"
          hidden
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file) void attachPhoto(file);
          }}
        />
        <button
          type="button"
          className={styles.attachButton}
          aria-label="Attach a photo"
          aria-describedby={photoHintId}
          title="Attach a photo (up to 10 MB)"
          disabled={
            savingGif || savingPhoto || !!draft.photo || !!draft.photoFile
          }
          onClick={() => {
            setPickerOpen(false);
            fileInput.current?.click();
          }}
        >
          <ImagePlus size={23} aria-hidden="true" />
        </button>
        <span id={photoHintId} className="sr-only">
          {privateMedia
            ? 'One photo, up to 10 MB. Photos are encrypted on this device before upload.'
            : 'One photo, up to 10 MB. Photos use shareable Pana media links, not end-to-end encryption. See Conversation details for more information.'}
        </span>
        <div className={styles.composeField}>
          <textarea
            ref={inputRef}
            value={draft.text}
            data-private="true"
            onChange={(event) => onChange({ text: event.target.value })}
            onKeyDown={(event) => {
              const phone =
                native ||
                window.matchMedia('(max-width: 767px), (pointer: coarse)')
                  .matches;
              if (
                event.key === 'Enter' &&
                composerEnterSends(
                  phone,
                  event.shiftKey,
                  event.nativeEvent.isComposing ||
                    event.nativeEvent.keyCode === 229
                )
              ) {
                event.preventDefault();
                submit();
              }
            }}
            rows={1}
            enterKeyHint="enter"
            placeholder="Message..."
            aria-label={`Message ${counterpartyName}`}
            aria-describedby={native ? undefined : hintId}
            className={styles.compactInput}
          />
          {gifsEnabled && (
            <button
              type="button"
              className={styles.compactGifButton}
              onClick={() => setPickerOpen((open) => !open)}
              aria-label="Add a GIF"
              aria-expanded={pickerOpen}
              disabled={savingPhoto}
            >
              GIF
            </button>
          )}
        </div>
        <button
          type="submit"
          className={`${styles.sendButton} ${styles.compactSendButton}`}
          disabled={!canSubmit}
          aria-label="Send message"
        >
          {isSending || savingGif || savingPhoto ? (
            <LoaderCircle
              className="h-5 w-5 motion-safe:animate-spin"
              aria-hidden="true"
            />
          ) : (
            <ArrowUp className="h-5 w-5" aria-hidden="true" />
          )}
        </button>
      </form>
      {!native && (
        <p id={hintId} className={styles.keyboardHint}>
          Enter to send · Shift + Enter for a new line
        </p>
      )}
    </footer>
  );
}
