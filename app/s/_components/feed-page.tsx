'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { redirect } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import SurfaceLink from '@/components/panaverse/SurfaceLink';
import { useSession } from '@/lib/auth-client';
import { useIsNativeApp } from '@/lib/mobile/use-native-app';
import { SocialEligibilityGate } from '@/components/social';
import { useTimeline, useMyActor } from '@/lib/query/social';
import { FeedPostCard } from './feed-post-card';
import { FeedRail } from './feed-rail';
import { StoriesRail } from './stories-rail';
import { IdentityPrompt } from './identity-prompt';
import {
  DirectoryModule,
  EventsModule,
  SuggestionsModule,
} from './feed-modules';

const PostComposer = dynamic(
  () =>
    import('@/components/social/PostComposer').then((m) => ({
      default: m.PostComposer,
    })),
  { ssr: false }
);

/**
 * The Pana Social feed.
 *
 * Lives here rather than in a route file because two routes render it. On a
 * surface hostname the feed is the front door and is served at `/`; `/s`
 * remains the route it occupies in the shared tree, which is what every other
 * hostname reaches it by. One implementation, two doors — see app/page.tsx.
 */
export function FeedPage({
  active = true,
  captureSession = 0,
}: {
  active?: boolean;
  captureSession?: number;
} = {}) {
  const { status } = useSession();
  const native = useIsNativeApp();
  const pageClass = native
    ? 'surface-cream native-social-feed'
    : 'surface-cream min-h-screen pb-20';
  const containerClass = native
    ? 'container mx-auto native-social-container'
    : 'container mx-auto max-w-6xl px-4 pt-8';

  if (status === 'unauthenticated') {
    if (!active) return null;
    /* The callback is not only a courtesy that returns the member to the feed
     * after signing in. A bare '/signin' is a www doorway, so a signed-out
     * member sent here was offered "Pana Mia" to install, with the Pana Mia
     * tile — on the one journey that starts at Pana Social's front door. The
     * callback is what tells the doorway which app it is a doorway to; see
     * resolveInstallSurface in lib/panaverse/chrome.ts. */
    redirect(`/signin?callbackUrl=${encodeURIComponent('/s')}`);
  }

  if (status === 'loading') {
    return (
      <main className={pageClass}>
        <div className={containerClass}>
          <div className="animate-pulse space-y-4">
            <div className="bg-pana-ink/10 h-28 rounded-2xl" />
            <div className="bg-pana-ink/10 h-40 rounded-2xl" />
            <div className="bg-pana-ink/10 h-40 rounded-2xl" />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={pageClass}>
      <div className={containerClass}>
        {/* The surface masthead already flies the Pana Social mark, so a
            visible page title would repeat it. Screen readers still need a
            heading to land on. */}
        <h1 className="sr-only">My feed</h1>

        <SocialEligibilityGate>
          <FeedContent native={native} captureSession={captureSession} />
        </SocialEligibilityGate>
      </div>
    </main>
  );
}

function FeedContent({
  native,
  captureSession,
}: {
  native: boolean;
  captureSession: number;
}) {
  /* Latched, not a timer: once a member has posted in this visit the ask stays
     available until they act on it or wave it away. Resetting it on the next
     render would take the card away mid-reach. */
  const [hasPosted, setHasPosted] = useState(false);

  const { data: me } = useMyActor();
  const actor = me?.actor ?? null;
  const source = useTimeline(actor?.id);
  const posts = [
    ...new Map(
      source.data?.pages
        .flatMap((page) => page?.statuses ?? [])
        .map((post) => [post.id, post])
    ).values(),
  ];
  const firstName = (actor?.name || actor?.username || '').split(' ')[0];

  return (
    <div
      className={
        native
          ? 'min-w-0'
          : 'grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start'
      }
    >
      <div className="min-w-0">
        <StoriesRail key={`stories-${captureSession}`} actor={actor} />
        <div>
          <PostComposer
            key={`composer-${captureSession}`}
            avatarUrl={actor?.iconUrl}
            avatarName={actor?.name || actor?.username}
            onSuccess={() => setHasPosted(true)}
            placeholder={
              firstName
                ? `What's on your mind, ${firstName}?`
                : "What's on your mind?"
            }
          />
        </div>

        {hasPosted && (
          <IdentityPrompt
            actorId={actor?.id}
            name={actor?.name}
            username={actor?.username}
            iconUrl={actor?.iconUrl}
          />
        )}

        <section
          id="feed-panel"
          aria-label="Community feed"
          aria-busy={source.isPending}
          className="mt-4 space-y-4"
        >
          <p className="sr-only">
            Community posts, with recent posts from your Panas given a little
            priority.
          </p>
          {source.isPending ? (
            <FeedSkeleton />
          ) : source.isError && !posts.length ? (
            <FeedError onRetry={() => source.refetch()} />
          ) : posts.length > 0 ? (
            withModules(
              posts.map((post) => <FeedPostCard key={post.id} status={post} />)
            )
          ) : (
            <FeedEmpty />
          )}
          {posts.length > 0 && source.isError && (
            <FeedError
              message={
                source.isFetchNextPageError
                  ? 'Could not load more posts. Your current feed is still here.'
                  : 'Could not refresh the feed. Your current posts are still here.'
              }
              onRetry={() =>
                source.isFetchNextPageError
                  ? source.fetchNextPage()
                  : source.refetch()
              }
            />
          )}
          {source.hasNextPage && (
            <button
              type="button"
              onClick={() => source.fetchNextPage()}
              disabled={source.isFetching}
              className="text-pana-indigo focus-visible:ring-pana-indigo min-h-11 rounded-xl px-4 text-sm font-extrabold focus-visible:ring-2 disabled:opacity-50"
            >
              {source.isFetchingNextPage
                ? 'Loading more...'
                : 'Load more posts'}
            </button>
          )}
          {!source.isPending &&
            !source.isError &&
            !source.hasNextPage &&
            posts.length > 0 && (
              <div className="feed-end mt-8">
                <span>You&apos;re all caught up</span>
              </div>
            )}
        </section>
      </div>

      {actor && !native && <FeedRail actor={actor} />}
    </div>
  );
}

/* Threads the standing modules through the timeline instead of stacking them
 * in the rail, so the column has something other than statuses in it. The
 * modules are injected into the rendered list rather than mixed into the data,
 * because they are not posts and must never be treated as posts — no keys
 * collide with status ids, and filtering never sees them.
 *
 * The mock injects three and all three now exist, so its 1/3/5 spacing is
 * used directly rather than re-derived. An earlier version of this function
 * compressed the positions because the middle module was missing and fixed
 * positions would have left a nine-post gap.
 *
 * The short-list rule is the important one. A feed with one or two posts is a
 * new or quiet account, which is precisely the case that used to dead-end in
 * a grey box. Those get a module appended so the column ends on somewhere to
 * go — Suggestions rather than Directory, so even a quiet feed ends on a way
 * to build mutual connections. Positional injections cannot fire on a list
 * that short, so nothing is ever shown twice. */
function withModules(cards: ReactNode[]): ReactNode[] {
  if (cards.length <= 2) {
    return [...cards, <SuggestionsModule key="module-panas-tail" />];
  }

  const out: ReactNode[] = [];
  cards.forEach((card, index) => {
    out.push(card);
    if (index === 1) out.push(<SuggestionsModule key="module-panas" />);
    if (index === 3) out.push(<EventsModule key="module-events" />);
    if (index === 5) out.push(<DirectoryModule key="module-directory" />);
  });
  return out;
}

function FeedSkeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-hidden="true">
      <div className="bg-pana-ink/10 h-36 rounded-2xl" />
      <div className="bg-pana-ink/10 h-36 rounded-2xl" />
      <div className="bg-pana-ink/10 h-36 rounded-2xl" />
    </div>
  );
}

