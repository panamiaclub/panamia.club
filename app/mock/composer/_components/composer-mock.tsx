'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  Ellipsis,
  Eye,
  Globe,
  ImagePlus,
  Lock,
  Sparkles,
  Users,
  Volume2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MOCK_VIEWER } from '../../feed/_data/mock-feed';

const AUDIENCES = [
  {
    id: 'everyone',
    label: 'Everyone',
    icon: Globe,
    hint: 'A public post, on Pana Social and beyond.',
    reach: 'Anyone can read this. It will appear in Everyone.',
  },
  {
    id: 'panas',
    label: 'Panas',
    icon: Users,
    hint: 'Only people you follow who follow you back.',
    reach: 'Only your mutual Panas can read this.',
  },
] as const;

type Audience = (typeof AUDIENCES)[number]['id'];
type MediaKind = 'image' | 'video' | 'audio';

interface MockAttachment {
  id: string;
  kind: MediaKind;
  url: string;
  name: string;
}

const MAX_LENGTH = 500;
const MAX_ATTACHMENTS = 4;
const IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);
const PHOTO_VIDEO_ACCEPT = [...IMAGE_TYPES, 'video/*'].join(',');
const SAMPLE_PHOTO: MockAttachment = {
  id: 'sample-zines',
  kind: 'image',
  url: '/img/impact/zine-series.webp',
  name: 'Sample photo: three people posing with a zine',
};

function mediaKind(file: File): MediaKind | null {
  if (IMAGE_TYPES.has(file.type)) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return null;
}

