'use client';

import { Button } from '@/components/ui/button';
import { useFollowActor, useUnfollowActor } from '@/lib/query/social';
import { toast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { UserPlus, UserMinus, Loader2 } from 'lucide-react';

interface FollowButtonProps {
  username: string;
  isFollowing: boolean;
  /**
   * Whether this person already follows the viewer. Only changes the label:
   * "Follow back" instead of "Follow", which names the fact that the tap
   * completes a Pana rather than starting a one-way follow.
   * See docs/SOCIAL-GRAPH.md.
   */
  isFollowedBy?: boolean;
  size?: 'default' | 'sm' | 'lg' | 'icon';
  variant?: 'default' | 'outline' | 'ghost';
  showIcon?: boolean;
  /**
   * Extra classes for the button itself. Surfaces with their own button
   * language — the directory cards, where this sits between a pill-shaped Save
   * and a pill-shaped View profile — need to restyle the control without
   * reimplementing the follow and unfollow mutations, the actor checks and the
   * toasts that live in here.
   */
  className?: string;
}

export function FollowButton({
  username,
  isFollowing,
  isFollowedBy = false,
  size = 'sm',
  variant = 'default',
  showIcon = true,
  className,
}: FollowButtonProps) {
  const followActor = useFollowActor();
  const unfollowActor = useUnfollowActor();

  const isPending = followActor.isPending || unfollowActor.isPending;
  const { t } = useTranslation('toast');

  const handleClick = async () => {
    try {
      if (isFollowing) {
        await unfollowActor.mutateAsync(username);
        toast({
          title: t('unfollowed'),
          description: t('unfollowedDesc', { username }),
        });
      } else {
        await followActor.mutateAsync(username);
        toast({
          title: t('following'),
          description: t('followingDesc', { username }),
        });
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Please try again.';
      toast({
        title: t('error'),
        description: message,
        variant: 'destructive',
      });
    }
  };

  return (
    <Button
      variant={isFollowing ? 'outline' : variant}
      size={size}
      className={className}
      onClick={handleClick}
      disabled={isPending}
    >
      {isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <>
          {showIcon &&
            (isFollowing ? (
              <UserMinus className="mr-1 h-4 w-4" />
            ) : (
              <UserPlus className="mr-1 h-4 w-4" />
            ))}
          {isFollowing ? 'Following' : isFollowedBy ? 'Follow back' : 'Follow'}
        </>
      )}
    </Button>
  );
}
