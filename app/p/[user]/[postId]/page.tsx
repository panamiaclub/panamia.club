'use client';

import { use } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PostCard, PostList } from '@/components/social';

const PostComposer = dynamic(
  () =>
    import('@/components/social/PostComposer').then((m) => ({
      default: m.PostComposer,
    })),
  { ssr: false }
);
import { useStatus, useStatusReplies, useMyActor } from '@/lib/query/social';
import { getVisibilityFromRecipients } from '@/lib/utils/getVisibility';
import { Loader2, ArrowLeft } from 'lucide-react';

export default function StatusDetailPage({
  params,
}: {
  params: Promise<{ user: string; postId: string }>;
}) {
  const { postId } = use(params);

  const { data: statusData, isLoading: statusLoading } = useStatus(postId);
  const { data: repliesData, isLoading: repliesLoading } =
    useStatusReplies(postId);
  const { data: myActor } = useMyActor();

  if (statusLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="mx-auto flex max-w-2xl justify-center">
          <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
        </div>
      </div>
    );
  }

  if (!statusData?.status) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="mb-2 text-2xl font-bold">Post not found</h1>
          <p className="text-muted-foreground mb-4">
            This post may have been deleted or doesn&apos;t exist.
          </p>
          <Button variant="outline" asChild>
            <Link href="/timeline/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Timeline
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const status = statusData.status;
  const replies = repliesData?.replies || [];

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Back button */}
        <Button variant="ghost" size="sm" asChild>
          <Link href="/timeline/">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Timeline
          </Link>
        </Button>

        {/* Main post */}
        <Card>
          <CardContent className="pt-4">
            <PostCard status={status} isDetail showReplyComposer={false} />
          </CardContent>
        </Card>

        {/* Reply composer */}
        {myActor?.actor && (
          <Card>
            <CardContent className="pt-4">
              <h3 className="mb-3 text-sm font-medium">Reply to this post</h3>
              <PostComposer
                inReplyTo={status.id}
                replyVisibility={getVisibilityFromRecipients(
                  status.recipientTo,
                  status.recipientCc,
                  status.type
                )}
                placeholder={`Reply to @${status.actor.username}...`}
              />
            </CardContent>
          </Card>
        )}

        {/* Replies */}
        <div>
          <h2 className="mb-4 text-lg font-semibold">
            Replies {replies.length > 0 && `(${replies.length})`}
          </h2>
          <PostList
            statuses={replies}
            isLoading={repliesLoading}
            hasMore={!!repliesData?.nextCursor}
            emptyMessage="No replies yet. Be the first to reply!"
          />
        </div>
      </div>
    </div>
  );
}
