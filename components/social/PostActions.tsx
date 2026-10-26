'use client';

import { Button } from '@/components/ui/button';
import { useLikePost, useUnlikePost } from '@/lib/query/social';
import { Heart, MessageCircle, Share2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';

interface PostActionsProps {
  statusId: string;
  actorUsername: string;
  liked: boolean;
  likesCount: number;
  repliesCount: number;
  onReply?: () => void;
  showReplyButton?: boolean;
  repliesExpanded?: boolean;
  repliesId?: string;
  repliesPreviewed?: boolean;
  appearance?: 'default' | 'feed';
}

export function PostActions({
  statusId,
  actorUsername,
  liked,
  likesCount,
  repliesCount,
  onReply,
  showReplyButton = true,
  repliesExpanded,
  repliesId,
  repliesPreviewed = false,
  appearance = 'default',
}: PostActionsProps) {
  const likePost = useLikePost();
  const unlikePost = useUnlikePost();
  const { t } = useTranslation('toast');

  const handleLike = async () => {
    try {
      if (liked) {
        await unlikePost.mutateAsync(statusId);
      } else {
        await likePost.mutateAsync(statusId);
      }
    } catch {
      toast({
        title: t('error'),
        description: t('likeFailed'),
        variant: 'destructive',
      });
    }
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/p/${actorUsername}/${statusId}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({
        title: t('linkCopied'),
        description: t('linkCopiedDesc'),
      });
    } catch {
      toast({
        title: t('error'),
        description: t('linkCopyFailed'),
        variant: 'destructive',
      });
    }
  };

  // These buttons are icon-only when their count is zero, so without an
  // explicit name a screen reader announces them as just "button".
  const replyLabel =
    repliesExpanded === undefined
      ? repliesCount > 0
        ? `Reply, ${repliesCount} ${repliesCount === 1 ? 'reply' : 'replies'}`
        : 'Reply'
      : `${repliesPreviewed ? (repliesExpanded ? 'Close conversation' : 'Open conversation') : `${repliesExpanded ? 'Hide' : 'Show'} comments`}${
          repliesCount > 0
            ? `, ${repliesCount} ${repliesCount === 1 ? 'comment' : 'comments'}`
            : ''
        }`;
  const likeLabel =
    likesCount > 0
      ? `Like, ${likesCount} ${likesCount === 1 ? 'like' : 'likes'}`
      : 'Like';
  const feed = appearance === 'feed';
  const actionClass = feed
    ? 'text-pana-indigo hover:bg-pana-indigo/7 h-11 min-w-11 rounded-xl px-2'
    : 'text-muted-foreground hover:text-foreground h-8 px-2 pointer-coarse:h-11 pointer-coarse:min-w-11';

  const replyButton = showReplyButton && (
    <Button
      variant="ghost"
      size="sm"
      aria-label={replyLabel}
      aria-expanded={repliesExpanded}
      aria-controls={repliesId}
      className={actionClass}
      onClick={onReply}
    >
      <MessageCircle className="mr-1 h-4 w-4" />
      {repliesCount > 0 && <span className="text-xs">{repliesCount}</span>}
    </Button>
  );

  const likeButton = (
    <Button
      variant="ghost"
      size="sm"
      aria-label={likeLabel}
      aria-pressed={liked}
      className={`${feed ? 'h-11 min-w-11 rounded-xl px-2' : 'h-8 px-2 pointer-coarse:h-11 pointer-coarse:min-w-11'} ${
        liked
          ? feed
            ? 'text-pana-red-deep bg-pana-red/7 hover:bg-pana-red/12'
            : 'text-red-500 hover:text-red-600'
          : feed
            ? 'text-pana-indigo hover:bg-pana-indigo/7'
            : 'text-muted-foreground hover:text-red-500'
      }`}
      onClick={handleLike}
      disabled={likePost.isPending || unlikePost.isPending}
    >
      <Heart className={`mr-1 h-4 w-4 ${liked ? 'fill-current' : ''}`} />
      {likesCount > 0 && <span className="text-xs">{likesCount}</span>}
    </Button>
  );

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      {feed ? (
        <>
          {likeButton}
          {replyButton}
        </>
      ) : (
        <>
          {replyButton}
          {likeButton}
        </>
      )}
      <Button
        variant="ghost"
        size="sm"
        aria-label="Copy link to post"
        className={actionClass}
        onClick={handleShare}
      >
        <Share2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
