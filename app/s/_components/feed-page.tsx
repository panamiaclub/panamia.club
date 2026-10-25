'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { redirect } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import SurfaceLink from '@/components/panaverse/SurfaceLink';
import { useSession } from '@/lib/auth-client';
import { SocialEligibilityGate } from '@/components/social';
import { useTimeline, usePublicTimeline, useMyActor } from '@/lib/query/social';
import type { SocialStatusDisplay } from '@/lib/interfaces';
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

type FeedFilter = 'panas' | 'everyone' | 'voice';

const FEED_FILTERS: { id: FeedFilter; label: string; hint: string }[] = [
  {
    id: 'everyone',
    label: 'Everyone',
    hint: 'Every public post from Pana Mia members, newest first.',
  },
  {
    id: 'panas',
    label: 'Panas',
    hint: 'Posts from your mutual Panas, your groups, and you.',
  },
  {
    id: 'voice',
    label: 'Voice notes',
    hint: 'Audio posts from your mutual Panas, your groups, and you.',
  },
];

function hasAudio(status: SocialStatusDisplay): boolean {
  return Boolean(
    status.attachments?.some(
      (attachment) =>
        attachment.type === 'audio' ||
        attachment.mediaType?.startsWith('audio/')
    )
  );
}

/**
 * The Pana Social feed.
 *
 * Lives here rather than in a route file because two routes render it. On a
 * surface hostname the feed is the front door and is served at `/`; `/s`
 * remains the route it occupies in the shared tree, which is what every other
 * hostname reaches it by. One implementation, two doors — see app/page.tsx.
 */
export function FeedPage() {
  const { status } = useSession();

  if (status === 'unauthenticated') {
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
      <main className="surface-cream min-h-screen pb-20">
        <div className="container mx-auto max-w-6xl px-4 pt-8">
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
    <main className="surface-cream min-h-screen pb-20">
      <div className="container mx-auto max-w-6xl px-4 pt-8">
        {/* The surface masthead already flies the Pana Social mark, so a
            visible page title would repeat it. Screen readers still need a
            heading to land on. */}
        <h1 className="sr-only">My feed</h1>

        <SocialEligibilityGate>
          <FeedContent />
        </SocialEligibilityGate>
      </div>
    </main>
  );
}

function FeedContent() {
  const [filter, setFilter] = useState<FeedFilter>('everyone');
  /* Latched, not a timer: once a member has posted in this visit the ask stays
     available until they act on it or wave it away. Resetting it on the next
     render would take the card away mid-reach. */
  const [hasPosted, setHasPosted] = useState(false);

  const { data: me } = useMyActor();
  const home = useTimeline();
  const everyone = usePublicTimeline();

  const source = filter === 'everyone' ? everyone : home;
  const statuses = source.data?.statuses ?? [];

  /* Voice filters what the timeline already returned rather than asking for
     audio posts specifically, because no endpoint offers that. The honest
     consequence is that it only sees the current page: a member whose voice
     memos are all older than the newest 20 posts gets an empty tab. The empty
     state says so rather than implying none exist. */
  const posts = filter === 'voice' ? statuses.filter(hasAudio) : statuses;

  const activeFilter = FEED_FILTERS.find((entry) => entry.id === filter);
  const actor = me?.actor ?? null;
  const firstName = (actor?.name || actor?.username || '').split(' ')[0];

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start">
      <div className="min-w-0">
        <StoriesRail actor={actor} />
        <div>
          <PostComposer
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

        <div className="mt-6" role="tablist" aria-label="Feed filters">
          <div className="profile-tabs">
            {FEED_FILTERS.map((entry) => {
              const isActive = entry.id === filter;
              return (
                <button
                  key={entry.id}
                  type="button"
                  role="tab"
                  id={`feed-tab-${entry.id}`}
                  aria-selected={isActive}
                  aria-controls="feed-panel"
                  className="profile-tab"
                  data-active={isActive}
                  onClick={() => setFilter(entry.id)}
                >
                  {entry.label}
                </button>
              );
            })}
          </div>
        </div>

        {activeFilter && (
          <p className="text-pana-ink/60 mt-3 text-[13px] font-bold">
            {activeFilter.hint}
          </p>
        )}

        <div
          id="feed-panel"
          role="tabpanel"
          aria-labelledby={`feed-tab-${filter}`}
          className="mt-4 space-y-4"
        >
          {source.isLoading ? (
            <FeedSkeleton />
          ) : source.isError ? (
            <FeedError onRetry={() => source.refetch()} />
          ) : posts.length > 0 ? (
            withModules(
              posts.map((post) => <FeedPostCard key={post.id} status={post} />)
            )
          ) : filter === 'panas' && statuses.length === 0 ? (
            <FeedEmpty />
          ) : (
            <FilterEmpty filter={filter} />
          )}
        </div>

        {!source.isLoading && !source.isError && posts.length > 0 && (
          <div className="feed-end mt-8">
            <span>You&apos;re all caught up</span>
          </div>
        )}
      </div>

      {actor && <FeedRail actor={actor} />}
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
function FeedError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="reserved-slot items-start p-6">
      <p className="reserved-slot-title">That didn&apos;t load</p>
      <p className="text-pana-ink/65 text-[13px] leading-snug font-medium">
        Something went wrong fetching the timeline. This is a problem on our
        side, not an empty feed.
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
        <p className="reserved-slot-title">Your Panas feed starts here</p>
        <p className="text-pana-ink/65 text-[13px] leading-snug font-medium">
          When you and someone follow each other, you become Panas. Their posts,
          your own posts, and posts from groups you join will appear here.
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

function FilterEmpty({ filter }: { filter: FeedFilter }) {
  const label = FEED_FILTERS.find((entry) => entry.id === filter)?.label ?? '';

  return (
    <div className="reserved-slot items-start p-6">
      <p className="reserved-slot-title">Nothing under {label} right now</p>
      <p className="text-pana-ink/65 text-[13px] leading-snug font-medium">
        {filter === 'voice'
          ? 'No voice memos in the posts loaded so far. Older ones further down the timeline will not show up here yet.'
          : 'No public posts yet. Share a post with Everyone to start the conversation.'}
      </p>
    </div>
  );
}
