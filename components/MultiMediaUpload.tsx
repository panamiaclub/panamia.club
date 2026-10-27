/**
 * MultiMediaUpload
 *
 * Parallel to MediaUpload, but for multiple attachments of mixed kinds
 * (image + audio + video) — the shape the social composer needs. Extracts the
 * upload logic that used to live inline in PostComposer:
 *   - audio → transcode to Opus, video → transcode to MP4 (both in-browser),
 *     then PUT directly to R2 via a presigned URL from `presignEndpoint`.
 *   - images → multipart POST to `imageUploadEndpoint`.
 *
 * Controlled: the caller owns the attachments array and passes the namespaced
 * endpoints + R2 key prefix, so this stays module-agnostic.
 */

'use client';

import { useId, useImperativeHandle, useRef, useState, type Ref } from 'react';
import Image from 'next/image';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { ImagePlus, X, Volume2, Loader2, Video } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { transcodeToOpus, transcodeToMp4Video } from '@/lib/media/transcode';

/* Audio only. Video is H.264/AAC MP4, which every Safari plays; Opus in an
   Ogg container is still unreliable on iOS, so the audio warning stays. */
const isSafari = () =>
  typeof navigator !== 'undefined' &&
  /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

const DEFAULT_ACCEPT =
  'image/jpeg,image/png,image/webp,image/gif,audio/*,video/*';
const PHOTO_VIDEO_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,video/*';

export interface UploadedMedia {
  type: string; // 'image' | 'audio' | 'video'
  mediaType: string;
  url: string;
  name: string;
}

export interface MediaUploadHandle {
  addFiles: (files: File[]) => Promise<UploadedMedia[]>;
  isUploading: () => boolean;
  openPicker: (kind: 'media' | 'audio') => void;
}

/** The same playable attachments in the writing and formatting-preview views. */
export function MediaAttachments({
  value,
  onRemove,
  disabled,
}: {
  value: UploadedMedia[];
  onRemove?: (index: number) => void;
  disabled?: boolean;
}) {
  if (!value.length) return null;

  return (
    <div
      className={`grid min-w-0 gap-3 ${value.length > 1 ? 'grid-cols-2' : ''}`}
    >
      {value.map((attachment, index) => (
        <figure
          key={`${attachment.url}-${index}`}
          className={`border-pana-ink/10 bg-pana-cream/40 relative min-w-0 overflow-hidden rounded-2xl border ${attachment.type === 'audio' ? 'col-span-full' : ''}`}
        >
          {attachment.type === 'image' ? (
            <Image
              src={attachment.url}
              alt={attachment.name || 'Attached photo'}
              width={1000}
              height={750}
              unoptimized
              className="aspect-4/3 max-h-80 w-full object-cover"
            />
          ) : attachment.type === 'video' ? (
            <video
              src={attachment.url}
              controls
              playsInline
              preload="metadata"
              aria-label={attachment.name || 'Attached video'}
              className="max-h-80 w-full bg-black"
            />
          ) : (
            <div className="space-y-2 p-3 pt-4">
              <div className="text-pana-ink flex items-center gap-2 pr-9 text-xs font-bold">
                <Volume2 className="h-4 w-4 flex-none" aria-hidden="true" />
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  {attachment.name || 'Attached audio'}
                </span>
              </div>
              <audio
                src={attachment.url}
                controls
                preload="metadata"
                aria-label={attachment.name || 'Attached audio'}
                className="h-10 w-full min-w-0"
              />
            </div>
          )}
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(index)}
              disabled={disabled}
              aria-label={`Remove ${attachment.name || 'attachment'}`}
              className="text-pana-ink focus-visible:ring-pana-indigo absolute top-2 right-2 grid h-8 w-8 place-items-center rounded-full bg-white/95 shadow-sm focus-visible:ring-2 disabled:opacity-45"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </figure>
      ))}
    </div>
  );
}

