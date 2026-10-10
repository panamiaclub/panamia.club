'use client';

import { useState } from 'react';
import { Send } from 'lucide-react';
import { RefusedComposer } from './chat-primitives';
import { GifPicker, GifPreview } from './gif-picker';
import {
  useGifSearch,
  useMirrorGif,
  type DraftAttachment,
  type GifResult,
} from '@/lib/query/social';

/* The composer.
 *
 * One line, Enter to send, and a gate that is answered before the box is drawn
 * rather than after the message is written.
 *
 * Two states, not the gate's three. `refuse` removes the input entirely -- see
 * RefusedComposer. `hold` is reported to this component as `allow`, because
 * telling the sender their message will land in the recipient's Requests
 * folder discloses the recipient's settings, which is precisely what
 * dm-gate.ts is built to withhold. The message is genuinely delivered either
 * way; the composer simply has nothing to say about where.
 *
 * GIFs are the one attachment here. They are chosen rather than uploaded, so
 * they need no file picker, no progress bar and no failure path on the
 * sender's own connection -- the work happens server-side in the mirror
 * route. Voice memos still reach DMs through the existing recorder. */
export function Composer({
  canSend,
  counterpartyName,
  onSend,
  isSending,
  error,
}: {
  canSend: 'allow' | 'refuse';
  counterpartyName: string;
  onSend: (text: string, attachments?: DraftAttachment[]) => void;
  isSending: boolean;
  error: string | null;
}) {
  const [text, setText] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [gif, setGif] = useState<DraftAttachment | null>(null);
  const [gifError, setGifError] = useState<string | null>(null);

  const mirror = useMirrorGif();

  /* Asked without a search term, which hits Tenor's featured endpoint. The
     answer that matters is `enabled` -- whether a key is configured at all --
     and the results get cached for the picker's first paint on the way past. */
  const gifAvailability = useGifSearch('', canSend === 'allow');
  const gifsEnabled = gifAvailability.data?.enabled ?? false;

  if (canSend === 'refuse') return <RefusedComposer />;

  const submit = () => {
    const trimmed = text.trim();
    // A GIF on its own is a message. Requiring words beside it would make the
    // feature useless for the thing it is mostly used for.
    if ((!trimmed && !gif) || isSending) return;
    setText('');
    setGif(null);
    onSend(trimmed, gif ? [gif] : undefined);
  };

  const pick = async (chosen: GifResult) => {
    setGifError(null);
    try {
      const attachment = await mirror.mutateAsync(chosen);
      setGif(attachment);
      setPickerOpen(false);
    } catch {
      // Left open deliberately: the grid is still there, and the most useful
      // thing after one GIF fails to save is to pick a different one.
      setGifError('Could not save that GIF. Try another.');
    }
  };

  return (
    <footer className="border-pana-ink/14 border-t-2 bg-white">
      {pickerOpen && (
        <GifPicker
          onPick={pick}
          onClose={() => setPickerOpen(false)}
          isSaving={mirror.isPending}
        />
      )}

      {gif && <GifPreview url={gif.url} onRemove={() => setGif(null)} />}

      <div className="px-4 py-3">
        {/* The gate also runs server-side inside createStatus, so a refusal can
            arrive here even when the view believed it was allowed -- the
            recipient may have changed a setting while this page was open. It is
            shown in place, above the box the words are still in, rather than as
            a toast that disappears while they are being retyped. */}
        {(error || gifError) && (
          <p className="text-pana-red-deep mb-2 text-[11px] font-bold">
            {error ?? gifError}
          </p>
        )}

        <div className="flex items-end gap-2">
          {/* Absent rather than disabled when no key is configured. A greyed
              button is a promise of something that is not coming. */}
          {gifsEnabled && (
            <button
              type="button"
              onClick={() => setPickerOpen((open) => !open)}
              aria-label={pickerOpen ? 'Close GIF picker' : 'Add a GIF'}
              aria-expanded={pickerOpen}
              className={`border-pana-ink/16 flex h-10 flex-none items-center justify-center rounded-full border-2 px-3 text-xs font-black transition-colors ${
                pickerOpen
                  ? 'bg-pana-indigo text-pana-cream border-pana-indigo'
                  : 'text-pana-ink/60 hover:bg-pana-butter-2 hover:text-pana-ink'
              }`}
            >
              GIF
            </button>
          )}

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            placeholder="Message"
            aria-label={`Message ${counterpartyName}`}
            className="border-pana-ink/16 text-pana-ink placeholder:text-pana-ink/40 focus:border-pana-indigo max-h-32 min-h-[2.5rem] flex-1 resize-none rounded-2xl border-2 px-3.5 py-2 text-[15px] font-medium outline-none"
          />
          <button
            type="button"
            onClick={submit}
            disabled={(!text.trim() && !gif) || isSending}
            aria-label="Send"
            className="bg-pana-indigo text-pana-cream flex h-10 w-10 flex-none items-center justify-center rounded-full disabled:opacity-40"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </footer>
  );
}