export function ComposerMock() {
  const [audience, setAudience] = useState<Audience>('everyone');
  const [draft, setDraft] = useState('');
  const [preview, setPreview] = useState(false);
  const [attachments, setAttachments] = useState<MockAttachment[]>([]);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [warning, setWarning] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  const objectUrls = useRef(new Set<string>());

  useEffect(() => {
    const urls = objectUrls.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  const selected = AUDIENCES.find((option) => option.id === audience)!;
  const AudienceIcon = selected.icon;
  const canPost =
    (draft.trim().length > 0 || attachments.length > 0) &&
    draft.length <= MAX_LENGTH;
  const atMediaLimit = attachments.length >= MAX_ATTACHMENTS;
  const firstName = MOCK_VIEWER.name.split(' ')[0];

  const addFiles = (files: File[]) => {
    if (!files.length) return;
    if (attachments.length + files.length > MAX_ATTACHMENTS) {
      setMediaError(
        `You can add up to ${MAX_ATTACHMENTS} attachments. Remove one or choose fewer files.`
      );
      return;
    }

    const chosen: { file: File; kind: MediaKind }[] = [];
    for (const file of files) {
      const kind = mediaKind(file);
      if (!kind) {
        setMediaError(
          `${file.name} is not supported. Choose a JPG, PNG, WebP, GIF, video or audio file.`
        );
        return;
      }
      chosen.push({ file, kind });
    }

    const added = chosen.map(({ file, kind }) => {
      const url = URL.createObjectURL(file);
      objectUrls.current.add(url);
      return { id: crypto.randomUUID(), kind, url, name: file.name };
    });
    setAttachments([...attachments, ...added]);
    setMediaError(null);
    setPreview(false);
    setSubmitted(false);
  };

  const removeAttachment = (id: string) => {
    const removed = attachments.find((attachment) => attachment.id === id);
    if (removed && objectUrls.current.delete(removed.url)) {
      URL.revokeObjectURL(removed.url);
    }
    setAttachments(attachments.filter((attachment) => attachment.id !== id));
    setMediaError(null);
    setSubmitted(false);
  };

  const attachedMedia = attachments.length > 0 && (
    <div
      role="group"
      aria-label="Attached media"
      className={`grid gap-3 ${attachments.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}
    >
      {attachments.map((attachment) => (
        <div
          key={attachment.id}
          className={`border-pana-ink/10 relative min-w-0 overflow-hidden rounded-2xl border bg-white ${attachment.kind === 'audio' ? 'col-span-full p-3' : ''}`}
        >
          {attachment.kind === 'image' ? (
            <Image
              src={attachment.url}
              alt={attachment.name}
              width={640}
              height={400}
              unoptimized
              className={`w-full object-cover ${attachments.length === 1 ? 'max-h-64' : 'aspect-square'}`}
              onError={() =>
                setMediaError(
                  `This browser could not preview ${attachment.name}. Remove it and try another image.`
                )
              }
            />
          ) : attachment.kind === 'video' ? (
            <video
              src={attachment.url}
              aria-label={`Video preview: ${attachment.name}`}
              controls
              playsInline
              preload="metadata"
              className="aspect-video w-full bg-black"
              onError={() =>
                setMediaError(
                  `This browser could not play ${attachment.name}. No file was uploaded.`
                )
              }
            />
          ) : (
            <>
              <div className="mb-3 flex min-w-0 items-center gap-2 pr-9">
                <Volume2
                  className="text-pana-indigo h-4 w-4 flex-none"
                  aria-hidden="true"
                />
                <span className="truncate text-xs font-bold">
                  {attachment.name}
                </span>
              </div>
              <audio
                src={attachment.url}
                aria-label={`Audio preview: ${attachment.name}`}
                controls
                preload="metadata"
                className="h-10 w-full min-w-0"
                onError={() =>
                  setMediaError(
                    `This browser could not play ${attachment.name}. No file was uploaded.`
                  )
                }
              />
            </>
          )}
          {!preview && (
            <button
              type="button"
              aria-label={`Remove ${attachment.name}`}
              onClick={() => removeAttachment(attachment.id)}
              className="text-pana-ink hover:text-pana-indigo focus-visible:ring-pana-indigo absolute top-2 right-2 grid h-9 w-9 place-items-center rounded-full bg-white/95 shadow-sm focus-visible:ring-2"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      ))}
    </div>
  );

  const postBody = (
    <div className="space-y-4">
      {draft.trim() ? (
        <div className="prose prose-sm max-w-none break-words">
          <ReactMarkdown>{draft}</ReactMarkdown>
        </div>
      ) : !attachments.length ? (
        <p className="text-pana-ink/45 text-sm font-semibold">
          Your post preview will appear here.
        </p>
      ) : null}
      {attachedMedia}
    </div>
  );

  return (
    <main className="surface-cream min-h-screen pb-12">
      <div className="mock-toolbar">
        <span className="mock-toolbar-badge">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          Mock
        </span>
        <span className="text-xs font-bold">Friendly social card</span>
        <span className="ml-auto text-xs">Nothing here is published</span>
      </div>

      <div className="container mx-auto max-w-3xl px-4 pt-8 sm:pt-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Image
            src="/logos/pana_social_long_orange.png"
            alt="Pana Social"
            width={190}
            height={52}
            className="h-10 w-auto object-contain"
          />
          <Link
            href="/mock/feed"
            className="text-pana-ink/55 inline-flex items-center gap-1.5 text-xs font-extrabold"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Feed mock
          </Link>
        </div>

        <div className="mt-8 mb-6">
          <h1 className="text-pana-ink text-2xl font-extrabold tracking-tight sm:text-3xl">
            Share a little of your day.
          </h1>
          <p className="text-pana-ink/60 mt-2 text-sm font-semibold">
            A thought, a photo, a little moment. Start wherever you like.
          </p>
        </div>

        <section aria-label="Post composer preview">
          <form
            className={`border-pana-ink/10 focus-within:border-pana-indigo/45 space-y-5 rounded-3xl border-2 bg-white p-4 shadow-sm transition-colors sm:p-6 ${isDragging ? 'outline-pana-indigo outline-2 outline-offset-4' : ''}`}
            onSubmit={(event) => {
              event.preventDefault();
              if (canPost) setSubmitted(true);
            }}
            onDragOver={(event) => {
              if (event.dataTransfer.types.includes('Files')) {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'copy';
                setIsDragging(true);
              }
            }}
            onDragLeave={(event) => {
              if (
                !(event.relatedTarget instanceof Node) ||
                !event.currentTarget.contains(event.relatedTarget)
              ) {
                setIsDragging(false);
              }
            }}
            onDrop={(event) => {
              if (!event.dataTransfer.types.includes('Files')) return;
              event.preventDefault();
              setIsDragging(false);
              addFiles(Array.from(event.dataTransfer.files));
            }}
            onPaste={(event) => {
              if (!event.clipboardData.files.length) return;
              event.preventDefault();
              addFiles(Array.from(event.clipboardData.files));
            }}
          >
            <div className="flex items-center gap-3">
              <Image
                src={MOCK_VIEWER.avatar}
                alt={MOCK_VIEWER.name}
                width={44}
                height={44}
                className="border-pana-ink/10 h-11 w-11 flex-none rounded-full border-2 object-cover"
              />
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="text-pana-ink text-sm font-extrabold">
                  {MOCK_VIEWER.name}
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`Audience: ${selected.label}`}
                      className="bg-pana-indigo/7 text-pana-indigo hover:bg-pana-indigo/12 focus-visible:ring-pana-indigo inline-flex min-h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-extrabold focus-visible:ring-2"
                    >
                      <AudienceIcon
                        className="h-3.5 w-3.5"
                        aria-hidden="true"
                      />
                      {selected.label}
                      <ChevronDown className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    sideOffset={8}
                    collisionPadding={12}
                    className="destination-menu"
                  >
                    <DropdownMenuLabel className="destination-menu-heading">
                      Who can see this?
                    </DropdownMenuLabel>
                    <DropdownMenuRadioGroup value={audience}>
                      {AUDIENCES.map((option) => (
                        <DropdownMenuRadioItem
                          key={option.id}
                          value={option.id}
                          onSelect={() => {
                            setAudience(option.id);
                            setSubmitted(false);
                          }}
                          className="destination-option [&>span:first-child]:hidden"
                        >
                          <option.icon
                            className="destination-option-icon"
                            aria-hidden="true"
                          />
                          <span className="min-w-0">
                            <span className="destination-option-label">
                              {option.label}
                            </span>
                            <span className="destination-option-hint">
                              {option.hint}
                            </span>
                          </span>
                          {audience === option.id && (
                            <Check
                              className="destination-option-check"
                              aria-hidden="true"
                            />
                          )}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {showWarning && !preview && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="mock-composer-warning"
                    className="text-xs font-extrabold"
                  >
                    Content warning
                  </Label>
                  <button
                    type="button"
                    aria-label="Remove content warning"
                    className="text-pana-ink/50 hover:text-pana-indigo rounded-full p-1"
                    onClick={() => {
                      setShowWarning(false);
                      setWarning('');
                      setSubmitted(false);
                    }}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
                <Input
                  id="mock-composer-warning"
                  value={warning}
                  onChange={(event) => {
                    setWarning(event.target.value);
                    setSubmitted(false);
                  }}
                  placeholder="Give people a heads-up before they open your post"
                  maxLength={100}
                  className="composer-surface"
                />
              </div>
            )}

            {preview ? (
              <div aria-label="Post preview" className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-pana-ink/45 text-xs font-bold">
                    Formatting preview
                  </span>
                  <button
                    type="button"
                    onClick={() => setPreview(false)}
                    className="text-pana-indigo inline-flex items-center gap-1 text-xs font-extrabold"
                  >
                    <ArrowLeft className="h-3 w-3" aria-hidden="true" />
                    Back to writing
                  </button>
                </div>
                {showWarning ? (
                  <details className="composer-surface">
                    <summary className="text-pana-ink cursor-pointer text-sm font-bold">
                      {warning.trim() || 'Content warning'}
                    </summary>
                    <div className="mt-3">{postBody}</div>
                  </details>
                ) : (
                  postBody
                )}
              </div>
            ) : (
              <>
                <textarea
                  aria-label="Write a post"
                  aria-describedby="mock-composer-count"
                  aria-invalid={draft.length > MAX_LENGTH}
                  value={draft}
                  onChange={(event) => {
                    setDraft(event.target.value);
                    setSubmitted(false);
                  }}
                  placeholder={`What's on your mind, ${firstName}?`}
                  rows={3}
                  className="feed-composer-prompt block min-h-24"
                />
                {attachedMedia}
              </>
            )}

            <div className="space-y-2">
              <input
                ref={photoInput}
                type="file"
                multiple
                accept={PHOTO_VIDEO_ACCEPT}
                aria-label="Choose photos or videos"
                className="hidden"
                onChange={(event) => {
                  addFiles(Array.from(event.currentTarget.files ?? []));
                  event.currentTarget.value = '';
                }}
              />
              <input
                ref={audioInput}
                type="file"
                multiple
                accept="audio/*"
                aria-label="Choose audio"
                className="hidden"
                onChange={(event) => {
                  addFiles(Array.from(event.currentTarget.files ?? []));
                  event.currentTarget.value = '';
                }}
              />
              <div className="flex items-stretch gap-2.5">
                <button
                  type="button"
                  onClick={() => photoInput.current?.click()}
                  disabled={atMediaLimit}
                  aria-describedby="mock-media-hint"
                  className="border-pana-indigo/20 bg-pana-indigo/4 hover:border-pana-indigo/45 hover:bg-pana-indigo/8 focus-visible:ring-pana-indigo flex min-w-0 flex-1 items-center gap-3 rounded-2xl border-2 border-dashed p-3 text-left transition-colors focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-45 sm:p-4"
                >
                  <span className="bg-pana-orange/15 text-pana-ink grid h-10 w-10 flex-none place-items-center rounded-xl">
                    <ImagePlus className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="text-pana-ink block text-sm leading-snug font-extrabold">
                      {isDragging
                        ? 'Drop your files here'
                        : 'Add photos or video'}
                    </span>
                    <span className="text-pana-ink/50 mt-0.5 hidden text-xs font-semibold sm:block">
                      Choose from your device, or drop files here
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  aria-label="Add audio"
                  onClick={() => audioInput.current?.click()}
                  disabled={atMediaLimit}
                  className="border-pana-ink/10 bg-pana-cream/70 text-pana-ink/70 hover:border-pana-indigo/40 hover:text-pana-indigo focus-visible:ring-pana-indigo flex w-17 flex-none flex-col items-center justify-center gap-1 rounded-2xl border px-3 py-3 text-xs font-extrabold focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-45 sm:w-20"
                >
                  <Volume2 className="h-5 w-5" aria-hidden="true" />
                  Audio
                </button>
              </div>
              <p
                id="mock-media-hint"
                className="text-pana-ink/45 px-1 text-[11px] font-semibold"
              >
                {attachments.length
                  ? `${attachments.length} of ${MAX_ATTACHMENTS} attachments`
                  : `Up to ${MAX_ATTACHMENTS} attachments`}
                <span className="hidden sm:inline">
                  {' '}
                  &middot; You can paste images, too
                </span>
              </p>
            </div>

            {mediaError && (
              <p
                role="alert"
                className="text-destructive flex items-start gap-2 text-xs font-semibold"
              >
                <AlertTriangle
                  className="mt-0.5 h-3.5 w-3.5 flex-none"
                  aria-hidden="true"
                />
                <span className="min-w-0 break-words">{mediaError}</span>
              </p>
            )}

            <div className="border-pana-ink/8 flex items-center gap-2 border-t pt-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="text-pana-ink/55 hover:bg-pana-ink/5 hover:text-pana-indigo focus-visible:ring-pana-indigo inline-flex h-10 items-center gap-1.5 rounded-xl px-2 text-xs font-extrabold focus-visible:ring-2"
                    aria-label="More post options"
                  >
                    <Ellipsis className="h-3.5 w-3.5" aria-hidden="true" />
                    More
                    {showWarning && (
                      <span className="bg-pana-indigo h-1.5 w-1.5 rounded-full">
                        <span className="sr-only">Content warning enabled</span>
                      </span>
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  sideOffset={8}
                  collisionPadding={12}
                  className="destination-menu"
                >
                  <DropdownMenuLabel className="destination-menu-heading">
                    Optional
                  </DropdownMenuLabel>
                  <DropdownMenuCheckboxItem
                    checked={showWarning}
                    onCheckedChange={(checked) => {
                      setShowWarning(checked === true);
                      if (checked !== true) setWarning('');
                      setSubmitted(false);
                    }}
                    className="rounded-xl py-2.5 text-[13px] font-bold"
                  >
                    <AlertTriangle
                      className="mr-2 h-3.5 w-3.5"
                      aria-hidden="true"
                    />
                    Content warning
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={preview}
                    onCheckedChange={(checked) => setPreview(checked === true)}
                    className="rounded-xl py-2.5 text-[13px] font-bold"
                  >
                    <Eye className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                    Preview formatting
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuSeparator className="destination-menu-separator" />
                  <p className="destination-menu-empty">
                    Your saved account license applies automatically.
                  </p>
                </DropdownMenuContent>
              </DropdownMenu>
              <span
                id="mock-composer-count"
                className={`ml-auto text-[11px] font-bold ${draft.length > MAX_LENGTH ? 'text-destructive' : 'text-pana-ink/40'}`}
              >
                {draft.length}/{MAX_LENGTH}
              </span>
              <Button
                type="submit"
                disabled={!canPost}
                className="bg-pana-indigo text-pana-cream hover:bg-pana-indigo/90 ml-2 h-11 rounded-full px-7 font-extrabold"
              >
                Post
              </Button>
            </div>
          </form>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-1">
            <p className="text-pana-ink/55 inline-flex items-start gap-1.5 text-xs font-semibold">
              {audience === 'panas' ? (
                <Lock
                  className="mt-0.5 h-3.5 w-3.5 flex-none"
                  aria-hidden="true"
                />
              ) : (
                <Globe
                  className="mt-0.5 h-3.5 w-3.5 flex-none"
                  aria-hidden="true"
                />
              )}
              {selected.reach}
            </p>
            <button
              type="button"
              disabled={
                atMediaLimit ||
                attachments.some(
                  (attachment) => attachment.id === SAMPLE_PHOTO.id
                )
              }
              onClick={() => {
                setAttachments([...attachments, SAMPLE_PHOTO]);
                setPreview(false);
                setMediaError(null);
                setSubmitted(false);
              }}
              className="text-pana-indigo text-xs font-extrabold underline decoration-current/30 underline-offset-4 disabled:opacity-40"
            >
              Try a sample photo
            </button>
          </div>
        </section>

        <p role="status" className="text-pana-indigo mt-3 text-sm font-bold">
          {submitted ? 'Mock only - nothing was published.' : ''}
        </p>

        <div className="text-pana-ink/65 mt-7 grid gap-5 text-[13px] sm:grid-cols-3">
          <div>
            <p className="text-pana-ink mb-1 font-extrabold">
              Media, front and center
            </p>
            <p>
              Pick photos or video in one tap. Add audio, drop files, or paste
              an image.
            </p>
          </div>
          <div>
            <p className="text-pana-ink mb-1 font-extrabold">
              Your audience, up front
            </p>
            <p>
              Everyone or mutual Panas, right beside your name. No group
              destinations to sort through.
            </p>
          </div>
          <div>
            <p className="text-pana-ink mb-1 font-extrabold">
              One clear finish
            </p>
            <p>
              Post is the main action. Content warnings and formatting preview
              live under More.
            </p>
          </div>
        </div>

        <p className="border-pana-ink/10 text-pana-ink/45 mt-10 border-t pt-5 text-xs font-semibold">
          Design mock at <code>/mock/composer</code>. Selected files are
          previewed only in this browser, never uploaded. Post does not publish.
          Audience behavior is proposed, not a change to live privacy settings.
        </p>
      </div>
    </main>
  );
}