interface MultiMediaUploadProps {
  value: UploadedMedia[];
  onChange: (next: UploadedMedia[]) => void;
  /** Max number of attachments. Default 4. */
  maxItems?: number;
  /** file input `accept` attribute. */
  accept?: string;
  /** Multipart image upload endpoint returning { success, data: UploadedMedia }. */
  imageUploadEndpoint: string;
  /** Presigned-URL endpoint (POST { filename, contentType, size }) for audio/video. */
  presignEndpoint: string;
  /** R2 key prefix, e.g. "social/media". */
  pathPrefix: string;
  disabled?: boolean;
  /** Class for the outer wrapper, replacing the default stack. Pass a
   *  `display: contents` class to let a caller lay the trigger out inline in
   *  its own row — the composer puts it in a row of chips. */
  wrapperClassName?: string;
  /** Class for the file-picker trigger. Supplying one swaps the default
   *  shadcn button for an unstyled element, so the caller's styling isn't
   *  competing with button utilities it would have to override one by one. */
  triggerClassName?: string;
  presentation?: 'default' | 'composer' | 'compact';
  showControls?: boolean;
  showAttachments?: boolean;
  onUploadingChange?: (uploading: boolean) => void;
  ref?: Ref<MediaUploadHandle>;
}

export default function MultiMediaUpload({
  value,
  onChange,
  maxItems = 4,
  accept = DEFAULT_ACCEPT,
  imageUploadEndpoint,
  presignEndpoint,
  pathPrefix,
  disabled,
  wrapperClassName = 'space-y-2',
  triggerClassName,
  presentation = 'default',
  showControls = true,
  showAttachments = true,
  onUploadingChange,
  ref,
}: MultiMediaUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const hintId = useId();
  const [uploading, setUploading] = useState(false);
  const [videoProgress, setVideoProgress] = useState<number | null>(null);
  const [safariNotice, setSafariNotice] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const { toast } = useToast();
  const { t } = useTranslation('toast');

  // Transcoded audio/video: get a presigned URL, then PUT the blob to R2.
  const presignPut = async (
    blob: Blob,
    contentType: string,
    ext: string
  ): Promise<string> => {
    const filename = `${pathPrefix}/${crypto.randomUUID()}.${ext}`;
    const { presignedUrl, publicUrl } = await fetch(presignEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, contentType, size: blob.size }),
    }).then(async (r) => {
      if (!r.ok) {
        throw new Error((await r.json()).error ?? 'Upload token failed');
      }
      return r.json() as Promise<{ presignedUrl: string; publicUrl: string }>;
    });
    // fetch resolves on HTTP errors too — a failed R2 PUT must throw so it
    // reaches the catch/toast instead of attaching a URL to an object that was
    // never stored.
    const put = await fetch(presignedUrl, {
      method: 'PUT',
      body: blob,
      headers: { 'Content-Type': contentType },
    });
    if (!put.ok) throw new Error(`Upload failed (${put.status})`);
    return publicUrl;
  };

  const addFiles = async (files: File[]): Promise<UploadedMedia[]> => {
    if (!files.length) return [];
    if (disabled || busy.current) {
      setMediaError(
        'Wait for the current upload or post to finish before adding files.'
      );
      return [];
    }

    const errors: string[] = [];
    const supported = files.filter((file) => {
      const matches = accept.split(',').some((pattern) => {
        const rule = pattern.trim();
        return rule.startsWith('.')
          ? file.name.toLowerCase().endsWith(rule.toLowerCase())
          : rule.endsWith('/*')
            ? file.type.startsWith(rule.slice(0, -1))
            : file.type === rule;
      });
      if (!matches) errors.push(`Unsupported file: ${file.name}.`);
      return matches;
    });
    const available = Math.max(0, maxItems - value.length);
    if (supported.length > available) {
      errors.push(
        `You can add up to ${maxItems} attachments. Extra files were not added.`
      );
    }
    setMediaError(errors.length ? errors.join(' ') : null);
    const filesToUpload = supported.slice(0, available);
    if (!filesToUpload.length) return [];

    if (
      filesToUpload.some((file) => file.type.startsWith('audio/')) &&
      isSafari()
    ) {
      setSafariNotice(true);
    }

    busy.current = true;
    setUploading(true);
    onUploadingChange?.(true);
    const added: UploadedMedia[] = [];
    try {
      for (const file of filesToUpload) {
        try {
          if (file.type.startsWith('audio/')) {
            const ogg = await transcodeToOpus(file);
            const url = await presignPut(ogg, 'audio/ogg', 'ogg');
            added.push({
              type: 'audio',
              mediaType: 'audio/ogg',
              url,
              name: file.name,
            });
          } else if (file.type.startsWith('video/')) {
            setVideoProgress(0);
            const mp4 = await transcodeToMp4Video(file, (ratio) =>
              setVideoProgress(Math.round(ratio * 100))
            );
            setVideoProgress(null);
            const url = await presignPut(mp4, 'video/mp4', 'mp4');
            added.push({
              type: 'video',
              mediaType: 'video/mp4',
              url,
              name: file.name,
            });
          } else {
            const formData = new FormData();
            formData.append('file', file);
            const res = await axios.post<{
              success: boolean;
              data?: UploadedMedia;
              error?: string;
            }>(imageUploadEndpoint, formData);
            if (!res.data.success || !res.data.data) {
              throw new Error(res.data.error || 'Image upload failed.');
            }
            added.push(res.data.data);
          }
          onChange([...value, ...added]);
        } catch (error) {
          setVideoProgress(null);
          const message =
            axios.isAxiosError<{ error?: string }>(error) &&
            error.response?.data?.error
              ? error.response.data.error
              : error instanceof Error
                ? error.message
                : 'Upload failed. Please try again.';
          errors.push(`${file.name}: ${message}`);
          setMediaError(errors.join(' '));
          toast({
            title: t('uploadFailed'),
            description: message,
            variant: 'destructive',
          });
        }
      }
    } finally {
      busy.current = false;
      setUploading(false);
      onUploadingChange?.(false);
    }
    return added;
  };

  useImperativeHandle(ref, () => ({
    addFiles,
    isUploading: () => busy.current,
    openPicker: (kind) => {
      if (disabled || busy.current || value.length >= maxItems) return;
      (kind === 'audio' ? audioInputRef : fileInputRef).current?.click();
    },
  }));

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';
    void addFiles(files);
  };

  const removeAt = (index: number) => {
    if (disabled || busy.current) return;
    onChange(value.filter((_, i) => i !== index));
    setMediaError(null);
  };

  const triggerLabel =
    videoProgress !== null
      ? `Preparing video... ${videoProgress}%`
      : uploading
        ? 'Uploading...'
        : value.length > 0
          ? `${value.length}/${maxItems}`
          : 'Media';
  const pickerDisabled = disabled || value.length >= maxItems || uploading;
  const friendly = presentation !== 'default';
  const hasVisibleContent =
    showControls ||
    (showAttachments && value.length > 0) ||
    uploading ||
    mediaError ||
    safariNotice;

  return (
    <div className={hasVisibleContent ? wrapperClassName : 'hidden'}>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={friendly ? PHOTO_VIDEO_ACCEPT : accept}
        aria-label={friendly ? 'Choose photos or videos' : 'Choose media'}
        className="hidden"
        onChange={handleFileSelect}
      />
      <input
        ref={audioInputRef}
        type="file"
        multiple
        accept="audio/*"
        aria-label="Choose audio"
        className="hidden"
        onChange={handleFileSelect}
      />

      {friendly && showAttachments && (
        <MediaAttachments
          value={value}
          onRemove={removeAt}
          disabled={disabled || uploading}
        />
      )}

      {showControls &&
        (friendly ? (
          <div className="space-y-2">
            <div
              className={
                presentation === 'compact'
                  ? 'flex flex-wrap items-center gap-2'
                  : 'flex items-stretch gap-2.5'
              }
            >
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={pickerDisabled}
                aria-describedby={hintId}
                className={
                  presentation === 'compact'
                    ? 'composer-chip'
                    : 'border-pana-indigo/20 bg-pana-indigo/4 hover:border-pana-indigo/45 hover:bg-pana-indigo/8 focus-visible:ring-pana-indigo flex min-w-0 flex-1 items-center gap-3 rounded-2xl border-2 border-dashed p-3 text-left transition-colors focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-45 sm:p-4'
                }
              >
                <span
                  className={
                    presentation === 'composer'
                      ? 'bg-pana-orange/15 text-pana-ink grid h-10 w-10 flex-none place-items-center rounded-xl'
                      : ''
                  }
                >
                  <ImagePlus
                    className={
                      presentation === 'composer' ? 'h-5 w-5' : 'h-4 w-4'
                    }
                    aria-hidden="true"
                  />
                </span>
                <span className="min-w-0">
                  <span className="text-pana-ink block text-sm leading-snug font-extrabold">
                    Add photos or video
                  </span>
                  {presentation === 'composer' && (
                    <span className="text-pana-ink/50 mt-0.5 hidden text-xs font-semibold sm:block">
                      Choose from your device, or drop files here
                    </span>
                  )}
                </span>
              </button>
              <button
                type="button"
                aria-label="Add audio"
                onClick={() => audioInputRef.current?.click()}
                disabled={pickerDisabled}
                className={
                  presentation === 'compact'
                    ? 'composer-chip'
                    : 'border-pana-ink/10 bg-pana-cream/70 text-pana-ink/70 hover:border-pana-indigo/40 hover:text-pana-indigo focus-visible:ring-pana-indigo flex w-17 flex-none flex-col items-center justify-center gap-1 rounded-2xl border px-3 py-3 text-xs font-extrabold focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-45 sm:w-20'
                }
              >
                <Volume2
                  className={
                    presentation === 'composer' ? 'h-5 w-5' : 'h-4 w-4'
                  }
                  aria-hidden="true"
                />
                Audio
              </button>
            </div>
            <p
              id={hintId}
              className="text-pana-ink/45 px-1 text-[11px] font-semibold"
            >
              {value.length
                ? `${value.length} of ${maxItems} attachments`
                : `Up to ${maxItems} attachments`}
              <span className="hidden sm:inline">
                {' '}
                &middot; You can paste images, too
              </span>
            </p>
          </div>
        ) : triggerClassName ? (
          <button
            type="button"
            className={triggerClassName}
            onClick={() => fileInputRef.current?.click()}
            disabled={pickerDisabled}
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ImagePlus className="h-3.5 w-3.5" />
            )}
            {triggerLabel}
          </button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={pickerDisabled}
          >
            {uploading ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <ImagePlus className="mr-1 h-4 w-4" />
            )}
            {triggerLabel}
          </Button>
        ))}

      {uploading && (
        <p
          role="status"
          className="text-pana-indigo flex items-center gap-2 text-xs font-semibold"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          {triggerLabel}
        </p>
      )}
      {mediaError && (
        <p
          role="alert"
          className="text-destructive min-w-0 text-xs font-semibold [overflow-wrap:anywhere]"
        >
          {mediaError}
        </p>
      )}

      {safariNotice && (
        <p className="composer-media-block text-muted-foreground rounded-md border px-3 py-2 text-sm">
          {`Audio playback requires Chrome or Firefox \u{1F49B} — your upload will succeed but won't play on this device.`}
        </p>
      )}

      {!friendly && showAttachments && value.length > 0 && (
        <div className="composer-media-block flex flex-wrap gap-2">
          {value.map((att, i) => (
            <div key={i} className="group relative">
              {att.type === 'image' ? (
                <Image
                  src={att.url}
                  alt={att.name || ''}
                  width={80}
                  height={80}
                  className="h-20 w-20 rounded-md border object-cover"
                  unoptimized
                />
              ) : (
                <div className="bg-muted flex h-20 w-20 items-center justify-center rounded-md border">
                  {att.type === 'video' ? (
                    <Video className="text-muted-foreground h-6 w-6" />
                  ) : (
                    <Volume2 className="text-muted-foreground h-6 w-6" />
                  )}
                </div>
              )}
              <button
                type="button"
                onClick={() => removeAt(i)}
                disabled={disabled || uploading}
                aria-label={`Remove ${att.name || 'attachment'}`}
                className="bg-destructive text-destructive-foreground absolute -top-1.5 -right-1.5 rounded-full p-1 disabled:opacity-45"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
