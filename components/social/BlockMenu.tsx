'use client';

/**
 * The overflow menu on another person's profile: block, unblock, mute, unmute.
 *
 * Deliberately not a one-tap button. Blocking is the one social action that is
 * hard to undo by design — it severs follows in both directions and those
 * follows are not restored on unblock — so it sits behind a menu and a
 * confirmation rather than next to Follow where a mis-tap lands.
 *
 * Mute is in the same menu but takes no confirmation. It is reversible, it
 * changes nothing for the other person, and making it ceremonious would push
 * people toward blocking when a mute was what they actually wanted.
 *
 * See docs/SOCIAL-GRAPH.md section B.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  useBlockActor,
  useUnblockActor,
  type SocialBlockKind,
} from '@/lib/query/social';
import { toast } from '@/hooks/use-toast';
import {
  MoreHorizontal,
  Ban,
  VolumeX,
  Volume2,
  Loader2,
  Flag,
} from 'lucide-react';
import { openSafetyReport } from '@/lib/safety-report';

interface BlockMenuProps {
  username: string;
  actorUri?: string;
  displayName?: string | null;
  isBlocked?: boolean;
  isMuted?: boolean;
}

export function BlockMenu({
  username,
  actorUri,
  displayName,
  isBlocked = false,
  isMuted = false,
}: BlockMenuProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const blockActor = useBlockActor();
  const unblockActor = useUnblockActor();

  const isPending = blockActor.isPending || unblockActor.isPending;
  const who = displayName || `@${username}`;

  const run = async (
    action: 'block' | 'unblock' | 'mute' | 'unmute',
    kind: SocialBlockKind
  ) => {
    const adding = action === 'block' || action === 'mute';
    try {
      if (adding) {
        await blockActor.mutateAsync({ username, kind });
      } else {
        await unblockActor.mutateAsync({ username, kind });
      }

      toast({
        title:
          action === 'block'
            ? `Blocked ${who}`
            : action === 'unblock'
              ? `Unblocked ${who}`
              : action === 'mute'
                ? `Muted ${who}`
                : `Unmuted ${who}`,
        description:
          action === 'block'
            ? 'They can no longer follow you or see your posts, and you will not see theirs.'
            : action === 'unblock'
              ? 'Following is not restored. You can follow each other again if you want to.'
              : action === 'mute'
                ? 'You will stop seeing their posts. They are not told, and nothing changes for them.'
                : 'Their posts will show up again.',
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Please try again.';
      toast({
        title: 'Something went wrong',
        description: message,
        variant: 'destructive',
      });
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            disabled={isPending}
            aria-label={`More options for ${who}`}
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MoreHorizontal className="h-4 w-4" />
            )}
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem
            onSelect={() => {
              // Let the menu release its focus trap before opening the report.
              requestAnimationFrame(() =>
                openSafetyReport({
                  type: 'user',
                  url: actorUri || `/p/${encodeURIComponent(username)}`,
                })
              );
            }}
          >
            <Flag className="mr-2 h-4 w-4" />
            Report {who}
          </DropdownMenuItem>
          {isMuted ? (
            <DropdownMenuItem onClick={() => run('unmute', 'mute')}>
              <Volume2 className="mr-2 h-4 w-4" />
              Unmute {who}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => run('mute', 'mute')}>
              <VolumeX className="mr-2 h-4 w-4" />
              Mute {who}
            </DropdownMenuItem>
          )}

          {isBlocked ? (
            <DropdownMenuItem onClick={() => run('unblock', 'block')}>
              <Ban className="mr-2 h-4 w-4" />
              Unblock {who}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setConfirmOpen(true)}
            >
              <Ban className="mr-2 h-4 w-4" />
              Block {who}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Block {who}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              {/*
                Spelled out rather than summarised. The two things people are
                surprised by afterwards are that it cuts both ways and that
                unblocking does not put the follow back, so both are said here
                before the tap rather than discovered later.
              */}
              <div className="space-y-2 text-sm">
                <p>
                  You will stop following each other, and neither of you will
                  see the other&rsquo;s posts.
                </p>
                <p>
                  They are not told that you blocked them. If you unblock them
                  later, you will not be following each other again
                  automatically.
                </p>
                <p className="text-muted-foreground">
                  If you just want them out of your feed, mute them instead.
                  Muting is invisible and easy to undo.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => run('block', 'block')}
            >
              Block
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
