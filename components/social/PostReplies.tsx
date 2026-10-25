'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { useInfiniteStatusReplies } from '@/lib/query/social';
import type { SocialStatusDisplay } from '@/lib/interfaces';
import { PostCard } from './PostCard';

export function PostReplies({
  statusId,
  group,
}: {
  statusId: string;
  group?: SocialStatusDisplay['group'];
}) {
  const {
    data,
    isPending,
    isError,
    isFetching,
    isFetchingNextPage,
    isFetchNextPageError,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteStatusReplies(statusId);

  let content: ReactNode;
  if (isPending) {
    content = (
      <p role="status" className="text-muted-foreground text-sm">
        Loading comments...
      </p>
    );
  } else if (isError && !data) {
    content = (
      <div role="alert" className="space-y-2">
        <p className="text-sm">Could not load comments.</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void refetch()}
          disabled={isFetching}
        >
          Try again
        </Button>
      </div>
    );
  } else if (!data || data.pages.some((page) => page === null)) {
    content = (
      <p role="alert" className="text-muted-foreground text-sm">
        Comments are no longer available.
      </p>
    );
  } else {
    const replies = data.pages.flatMap((page) => page?.replies ?? []);
    content = (
      <>
        {replies.length === 0 ? (
          <p className="text-muted-foreground text-sm">No comments yet.</p>
        ) : (
          <ol className="space-y-4">
            {replies.map((reply) => (
              <li key={reply.id}>
                <PostCard
                  status={{ ...reply, group: reply.group ?? group }}
                  compact
                />
              </li>
            ))}
          </ol>
        )}
        {isError && (
          <div role="alert" className="space-y-2">
            <p className="text-sm">
              {isFetchNextPageError
                ? 'Could not load more comments.'
                : 'Could not refresh comments.'}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void (isFetchNextPageError ? fetchNextPage() : refetch())
              }
              disabled={isFetching}
            >
              Try again
            </Button>
          </div>
        )}
        {hasNextPage && !isFetchNextPageError && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void fetchNextPage()}
            disabled={isFetching}
          >
            {isFetchingNextPage
              ? 'Loading more comments...'
              : 'Load more comments'}
          </Button>
        )}
      </>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Comments</h3>
      {content}
    </div>
  );
}
