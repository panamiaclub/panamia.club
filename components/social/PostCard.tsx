'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import dynamic from 'next/dynamic';
import { PostActions } from './PostActions';

const PostComposer = dynamic(
  () => import('./PostComposer').then((m) => ({ default: m.PostComposer })),
  { ssr: false }
);
const PostReplies = dynamic(
  () => import('./PostReplies').then((m) => ({ default: m.PostReplies })),
  {
    ssr: false,
    loading: () => <p role="status">Loading comments...</p>,
  }
);
import { SafeHtml } from '@/components/safe-html';
import { AttachmentGrid } from './AttachmentGrid';
import { CollapsibleContent } from './CollapsibleContent';
import { StoryRing } from './StoryRing';
import { SocialStatusDisplay } from '@/lib/interfaces';
import { useCanReplyToGroup } from '@/lib/query/social';
import { getVisibilityFromRecipients } from '@/lib/utils/getVisibility';
import { formatDistanceToNow } from 'date-fns';
import { AlertTriangle, ChevronDown, ChevronUp, MapPin } from 'lucide-react';
import {
  CCBadge,
  type CCLicenseValue,
} from '@/components/legal/CCLicensePicker';

interface PostCardProps {
  status: SocialStatusDisplay;
  showReplyComposer?: boolean;
  isDetail?: boolean;
  compact?: boolean;
  preview?: boolean;
}

