'use client';

import Image from 'next/image';
import { isAudioAttachment, isVisualAttachment } from '@/lib/media/attachments';

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

function ImageItem({ attachment }: { attachment: AttachmentDisplay }) {
  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      className="relative block overflow-hidden rounded-lg border"
    >
      <Image
        src={attachment.url}
        alt={attachment.name || ''}
        width={attachment.width || 600}
        height={attachment.height || 400}
        className="h-auto max-h-80 w-full object-cover"
        unoptimized
      />
    </a>
  );
}

export function AttachmentGrid({ attachments }: AttachmentGridProps) {
  if (!attachments.length) return null;

  const visible = attachments.filter(isVisualAttachment);
  const images = visible.filter((a) => a.type === 'image');
  const videos = visible.filter((a) => a.type === 'video');

  if (!visible.length) {
    return attachments.some(isAudioAttachment) ? (
      <p className="text-muted-foreground mt-3 text-sm">
        Attachment unavailable.
      </p>
    ) : null;
  }

  return (
    <div className="mt-3 space-y-2">
      {/* Image grid */}
      {images.length === 1 && <ImageItem attachment={images[0]} />}
      {images.length === 2 && (
        <div className="grid grid-cols-2 gap-1">
          {images.map((a) => (
            <ImageItem key={a.id} attachment={a} />
          ))}
        </div>
      )}
      {images.length >= 3 && (
        <div className="grid grid-cols-2 gap-1">
          {images.slice(0, 4).map((a) => (
            <ImageItem key={a.id} attachment={a} />
          ))}
        </div>
      )}

      {/* Video players */}
      {videos.map((a) => (
        <VideoPlayer key={a.id} attachment={a} />
      ))}
    </div>
  );
}
