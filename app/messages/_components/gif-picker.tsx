'use client';

import { useState } from 'react';
import Image from 'next/image';
import { X } from 'lucide-react';
import { useDebounce } from '@/hooks/use-debounce';
import {
  useGifSearch,
  type GifResult,
  GIPHY_ATTRIBUTION,
  GIPHY_ATTRIBUTION_MARK,
  GIPHY_SEARCH_PLACEHOLDER,
} from '@/lib/query/social';

/**
 * The GIF picker.
 *
 * Opens over the composer rather than in a dialog. A modal would take the
 * conversation off the screen, and choosing a GIF is a reply to something
 * that was just said -- you want to still be able to see it.
 *
 * Previews are plain <img>, not next/image. The optimiser would render the
 * first frame and nothing else, which for a wall of GIFs is a wall of
 * stills: the one property being chosen on is the motion.
 */
export function GifPicker({
  onPick,
  onClose,
  isSaving,
}: {
  onPick: (gif: GifResult) => void;
  onClose: () => void;
  isSaving: boolean;
}) {
  const [query, setQuery] = useState('');
  /* Half a second, not the 350ms used for the pana search next door. A GIPHY
     beta key allows a hundred calls an HOUR for the whole app -- shared by
     every pana at once -- so each keystroke here is a draw on a budget that
     is both small and not ours alone. The server caches hard on top of this;
     the debounce is what keeps a single fast typist from spending a visible
     slice of the hour by themselves. */
  const term = useDebounce(query.trim(), 500);
  const gifs = useGifSearch(term);

  const results = gifs.data?.results ?? [];

  return (
    <div className="border-pana-ink/10 bg-pana-cream border-b">
      <div className="flex items-center gap-2 px-3 pt-3">
        <input
          type="search"
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={GIPHY_SEARCH_PLACEHOLDER}
          aria-label={GIPHY_SEARCH_PLACEHOLDER}
          className="border-pana-ink/10 focus:border-pana-indigo text-pana-ink placeholder:text-pana-ink/45 min-w-0 flex-1 rounded-full border bg-white px-3 py-2 text-sm font-bold transition-colors outline-none"
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close GIF picker"
          className="text-pana-ink/55 hover:bg-pana-butter-2 hover:text-pana-ink flex-none rounded-full p-2 transition-colors"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* Fixed height, not max-height: a grid that resizes as results arrive
          would shove the conversation up and down the screen while someone is
          reading it. */}
      <div className="h-56 overflow-y-auto px-3 py-3">
        {gifs.isLoading && (
          <p className="text-pana-ink/45 py-8 text-center text-sm font-bold">
            Loading GIFs…
          </p>
        )}

        {!gifs.isLoading && gifs.isError && (
          <p className="text-pana-ink/55 py-8 text-center text-sm font-medium">
            {/* The server distinguishes "too many searches at once" from
                "GIPHY is down", and so should this -- the first is worth
                waiting a second for, the second is not. */}
            {(gifs.error as { response?: { data?: { error?: string } } })
              ?.response?.data?.error ??
              'GIF search is having a moment. Try again shortly.'}
          </p>
        )}

        {!gifs.isLoading && !gifs.isError && results.length === 0 && (
          <p className="text-pana-ink/45 py-8 text-center text-sm font-medium">
            {term ? 'No GIFs match that.' : 'No GIFs right now.'}
          </p>
        )}

        {results.length > 0 && (
          <ul className="grid grid-cols-3 gap-2">
            {results.map((gif) => (
              <li key={gif.id}>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => onPick(gif)}
                  className="border-pana-ink/10 hover:border-pana-indigo focus:border-pana-indigo block w-full overflow-hidden rounded-lg border-2 transition-colors disabled:opacity-50"
                >
                  {/* Plain <img>, not next/image: the src is on GIPHY's CDN
                      rather than our own, so it is outside the configured
                      remote patterns, and these tiles are previews of
                      something being chosen rather than page content.

                      The uploader goes in the alt text because GIPHY's terms
                      forbid displaying their content "without Giphy user
                      and/or source attribution where available". */}
                  <img
                    src={gif.previewUrl}
                    alt={
                      gif.creator
                        ? `${gif.description} by ${gif.creator}`
                        : gif.description
                    }
                    loading="lazy"
                    className="h-24 w-full bg-white object-cover"
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {isSaving && (
        <p className="text-pana-ink/55 border-pana-ink/10 border-t px-4 py-2 text-xs font-bold">
          Saving that GIF…
        </p>
      )}

      {/* Required by GIPHY's terms, not decoration. Their API Terms of
          Service ask for the words "Powered by Giphy" *and* the Giphy logo,
          so this is their official mark reproduced unmodified rather than
          text styled to look like it -- the trademark licence covers
          reproducing the artwork, not redrawing it. */}
      <div className="border-pana-ink/10 flex items-center border-t px-4 py-2">
        {/* Plain <img> to match the tiles above, and because this is a fixed
            static badge rather than content worth running the optimiser
            over. Half the asset's 200x42 so it stays crisp on retina. */}
        <img
          src={GIPHY_ATTRIBUTION_MARK}
          alt={GIPHY_ATTRIBUTION}
          width={100}
          height={21}
          className="h-[21px] w-auto"
        />
      </div>
    </div>
  );
}

/** A chosen GIF sitting above the composer, before it is sent. */
export function GifPreview({
  url,
  onRemove,
}: {
  url: string;
  onRemove: () => void;
}) {
  return (
    <div className="border-pana-ink/10 flex items-center gap-3 border-b px-3 py-2">
      <Image
        src={url}
        alt="GIF ready to send"
        width={80}
        height={80}
        unoptimized
        className="border-pana-ink/10 h-16 w-16 rounded-lg border object-cover"
      />
      <span className="text-pana-ink/55 flex-1 text-xs font-bold">
        GIF ready to send
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove GIF"
        className="text-pana-ink/55 hover:bg-pana-butter-2 hover:text-pana-ink rounded-full p-2 transition-colors"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
