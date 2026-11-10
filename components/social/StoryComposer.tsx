'use client';

// Post a story: capture or pick one photo or video, optionally caption it, done.
//
// Reuses MultiMediaUpload with maxItems=1 rather than growing a second upload
// path. That component already handles the two R2 routes (multipart for
// images, presigned PUT for video), the size caps, and the accept list, and
// all of that is the same here. Capping it at one is the only difference,
// and it is the difference that makes the viewer's one-tap-one-story contract
// enforceable rather than aspirational.

import { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Camera, ImagePlus, X, Loader2 } from 'lucide-react';
import MultiMediaUpload, {
  type MediaUploadHandle,
  type UploadedMedia,
} from '@/components/MultiMediaUpload';
import { isNativeApp, NATIVE_BACK_BUTTON_EVENT } from '@/lib/mobile/native';
import {
  hasNativeMediaLibrary,
  pickNativeStoryMedia,
} from '@/lib/mobile/media-library';
import { useToast } from '@/hooks/use-toast';
import { StoryCamera } from './StoryCamera';

const MAX_CAPTION_LENGTH = 280;

interface StoryComposerProps {
  onClose: () => void;
  onPosted: () => void;
}

export function StoryComposer({ onClose, onPosted }: StoryComposerProps) {
  const mediaInput = useRef<MediaUploadHandle>(null);
  const cameraButton = useRef<HTMLButtonElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const gallerySelection = useRef<((file: File | null) => void) | null>(null);
  const picking = useRef(false);
  const [media, setMedia] = useState<UploadedMedia[]>([]);
  const [caption, setCaption] = useState('');
  const [cameraOpen, setCameraOpen] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const selected = media[0];
  const overLimit = caption.length > MAX_CAPTION_LENGTH;
  const canPost = !!selected && !overLimit && !posting && !uploading;

  const close = () => {
    if (posting || picking.current || mediaInput.current?.isUploading()) return;
    if (cameraOpen) {
      setCameraOpen(false);
      requestAnimationFrame(() => cameraButton.current?.focus());
    } else {
      onClose();
    }
  };

  useEffect(() => {
    const handleBack = (event: Event) => {
      event.preventDefault();
      close();
    };
    window.addEventListener(NATIVE_BACK_BUTTON_EVENT, handleBack);
    return () =>
      window.removeEventListener(NATIVE_BACK_BUTTON_EVENT, handleBack);
  });

  useEffect(() => () => gallerySelection.current?.(null), []);

  const chooseFromGallery = async (): Promise<File | null> => {
    if (picking.current) {
      throw new Error('Finish choosing your current photo or video first.');
    }
    picking.current = true;
    try {
      if (hasNativeMediaLibrary()) return await pickNativeStoryMedia();
      if (isNativeApp()) {
        toast({
          title: 'App update needed',
          description:
            'This app version uses the system picker. Update Pana Mia to open the photo library directly.',
        });
      }
      return await new Promise<File | null>((resolve, reject) => {
        if (!galleryInput.current) {
          reject(
            new Error('The photo library picker is not ready. Try again.')
          );
          return;
        }
        gallerySelection.current = resolve;
        galleryInput.current.click();
      });
    } finally {
      picking.current = false;
    }
  };

  const useMedia = async (file: File): Promise<boolean> => {
    if (!mediaInput.current) {
      throw new Error('The story uploader is not ready. Please try again.');
    }
    const uploaded = await mediaInput.current.addFiles([file]);
    if (uploaded.length !== 1) return false;
    setCameraOpen(false);
    requestAnimationFrame(() =>
      document.getElementById('story-caption')?.focus()
    );
    return true;
  };

  const chooseFromEditor = async () => {
    setError(null);
    try {
      const file = await chooseFromGallery();
      if (file) await useMedia(file);
    } catch (failure) {
      console.error('Story library selection failed:', failure);
      setError(
        failure instanceof Error
          ? failure.message
          : 'Could not open your photo library. Please try again.'
      );
    }
  };

  const handlePost = async () => {
    if (!canPost || mediaInput.current?.isUploading()) return;
    setPosting(true);
    setError(null);

    try {
      const res = await fetch('/api/social/stories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media: {
            type: selected.type,
            mediaType: selected.mediaType,
            url: selected.url,
            name: selected.name,
          },
          caption: caption.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || 'Could not post your story');
        setPosting(false);
        return;
      }

      onPosted();
    } catch {
      setError('Could not post your story');
      setPosting(false);
    }
  };

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/70" />
        <Dialog.Content
          data-story-composer={!cameraOpen || undefined}
          className={
            cameraOpen
              ? 'fixed inset-0 z-[101] h-dvh w-screen overflow-hidden bg-black sm:inset-auto sm:top-1/2 sm:left-1/2 sm:h-[min(90dvh,56rem)] sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl'
              : 'bg-background fixed top-1/2 left-1/2 z-[101] max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl p-5 shadow-xl'
          }
          onPointerDownOutside={(event) => {
            if (cameraOpen || posting || uploading) event.preventDefault();
          }}
        >
          <Dialog.Title className="sr-only">
            {cameraOpen ? 'Story camera' : 'Post a story'}
          </Dialog.Title>
          <Dialog.Description className="sr-only">
            Capture or choose a photo or video, then add a caption and post it
            for 24 hours.
          </Dialog.Description>
          <input
            ref={(input) => {
              galleryInput.current = input;
              if (!input) return;
              const cancel = () => {
                gallerySelection.current?.(null);
                gallerySelection.current = null;
              };
              input.addEventListener('cancel', cancel);
              return () => input.removeEventListener('cancel', cancel);
            }}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,video/*"
            aria-label="Choose story from gallery"
            className="hidden"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0] ?? null;
              event.currentTarget.value = '';
              gallerySelection.current?.(file);
              gallerySelection.current = null;
            }}
          />
          <div className={cameraOpen ? 'hidden' : undefined}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Post a story</h2>
              <button
                type="button"
                onClick={close}
                disabled={posting || uploading}
                className="hover:bg-muted rounded-full p-1.5"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-muted-foreground mb-4 text-sm">
              Your story stays up for 24 hours, then disappears on its own.
            </p>

            {!selected && (
              <div className="mb-3 grid grid-cols-2 gap-3">
                <button
                  ref={cameraButton}
                  type="button"
                  onClick={() => setCameraOpen(true)}
                  disabled={posting || uploading}
                  className="border-input hover:bg-muted flex min-h-12 items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold disabled:opacity-50"
                >
                  <Camera className="h-5 w-5" aria-hidden="true" />
                  Open camera
                </button>
                <button
                  type="button"
                  onClick={() => void chooseFromEditor()}
                  disabled={posting || uploading}
                  className="border-input hover:bg-muted flex min-h-12 items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold disabled:opacity-50"
                >
                  <ImagePlus className="h-5 w-5" aria-hidden="true" />
                  Choose from gallery
                </button>
              </div>
            )}

            <MultiMediaUpload
              ref={mediaInput}
              value={media}
              onChange={setMedia}
              maxItems={1}
              accept="image/jpeg,image/png,image/webp,image/gif,video/*"
              imageUploadEndpoint="/api/social/media"
              presignEndpoint="/api/social/media/upload"
              pathPrefix="social/stories"
              disabled={posting}
              showControls={false}
              onUploadingChange={setUploading}
            />

            <div className="mt-4">
              <label htmlFor="story-caption" className="sr-only">
                Caption
              </label>
              <textarea
                id="story-caption"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Say something about it (optional)"
                rows={2}
                disabled={posting}
                className="border-input bg-background w-full resize-none rounded-lg border p-2 text-sm"
              />
              <div className="mt-1 flex justify-end">
                <span
                  className={`text-xs ${
                    overLimit ? 'text-destructive' : 'text-muted-foreground'
                  }`}
                >
                  {caption.length}/{MAX_CAPTION_LENGTH}
                </span>
              </div>
            </div>

            {error && <p className="text-destructive mt-2 text-sm">{error}</p>}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={close}
                disabled={posting || uploading}
                className="hover:bg-muted rounded-lg px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePost}
                disabled={!canPost}
                className="flex items-center gap-2 rounded-lg bg-[var(--color-pana-indigo)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {posting && <Loader2 className="h-4 w-4 animate-spin" />}
                Post story
              </button>
            </div>
          </div>
          {cameraOpen && (
            <StoryCamera
              onClose={close}
              onChooseFromGallery={chooseFromGallery}
              onCapture={useMedia}
            />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
