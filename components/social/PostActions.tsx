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
      : `${repliesExpanded ? 'Hide' : 'Show'} comments${
          repliesCount > 0
            ? `, ${repliesCount} ${repliesCount === 1 ? 'comment' : 'comments'}`
            : ''
        }`;
  const likeLabel =
    likesCount > 0
      ? `Like, ${likesCount} ${likesCount === 1 ? 'like' : 'likes'}`
      : 'Like';

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      {showReplyButton && (
        <Button
          variant="ghost"
          size="sm"
          aria-label={replyLabel}
          aria-expanded={repliesExpanded}
          aria-controls={repliesId}
          className="text-muted-foreground hover:text-foreground h-8 px-2 pointer-coarse:h-11 pointer-coarse:min-w-11"
          onClick={onReply}
        >
          <MessageCircle className="mr-1 h-4 w-4" />
          {repliesCount > 0 && <span className="text-xs">{repliesCount}</span>}
        </Button>
      )}

      <Button
        variant="ghost"
        size="sm"
        aria-label={likeLabel}
        aria-pressed={liked}
        className={`h-8 px-2 pointer-coarse:h-11 pointer-coarse:min-w-11 ${
          liked
            ? 'text-red-500 hover:text-red-600'
            : 'text-muted-foreground hover:text-red-500'
        }`}
        onClick={handleLike}
        disabled={likePost.isPending || unlikePost.isPending}
      >
        <Heart className={`mr-1 h-4 w-4 ${liked ? 'fill-current' : ''}`} />
        {likesCount > 0 && <span className="text-xs">{likesCount}</span>}
      </Button>

      <Button
        variant="ghost"
        size="sm"
        aria-label="Copy link to post"
        className="text-muted-foreground hover:text-foreground h-8 px-2 pointer-coarse:h-11 pointer-coarse:min-w-11"
        onClick={handleShare}
      >
        <Share2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
