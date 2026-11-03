'use client';

// The story viewer. Deliberately not a feed.
//
// The whole point of this feature is that you arrive at one pana's stories by
// tapping their profile picture, watch what they posted, and leave. There is
// no scroll, no next-account autoplay, and nothing to fall into. That is a
// product decision, and it is also why this component takes a single tray and
// has no concept of what comes after it -- there is nowhere for an infinite
// feed to grow from later without someone deciding to add it on purpose.

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { X, ChevronLeft, ChevronRight, Eye, Trash2, Flag } from 'lucide-react';
import { isUnoptimizableImageSrc } from '@/lib/image-src';
import { openSafetyReport } from '@/lib/safety-report';
import type { Story, StoryTray } from '@/lib/federation/wrappers/stories';

/** How long a photo stays up before advancing. Videos use their own length. */
const PHOTO_DURATION_MS = 5000;

interface StoryViewerProps {
  tray: StoryTray;
  /** Index to open on. Callers usually pass the first unwatched story. */
  startIndex?: number;
  onClose: () => void;
  /** Shown the delete affordance and view counts. */
  isOwner?: boolean;
  /** Fired after a successful delete so the ring can refresh. */
  onDeleted?: (storyId: string) => void;
}

export function StoryViewer({
  tray,
  startIndex = 0,
  onClose,
  isOwner = false,
  onDeleted,
}: StoryViewerProps) {
  const [index, setIndex] = useState(startIndex);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [stories, setStories] = useState<Story[]>(tray.stories);

  const videoRef = useRef<HTMLVideoElement>(null);
  const viewedRef = useRef(new Set<string>());

  const current = stories[index];
  const isVideo = current?.media.type === 'video';

  const close = useCallback(() => onClose(), [onClose]);

  const goNext = useCallback(() => {
    setProgress(0);
    setIndex((i) => {
      // Running off the end closes the viewer rather than wrapping or moving
      // to another pana. Watching someone's stories is a finite errand.
      if (i >= stories.length - 1) {
        close();
        return i;
      }
      return i + 1;
    });
  }, [stories.length, close]);

  const goPrev = useCallback(() => {
    setProgress(0);
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  // Record the view once per story per mount. The endpoint is idempotent, but
  // tapping back and forth through five stories should not be five more
  // requests each time.
  useEffect(() => {
    if (!current || viewedRef.current.has(current.id)) return;
    viewedRef.current.add(current.id);

    fetch(`/api/social/stories/${current.id}/view`, { method: 'POST' }).catch(
      () => {
        // A failed view record is not worth interrupting playback over. The
        // author loses one number; the viewer loses nothing.
      }
    );
  }, [current]);

  // Photo timer. Videos advance from their own `ended` event instead, because
  // a fixed timer would either cut a long clip short or sit on a short one.
  useEffect(() => {
    if (!current || isVideo || paused) return;

    const startedAt = Date.now();
    const startProgress = progress;
    const remaining = PHOTO_DURATION_MS * (1 - startProgress);

    const tick = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const next = startProgress + elapsed / PHOTO_DURATION_MS;
      setProgress(Math.min(1, next));
    }, 50);

    const timer = window.setTimeout(goNext, remaining);

    return () => {
      window.clearInterval(tick);
      window.clearTimeout(timer);
    };
    // `progress` is deliberately not a dependency. Including it would restart
    // the timer on every 50ms tick, so the story would never advance. It is
    // read once when a run starts, which is what lets a pause resume from
    // where it stopped rather than from zero.
  }, [current, isVideo, paused, goNext]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (paused) video.pause();
    else void video.play().catch(() => setPaused(true));
  }, [paused, index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === ' ') {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close, goNext, goPrev]);

  // Lock the page behind the viewer. Without this the body scrolls under the
  // overlay on mobile, which is the exact feed behaviour this avoids.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const handleDelete = async () => {
    if (!current || deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/social/stories/${current.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('delete failed');

      const deletedId = current.id;
      const remaining = stories.filter((s) => s.id !== deletedId);
      onDeleted?.(deletedId);

      if (remaining.length === 0) {
        close();
        return;
      }
      setStories(remaining);
      setIndex((i) => Math.min(i, remaining.length - 1));
      setProgress(0);
    } catch {
      setDeleting(false);
    }
  };

  if (!current) return null;

  const displayName = tray.actor.displayName || tray.actor.username;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95"
      role="dialog"
      aria-modal="true"
      aria-label={`Stories from ${displayName}`}
    >
      {/* Segmented progress, one bar per story. This is the viewer's only
          navigation cue: it says how many there are and where you are, which
          is what makes a bounded set feel bounded. */}
      <div className="absolute top-0 right-0 left-0 z-20 flex gap-1 p-3">
        {stories.map((s, i) => (
          <div
            key={s.id}
            className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/30"
          >
            <div
              className="h-full bg-white transition-[width] duration-75 ease-linear"
              style={{
                width:
                  i < index
                    ? '100%'
                    : i === index
                      ? `${progress * 100}%`
                      : '0%',
              }}
            />
          </div>
        ))}
      </div>

      <div className="absolute top-6 right-0 left-0 z-20 flex items-center gap-3 px-4 py-2">
        <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-white/20">
          {tray.actor.iconUrl && (
            <Image
              src={tray.actor.iconUrl}
              alt=""
              fill
              sizes="36px"
              className="object-cover"
              unoptimized={isUnoptimizableImageSrc(tray.actor.iconUrl)}
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">
            {displayName}
          </p>
          <p className="text-xs text-white/70">
            {timeAgo(current.publishedAt)}
          </p>
        </div>

        {isOwner && current.viewCount !== null && (
          <span className="flex items-center gap-1 text-xs text-white/80">
            <Eye className="h-3.5 w-3.5" />
            {current.viewCount}
          </span>
        )}

        {isOwner && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-full p-2 text-white/80 hover:bg-white/10 hover:text-white disabled:opacity-40"
            aria-label="Delete this story"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            close();
            openSafetyReport({
              type: 'content',
              url: `/p/${encodeURIComponent(tray.actor.username)}/${encodeURIComponent(current.id)}`,
            });
          }}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white/80 hover:bg-white/10 hover:text-white"
          aria-label="Report this story"
        >
          <Flag className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={close}
          className="rounded-full p-2 text-white/80 hover:bg-white/10 hover:text-white"
          aria-label="Close stories"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div
        className="relative flex h-full w-full max-w-md items-center justify-center"
        onPointerDown={() => setPaused(true)}
        onPointerUp={() => setPaused(false)}
        onPointerLeave={() => setPaused(false)}
      >
        {isVideo ? (
          <video
            ref={videoRef}
            key={current.id}
            src={current.media.url}
            className="max-h-full w-full object-contain"
            playsInline
            autoPlay
            onEnded={goNext}
            onTimeUpdate={(e) => {
              const v = e.currentTarget;
              if (v.duration) setProgress(v.currentTime / v.duration);
            }}
          />
        ) : (
          <Image
            key={current.id}
            src={current.media.url}
            alt={current.media.name || ''}
            width={1080}
            height={1920}
            className="max-h-full w-auto object-contain"
            unoptimized={isUnoptimizableImageSrc(current.media.url)}
            priority
          />
        )}

        {current.contentWarning && (
          <div className="absolute top-1/2 right-4 left-4 -translate-y-1/2 rounded-lg bg-black/70 p-3 text-center text-sm text-white">
            {current.contentWarning}
          </div>
        )}

        {current.caption && (
          <p className="absolute right-4 bottom-8 left-4 rounded-lg bg-black/50 px-3 py-2 text-center text-sm break-words text-white">
            {current.caption}
          </p>
        )}

        {/* Tap targets. Left third goes back, right two-thirds advance --
            the asymmetry is deliberate, since advancing is the common action
            and going back is the correction. */}
        <button
          type="button"
          onClick={goPrev}
          disabled={index === 0}
          className="absolute inset-y-0 left-0 w-1/3 cursor-default disabled:cursor-default"
          aria-label="Previous story"
        />
        <button
          type="button"
          onClick={goNext}
          className="absolute inset-y-0 right-0 w-2/3 cursor-default"
          aria-label="Next story"
        />
      </div>

      {/* Desktop arrows. The tap zones above are invisible and undiscoverable
          with a mouse, so pointer users get something to aim at. */}
      {index > 0 && (
        <button
          type="button"
          onClick={goPrev}
          className="absolute left-4 hidden rounded-full bg-white/10 p-2 text-white hover:bg-white/20 md:block"
          aria-label="Previous story"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}
      {index < stories.length - 1 && (
        <button
          type="button"
          onClick={goNext}
          className="absolute right-4 hidden rounded-full bg-white/10 p-2 text-white hover:bg-white/20 md:block"
          aria-label="Next story"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}
    </div>
  );
}

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}
