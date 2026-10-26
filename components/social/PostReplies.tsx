'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronDown } from 'lucide-react';
import { useInfiniteStatusReplies } from '@/lib/query/social';
import type { SocialStatusDisplay } from '@/lib/interfaces';
import { PostCard } from './PostCard';

const COMMENT_PREVIEW_LIMIT = 2;

export function PostReplies({
  statusId,
  group,
  preview,
}: {
  statusId: string;
  group?: SocialStatusDisplay['group'];
  preview?: {
    expanded: boolean;
    onExpandedChange: (expanded: boolean) => void;
    totalCount: number;
  };
}) {
  const container = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [enteredViewport, setEnteredViewport] = useState(false);
  const previewMode = Boolean(preview);
  const showAll = !preview || preview.expanded;
  const enabled = !previewMode || showAll || enteredViewport;

  useEffect(() => {
    if (!previewMode || enteredViewport) return;
    if (showAll) {
      setEnteredViewport(true);
      return;
    }
    const element = container.current;
    if (!element) return;
    if (typeof IntersectionObserver === 'undefined') {
      setEnteredViewport(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setEnteredViewport(true);
        observer.disconnect();
      },
      { rootMargin: '200px 0px' }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [previewMode, showAll, enteredViewport]);

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
  } = useInfiniteStatusReplies(statusId, 20, {
    initialLimit: previewMode ? COMMENT_PREVIEW_LIMIT : 20,
    enabled,
  });

  const pageCount = data?.pages.length ?? 0;
  const replies = data?.pages.flatMap((page) => page?.replies ?? []) ?? [];
  const hasMore = Boolean(
    data &&
    data.pages.every((page) => page !== null) &&
    (hasNextPage || replies.length > COMMENT_PREVIEW_LIMIT)
  );
  const knownCount = Math.max(preview?.totalCount ?? 0, replies.length);
  useEffect(() => {
    if (
      previewMode &&
      showAll &&
      pageCount === 1 &&
      hasNextPage &&
      !isFetching &&
      !isError
    ) {
      void fetchNextPage();
    }
  }, [
    previewMode,
    showAll,
    pageCount,
    hasNextPage,
    isFetching,
    isError,
    fetchNextPage,
  ]);

  let content: ReactNode;
  if (!enabled) {
    content = <div className="h-16" aria-hidden="true" />;
  } else if (isPending) {
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
    const visibleReplies = showAll
      ? replies
      : replies.slice(0, COMMENT_PREVIEW_LIMIT);
    content = (
      <>
        {replies.length === 0 ? (
          showAll && (
            <p className="text-muted-foreground text-sm">No comments yet.</p>
          )
        ) : (
          <ol className={showAll ? 'space-y-4' : 'space-y-2.5'}>
            {visibleReplies.map((reply) => (
              <li key={reply.id}>
                <PostCard
                  status={{ ...reply, group: reply.group ?? group }}
                  compact
                  preview={!showAll}
                />
              </li>
            ))}
          </ol>
        )}
        {isError && (showAll || !isFetchNextPageError) && (
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
        {showAll && hasNextPage && !isFetchNextPageError && (
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
    <div ref={container} id={listId} className="min-w-0 space-y-3">
      {showAll && <h3 className="text-sm font-semibold">Comments</h3>}
      {content}
      {preview && hasMore && (
        <button
          type="button"
          aria-expanded={showAll}
          aria-controls={listId}
          onClick={() => preview.onExpandedChange(!showAll)}
          className="text-pana-indigo focus-visible:ring-pana-indigo ml-10 inline-flex min-h-11 items-center gap-1 rounded-lg text-xs font-extrabold focus-visible:ring-2"
        >
          {showAll
            ? 'Show fewer comments'
            : knownCount > COMMENT_PREVIEW_LIMIT
              ? `View all ${knownCount} comments`
              : 'View all comments'}
          <ChevronDown
            className={`h-3.5 w-3.5 ${showAll ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
      )}
    </div>
  );
}
