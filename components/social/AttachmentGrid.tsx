'use client';

import Image from 'next/image';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { isAudioAttachment, isVisualAttachment } from '@/lib/media/attachments';
import { VoiceNotePlayer } from './VoiceNotePlayer';

export interface AttachmentDisplay {
  id: string;
  type: string;
  mediaType?: string | null;
  url: string;
  name?: string | null;
  width?: number | null;
  height?: number | null;
  peaks?: number[] | null;
}

interface AttachmentGridProps {
  attachments: AttachmentDisplay[];
  imageViewer?: boolean;
  audioPlayback?: boolean;
}

function VideoPlayer({ attachment }: { attachment: AttachmentDisplay }) {
  return (
    <video
      controls
      /* Without playsInline, iPhone yanks every playback into native
         fullscreen the moment it starts. */
      playsInline
      preload="metadata"
      className="w-full rounded-lg border"
      aria-label={attachment.name ?? 'Video'}
    >
      {/* Trusts the stored mediaType instead of asserting video/webm. Posts
          made before the H.264 switch are still WebM in R2, and telling Safari
          an MP4 is WebM makes it refuse a file it can play. media_type is
          nullable, and guessing on those rows would break the other direction,
          so when it is absent the attribute is dropped and the browser sniffs
          the file itself. */}
      <source src={attachment.url} type={attachment.mediaType ?? undefined} />
    </video>
  );
}

function ImageItem({
  attachment,
  imageViewer,
}: {
  attachment: AttachmentDisplay;
  imageViewer: boolean;
}) {
  const thumbnail = (
    <Image
      src={attachment.url}
      alt={attachment.name || ''}
      width={attachment.width || 600}
      height={attachment.height || 400}
      className="h-auto max-h-80 w-full object-cover"
      unoptimized
    />
  );

  if (imageViewer) {
    return (
      <Dialog>
        <DialogTrigger asChild>
          <button
            type="button"
            aria-label={
              attachment.name ? `View image: ${attachment.name}` : 'View image'
            }
            className="relative block w-full cursor-zoom-in overflow-hidden rounded-lg border"
          >
            {thumbnail}
          </button>
        </DialogTrigger>
        <DialogContent
          aria-describedby={undefined}
          className="flex h-dvh max-w-none items-center justify-center rounded-none border-0 bg-black p-4 pt-16 pb-[max(1rem,env(safe-area-inset-bottom))] text-white sm:rounded-none [&>button]:top-[max(1rem,env(safe-area-inset-top))] [&>button]:right-[max(1rem,env(safe-area-inset-right))] [&>button]:flex [&>button]:size-11 [&>button]:items-center [&>button]:justify-center"
        >
          <DialogTitle className="sr-only">Image viewer</DialogTitle>
          <Image
            src={attachment.url}
            alt={attachment.name || 'Message image'}
            width={attachment.width || 600}
            height={attachment.height || 400}
            className="h-full min-h-0 w-full object-contain"
            unoptimized
          />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      className="relative block overflow-hidden rounded-lg border"
    >
      {thumbnail}
    </a>
  );
}

export function AttachmentGrid({
  attachments,
  imageViewer = false,
  audioPlayback = false,
}: AttachmentGridProps) {
  if (!attachments.length) return null;

  const visible = attachments.filter(isVisualAttachment);
  const images = visible.filter((a) => a.type === 'image');
  const videos = visible.filter((a) => a.type === 'video');
  const audio = audioPlayback ? attachments.filter(isAudioAttachment) : [];

  if (!visible.length && !audio.length) {
    return attachments.some(isAudioAttachment) ? (
      <p className="text-muted-foreground mt-3 text-sm">
        Attachment unavailable.
      </p>
    ) : null;
  }

  return (
    <div className="mt-3 space-y-2">
      {/* Image grid */}
      {images.length === 1 && (
        <ImageItem attachment={images[0]} imageViewer={imageViewer} />
      )}
      {images.length === 2 && (
        <div className="grid grid-cols-2 gap-1">
          {images.map((a) => (
            <ImageItem key={a.id} attachment={a} imageViewer={imageViewer} />
          ))}
        </div>
      )}
      {images.length >= 3 && (
        <div className="grid grid-cols-2 gap-1">
          {images.slice(0, 4).map((a) => (
            <ImageItem key={a.id} attachment={a} imageViewer={imageViewer} />
          ))}
        </div>
      )}

      {/* Video players */}
      {videos.map((a) => (
        <VideoPlayer key={a.id} attachment={a} />
      ))}
      {audio.map((attachment) => (
        <VoiceNotePlayer key={attachment.id} url={attachment.url} />
      ))}
    </div>
  );
}
