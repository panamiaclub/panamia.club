'use client';

import { useId, useRef, useState } from 'react';
import axios from 'axios';
import { useModuleConsent } from '@/hooks/use-module-consent';
import { useToast } from '@/hooks/use-toast';
import { ConsentModal } from '@/components/legal/ConsentModal';
import ReactMarkdown from 'react-markdown';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  useCreatePost,
  useCreateGroupPost,
  useMyGroups,
  useMyActor,
} from '@/lib/query/social';
import MultiMediaUpload, {
  MediaAttachments,
  type MediaUploadHandle,
  type UploadedMedia,
} from '@/components/MultiMediaUpload';
import type { PostVisibility } from '@/lib/utils/getVisibility';
import {
  DestinationPicker,
  DEFAULT_DESTINATION,
  GROUP_POST_VISIBILITY,
  reachLine,
  type Destination,
} from '@/components/social/destination-picker';
import {
  AlertTriangle,
  ArrowLeft,
  Ellipsis,
  Eye,
  Globe,
  ImagePlus,
  Lock,
  Users,
  Volume2,
  X,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface PostComposerProps {
  inReplyTo?: string;
  replyVisibility?: PostVisibility;
  onSuccess?: () => void;
  placeholder?: string;
  /** Optional identity already loaded by the feed. Replies omit the header. */
  avatarUrl?: string | null;
  avatarName?: string;
  /**
   * Pin this composer to one group, by handle.
   *
   * Set by the group page, where the destination is the page itself and a
   * picker offering six other places would be a trap. Identified by handle
   * rather than id because the handle is what the write endpoint is keyed on,
   * so submission does not depend on the group list having loaded -- only the
   * wording of the reach line does.
   */
  lockedGroupHandle?: string;
}

const MAX_LENGTH = 500;
const MAX_ATTACHMENTS = 4;

export function PostComposer({
  inReplyTo,
  replyVisibility,
  onSuccess,
  placeholder,
  avatarUrl,
  avatarName,
  lockedGroupHandle,
}: PostComposerProps) {
  const id = useId();
  const mediaInput = useRef<MediaUploadHandle>(null);
  const [content, setContent] = useState('');
  const [contentWarning, setContentWarning] = useState('');
  const [showCW, setShowCW] = useState(false);
  const [destination, setDestination] =
    useState<Destination>(DEFAULT_DESTINATION);
  const [destinationOpen, setDestinationOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const [attachments, setAttachments] = useState<UploadedMedia[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const createPost = useCreatePost();
  const createGroupPost = useCreateGroupPost();
  const { data: me } = useMyActor();
  const { data: myGroups } = useMyGroups({ enabled: !!lockedGroupHandle });
  const { toast } = useToast();
  const groups = myGroups?.groups ?? [];

  const charCount = content.length;
  const isOverLimit = charCount > MAX_LENGTH;
  const isEmpty = !content.trim() && !attachments.length;
  const isReply = !!inReplyTo;
  const targetGroupHandle = isReply ? undefined : lockedGroupHandle;
  const pinnedGroup = lockedGroupHandle
    ? groups.find((g) => g.handle === lockedGroupHandle)
    : undefined;
  const audience =
    destination.kind === 'audience' &&
    (destination.id === 'public' || destination.id === 'private')
      ? destination.id
      : undefined;
  const unresolvedAudience = !isReply && !targetGroupHandle && !audience;
  // Replies inherit their parent; the server also retains a Panas thread's
  // original recipients. A group page never offers a personal audience.
  const effectiveVisibility: PostVisibility = isReply
    ? (replyVisibility ?? 'unlisted')
    : targetGroupHandle
      ? GROUP_POST_VISIBILITY
      : (audience ?? 'private');
  const isPending = createPost.isPending || createGroupPost.isPending;
  const hasDraft = Boolean(
    content || attachments.length || showCW || preview || submitError
  );
  const isExpanded = isReply || expanded || hasDraft || uploading;
  const mediaDisabled =
    isPending || uploading || attachments.length >= MAX_ATTACHMENTS;
  const isDisabled =
    isEmpty || isOverLimit || isPending || uploading || unresolvedAudience;
  const displayName =
    avatarName || me?.actor?.name || me?.actor?.username || 'You';
  const displayAvatar = avatarUrl ?? me?.actor?.iconUrl;
  const firstName = displayName.split(' ')[0];
  const prompt = placeholder ?? `What's on your mind, ${firstName}?`;
  const initials = displayName
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const { needsConsent: showSocialNotice, recordConsent: onSocialNotice } =
    useModuleConsent({ document: 'terms', module: 'social' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDisabled || mediaInput.current?.isUploading()) return;
    setSubmitError(null);

    const trimmedCw =
      showCW && contentWarning.trim() ? contentWarning.trim() : undefined;
    const media = attachments.length > 0 ? attachments : undefined;

    try {
      if (targetGroupHandle) {
        await createGroupPost.mutateAsync({
          handle: targetGroupHandle,
          content: content.trim(),
          contentWarning: trimmedCw,
          visibility: GROUP_POST_VISIBILITY,
          attachments: media,
        });
      } else {
        await createPost.mutateAsync({
          content: content.trim(),
          contentWarning: trimmedCw,
          inReplyTo,
          visibility: effectiveVisibility,
          attachments: media,
          ...(!isReply && audience === 'private'
            ? { audience: 'panas' as const }
            : {}),
        });
      }
    } catch (error) {
      console.error('Failed to create post:', error);
      setSubmitError(
        axios.isAxiosError<{ error?: string }>(error) &&
          error.response?.data?.error
          ? error.response.data.error
          : error instanceof Error
            ? error.message
            : 'Could not post. Your draft is still here; please try again.'
      );
      return;
    }
    setContent('');
    setContentWarning('');
    setShowCW(false);
    setAttachments([]);
    setPreview(false);
    setExpanded(false);
    toast({
      title: isReply
        ? 'Reply posted'
        : targetGroupHandle
          ? 'Posted to the group'
          : audience === 'private'
            ? 'Posted to Panas'
            : 'Posted to Everyone',
    });
    onSuccess?.();
  };

  const reachText = unresolvedAudience
    ? 'Choose who can see this before posting.'
    : lockedGroupHandle
      ? pinnedGroup
        ? reachLine({ kind: 'group', id: pinnedGroup.id }, groups)
        : 'Posting to this group.'
      : reachLine(destination, groups);
  const ReachIcon = targetGroupHandle
    ? pinnedGroup?.visibility === 'private'
      ? Lock
      : Users
    : audience === 'private'
      ? Lock
      : Globe;
  const previewBody = (
    <div className="min-w-0 space-y-3">
      {content.trim() ? (
        <div className="prose prose-sm max-w-none break-words">
          <ReactMarkdown>{content.trim()}</ReactMarkdown>
        </div>
      ) : !attachments.length ? (
        <p className="text-pana-ink/50 text-sm">Nothing to preview yet.</p>
      ) : null}
      <MediaAttachments value={attachments} />
    </div>
  );

  const warningField = showCW && !preview && (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={`${id}-warning`} className="text-xs font-extrabold">
          Content warning
        </Label>
        <button
          type="button"
          disabled={isPending}
          aria-label="Remove content warning"
          className="text-pana-ink/50 hover:text-pana-indigo rounded-full p-1"
          onClick={() => {
            setShowCW(false);
            setContentWarning('');
          }}
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      <Input
        id={`${id}-warning`}
        value={contentWarning}
        onChange={(event) => setContentWarning(event.target.value)}
        disabled={isPending}
        placeholder="Give people a heads-up before they open your post"
        maxLength={100}
        className="composer-surface"
      />
    </div>
  );
  const writingField = preview ? (
    <div aria-label="Post preview" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-pana-ink/45 text-xs font-bold">
          Formatting preview
        </span>
        <button
          type="button"
          disabled={isPending}
          onClick={() => setPreview(false)}
          className="text-pana-indigo inline-flex items-center gap-1 text-xs font-extrabold"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden="true" />
          Back to writing
        </button>
      </div>
      {showCW && contentWarning.trim() ? (
        <details className="composer-surface">
          <summary className="text-pana-ink cursor-pointer text-sm font-bold">
            {contentWarning.trim()}
          </summary>
          <div className="mt-3">{previewBody}</div>
        </details>
      ) : (
        previewBody
      )}
    </div>
  ) : (
    <textarea
      value={content}
      onFocus={() => setExpanded(true)}
      onChange={(event) => setContent(event.target.value)}
      disabled={isPending}
      placeholder={prompt}
      rows={isReply ? 2 : isExpanded ? 3 : 1}
      aria-label={isReply ? 'Write a reply' : 'Write a post'}
      aria-describedby={`${id}-count${isReply ? '' : ` ${id}-reach`}`}
      aria-invalid={isOverLimit}
      className={
        isReply
          ? 'composer-prompt block'
          : `text-pana-ink placeholder:text-pana-ink/60 block w-full min-w-0 resize-none border-0 bg-transparent py-2 text-base leading-6 font-semibold outline-none ${isExpanded ? 'min-h-24' : 'h-11'}`
      }
    />
  );
  const optionsMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={isPending}
          aria-label="More post options"
          className="text-pana-ink/55 hover:bg-pana-ink/5 hover:text-pana-indigo focus-visible:ring-pana-indigo inline-flex h-10 items-center gap-1.5 rounded-xl px-2 text-xs font-extrabold focus-visible:ring-2"
        >
          <Ellipsis className="h-3.5 w-3.5" aria-hidden="true" />
          More
          {showCW && (
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
          checked={showCW}
          onCheckedChange={(checked) => {
            setShowCW(checked === true);
            if (checked !== true) setContentWarning('');
          }}
          className="rounded-xl py-2.5 text-[13px] font-bold"
        >
          <AlertTriangle className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
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
  );
  const characterCount = (
    <span
      id={`${id}-count`}
      className={`${isExpanded ? 'ml-auto text-[11px] font-bold' : 'sr-only'} ${isOverLimit ? 'text-destructive' : 'text-pana-ink/65'}`}
    >
      {charCount}/{MAX_LENGTH}
    </span>
  );
  const postButton = (
    <Button
      type="submit"
      disabled={isDisabled}
      className={`bg-pana-indigo text-pana-cream hover:bg-pana-indigo/90 justify-self-end rounded-full font-extrabold ${isReply ? 'ml-2 h-10 px-5' : 'h-11 px-5 text-xs'}`}
    >
      {isPending
        ? 'Posting...'
        : uploading
          ? 'Uploading...'
          : isReply
            ? 'Reply'
            : 'Post'}
    </Button>
  );

  return (
    <div className="min-w-0">
      <form
        onSubmit={handleSubmit}
        aria-label={isReply ? 'Reply composer' : 'Post composer'}
        data-expanded={isExpanded}
        className={
          isReply
            ? 'min-w-0 space-y-3'
            : `border-pana-ink/12 focus-within:border-pana-indigo/40 shadow-pana-burnt/5 min-w-0 overflow-hidden rounded-3xl border bg-white shadow-sm transition-colors ${dragging ? 'outline-pana-indigo outline-2 outline-offset-4' : ''}`
        }
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes('Files')) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
          setDragging(true);
        }}
        onDragLeave={(event) => {
          if (
            !(event.relatedTarget instanceof Node) ||
            !event.currentTarget.contains(event.relatedTarget)
          ) {
            setDragging(false);
          }
        }}
        onDrop={(event) => {
          if (!event.dataTransfer.types.includes('Files')) return;
          event.preventDefault();
          setDragging(false);
          setExpanded(true);
          void mediaInput.current?.addFiles(
            Array.from(event.dataTransfer.files)
          );
        }}
        onPaste={(event) => {
          if (!event.clipboardData.files.length) return;
          event.preventDefault();
          setExpanded(true);
          void mediaInput.current?.addFiles(
            Array.from(event.clipboardData.files)
          );
        }}
      >
        <div className={isReply ? 'space-y-3' : 'flex flex-col gap-3 p-4 pb-2'}>
          <div className={isReply ? 'contents' : 'flex items-start gap-3'}>
            {!isReply && (
              <Avatar className="border-pana-flame/20 mt-0.5 h-10 w-10 flex-none border-2">
                <AvatarImage src={displayAvatar || undefined} alt="" />
                <AvatarFallback>{initials}</AvatarFallback>
                <span className="sr-only">{displayName}</span>
              </Avatar>
            )}
            <div className={isReply ? 'contents' : 'min-w-0 flex-1'}>
              {writingField}
            </div>
          </div>
          {warningField}
          <MultiMediaUpload
            ref={mediaInput}
            value={attachments}
            onChange={(next) => {
              setAttachments(next);
              if (!next.length && !content && !showCW && !preview) {
                setExpanded(false);
              }
            }}
            maxItems={MAX_ATTACHMENTS}
            imageUploadEndpoint="/api/social/media"
            presignEndpoint="/api/social/media/upload"
            pathPrefix="social/media"
            wrapperClassName="min-w-0 space-y-3"
            presentation="compact"
            showControls={isReply}
            showAttachments={!preview}
            disabled={isPending}
            onUploadingChange={setUploading}
          />
          {dragging && !isReply && (
            <div
              role="status"
              className="border-pana-indigo/40 bg-pana-indigo/5 text-pana-indigo rounded-2xl border-2 border-dashed p-5 text-center text-sm font-extrabold"
            >
              Drop your photos, video or audio here
            </div>
          )}
          {submitError && (
            <p
              role="alert"
              className="text-destructive text-sm [overflow-wrap:anywhere]"
            >
              {submitError}
            </p>
          )}
        </div>
        {isReply ? (
          <div className="border-pana-ink/8 flex flex-wrap items-center gap-2 border-t pt-3">
            {optionsMenu}
            {characterCount}
            {postButton}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5 px-3 pb-3 sm:flex sm:flex-wrap">
              <div className="col-span-2 flex flex-wrap items-center gap-1.5 sm:contents">
                <button
                  type="button"
                  aria-label="Add photos or video"
                  disabled={mediaDisabled}
                  onClick={() => {
                    setExpanded(true);
                    mediaInput.current?.openPicker('media');
                  }}
                  className="text-pana-burnt-deep hover:bg-pana-flame/10 focus-visible:ring-pana-indigo inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2.5 text-xs font-extrabold focus-visible:ring-2 disabled:opacity-45"
                >
                  <ImagePlus className="h-4 w-4" aria-hidden="true" />
                  Photo / video
                </button>
                <button
                  type="button"
                  aria-label="Add audio"
                  disabled={mediaDisabled}
                  onClick={() => {
                    setExpanded(true);
                    mediaInput.current?.openPicker('audio');
                  }}
                  className="text-pana-indigo hover:bg-pana-indigo/6 focus-visible:ring-pana-indigo inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2.5 text-xs font-extrabold focus-visible:ring-2 disabled:opacity-45"
                >
                  <Volume2 className="h-4 w-4" aria-hidden="true" />
                  Audio
                </button>
              </div>
              <div className="min-w-0 justify-self-start sm:ml-auto">
                {targetGroupHandle ? (
                  <span className="text-pana-indigo inline-flex min-h-11 min-w-0 items-center gap-1.5 px-2 text-xs font-extrabold">
                    <ReachIcon
                      className="h-3.5 w-3.5 flex-none"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 [overflow-wrap:anywhere]">
                      {pinnedGroup?.name || `@${targetGroupHandle}`}
                    </span>
                  </span>
                ) : (
                  <DestinationPicker
                    destination={destination}
                    onChange={(next) => {
                      setDestination(next);
                      setExpanded(true);
                    }}
                    groups={groups}
                    open={destinationOpen}
                    onOpenChange={setDestinationOpen}
                    disabled={isPending}
                    className="bg-pana-indigo/7 text-pana-indigo hover:bg-pana-indigo/12 focus-visible:ring-pana-indigo inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs font-extrabold focus-visible:ring-2 disabled:opacity-45"
                  />
                )}
              </div>
              {postButton}
            </div>
            {isExpanded ? (
              <div className="border-pana-ink/8 bg-pana-cream/35 border-t px-4 py-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {optionsMenu}
                  {characterCount}
                  {!hasDraft && !uploading && !isPending && (
                    <button
                      type="button"
                      onClick={() => setExpanded(false)}
                      className="text-pana-ink/65 min-h-11 px-1 text-xs font-extrabold"
                    >
                      Done
                    </button>
                  )}
                </div>
                <p
                  id={`${id}-reach`}
                  className="text-pana-ink/65 pb-1 text-xs leading-relaxed"
                >
                  {reachText}
                  <span className="mt-0.5 block">
                    {attachments.length
                      ? `${attachments.length} of ${MAX_ATTACHMENTS} attachments.`
                      : `Up to ${MAX_ATTACHMENTS} attachments. Drag files or paste an image, too.`}
                  </span>
                </p>
              </div>
            ) : (
              <>
                {characterCount}
                <span
                  id={`${id}-reach`}
                  className={
                    unresolvedAudience
                      ? 'text-destructive block px-4 pb-3 text-xs'
                      : 'sr-only'
                  }
                >
                  {reachText}
                </span>
              </>
            )}
          </>
        )}
      </form>
      <ConsentModal
        open={showSocialNotice}
        type="notice"
        module="social"
        title="Social Timeline"
        description="Your social posts (including replies and attachments) are always fully deletable, including on account deletion. An ActivityPub Delete activity is sent to federation peers (best-effort)."
        policyUrl="/legal/terms/modules/social"
        onConsent={onSocialNotice}
      />
    </div>
  );
}