/* The previous feed had no error branch at all, so a failing request was
   indistinguishable from an empty timeline — the member was told to go follow
   people when the real problem was a 500. */
function FeedError({
  onRetry,
  message = 'Something went wrong fetching the timeline. This is a problem on our side, not an empty feed.',
}: {
  onRetry: () => void;
  message?: string;
}) {
  return (
    <div role="alert" className="reserved-slot items-start p-6">
      <p className="reserved-slot-title">That didn&apos;t load</p>
      <p className="text-pana-ink/65 text-[13px] leading-snug font-medium">
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="text-pana-indigo mt-2 text-[13px] font-extrabold hover:underline"
      >
        Try again
      </button>
    </div>
  );
}

function FeedEmpty() {
  return (
    <div className="space-y-5">
      <div className="reserved-slot items-start p-6">
        <p className="reserved-slot-title">Your community feed starts here</p>
        <p className="text-pana-ink/65 text-[13px] leading-snug font-medium">
          No posts yet. Share a moment with Everyone, connect with Panas, or
          join a group to start the conversation.
        </p>
        <SurfaceLink
          href="/directory/search"
          className="link-arrow text-pana-indigo mt-2 text-[13px] font-extrabold"
        >
          Browse the directory
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </SurfaceLink>
      </div>

      <SuggestionsModule />
    </div>
  );
}
