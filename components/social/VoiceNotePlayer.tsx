'use client';

import { useRef, useState } from 'react';

export function VoiceNotePlayer({
  url,
  label = 'Voice note',
}: {
  url: string;
  label?: string;
}) {
  const player = useRef<HTMLAudioElement>(null);
  const [failed, setFailed] = useState(false);
  return (
    <div className="w-full min-w-0">
      <audio
        ref={player}
        src={url}
        controls
        preload="metadata"
        aria-label={label}
        className="block h-11 w-full max-w-full"
        onError={() => setFailed(true)}
      />
      {failed && (
        <p className="mt-1 text-xs" role="alert">
          Could not load this voice note.{' '}
          <button
            type="button"
            className="min-h-11 font-bold underline"
            onClick={() => {
              setFailed(false);
              player.current?.load();
            }}
          >
            Retry playback
          </button>
        </p>
      )}
    </div>
  );
}
