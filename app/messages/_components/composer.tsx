'use client';

import { useId, useLayoutEffect, useState, type RefObject } from 'react';
import { ArrowUp, LoaderCircle } from 'lucide-react';
import styles from '@/components/messages/workspace.module.css';
import { RefusedComposer } from './chat-primitives';
import { GifPicker, GifPreview } from './gif-picker';
import { useGifSearch, useMirrorGif, type GifResult } from '@/lib/query/social';
import { messageError, type MessageDraft } from '../_lib/workspace';

export function Composer({
  canSend,
  counterpartyName,
  draft,
  onChange,
  onSend,
  isSending,
  inputRef,
}: {
  canSend: 'allow' | 'refuse';
  counterpartyName: string;
  draft: MessageDraft;
  onChange: (patch: Partial<MessageDraft>) => void;
  onSend: () => void;
  isSending: boolean;
  inputRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const hintId = useId();
  const mirror = useMirrorGif();
  const gifAvailability = useGifSearch('', canSend === 'allow');
  const gifsEnabled = gifAvailability.data?.enabled ?? false;
  const savingGif = draft.isMirroring || mirror.isPending;
  const canSubmit =
    !!(draft.text.trim() || draft.gif) && !isSending && !savingGif;

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 128)}px`;
  }, [draft.text, inputRef]);

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
    if (savingGif) return;
    const input = inputRef.current;
    onChange({ isMirroring: true, gifError: null });
    try {
      const attachment = await mirror.mutateAsync(chosen);
      // Only patch the GIF: text may have changed while the mirror was saving.
      onChange({ gif: attachment, isMirroring: false });
      setPickerOpen(false);
      if (input?.isConnected && inputRef.current === input) input.focus();
    } catch (error) {
      onChange({
        isMirroring: false,
        gifError: messageError(error, 'Could not save that GIF. Try another.'),
      });
    }
  };

  return (
    <footer className={styles.composer}>
      {pickerOpen && (
        <GifPicker
          onPick={pick}
          onClose={closePicker}
          isSaving={savingGif}
          error={draft.gifError}
        />
      )}
      {draft.gif && (
        <div className="mb-3">
          <GifPreview
            url={draft.gif.url}
            onRemove={() => onChange({ gif: null, gifError: null })}
          />
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
        className={styles.composeBox}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <textarea
          ref={inputRef}
          value={draft.text}
          onChange={(event) => onChange({ text: event.target.value })}
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder="Write a little hello..."
          aria-label={`Message ${counterpartyName}`}
          aria-describedby={hintId}
          className={styles.messageInput}
        />
        <div className="flex items-center justify-between gap-3 px-2 pb-2">
          {gifsEnabled ? (
            <button
              type="button"
              className={styles.gifButton}
              onClick={() => setPickerOpen((open) => !open)}
              aria-label="Add a GIF"
              aria-expanded={pickerOpen}
            >
              GIF
            </button>
          ) : (
            <span />
          )}
          <button
            type="submit"
            className={styles.sendButton}
            disabled={!canSubmit}
            aria-label="Send message"
          >
            {isSending || savingGif ? (
              <LoaderCircle
                className="h-4 w-4 motion-safe:animate-spin"
                aria-hidden="true"
              />
            ) : (
              <ArrowUp className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </form>
      <div
        id={hintId}
        className="text-pana-ink/60 mt-2 flex min-h-4 items-center justify-between gap-2 text-[10px] leading-relaxed"
      >
        <span>
          {draft.text || draft.gif
            ? 'Your draft stays with this conversation.'
            : 'Make yourself at home. Say hello.'}
        </span>
        <span className="hidden flex-none lg:inline">
          Enter to send · Shift + Enter for a new line
        </span>
      </div>
    </footer>
  );
}
