'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  BadgeCheck,
  ChevronDown,
  ChevronUp,
  Eye,
  Heart,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Pause,
  Play,
  Repeat2,
  Share2,
  Users,
} from 'lucide-react';
import {
  MOCK_MY_GROUPS,
  type MockAttachment,
  type MockPost,
} from '../_data/mock-feed';

/* One status in the timeline.
 *
 * Unlike the profile's post card, this one takes its author from the post —
 * the feed is many authors and one reader, so attribution has to travel with
 * the status rather than with the page.
 *
 * Client component because three things here are genuinely interactive at mock
 * fidelity: the content-warning disclosure, the like state, and the voice memo
 * transport. Everything else is static markup. */
export function FeedPostCard({
  post,
  showGroupContext = true,
}: {
  post: MockPost;
  showGroupContext?: boolean;
}) {
  const [cwOpen, setCwOpen] = useState(false);
  const [liked, setLiked] = useState(Boolean(post.liked));
  const [vote, setVote] = useState<-1 | 0 | 1>(post.liked ? 1 : 0);
  const group = post.group
    ? MOCK_MY_GROUPS.find((entry) => entry.name === post.group)
    : undefined;

  /* The CW hides the body *and* the media. Revealing the text but leaving a
     photograph on screen would defeat the entire point of the warning. */
  const bodyHidden = Boolean(post.contentWarning) && !cwOpen;

  /* The fixture count includes the reader's own like, so strip it out and add
     it back from state. Otherwise unliking leaves the total untouched and the
     number reads as decoration. */
  const likesWithoutViewer = post.likesCount - (post.liked ? 1 : 0);
  const visibleScore = likesWithoutViewer + vote;

  return (
    <article className="profile-card p-4 sm:p-5">
      {post.group && showGroupContext ? (
        <Link
          href="/mock/group"
          className="feed-community-header -m-4 mb-4 sm:-m-5 sm:mb-5"
        >
          <span className="border-pana-ink/10 relative h-9 w-9 flex-none overflow-hidden rounded-lg border">
            {group ? (
              <Image
                src={group.avatar}
                alt=""
                fill
                sizes="36px"
                className="object-cover"
              />
            ) : (
              <Users className="text-pana-indigo h-4 w-4" aria-hidden="true" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-black">
              {post.group}
            </span>
            <span className="text-pana-ink/50 block truncate text-[11px] font-bold">
              {group
                ? `${group.memberCount} members · ${group.activity}`
                : 'Community post'}
            </span>
          </span>
          <span className="text-pana-indigo text-[11px] font-black">
            View group
          </span>
        </Link>
      ) : null}

      {/* Attribution for a boost sits above the author row, because the reason
          this post is in the feed is the first thing that has to be explained —
          otherwise a stranger's post looks like a bug. */}
      {post.boostedBy && (
        <p className="feed-context mb-3">
          <Repeat2 className="h-3.5 w-3.5" aria-hidden="true" />
          {post.boostedBy} boosted
        </p>
      )}

      <div className="flex items-start gap-3">
        <div className="flex flex-none flex-col items-center gap-2">
          <div className="border-pana-ink/10 relative h-11 w-11 overflow-hidden rounded-full border-2">
            <Image
              src={post.author.avatar}
              alt=""
              fill
              sizes="44px"
              className="object-cover"
            />
          </div>

          {post.group ? (
            <div
              className="group-vote-control"
              data-orientation="vertical"
              aria-label="Community voting"
            >
              <button
                type="button"
                data-active={vote === 1}
                aria-pressed={vote === 1}
                onClick={() => setVote((current) => (current === 1 ? 0 : 1))}
                aria-label="Upvote"
              >
                <ChevronUp className="h-4 w-4" aria-hidden="true" />
              </button>
              <span aria-label={`${visibleScore} net votes`}>
                {visibleScore}
              </span>
              <button
                type="button"
                data-active={vote === -1}
                aria-pressed={vote === -1}
                onClick={() => setVote((current) => (current === -1 ? 0 : -1))}
                aria-label="Downvote"
              >
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm leading-tight">
            <span className="truncate font-extrabold">{post.author.name}</span>
            <span className="text-pana-ink/45 truncate font-bold">
              @{post.author.handle}
            </span>
            <span aria-hidden="true" className="text-pana-ink/30">
              ·
            </span>
            <time className="text-pana-ink/45 flex-none font-bold">
              {post.published}
            </time>
            {/* The check is on the county, not the person — residency is what
                Pana Mia actually verifies, from billing zip. */}
            {post.author.county && (
              <span className="text-pana-indigo inline-flex flex-none items-center gap-1 text-[11px] font-extrabold">
                <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                {post.author.county}
              </span>
            )}
          </div>

          {post.group && !showGroupContext && (
            <p className="feed-context mt-1.5">
              <Users className="h-3 w-3" aria-hidden="true" />
              Posted in {post.group}
            </p>
          )}

          {post.contentWarning && (
            <button
              type="button"
              className="cw-toggle mt-2.5"
              onClick={() => setCwOpen((open) => !open)}
              aria-expanded={cwOpen}
            >
              <span className="inline-flex items-center gap-2">
                <Eye className="h-4 w-4 flex-none" aria-hidden="true" />
                {post.contentWarning}
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
              <p className="mt-2 text-[15px] leading-relaxed font-medium">
                {post.body}
              </p>

              {post.voice && <VoiceMemo memo={post.voice} />}

              {post.attachments && post.attachments.length > 0 && (
                <AttachmentGrid attachments={post.attachments} />
              )}

              {post.link && (
                <a
                  href="#"
                  className="link-preview mt-3"
                  onClick={(event) => event.preventDefault()}
                >
                  <span className="link-preview-domain">
                    {post.link.domain}
                  </span>
                  <span className="mt-1 block text-[15px] leading-snug font-extrabold">
                    {post.link.title}
                  </span>
                  <span className="text-pana-ink/60 mt-1 block text-[13px] leading-snug font-medium">
                    {post.link.description}
                  </span>
                </a>
              )}
            </>
          )}

          {/* Location and licence are post metadata rather than content, so
              they stay visible behind a content warning. Neither one reveals
              what the warning is covering. */}
          {(post.location || post.ccLicense) && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {post.location && (
                <span className="identity-pill text-pana-ink/65 text-[11px]">
                  <MapPin className="h-3 w-3" aria-hidden="true" />
                  {post.location}
                </span>
              )}
              {post.ccLicense && (
                <span className="identity-pill text-pana-ink/65 text-[11px]">
                  {post.ccLicense}
                </span>
              )}
            </div>
          )}

          {post.group ? (
            <div className="mt-3.5 flex items-center gap-3">
              <button type="button" className="post-action">
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
                {post.repliesCount}
                <span className="sr-only">replies</span>
              </button>
              <button type="button" className="post-action ml-auto">
                <Share2 className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">Share this post</span>
              </button>
            </div>
          ) : (
            <div className="mt-3.5 flex items-center gap-5 sm:gap-7">
              <button type="button" className="post-action">
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
                {post.repliesCount}
                <span className="sr-only">replies</span>
              </button>
              <button type="button" className="post-action" data-tone="boost">
                <Repeat2 className="h-4 w-4" aria-hidden="true" />
                {post.announcesCount}
                <span className="sr-only">boosts</span>
              </button>
              <button
                type="button"
                className="post-action"
                data-active={liked}
                aria-pressed={liked}
                onClick={() => setLiked((value) => !value)}
              >
                <Heart className="h-4 w-4" aria-hidden="true" />
                {likesWithoutViewer + (liked ? 1 : 0)}
                <span className="sr-only">likes</span>
              </button>
              <button type="button" className="post-action ml-auto">
                <Share2 className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">Share this post</span>
              </button>
            </div>
          )}

          {post.topReply && !bodyHidden && (
            <div className="reply-preview mt-3.5">
              <div className="flex items-center gap-2 text-[13px] leading-tight">
                <span className="border-pana-ink/10 relative h-6 w-6 flex-none overflow-hidden rounded-full border">
                  <Image
                    src={post.topReply.author.avatar}
                    alt=""
                    fill
                    sizes="24px"
                    className="object-cover"
                  />
                </span>
                <span className="truncate font-extrabold">
                  {post.topReply.author.name}
                </span>
                <span className="text-pana-ink/45 flex-none font-bold">
                  {post.topReply.published}
                </span>
              </div>
              <p className="text-pana-ink/80 mt-1 text-[14px] leading-snug font-medium">
                {post.topReply.body}
              </p>
              <p className="text-pana-ink/45 mt-1.5 text-[12px] font-bold">
                {post.repliesCount - 1} more replies
              </p>
            </div>
          )}
        </div>

        <button
          type="button"
          className="text-pana-ink/35 hover:text-pana-ink flex-none pointer-coarse:inline-flex pointer-coarse:h-11 pointer-coarse:w-11 pointer-coarse:items-center pointer-coarse:justify-center"
          aria-label="More options"
        >
          <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}

/* One or two photos. Beyond two the grid starts making cropping decisions on
   the poster's behalf, which is a real feature rather than a mock one — so the
   fixtures stop at two and so does this. */
function AttachmentGrid({ attachments }: { attachments: MockAttachment[] }) {
  const isPair = attachments.length > 1;

  return (
    <div className={`mt-3 grid gap-2 ${isPair ? 'grid-cols-2' : ''}`}>
      {attachments.map((attachment) => (
        <div
          key={attachment.src}
          className={`media-frame ${isPair ? 'aspect-square' : 'aspect-[16/10]'}`}
        >
          <Image
            src={attachment.src}
            alt={attachment.alt}
            fill
            sizes="(min-width: 640px) 34rem, 100vw"
            className="object-cover"
          />
        </div>
      ))}
    </div>
  );
}

/* Voice memo transport. The progress position is fixed rather than animated:
   this is a design mock, and a bar that actually travelled would need real
   audio behind it to not look broken when it reached the end. */
const PLAYED_FRACTION = 0.4;

function VoiceMemo({ memo }: { memo: NonNullable<MockPost['voice']> }) {
  const [playing, setPlaying] = useState(false);
  const playedThrough = Math.round(memo.peaks.length * PLAYED_FRACTION);

  return (
    <div className="mt-3">
      <div className="voice-memo">
        <button
          type="button"
          className="voice-memo-play"
          onClick={() => setPlaying((value) => !value)}
          aria-label={playing ? 'Pause voice memo' : 'Play voice memo'}
        >
          {playing ? (
            <Pause className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Play className="ml-0.5 h-4 w-4" aria-hidden="true" />
          )}
        </button>

        <div className="waveform" aria-hidden="true">
          {memo.peaks.map((peak, index) => (
            <span
              key={index}
              style={{ '--peak': peak } as React.CSSProperties}
              data-played={playing && index < playedThrough}
            />
          ))}
        </div>

        <span className="flex-none text-[13px] font-extrabold tabular-nums">
          {memo.duration}
        </span>
      </div>

      <p className="text-pana-ink/55 mt-1.5 text-[12px] font-bold">
        {memo.note}
      </p>
    </div>
  );
}
