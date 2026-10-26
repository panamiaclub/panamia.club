'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  ChevronDown,
  ChevronUp,
  Eye,
  Globe,
  Lock,
  MapPin,
  Users,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { AttachmentGrid } from '@/components/social/AttachmentGrid';
import { SafeHtml } from '@/components/safe-html';
import { PostActions } from '@/components/social/PostActions';
import { PostReplies } from '@/components/social/PostReplies';
import {
  CCBadge,
  type CCLicenseValue,
} from '@/components/legal/CCLicensePicker';
import {
  getVisibilityFromRecipients,
  STATUS_TYPE_PANAS,
} from '@/lib/utils/getVisibility';
import type { SocialStatusDisplay } from '@/lib/interfaces';
import { useCanReplyToGroup } from '@/lib/query/social';

const PostComposer = dynamic(
  () =>
    import('@/components/social/PostComposer').then((m) => ({
      default: m.PostComposer,
    })),
  { ssr: false }
);

export function FeedPostCard({ status }: { status: SocialStatusDisplay }) {
  const [cwOpen, setCwOpen] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const canReply = useCanReplyToGroup(status.group);
  const repliesId = useId();

  const hasCW = Boolean(status.contentWarning?.trim());

  /* The warning hides the body *and* the media. Revealing the text while
     leaving a photograph on screen would defeat the point of the warning. */
  const bodyHidden = hasCW && !cwOpen;
  const hasPreview = status.repliesCount > 0 && !bodyHidden;

  const displayName = status.actor.name || status.actor.username;
  const published = status.published ? new Date(status.published) : null;

  const initials = status.actor.name
    ? status.actor.name
        .split(' ')
        .map((part) => part[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : status.actor.username.slice(0, 2).toUpperCase();

  const visibility = getVisibilityFromRecipients(
    status.recipientTo,
    status.recipientCc,
    status.type
  );
  const showLicense = Boolean(status.ccLicense) && visibility !== 'private';
  const audienceLabel = status.group
    ? status.group.visibility === 'private'
      ? 'Private group'
      : 'Public group'
    : status.type === STATUS_TYPE_PANAS
      ? 'Panas'
      : visibility === 'public'
        ? 'Everyone'
        : visibility === 'unlisted'
          ? 'Unlisted'
          : visibility === 'private'
            ? 'Followers'
            : 'Private';
  const AudienceIcon = status.group
    ? status.group.visibility === 'private'
      ? Lock
      : Users
    : visibility === 'public' || visibility === 'unlisted'
      ? Globe
      : Lock;

  return (
    <article className="border-pana-flame/20 shadow-pana-burnt/5 min-w-0 overflow-hidden rounded-3xl border bg-white shadow-sm">
      {status.group && (
        <Link
          href={`/g/${status.group.handle}`}
          className="border-pana-flame/10 bg-pana-cream/60 text-pana-ink/65 hover:text-pana-indigo flex min-w-0 items-center gap-1.5 border-b px-4 py-2 text-xs font-bold sm:px-5"
        >
          {status.group.visibility === 'private' ? (
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          <span className="truncate">
            Posted in {status.group.name || status.group.handle}
          </span>
        </Link>
      )}

      <header className="border-pana-flame/10 from-pana-flame/12 via-pana-cream/75 flex items-start gap-3 border-b bg-linear-to-r to-white px-4 py-3.5 sm:px-5">
        <Link
          href={`/p/${status.actor.username}`}
          className="flex-none"
          aria-label={`${displayName}'s profile`}
        >
          <Avatar className="border-pana-flame/20 h-10 w-10 border-2">
            <AvatarImage src={status.actor.iconUrl || undefined} alt="" />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </Link>

        <div className="min-w-0 flex-1">
          <Link
            href={`/p/${status.actor.username}`}
            className="block truncate text-sm font-extrabold hover:underline"
          >
            {displayName}
          </Link>
          <div className="text-pana-ink/65 mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
            <Link
              href={`/p/${status.actor.username}`}
              className="truncate hover:underline"
            >
              @{status.actor.username}
            </Link>
            {published && (
              <>
                <span aria-hidden="true">·</span>
                <time
                  dateTime={published.toISOString()}
                  className="font-semibold"
                >
                  {formatDistanceToNow(published, { addSuffix: true })}
                </time>
              </>
            )}
            {status.actor.county && (
              <span
                title={status.actor.county}
                className="text-pana-indigo inline-flex max-w-full min-w-0 items-center gap-1 text-[11px] font-extrabold"
              >
                <MapPin className="h-3.5 w-3.5 flex-none" aria-hidden="true" />
                <span className="truncate">{status.actor.county}</span>
              </span>
            )}
          </div>
        </div>
        <span className="text-pana-indigo mt-0.5 inline-flex flex-none items-center gap-1 rounded-full bg-white/75 px-2 py-1 text-[10px] font-extrabold">
          <AudienceIcon className="h-3 w-3" aria-hidden="true" />
          {audienceLabel}
        </span>
      </header>

      <div className="p-4 sm:px-5">
        {status.inReplyTo && (
          <p className="feed-context mt-1.5">
            Replying to{' '}
            <Link
              href={`/p/${status.inReplyTo.actorUsername}`}
              className="text-pana-indigo hover:underline"
            >
              @{status.inReplyTo.actorUsername}
            </Link>
          </p>
        )}

        {hasCW && (
          <button
            type="button"
            className="cw-toggle w-full"
            onClick={() => setCwOpen((open) => !open)}
            aria-expanded={cwOpen}
          >
            <span className="inline-flex min-w-0 items-center gap-2 [overflow-wrap:anywhere]">
              <Eye className="h-4 w-4 flex-none" aria-hidden="true" />
              {status.contentWarning}
            </span>
            {cwOpen ? (
              <ChevronUp className="h-4 w-4 flex-none" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-4 w-4 flex-none" aria-hidden="true" />
            )}
          </button>
        )}

        {!bodyHidden && (
          <>
            <SafeHtml
              className="prose prose-sm dark:prose-invert text-pana-ink/90 max-w-none text-[15px] leading-7 [overflow-wrap:anywhere]"
              html={status.content}
            />

            {status.attachments && status.attachments.length > 0 && (
              <AttachmentGrid attachments={status.attachments} />
            )}
          </>
        )}

        {status.location && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <a
              href={
                status.location.latitude && status.location.longitude
                  ? `https://www.google.com/maps/search/?api=1&query=${status.location.latitude},${status.location.longitude}`
                  : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(status.location.name || '')}`
              }
              target="_blank"
              rel="noopener noreferrer"
              className="identity-pill text-pana-ink/65 text-[11px]"
            >
              <MapPin className="h-3 w-3" aria-hidden="true" />
              {status.location.name ||
                `${status.location.latitude?.toFixed(4)}, ${status.location.longitude?.toFixed(4)}`}
              {status.location.precision === 'general' && ' (approx)'}
            </a>
          </div>
        )}
      </div>
      <footer className="border-pana-indigo/7 bg-pana-indigo/4 flex flex-wrap items-center gap-x-2 border-t px-3 py-1.5 sm:px-4">
        <PostActions
          statusId={status.id}
          actorUsername={status.actor.username}
          liked={status.liked}
          likesCount={status.likesCount}
          repliesCount={status.repliesCount}
          onReply={() => setReplyOpen((open) => !open)}
          repliesExpanded={replyOpen}
          repliesId={repliesId}
          repliesPreviewed={hasPreview}
          appearance="feed"
        />
        {showLicense && (
          <span className="ml-auto">
            <CCBadge license={status.ccLicense as CCLicenseValue} />
          </span>
        )}
      </footer>
      <section
        id={repliesId}
        hidden={!replyOpen && !hasPreview}
        aria-label="Comments"
      >
        {(replyOpen || hasPreview) && (
          <div className="border-pana-indigo/8 bg-pana-indigo/3 min-w-0 space-y-4 border-t px-4 py-3 sm:px-5">
            <PostReplies
              statusId={status.id}
              group={status.group}
              preview={{
                expanded: replyOpen,
                onExpandedChange: setReplyOpen,
                totalCount: status.repliesCount,
              }}
            />
            {replyOpen && canReply && (
              <PostComposer
                inReplyTo={status.id}
                replyVisibility={visibility}
                placeholder={`Reply to @${status.actor.username}...`}
              />
            )}
          </div>
        )}
      </section>
    </article>
  );
}
