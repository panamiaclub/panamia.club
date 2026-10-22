'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUp, Lock, Sparkles } from 'lucide-react';
import {
  FEED_FILTERS,
  MOCK_VIEWER,
  postsForFilter,
  type FeedFilter,
  type FeedState,
} from '../_data/mock-feed';
import type { MockSurface } from '../../_data/panaverse';
import { SurfaceMasthead } from '../../_components/surface-masthead';
import { FeedComposer } from './feed-composer';
import { FeedPostCard } from './feed-post-card';
import { FeedRail } from './feed-rail';
import { FeedEmpty } from './feed-empty';
import { FeedCalendar } from './feed-calendar';
import { FeedGroupsShelf } from './feed-groups-shelf';
import { FeedGroupEvent } from './feed-group-event';
import {
  DirectoryModule,
  EventsModule,
  SuggestionsModule,
} from './feed-modules';

/* Design mock for the Pana Social feed, rendered as Pana Social.
 *
 * An earlier draft of this file argued the opposite, and said so at the top:
 * the feed was deliberately not an app shell, because an embedded product with
 * its own navigation is how you end up with a Pana Mia member looking at a
 * page that has no Pana Mia on it. That was the right call while the feed was
 * a section of panamia.club.
 *
 * It stopped being the right call the moment Pana Social got its own front
 * door at social.panamia.club and its own drawn mark. Wearing the main site's
 * scallop header and demoting "Pana Social" to an eyebrow no longer reads as
 * continuity — it reads as the social product never having arrived. The
 * continuity now lives where it should: in the lettering, the palette, and the
 * switcher, all of which survive the hostname change on their own.
 *
 * So this is full bleed and sticky, with no page wrapper around it. The only
 * non-product element is the mock toolbar above the masthead, which is styled
 * as developer chrome precisely so nothing else has to be.
 *
 * Two columns on desktop: the timeline, and a rail of context that stacks
 * beneath it on mobile. */
/** Which page the mock renders. The calendar is a route of its own in
 *  production (/s/calendar), not a tab of the feed — but it is reached from
 *  the feed rail, so both live in this one mock to make the handoff between
 *  them reviewable without a navigation. */
type FeedPage = 'feed' | 'calendar';

