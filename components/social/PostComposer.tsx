'use client';

import { useState, useRef, useEffect } from 'react';
// Phase 3 consent infrastructure — notice for social timeline deletion policy
import { useModuleConsent } from '@/hooks/use-module-consent';
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
} from '@/lib/query/social';
import MultiMediaUpload, {
  type UploadedMedia,
} from '@/components/MultiMediaUpload';
import type { PostVisibility } from '@/lib/utils/getVisibility';
import {
  DestinationPicker,
  DEFAULT_DESTINATION,
  DEFAULT_VISIBILITY_OPTION,
  GROUP_POST_VISIBILITY,
  VISIBILITY_OPTIONS,
  findGroup,
  reachLine,
  type Destination,
} from '@/components/social/destination-picker';
import { AlertTriangle, Send, Eye } from 'lucide-react';
import {
  CCLicenseBadge,
  CCLicensePickerModal,
  type CCLicenseValue,
} from '@/components/legal/CCLicensePicker';
import { useDefaultCcLicense } from '@/lib/query/profile';

interface PostComposerProps {
  inReplyTo?: string;
  replyVisibility?: PostVisibility;
  onSuccess?: () => void;
  placeholder?: string;
  /** Viewer's avatar and display name. Supplied by the feed, omitted by the
   *  reply box: a reply already sits under the avatar of the thread it is in,
   *  so repeating the viewer's would add a row to the densest part of the
   *  page. Absent both, the prompt simply starts at the left edge. */
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
  placeholder = "What's on your mind?",
  avatarUrl,
  avatarName,
  lockedGroupHandle,
}: PostComposerProps) {
  const [content, setContent] = useState('');
  const [contentWarning, setContentWarning] = useState('');
  const [showCW, setShowCW] = useState(false);
  const [destination, setDestination] =
    useState<Destination>(DEFAULT_DESTINATION);
  const [destinationOpen, setDestinationOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'write' | 'preview'>('write');
  const [attachments, setAttachments] = useState<UploadedMedia[]>([]);
  // Seed the license from the user's saved default, but stop tracking the
  // default once they explicitly pick one for this post (override).
  const defaultCcLicense = useDefaultCcLicense();
  const [ccLicense, setCcLicense] = useState<CCLicenseValue>(defaultCcLicense);
  const licenseTouched = useRef(false);
  useEffect(() => {
    if (!licenseTouched.current) setCcLicense(defaultCcLicense);
  }, [defaultCcLicense]);
  const handleLicenseChange = (license: CCLicenseValue) => {
    licenseTouched.current = true;
    setCcLicense(license);
  };
  const [showLicensePicker, setShowLicensePicker] = useState(false);
  const createPost = useCreatePost();
  const createGroupPost = useCreateGroupPost();
  const { data: myGroups, isLoading: groupsLoading } = useMyGroups();
  const groups = myGroups?.groups ?? [];

  const charCount = content.length;
  const isOverLimit = charCount > MAX_LENGTH;
  const isEmpty = content.trim().length === 0;

  /**
   * Replies never choose a destination.
   *
   * A reply to a group post belongs to that group, and `createStatus` now
   * inherits the parent's group server-side rather than taking one from the
   * client -- so the reply box deliberately sends no group and no picker is
   * offered. Letting a reply pick would mean letting it answer a private
   * thread somewhere else.
   */
  const isReply = !!inReplyTo;

  /**
   * The group handle this post is bound for, if any.
   *
   * A pinned group wins outright. Otherwise it comes from the selected
   * destination, which requires the group list to have loaded -- the picker
   * only ever offers groups from that list, so an unresolvable id means the
   * membership changed underneath the open menu.
   */
  const targetGroupHandle = isReply
    ? undefined
    : (lockedGroupHandle ??
      (destination.kind === 'group'
        ? findGroup(groups, destination.id)?.handle
        : undefined));

  /**
   * The pinned group's full record, for wording only.
   *
   * May be absent while `useMyGroups` is in flight even though the handle is
   * known, which is why it is never consulted to decide where the post goes.
   */
  const pinnedGroup = lockedGroupHandle
    ? groups.find((g) => g.handle === lockedGroupHandle)
    : undefined;

  /**
   * A group was chosen but cannot be resolved to a handle.
   *
   * Submission is blocked rather than falling back to a personal post. The
   * fallback is the dangerous direction: it would take something written for
   * one group's members and publish it to the author's whole timeline, which
   * is a disclosure, not a degraded experience.
   */
  const unresolvedGroup =
    !isReply && destination.kind === 'group' && !targetGroupHandle;

  const isGroupPost = !!targetGroupHandle;

  // For replies, use parent visibility. Inside a group the group's own
  // visibility governs who may read the post, so the status carries the
  // non-claiming value rather than whatever the audience list last had.
  const effectiveVisibility: PostVisibility = isReply
    ? (replyVisibility ?? 'unlisted')
    : isGroupPost
      ? GROUP_POST_VISIBILITY
      : destination.kind === 'audience'
        ? destination.id
        : 'unlisted';

  const currentOption =
    VISIBILITY_OPTIONS.find((o) => o.value === effectiveVisibility) ??
    DEFAULT_VISIBILITY_OPTION;

  const isPending = createPost.isPending || createGroupPost.isPending;

  // Phase 3 consent — social timeline deletion notice (soft notice, not a gate)
  // Social posts are always fully deletable regardless of age. This notice
  // informs the user of that policy on first use — it does NOT block posting.
  const { needsConsent: showSocialNotice, recordConsent: onSocialNotice } =
    useModuleConsent({ document: 'terms', module: 'social' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isEmpty || isOverLimit || isPending || unresolvedGroup) return;

    const trimmedCw =
      showCW && contentWarning.trim() ? contentWarning.trim() : undefined;
    const media = attachments.length > 0 ? attachments : undefined;

    try {
      if (targetGroupHandle) {
        // A different endpoint, not a groupId on the generic one. The group
        // route re-checks membership and owns the addressing of a private
        // group's posts; the generic status endpoint cannot do either from an
        // id handed to it by a client. See lib/query/social.ts.
        await createGroupPost.mutateAsync({
          handle: targetGroupHandle,
          content: content.trim(),
          contentWarning: trimmedCw,
          visibility: GROUP_POST_VISIBILITY,
          attachments: media,
          ccLicense,
        });
      } else {
        const isPublicPost =
          effectiveVisibility === 'public' ||
          effectiveVisibility === 'unlisted';
        await createPost.mutateAsync({
          content: content.trim(),
          contentWarning: trimmedCw,
          inReplyTo,
          visibility: effectiveVisibility,
          attachments: media,
          ...(isPublicPost ? { ccLicense } : {}),
        });
      }
      setContent('');
      setContentWarning('');
      setShowCW(false);
      setAttachments([]);
      onSuccess?.();
    } catch (error) {
      console.error('Failed to create post:', error);
    }
  };

  const isDisabled = isEmpty || isOverLimit || isPending || unresolvedGroup;

  /**
   * The sentence under the composer.
   *
   * Computed here rather than inline because the pinned-but-not-yet-loaded
   * case has to be caught explicitly: falling through to the default audience
   * line would tell a member writing in a private group that local Panas can
   * see it, which is both false and the wrong direction to be wrong in.
   */
  const reachText = unresolvedGroup
    ? 'That group is no longer available to post to. Pick another destination.'
    : lockedGroupHandle
      ? pinnedGroup
        ? reachLine({ kind: 'group', id: pinnedGroup.id }, groups)
        : 'Posting to this group.'
      : reachLine(destination, groups);
  const showAvatar = !isReply && (!!avatarUrl || !!avatarName);
  // Same derivation as feed-rail.tsx, so the composer and the sidebar fall
  // back to the same two letters for a member with no picture.
  const initials = avatarName
    ? avatarName
        .split(' ')
        .map((part) => part[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '';

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {showCW && (
        <div className="space-y-1">
          <Label htmlFor="cw" className="text-muted-foreground text-sm">
            Content Warning
          </Label>
          <Input
            id="cw"
            value={contentWarning}
            onChange={(e) => setContentWarning(e.target.value)}
            placeholder="Add a content warning..."
            maxLength={100}
            className="composer-surface"
          />
        </div>
      )}

      {/* Avatar beside the prompt rather than above it: it costs no vertical
          space there, and it answers "who am I posting as" on an account that
          can switch between a person and a business. */}
      <div className="flex items-start gap-3">
        {showAvatar && (
          <Avatar className="border-pana-ink/10 h-10 w-10 flex-none border-2">
            <AvatarImage src={avatarUrl || undefined} alt="" />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        )}
        <div className="min-w-0 flex-1">
          {activeTab === 'write' ? (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={placeholder}
              rows={isReply ? 2 : 3}
              aria-label={inReplyTo ? 'Write a reply' : 'Write a post'}
              className="composer-prompt"
            />
          ) : (
            <div className="composer-surface min-h-[76px]">
              {content.trim() ? (
                <div className="prose prose-sm dark:prose-invert max-w-none break-words">
                  <ReactMarkdown>{content}</ReactMarkdown>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  Nothing to preview yet...
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* One row of controls instead of three. Write/Preview used to be a
          segmented control on its own line above the prompt, and Media a
          button on its own line below it; as chips they share this row with
          everything else and read as one vocabulary. */}
      <div className="composer-actions" data-indent={showAvatar || undefined}>
        <MultiMediaUpload
          value={attachments}
          onChange={setAttachments}
          imageUploadEndpoint="/api/social/media"
          presignEndpoint="/api/social/media/upload"
          pathPrefix="social/media"
          wrapperClassName="composer-media"
          triggerClassName="composer-chip"
        />
        <button
          type="button"
          onClick={() => setShowCW(!showCW)}
          aria-pressed={showCW}
          className="composer-chip"
        >
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
          CW
        </button>
        <button
          type="button"
          onClick={() =>
            setActiveTab(activeTab === 'preview' ? 'write' : 'preview')
          }
          aria-pressed={activeTab === 'preview'}
          className="composer-chip"
        >
          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
          Preview
        </button>
        {(effectiveVisibility === 'public' ||
          effectiveVisibility === 'unlisted') && (
          <CCLicenseBadge
            value={ccLicense}
            onClick={() => setShowLicensePicker(true)}
            className="composer-chip"
          />
        )}

        <div className="composer-actions-end">
          {isPending ? (
            <Button
              type="button"
              disabled
              size="sm"
              className="bg-pana-indigo text-pana-cream rounded-full px-5 font-extrabold"
            >
              Posting...
            </Button>
          ) : isReply ? (
            <Button
              type="submit"
              disabled={isDisabled}
              size="sm"
              className="bg-pana-indigo text-pana-cream hover:bg-pana-indigo/90 rounded-full px-5 font-extrabold"
            >
              <Send className="mr-1 h-4 w-4" />
              {currentOption.replyText}
            </Button>
          ) : (
            <>
              {/* No picker when the group page pinned the destination: the
                  page already answers "where does this go", and offering six
                  other places on a group's own tab invites posting somewhere
                  you did not mean to. */}
              {!lockedGroupHandle && (
                <DestinationPicker
                  destination={destination}
                  onChange={setDestination}
                  groups={groups}
                  isLoading={groupsLoading}
                  open={destinationOpen}
                  onOpenChange={setDestinationOpen}
                />
              )}
              <Button
                type="submit"
                disabled={isDisabled}
                size="sm"
                className="bg-pana-indigo text-pana-cream hover:bg-pana-indigo/90 rounded-full px-5 font-extrabold"
              >
                Post
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Who actually ends up seeing this, in words. The chip names the
          destination; this names the consequence, which is the part that is
          not obvious from "Local Panas" or a group's name. Omitted for
          replies, which inherit their audience and offer no choice to
          explain. */}
      {!isReply && (
        <p className="composer-reach" data-indent={showAvatar || undefined}>
          {reachText}
        </p>
      )}

      {/* Footnote row. The character count used to sit inline with the Post
          button at body size, which gave a number nobody reads until they are
          near the limit the same weight as the action. */}
      <p className="composer-foot" data-indent={showAvatar || undefined}>
        <span>
          **<strong>bold</strong>**, <em>_italic_</em>, [link
          text](example.com), # headers, - lists
        </span>
        <span
          className={
            isOverLimit
              ? 'text-destructive font-bold'
              : charCount > MAX_LENGTH * 0.9
                ? 'font-bold text-yellow-600'
                : undefined
          }
        >
          {charCount}/{MAX_LENGTH}
        </span>
      </p>

      {/* CC License Picker Modal */}
      <CCLicensePickerModal
        open={showLicensePicker}
        onOpenChange={setShowLicensePicker}
        value={ccLicense}
        onChange={handleLicenseChange}
      />

      {/* Phase 3: social timeline deletion notice (type="notice") */}
      <ConsentModal
        open={showSocialNotice}
        type="notice"
        module="social"
        title="Social Timeline"
        description="Your social posts (including replies and attachments) are always fully deletable, including on account deletion. An ActivityPub Delete activity is sent to federation peers (best-effort)."
        policyUrl="/legal/terms/modules/social"
        onConsent={onSocialNotice}
      />
    </form>
  );
}
