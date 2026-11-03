'use client';

import { useState } from 'react';
import Image from 'next/image';
import {
  LayoutList,
  Lock,
  Map as MapIcon,
  Plus,
  Sparkles,
  Users,
} from 'lucide-react';
import { SkyClouds } from '@/components/home/scene-art';
import { ScopeField } from './scope-field';
import { MapPane } from './map-pane';
import {
  ListingCard,
  EventCard,
  ExploreEmpty,
  GroupCard,
  PanaCard,
} from './cards';
import {
  ExploreBand,
  ExploreTail,
  FacetRail,
  ResultSummary,
} from './explore-chrome';
import {
  LISTINGS,
  EVENTS,
  GROUPS,
  PANAS,
  SCOPE_COUNTS,
  SCOPE_PLACEHOLDER,
  SCOPE_TONE,
  type ExploreScope,
  type MockEvent,
} from '../_data';

/**
 * The views.
 *
 * Five pages and one gate, all driven by the same `ScopeField` state so the
 * switcher reads as one journey rather than six screenshots: pick a scope on
 * the homepage, land on the page that scope owns.
 */

/** Everything each view needs from the harness. */
export interface ViewProps {
  scope: ExploreScope;
  onScope: (next: ExploreScope) => void;
  term: string;
  onTerm: (next: string) => void;
  open: boolean;
  onOpen: (next: boolean) => void;
  signedIn: boolean;
  /** Renders the no-results state instead of the list. */
  empty: boolean;
}

/* --- 1. Home ------------------------------------------------------------- */

/**
 * The homepage hero, with the scope control moved into the search pill.
 *
 * This is the whole proposal in one screen. Today the hero ships a plain
 * `DirectorySuggest` with `scope="all"`, and the comment next to it explains
 * why with unusual candour: the placeholder "says 'Search panas, businesses,
 * groups, events' … while Enter used to land in the businesses-only scope — so
 * three of the four kinds it names were advertised and then dropped on
 * submit." The fix at the time was to widen Enter to Everything and let the
 * scope chips on the results page sort it out afterwards.
 *
 * That trade is what the panas pushed back on. It moves the choice *after* the
 * search, which means every query is run against the wrong corpus once before
 * it is run against the right one, and the control that fixes it lives on a
 * page you have to reach first. Moving the scope into the pill puts the choice
 * where the question is asked, and costs the hero nothing it was using: the
 * placeholder's four-noun list existed only to stand in for the control that
 * is now sitting an inch to its left.
 *
 * Open the menu from the switcher to see the second half of this view — the
 * four destinations, named, before anyone presses Enter.
 */
export function HomeView(props: ViewProps) {
  return (
    <section className="home-hero-banner home-hero-field">
      <SkyClouds />
      <div className="home-hero-grain" aria-hidden="true" />

      <div className="relative z-10 container mx-auto px-4">
        <Image
          src="/logos/pana_logo_long_orange.png"
          alt="Pana Mia"
          width={600}
          height={150}
          className="flower-power-logo mx-auto mb-8 h-auto w-full max-w-[min(26rem,70vw)] md:mb-10"
          priority
        />

        <h1 className="hero-headline">
          The Future
          <br />
          Is <em className="accent-word">Local</em>
        </h1>

        <div className="mx-auto mt-4 max-w-[760px]">
          <p className="hero-subheadline">
            <strong>Your Portal for Everything South Florida</strong>
          </p>

          <div className="mt-[18px]">
            <ScopeField
              {...props}
              idPrefix="home"
              placeholder={SCOPE_PLACEHOLDER[props.scope]}
            />
          </div>

          {/* The rotating short label on narrow screens cycled "Local
              business / Local panas / Local groups / Local events" — four
              words doing the job of a control because there was no control.
              With a scope button in the pill the rotation is noise competing
              with it, so the narrow-screen placeholder becomes the scope's own
              short form instead. */}
          <p className="mt-3 text-center text-[0.8125rem] font-semibold opacity-55">
            Searching{' '}
            <strong style={{ color: 'var(--story-coral)' }}>
              {props.scope === 'directory'
                ? 'the directory'
                : props.scope === 'event'
                  ? 'events'
                  : props.scope === 'group'
                    ? 'groups'
                    : 'panas'}
            </strong>{' '}
            · change it in the box above
          </p>
        </div>
      </div>
    </section>
  );
}