export function FeedMock({ surfaces }: { surfaces: MockSurface[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<FeedFilter>('panas');
  const [state, setState] = useState<FeedState>('populated');
  const [page, setPage] = useState<FeedPage>('feed');

  const posts = postsForFilter(filter);
  const activeFilter = FEED_FILTERS.find((entry) => entry.id === filter);

  /* This page IS Pana Social, so the surface is pinned rather than stateful.
     Choosing another surface in the switcher means leaving, which in the real
     product is a cross-origin navigation — here it lands on the panaverse mock,
     the one place the crossing itself is the thing on display. */
  const current =
    surfaces.find((surface) => surface.id === 'social') ?? surfaces[0];

  return (
    <main className="surface-cream min-h-screen pb-20">
      <MockToolbar
        state={state}
        onSelectState={setState}
        page={page}
        onSelectPage={setPage}
        hostname={current.hostname}
      />

      <SurfaceMasthead
        surfaces={surfaces}
        current={current}
        onSelect={(id) => {
          if (id !== current.id) router.push('/mock/panaverse');
        }}
        sticky
        contained
      />

      <div className="container mx-auto max-w-6xl px-4 pt-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start">
          <div className="min-w-0">
            {page === 'calendar' ? <FeedCalendar /> : null}

            {page === 'feed' ? (
              <>
                <FeedComposer state={state} />

                {state === 'populated' ? (
                  <>
                    <FeedGroupsShelf />

                    <div
                      className="mt-6"
                      role="tablist"
                      aria-label="Feed filters"
                    >
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
                              <span className="profile-tab-count">
                                {postsForFilter(entry.id).length}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* The filter says what it is showing in a full sentence. Four
                    tabs that each need a mental model — Panas is a mutual
                    follow, Everyone is the local timeline — cannot carry that
                    in a one-word label. */}
                    {activeFilter && (
                      <p className="text-pana-ink/60 mt-3 text-[13px] font-bold">
                        {activeFilter.hint}
                      </p>
                    )}

                    <div className="feed-new-row mt-4">
                      <button type="button" className="feed-new-pill">
                        <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                        {MOCK_VIEWER.unread} new posts
                      </button>
                    </div>

                    <div
                      id="feed-panel"
                      role="tabpanel"
                      aria-labelledby={`feed-tab-${filter}`}
                      className="mt-4 space-y-4"
                    >
                      {posts.length > 0 ? (
                        withModules(
                          posts.map((post) => (
                            <FeedPostCard key={post.id} post={post} />
                          )),
                          filter
                        )
                      ) : (
                        <FilterEmpty label={activeFilter?.label ?? ''} />
                      )}
                    </div>

                    {posts.length > 0 && (
                      <div className="feed-end mt-8">
                        <span>You&apos;re all caught up</span>
                      </div>
                    )}
                  </>
                ) : (
                  <FeedEmpty />
                )}
              </>
            ) : null}
          </div>

          <FeedRail onOpenCalendar={() => setPage('calendar')} />
        </div>

        <p className="border-pana-ink/10 text-pana-ink/55 mt-14 border-t pt-6 text-[13px] font-bold">
          Design mock at <code>/mock/feed</code> with hardcoded data. This is
          Pana Social as its own surface — its own mark, its own nav, its own
          hostname — sharing card, tab, and stat primitives with the personal
          profile at{' '}
          <Link href="/mock/profile" className="link-arrow text-pana-indigo">
            /mock/profile
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </p>
      </div>
    </main>
  );
}

/* Modules are injected into the rendered list rather than baked into the
   fixtures, because their positions are a property of the feed — every third
   or fourth card — not of any particular post. Injecting after the fact also
   means a filter that returns two posts still gets a module, instead of
   inheriting whatever position a longer list would have used. */
function withModules(cards: ReactNode[], filter: FeedFilter): ReactNode[] {
  const out: ReactNode[] = [];

  cards.forEach((card, index) => {
    out.push(card);

    if (index === 0 && (filter === 'panas' || filter === 'groups')) {
      out.push(<FeedGroupEvent key="group-event" />);
    }
    if (index === 1) {
      out.push(<SuggestionsModule key="module-panas" />);
    }
    if (index === 3) {
      out.push(<EventsModule key="module-events" />);
    }
    if (index === 5) {
      out.push(<DirectoryModule key="module-directory" />);
    }
  });

  /* Short lists would otherwise end on a post with nothing after it. One
     module is the difference between "that's everything" and "that's all we
     have" — the second is the feeling the current feed gives off. */
  if (cards.length === 1) {
    out.push(<SuggestionsModule key="module-panas-tail" />);
  }

  return out;
}

/* The only part of this page that is not the design under review.
 *
 * It sits above the masthead rather than inside the surface, and is styled as
 * developer chrome — dark, small, monospaced host — so that everything below
 * it can be judged as the product without a "mock" badge floating in the
 * middle of it. It scrolls away; the masthead does not.
 *
 * The hostname is here for a reason. The whole claim of this design is that
 * Pana Social reads as its own place, and the address bar is the thing that
 * makes a subdomain feel like one. Naming it in the toolbar keeps that claim
 * visible without drawing a fake browser around the page — which would put the
 * surface back inside a rectangle on someone else's page, the exact framing
 * this redesign exists to escape. */
function MockToolbar({
  state,
  onSelectState,
  page,
  onSelectPage,
  hostname,
}: {
  state: FeedState;
  onSelectState: (state: FeedState) => void;
  page: FeedPage;
  onSelectPage: (page: FeedPage) => void;
  hostname: string;
}) {
  return (
    <div className="mock-toolbar">
      <span className="mock-toolbar-badge">
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        Mock
      </span>

      <span className="mock-toolbar-host">
        <Lock className="h-3 w-3 flex-none" aria-hidden="true" />
        {hostname}
      </span>

      <div className="mock-switch ml-auto">
        <button
          type="button"
          data-active={page === 'feed'}
          onClick={() => onSelectPage('feed')}
        >
          Feed
        </button>
        <button
          type="button"
          data-active={page === 'calendar'}
          onClick={() => onSelectPage('calendar')}
        >
          Calendar
        </button>
      </div>

      {/* The empty state only means anything on the feed; the calendar has its
          own and is not wired to this switch. */}
      <div className="mock-switch">
        <button
          type="button"
          data-active={state === 'populated'}
          onClick={() => onSelectState('populated')}
        >
          Active feed
        </button>
        <button
          type="button"
          data-active={state === 'empty'}
          onClick={() => onSelectState('empty')}
        >
          New Pana
        </button>
      </div>

      <Link href="/mock/panaverse" className="mock-toolbar-link">
        Panaverse chrome
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}

/* A filter with no posts behind it. Distinct from the new-account empty state:
   nothing is wrong here and there is nothing to set up, so it stays small and
   points back at the tab that always has something in it. */
function FilterEmpty({ label }: { label: string }) {
  return (
    <div className="reserved-slot items-start p-6">
      <p className="reserved-slot-title">Nothing under {label} right now</p>
      <p className="text-pana-ink/65 text-[13px] leading-snug font-medium">
        This filter is narrower than your whole feed, so it empties out first.
        Everyone always has something in it.
      </p>
    </div>
  );
}