export function PostCard({
  status,
  showReplyComposer = false,
  isDetail = false,
  compact = false,
  preview = false,
}: PostCardProps) {
  const [showCWContent, setShowCWContent] = useState(false);
  const [showReplyBox, setShowReplyBox] = useState(false);
  const canReply = useCanReplyToGroup(status.group);
  const repliesId = useId();
  const repliesOpen = showReplyBox || showReplyComposer;

  const publishedDate = status.published
    ? new Date(status.published)
    : new Date();

  const timeAgo = formatDistanceToNow(publishedDate, { addSuffix: true });

  const actorInitials = status.actor.name
    ? status.actor.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : status.actor.username.slice(0, 2).toUpperCase();

  const hasCW =
    status.contentWarning && status.contentWarning.trim().length > 0;
  const avatar = (
    <Avatar className={preview ? 'mt-0.5 h-7.5 w-7.5' : 'h-10 w-10'}>
      <AvatarImage src={status.actor.iconUrl || undefined} alt="" />
      <AvatarFallback>{actorInitials}</AvatarFallback>
    </Avatar>
  );

  return (
    <Card
      className={
        preview
          ? 'border-0 bg-transparent shadow-none'
          : isDetail || compact
            ? 'border-0 shadow-none'
            : ''
      }
    >
      <CardContent
        className={compact || preview ? 'p-0' : isDetail ? 'px-0 pt-0' : 'pt-4'}
      >
        {/* Header */}
        <div className={`flex items-start ${preview ? 'gap-2.5' : 'gap-3'}`}>
          {preview ? (
            <Link
              href={`/p/${status.actor.username}`}
              className="flex-none"
              aria-label={`${status.actor.name || status.actor.username}'s profile`}
            >
              {avatar}
            </Link>
          ) : (
            <StoryRing
              username={status.actor.username}
              href={`/p/${status.actor.username}`}
              size="sm"
            >
              {avatar}
            </StoryRing>
          )}

          <div
            className={`min-w-0 flex-1 ${preview ? 'rounded-2xl rounded-tl-sm bg-white/85 px-3 py-2' : ''}`}
          >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <Link
                href={`/p/${status.actor.username}`}
                className={`truncate hover:underline ${preview ? 'text-xs font-extrabold' : 'font-semibold'}`}
              >
                {status.actor.name || status.actor.username}
              </Link>
              {!preview && (
                <Link
                  href={`/p/${status.actor.username}`}
                  className="text-muted-foreground truncate text-sm"
                >
                  @{status.actor.username}
                </Link>
              )}
              {!preview && (
                <span className="text-muted-foreground text-sm">&middot;</span>
              )}
              <time
                dateTime={publishedDate.toISOString()}
                className={
                  preview
                    ? 'text-pana-ink/60 text-[10px] font-semibold'
                    : 'text-muted-foreground text-sm'
                }
              >
                {timeAgo}
              </time>
            </div>

            {/* Reply indicator */}
            {!preview && status.inReplyTo && (
              <p className="text-muted-foreground mt-1 text-sm">
                Replying to{' '}
                <Link
                  href={`/p/${status.inReplyTo.actorUsername}`}
                  className="text-primary hover:underline"
                >
                  @{status.inReplyTo.actorUsername}
                </Link>
              </p>
            )}

            {/* Content Warning */}
            {hasCW && (
              <div className="mt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-auto min-h-9 w-full items-start justify-between text-left whitespace-normal"
                  onClick={() => setShowCWContent(!showCWContent)}
                  aria-expanded={showCWContent}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-600" />
                    <span className="text-sm break-words">
                      {status.contentWarning}
                    </span>
                  </span>
                  {showCWContent ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </div>
            )}

            {/* Content — collapse long posts in timeline, show full in detail */}
            {(!hasCW || showCWContent) &&
              (isDetail ? (
                <SafeHtml
                  className="prose prose-sm dark:prose-invert mt-2 max-w-none break-words"
                  html={status.content}
                />
              ) : (
                <CollapsibleContent
                  className={`prose prose-sm dark:prose-invert max-w-none [overflow-wrap:anywhere] ${preview ? 'text-pana-ink/80 mt-1 text-[13px] leading-relaxed' : 'mt-2 break-words'}`}
                  maxLines={preview ? 3 : 10}
                >
                  <SafeHtml html={status.content} />
                </CollapsibleContent>
              ))}

            {/* Attachments */}
            {(!hasCW || showCWContent) &&
              status.attachments &&
              status.attachments.length > 0 && (
                <AttachmentGrid attachments={status.attachments} />
              )}

            {/* Location */}
            {!preview && status.location && (
              <a
                href={
                  status.location.latitude && status.location.longitude
                    ? `https://www.google.com/maps/search/?api=1&query=${status.location.latitude},${status.location.longitude}`
                    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(status.location.name || '')}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-700 transition-colors hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900"
              >
                <MapPin className="h-4 w-4" />
                <span>
                  {status.location.name ||
                    `${status.location.latitude?.toFixed(4)}, ${status.location.longitude?.toFixed(4)}`}
                  {status.location.precision === 'general' && ' (approx)'}
                </span>
              </a>
            )}

            {/* CC License + Actions */}
            {!preview && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <PostActions
                  statusId={status.id}
                  actorUsername={status.actor.username}
                  liked={status.liked}
                  likesCount={status.likesCount}
                  repliesCount={status.repliesCount}
                  onReply={() => setShowReplyBox(!showReplyBox)}
                  showReplyButton={!isDetail}
                  repliesExpanded={repliesOpen}
                  repliesId={repliesId}
                />
                {status.ccLicense &&
                  getVisibilityFromRecipients(
                    status.recipientTo,
                    status.recipientCc,
                    status.type
                  ) !== 'private' && (
                    <CCBadge license={status.ccLicense as CCLicenseValue} />
                  )}
              </div>
            )}
          </div>
        </div>
        <section
          id={repliesId}
          hidden={preview || !repliesOpen}
          aria-label="Comments"
        >
          {!preview && repliesOpen && (
            <div className="border-muted mt-3 space-y-4 border-l-2 pl-2">
              <PostReplies statusId={status.id} group={status.group} />
              {canReply && (
                <PostComposer
                  inReplyTo={status.id}
                  replyVisibility={getVisibilityFromRecipients(
                    status.recipientTo,
                    status.recipientCc,
                    status.type
                  )}
                  placeholder={`Reply to @${status.actor.username}...`}
                />
              )}
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
