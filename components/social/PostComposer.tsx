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
  Lock,
  Users,
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

  return (
    <div className="min-w-0 space-y-3">
      <form
        onSubmit={handleSubmit}
        aria-label={isReply ? 'Reply composer' : 'Post composer'}
        className={
          isReply
            ? 'min-w-0 space-y-3'
            : `border-pana-ink/10 focus-within:border-pana-indigo/45 min-w-0 space-y-5 rounded-3xl border-2 bg-white p-4 shadow-sm transition-colors sm:p-6 ${dragging ? 'outline-pana-indigo outline-2 outline-offset-4' : ''}`
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
          void mediaInput.current?.addFiles(
            Array.from(event.dataTransfer.files)
          );
        }}
        onPaste={(event) => {
          if (!event.clipboardData.files.length) return;
          event.preventDefault();
          void mediaInput.current?.addFiles(
            Array.from(event.clipboardData.files)
          );
        }}
      >
        {!isReply && (
          <div className="flex items-center gap-3">
            <Avatar className="border-pana-ink/10 h-11 w-11 flex-none border-2">
              <AvatarImage src={displayAvatar || undefined} alt="" />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="text-pana-ink min-w-0 text-sm font-extrabold [overflow-wrap:anywhere]">
                {displayName}
              </span>
              {targetGroupHandle ? (
                <span className="text-pana-indigo inline-flex min-w-0 items-center gap-1.5 text-xs font-extrabold">
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
                  onChange={setDestination}
                  groups={groups}
                  open={destinationOpen}
                  onOpenChange={setDestinationOpen}
                  disabled={isPending}
                  className="bg-pana-indigo/7 text-pana-indigo hover:bg-pana-indigo/12 focus-visible:ring-pana-indigo inline-flex min-h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-extrabold focus-visible:ring-2 disabled:opacity-45"
                />
              )}
            </div>
          </div>
        )}

        {showCW && !preview && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label
                htmlFor={`${id}-warning`}
                className="text-xs font-extrabold"
              >
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
        )}

        {preview ? (
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
            onChange={(event) => setContent(event.target.value)}
            disabled={isPending}
            placeholder={prompt}
            rows={isReply ? 2 : 3}
            aria-label={isReply ? 'Write a reply' : 'Write a post'}
            aria-describedby={`${id}-count`}
            aria-invalid={isOverLimit}
            className={
              isReply
                ? 'composer-prompt block'
                : 'feed-composer-prompt block min-h-24'
            }
          />
        )}

        <MultiMediaUpload
          ref={mediaInput}
          value={attachments}
          onChange={setAttachments}
          imageUploadEndpoint="/api/social/media"
          presignEndpoint="/api/social/media/upload"
          pathPrefix="social/media"
          wrapperClassName="min-w-0 space-y-3"
          presentation={isReply ? 'compact' : 'composer'}
          showAttachments={!preview}
          disabled={isPending}
          onUploadingChange={setUploading}
        />

        {submitError && (
          <p
            role="alert"
            className="text-destructive text-sm [overflow-wrap:anywhere]"
          >
            {submitError}
          </p>
        )}
        <div
          className={`border-pana-ink/8 flex items-center gap-2 border-t pt-3 ${isReply ? 'flex-wrap' : ''}`}
        >
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
            id={`${id}-count`}
            className={`ml-auto text-[11px] font-bold ${isOverLimit ? 'text-destructive' : 'text-pana-ink/40'}`}
          >
            {charCount}/{MAX_LENGTH}
          </span>
          <Button
            type="submit"
            disabled={isDisabled}
            className={`bg-pana-indigo text-pana-cream hover:bg-pana-indigo/90 ml-2 rounded-full font-extrabold ${isReply ? 'h-10 px-5' : 'h-11 px-7'}`}
          >
            {isPending
              ? 'Posting...'
              : uploading
                ? 'Uploading...'
                : isReply
                  ? 'Reply'
                  : 'Post'}
          </Button>
        </div>
      </form>

      {!isReply && (
        <p className="text-pana-ink/55 inline-flex items-start gap-1.5 px-1 text-xs font-semibold">
          <ReachIcon
            className="mt-0.5 h-3.5 w-3.5 flex-none"
            aria-hidden="true"
          />
          {reachText}
        </p>
      )}

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