/* --- 2. Directory (listings only) ---------------------------------------- */

/**
 * `/directory/search`, after the other three kinds leave.
 *
 * Almost a screenshot of today's page, which is the argument. The band, the
 * rail, the cards and the map are untouched; the scope chip row that used to
 * sit directly under the band is gone, and nothing moved up to replace it.
 * The directory does not need redesigning to stop being four products — it
 * needs the three it was never shaped for to go somewhere else.
 *
 * What the removal buys is the row the rail could never afford: a fourth
 * facet where the scope chips were. Here that is Sort, pulled out of the
 * overflow menu it currently hides in.
 *
 * The two panes
 * -------------
 * This view used to be a single column with a List/Map toggle floating above
 * it and no map anywhere — which was wrong, and wrong in a way a mock cannot
 * afford, because it put a dead control on the one page the mock exists to
 * argue about. The live directory is `.dirsearch-split`: results left, map
 * right, both pinned to the viewport with only the column scrolling, and the
 * toggle hidden by CSS because there is nothing left to toggle.
 *
 * The toggle is still rendered, exactly as live renders it, because below
 * 72rem the two panes genuinely cannot share a phone and it is how you get
 * between them. `data-view` is inert above that width.
 */
export function DirectoryView(props: ViewProps) {
  // Which pane owns a narrow screen. Inert above 72rem, where both show.
  const [view, setView] = useState<'list' | 'map'>('map');

  // Hovering a card lights its pin and vice versa. The reason the panes are
  // worth pinning side by side is that each one answers what the other cannot
  // — but only if it is obvious which row is which pin.
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const facets = (
    <FacetRail
      inPane
      rows={[
        {
          label: 'Category',
          chips: ['All', 'Food', 'Products', 'Services', 'Art', 'Venues'],
          active: 0,
        },
        {
          label: 'Where',
          chips: [
            'All of South Florida',
            'Miami-Dade',
            'Broward',
            'Palm Beach',
          ],
          active: 0,
        },
        {
          label: 'Sort',
          chips: ['Closest', 'Most recommended', 'Newest'],
          active: 0,
        },
      ]}
      trailing={
        /* Hidden above 72rem by `.dirsearch-split .dirsearch-viewtoggle`.
           Kept in the tree so the narrow case is reviewable. */
        <span className="dirsearch-viewtoggle ml-auto">
          <button
            type="button"
            data-on={view === 'list'}
            aria-pressed={view === 'list'}
            onClick={() => setView('list')}
          >
            <LayoutList className="h-4 w-4" aria-hidden="true" />
            List
          </button>
          <button
            type="button"
            data-on={view === 'map'}
            aria-pressed={view === 'map'}
            onClick={() => setView('map')}
          >
            <MapIcon className="h-4 w-4" aria-hidden="true" />
            Map
          </button>
        </span>
      }
    />
  );

  return (
    <main
      className="dirsearch dirsearch-split"
      data-view={view}
      data-tone={SCOPE_TONE.directory}
    >
      <ExploreBand
        scope="directory"
        eyebrow="The directory"
        accent="Local"
        title="listings"
        count={
          <>
            <strong>{SCOPE_COUNTS.directory}</strong> listings in Miami-Dade,
            Broward and Palm Beach
          </>
        }
        field={
          <ScopeField
            {...props}
            idPrefix="dir"
            placeholder={SCOPE_PLACEHOLDER.directory}
          />
        }
      />

      <div className="dirsearch-panes">
        <section className="dirsearch-listpane" aria-label="Search results">
          {/* Outside the scroller deliberately — the controls that change the
              results are the ones you reach for after reading a few, and a
              header you have to scroll back up to find gets used once. */}
          <div className="dirsearch-listhead">{facets}</div>

          <div className="dirsearch-listscroll">
            <div className="dirsearch-listbody">
              {props.empty ? (
                <div className="py-10">
                  <ExploreEmpty
                    accent="No listings"
                    title="match that in Broward"
                    lede="The directory is listings only now, so a search for a meetup or a person will land here empty. The chip in the search box is how you send it somewhere that can answer."
                    primary="Search all of South Florida"
                    secondary="Look for events instead"
                    suggestions={[
                      'Food',
                      'Products',
                      'Services',
                      'Art',
                      'Venues',
                    ]}
                  />
                </div>
              ) : (
                <>
                  <ResultSummary>
                    Showing <strong>{LISTINGS.length}</strong> of{' '}
                    {SCOPE_COUNTS.directory} listings
                  </ResultSummary>

                  <div className="dirsearch-grid pt-4 pb-10">
                    {LISTINGS.map((listing) => (
                      <div
                        key={listing.id}
                        onMouseEnter={() => setSelectedId(listing.id)}
                        onFocus={() => setSelectedId(listing.id)}
                      >
                        <ListingCard listing={listing} />
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </section>

        {/* Always mounted. Below the breakpoint the CSS collapses this to
            nothing unless the toggle asks for it, which is cheaper than
            unmounting and re-framing a map every time the toggle is used. */}
        <aside className="dirsearch-mappane" aria-label="Results on a map">
          <MapPane selectedId={selectedId} onSelect={setSelectedId} />
        </aside>
      </div>
    </main>
  );
}

/* --- 3. Events ----------------------------------------------------------- */

/**
 * `/explore/events`.
 *
 * Grouped by day, sorted by time, and that is the whole reason it cannot live
 * in the directory. A directory list is ranked by relevance and is stable:
 * ask the same question next week and you get the same answer. An events list
 * is ranked by *when* and decays — half of what it shows today is gone by
 * Monday. Those two sorts cannot share a page, because the one thing a
 * relevance sort must not do is put a worse match first for being sooner.
 *
 * The day headings are the visible form of that. Nobody browsing events wants
 * a ranked list of twelve; they want to know what Saturday looks like.
 */
export function EventsView(props: ViewProps) {
  const days = groupByDay(EVENTS);

  return (
    <main className="dirsearch" data-tone={SCOPE_TONE.event}>
      <ExploreBand
        scope="event"
        eyebrow="Explore events"
        accent="What's on"
        title="this week"
        count={
          <>
            <strong>{EVENTS.length}</strong> events across the next seven days
          </>
        }
        field={
          <ScopeField
            {...props}
            idPrefix="events"
            placeholder={SCOPE_PLACEHOLDER.event}
          />
        }
      />

      {/* Facets the directory could never offer, because three of these four
          are questions only an event can answer. "This weekend" is meaningless
          against a storefront.

          "When" leads with the next 7 days because that is what the page says
          it is showing up top. Every rail leads with its own neutral option so
          that a tinted control always means "the visitor narrowed this". */}
      <FacetRail
        rows={[
          {
            label: 'When',
            chips: ['Next 7 days', 'Today', 'This weekend', 'This month'],
            active: 0,
          },
          {
            label: 'Where',
            chips: [
              'All of South Florida',
              'Miami-Dade',
              'Broward',
              'Palm Beach',
              'Online',
            ],
            active: 0,
          },
          {
            label: 'Type',
            chips: ['All', 'Market', 'Workshop', 'Show', 'Meetup'],
            active: 0,
          },
          {
            label: 'Price',
            chips: ['Any', 'Free', 'Under $20'],
            active: 0,
          },
        ]}
      />

      {props.empty ? (
        <div className="container mx-auto px-4 py-10">
          <ExploreEmpty
            accent="Nothing"
            title="on in Palm Beach this weekend"
            lede="Three counties is a wide net and a weekend is a narrow one. Widen either and there is usually something."
            primary="Look at the next 7 days"
            secondary="Search all counties"
            suggestions={['Markets', 'Workshops', 'Free events', 'Online']}
          />
        </div>
      ) : (
        <>
          <ResultSummary>
            <strong>{EVENTS.length}</strong> events · soonest first
          </ResultSummary>

          <div className="container mx-auto px-4 pt-5 pb-10">
            <div className="dirsearch-grid">
              {days.map(([isoDate, list]) => (
                <section key={isoDate} className="flex flex-col gap-4">
                  {/* The date rail. Sticky so the day someone is reading stays
                      named while they scroll past four events inside it. */}
                  <header className="sticky top-2 z-10 flex items-center gap-3">
                    <span
                      className="surface-pill shrink-0"
                      data-tone={SCOPE_TONE.event}
                    >
                      <span className="surface-dot" aria-hidden="true" />
                      <span className="surface-pill-name">
                        {list[0].day} {list[0].month}
                      </span>
                    </span>
                    <h2 className="text-[0.9375rem] font-black tracking-tight">
                      {list[0].dayLabel}
                    </h2>
                    <span className="text-[0.8125rem] font-bold opacity-50">
                      {list.length} {list.length === 1 ? 'event' : 'events'}
                    </span>
                  </header>

                  {list.map((event) => (
                    <EventCard key={event.id} event={event} />
                  ))}
                </section>
              ))}
            </div>
          </div>
        </>
      )}

      <ExploreTail
        scope="event"
        title="Putting something on?"
        lede="Any pana can list an event. It shows up here, on your profile, and on the directory page it belongs to."
        action="Host an event"
        secondary="See the event guidelines"
      />
    </main>
  );
}

/* --- 4. Groups ----------------------------------------------------------- */

/**
 * `/explore/groups`.
 *
 * Two changes from today worth arguing in review.
 *
 * First, groups become **public**. `SCOPE_REQUIRES_PANA` currently gates them
 * alongside panas, which means a group is invisible to exactly the people it
 * needs to recruit — you have to already be a member of the club to discover
 * the thing that would make you want to join it. Panas stay gated because a
 * member list is personal data; a group is a public notice board with a door
 * on it, and the door is `joinPolicy`, not the search index.
 *
 * Faces show either way; names never do. A signed-out visitor sees every
 * group, how many people are in it, and the crowd itself — but nothing that
 * turns an avatar into someone they can look up, because the faces carry no
 * names, no links and no alt text. The roster reads as a crowd rather than a
 * list, which recruits without publishing a walkable member directory. This is
 * the same rule the listing and event cards already followed; see `GroupCard`.
 *
 * What does stay behind sign-in is viewer state: the shelf below and the
 * "You're in" badge both answer "where do I already belong", and a signed-out
 * visitor has no answer to that yet.
 *
 * Second, the member's own groups get a shelf above the results. A group page
 * is somewhere you return to, unlike a directory listing, and burying "the
 * four I'm already in" under a search box treats a regular visit as a fresh
 * discovery every time. Signed out there is no such shelf, because there are
 * no groups of yours to put on it — the page is then a flat list of everything.
 */
export function GroupsView(props: ViewProps) {
  // Only a signed-in viewer has groups of their own, so the shelf/rest split
  // collapses to a single list for everyone else.
  const mine = props.signedIn ? GROUPS.filter((group) => group.joined) : [];
  const rest = props.signedIn
    ? GROUPS.filter((group) => !group.joined)
    : GROUPS;

  return (
    <main className="dirsearch" data-tone={SCOPE_TONE.group}>
      <ExploreBand
        scope="group"
        eyebrow="Explore groups"
        accent="Find"
        title="your people"
        count={
          <>
            <strong>{GROUPS.length}</strong> groups meeting across South Florida
          </>
        }
        field={
          <ScopeField
            {...props}
            idPrefix="groups"
            placeholder={SCOPE_PLACEHOLDER.group}
          />
        }
      />

      <FacetRail
        rows={[
          {
            label: 'Topic',
            chips: [
              'All',
              'Making',
              'Business',
              'Food',
              'Outdoors',
              'Mutual aid',
            ],
            active: 0,
          },
          {
            label: 'Where',
            chips: [
              'All of South Florida',
              'Miami-Dade',
              'Broward',
              'Palm Beach',
            ],
            active: 0,
          },
          {
            label: 'Meets',
            chips: ['Any', 'In person', 'Online', 'Hybrid'],
            active: 0,
          },
          {
            label: 'Joining',
            chips: ['Any', 'Open to all', 'By request'],
            active: 0,
          },
        ]}
      />

      {props.empty ? (
        <div className="container mx-auto px-4 py-10">
          <ExploreEmpty
            accent="No groups"
            title="match that yet"
            lede="Groups are the thinnest part of the club right now. If the one you want does not exist, you are probably the person to start it."
            primary="Start a group"
            secondary="Clear the filters"
            suggestions={['Making', 'Food', 'Mutual aid', 'Online']}
          />
        </div>
      ) : (
        <>
          {mine.length > 0 && (
            <div className="container mx-auto px-4 pt-7">
              <div className="dirsearch-grid">
                <h2 className="flex items-center gap-2 text-[0.9375rem] font-black tracking-tight">
                  <Users
                    className="h-4 w-4"
                    style={{ color: 'var(--surface-tone)' }}
                    aria-hidden="true"
                  />
                  Your groups
                </h2>
                {mine.map((group) => (
                  <GroupCard
                    key={group.id}
                    group={group}
                    signedIn={props.signedIn}
                  />
                ))}
              </div>
            </div>
          )}

          <ResultSummary>
            <strong>{rest.length}</strong>
            {props.signedIn ? ' more groups' : ' groups'} · most active first
          </ResultSummary>

          <div className="container mx-auto px-4 pt-5 pb-10">
            <div className="dirsearch-grid">
              {rest.map((group) => (
                <GroupCard
                  key={group.id}
                  group={group}
                  signedIn={props.signedIn}
                />
              ))}
            </div>
          </div>
        </>
      )}

      <ExploreTail
        scope="group"
        title="Start one"
        lede="A group needs a name, a rhythm and one person willing to show up first. The club handles the rest."
        action="Start a group"
        secondary="How groups work"
      />
    </main>
  );
}

/* --- 5. Panas ------------------------------------------------------------ */

/**
 * `/explore/panas`, for signed-in members.
 *
 * The only one of the four that stays gated, and the gate is the reason this
 * cannot be a directory scope: a page that 404s or bounces half its visitors
 * does not belong behind a control that looks identical to the three that do
 * not. Making it its own route means the gate is a property of the route,
 * which is both easier to reason about and easier to get right.
 *
 * The cards go two-up rather than one-up. A pana is three facts and a face;
 * a full-width row of that is mostly whitespace.
 */
export function PanasView(props: ViewProps) {
  if (!props.signedIn) return <PanasGateView {...props} />;

  return (
    <main className="dirsearch" data-tone={SCOPE_TONE.pana}>
      <ExploreBand
        scope="pana"
        eyebrow="Explore panas"
        accent="The"
        title="members"
        count={
          <>
            <strong>{PANAS.length}</strong> panas · visible to members only
          </>
        }
        field={
          <ScopeField
            {...props}
            idPrefix="panas"
            placeholder={SCOPE_PLACEHOLDER.pana}
          />
        }
      />

      <FacetRail
        rows={[
          {
            label: 'Craft',
            chips: ['All', 'Ceramics', 'Print', 'Food', 'Business', 'Teaching'],
            active: 0,
          },
          {
            label: 'Where',
            chips: [
              'All of South Florida',
              'Miami-Dade',
              'Broward',
              'Palm Beach',
            ],
            active: 0,
          },
          {
            label: 'Sort',
            chips: ['Panas in common', 'Recently active', 'Newest members'],
            active: 0,
          },
        ]}
      />

      {props.empty ? (
        <div className="container mx-auto px-4 py-10">
          <ExploreEmpty
            accent="No panas"
            title="match that yet"
            lede="Members opt into being findable, so this searches a smaller pool than the directory does. A craft or a neighbourhood usually works better than a name."
            primary="Clear the filters"
            secondary="Browse groups instead"
            suggestions={['Ceramics', 'Print', 'Food', 'Teaching']}
          />
        </div>
      ) : (
        <>
          <ResultSummary>
            <strong>{PANAS.length}</strong> panas · most connections in common
            first
          </ResultSummary>

          <div className="container mx-auto px-4 pt-5 pb-16">
            <div className="mx-auto grid max-w-[58rem] gap-4 sm:grid-cols-2">
              {PANAS.map((pana) => (
                <PanaCard key={pana.id} pana={pana} />
              ))}
            </div>
          </div>
        </>
      )}
    </main>
  );
}

/**
 * What a signed-out visitor gets at `/explore/panas`.
 *
 * Modelled on `GatedScope` in `app/directory/_components/scope-page.tsx`, with
 * one difference: because this is now a route rather than a scope, the gate can
 * say what is behind it and offer the two public pages as a consolation. The
 * live version can only tell you to sign in, because the page it is standing
 * in front of might have been any of four things.
 */
export function PanasGateView(props: ViewProps) {
  return (
    <main className="dirsearch" data-tone={SCOPE_TONE.pana}>
      <ExploreBand
        scope="pana"
        eyebrow="Explore panas"
        accent="The"
        title="members"
        count="Members only — sign in to search panas"
        field={
          <ScopeField
            {...props}
            idPrefix="gate"
            placeholder={SCOPE_PLACEHOLDER.pana}
          />
        }
      />

      <div className="container mx-auto px-4 py-12">
        <div className="dirsearch-empty">
          <Lock aria-hidden="true" />
          <p className="dirsearch-empty-title">
            <em>Panas</em> are for panas
          </p>
          <p className="dirsearch-empty-lede">
            Member profiles are not public. Join the club — it is free — and you
            can search {PANAS.length} panas by craft, neighbourhood and who you
            already have in common.
          </p>
          <div className="dirsearch-empty-actions">
            <button type="button" className="dirsearch-empty-primary">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Join the club
            </button>
            <span className="dirsearch-empty-or">or</span>
            <button type="button" className="dirsearch-empty-secondary">
              Sign in
            </button>
          </div>

          {/* The two public pages, offered by name. A gate that only says no
              sends the visitor back to the homepage to guess again. */}
          <div className="dirsearch-empty-cats">
            <button type="button">
              <Plus className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
              Browse the directory
            </button>
            <button type="button">
              <Plus className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
              Browse events
            </button>
            <button type="button">
              <Plus className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
              Browse groups
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

/* --- helpers ------------------------------------------------------------- */

/**
 * Events bucketed by day, in order.
 *
 * Derived rather than typed, per the mock README: a hand-written grouping
 * could show a heading the list below it does not match, which is the one way
 * a mock can mislead a review about the thing it is there to prove.
 */
function groupByDay(events: MockEvent[]): [string, MockEvent[]][] {
  const byDay = new Map<string, MockEvent[]>();
  for (const event of events) {
    const bucket = byDay.get(event.isoDate);
    if (bucket) bucket.push(event);
    else byDay.set(event.isoDate, [event]);
  }
  return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
}
