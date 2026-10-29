'use client';

import { useId, useLayoutEffect, useState, type RefObject } from 'react';
import { ArrowUp, LoaderCircle, X } from 'lucide-react';
import { ComposerPopover } from '@/components/messages/composer-popover';
import { MOCK_CHAT_GIFS, type MockChatDraft } from '../_data/mock-dm-chat';
import { GifArt } from './chat-primitives';
import styles from '@/components/messages/workspace.module.css';

export function Composer({
  draft,
  onChange,
  onSend,
  isSending,
  recipientName,
  inputRef,
}: {
  draft: MockChatDraft;
  onChange: (draft: MockChatDraft) => void;
  onSend: () => void;
  isSending: boolean;
  recipientName: string;
  inputRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const hintId = useId();
  const canSend = !!(draft.text.trim() || draft.gif) && !isSending;

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 128)}px`;
  }, [draft.text, inputRef]);

  const submit = () => {
    if (!canSend) return;
    setPickerOpen(false);
    onSend();
  };

  return (
    <footer className={styles.composer}>
      {pickerOpen && (
        <ComposerPopover
          label="Sample GIF picker"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setPickerOpen(false);
              inputRef.current?.focus();
            }
          }}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <p className="text-pana-ink text-xs font-extrabold">
                A little more you.
              </p>
              <p className="text-pana-ink/60 mt-0.5 text-[10px]">
                Sample animations, not a live GIF search.
              </p>
            </div>
            <button
              type="button"
              aria-label="Close GIF picker"
              className={styles.iconButton}
              onClick={() => setPickerOpen(false)}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {MOCK_CHAT_GIFS.map((gif) => (
              <button
                key={gif.id}
                type="button"
                aria-label={`Choose ${gif.label} GIF`}
                className="overflow-hidden rounded-xl"
                onClick={() => {
                  onChange({ ...draft, gif });
                  setPickerOpen(false);
                  inputRef.current?.focus();
                }}
              >
                <GifArt gif={gif} />
              </button>
            ))}
          </div>
        </ComposerPopover>
      )}
      {draft.gif && (
        <div className="mb-3 flex items-center gap-3">
          <span className="block w-24 overflow-hidden rounded-xl">
            <GifArt gif={draft.gif} />
          </span>
          <span className="text-pana-ink/65 text-xs font-medium">
            Ready to send
          </span>
          <button
            type="button"
            aria-label="Remove GIF"
            className={styles.iconButton}
            onClick={() => onChange({ ...draft, gif: null })}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className={styles.composeBox}
      >
        <textarea
          ref={inputRef}
          value={draft.text}
          onChange={(event) => onChange({ ...draft, text: event.target.value })}
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
          aria-label={`Message ${recipientName}`}
          aria-describedby={hintId}
          className={styles.messageInput}
        />
        <div className="flex items-center justify-between gap-3 px-2 pb-2">
          <button
            type="button"
            className={styles.gifButton}
            aria-label="Add a GIF"
            aria-expanded={pickerOpen}
            onClick={() => setPickerOpen((open) => !open)}
          >
            GIF
          </button>
          <button
            type="submit"
            className={styles.sendButton}
            disabled={!canSend}
            aria-label="Send message"
          >
            {isSending ? (
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
        className="text-pana-ink/55 mt-2 flex min-h-4 items-center justify-between gap-2 text-[10px] leading-relaxed"
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
