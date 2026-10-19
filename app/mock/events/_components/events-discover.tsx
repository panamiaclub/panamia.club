'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  CalendarPlus,
  Lock,
  RotateCcw,
  Sparkles,
  UserPlus,
} from 'lucide-react';
import { FilterMenu } from '@/components/ui/filter-menu';
import { BrowserFrame } from '../../_components/browser-frame';
import { SURFACE_LOGO } from '../../_data/panaverse';
import { AccountMenu } from './account-menu';
import {
  DiscoverChrome,
  type DayChip,
  type FacetCounts,
} from './discover-chrome';
import { EventCard, nameList } from './event-card';
import {
  MOCK_EVENTS,
  MOCK_HOST,
  MOCK_PATH,
  type EventCounty,
  type EventSort,
  type EventType,
  type MockEvent,
  type WhenBucket,
} from '../_data';
import { buildLanes, eventsInWindow, type Reason } from '../_reasons';

/** The nav a directory surface would carry. Not in
 *  `app/mock/_data/panaverse.ts`'s `SURFACE_NAV` because that map is keyed by
 *  surfaces that exist, and this one does not yet — adding it there would put
 *  a fictional surface into the file whose whole value is that it re-exports
 *  the real registry. */
const DIRECTORY_NAV = ['Browse', 'Events', 'Panas', 'Groups'];

/**
 * The masthead a promoted directory surface would fly.
 *
 * Local rather than `SurfaceMasthead` for one reason: that component takes its
 * surfaces from `lib/panaverse/surfaces.ts`, resolved on the server, and the
 * directory is not in that registry. Rather than inventing a fake entry and
 * feeding it to the shared component — which would make the shared component
 * lie about what ships — this draws the same `.panaverse-masthead` classes
 * directly. Same cream bar, same hairline, same indigo tone as the band below
 * it, with the account menu standing where the avatar does.
 *
 * Exported because `/mock/events/host` flies the same masthead. Two copies of
 * a surface's chrome inside one mock is how the host page and the page it
 * feeds start looking like different products.
 */
export function DirectoryMasthead({
  menuOpen,
  onToggleMenu,
  signedIn,
  onSignIn,
}: {
  menuOpen: boolean;
  onToggleMenu: () => void;
  signedIn: boolean;
  onSignIn: () => void;
}) {
  const logo = SURFACE_LOGO.www;

  return (
    <div className="panaverse-masthead" data-tone="indigo">
      <Image
        src={logo.src}
        alt={logo.alt}
        width={logo.width}
        height={logo.height}
        sizes="160px"
        className="panaverse-logo"
      />

      <nav className="panaverse-nav" aria-label="Directory navigation">
        {DIRECTORY_NAV.map((item) => (
          <a key={item} href="#" data-active={item === 'Events'}>
            {item}
          </a>
        ))}
      </nav>

      <div className="ml-auto flex flex-none items-center gap-2">
        {signedIn ? (
          <AccountMenu open={menuOpen} onToggle={onToggleMenu} />
        ) : (
          <button
            type="button"
            className="dirsearch-empty-primary text-[0.8125rem]"
            onClick={onSignIn}
          >
            Sign in
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * The one control.
 *
 * Phrased as the viewer's situation rather than the database's shape. "I'm
 * free" is a sentence somebody would say; "When" is a column name with a
 * chevron next to it. The difference is not decoration — a control that
 * completes a sentence tells you what answering it will do, where a bare facet
 * label leaves you to guess whether it widens or narrows what you are looking
 * at.
 *
 * There is exactly one, and that is the entire design argument of this page in
 * one component. The draft this replaced had five, which between them could
 * express roughly two thousand states, of which the viewer wanted one and had
 * no way to describe it. Availability is the single thing only the viewer
 * knows; everything else — what is good, who is going, what is like what they
 * already liked — the page can work out, and should, because that is what a
 * discover page is *for*. Asking the viewer to specify category, county and
 * sort order is asking them to do the recommending.
 */
const WHEN_SENTENCE: Record<WhenBucket | 'all', string> = {
  today: 'tonight',
  weekend: 'this weekend',
  month: 'later this month',
  all: 'any time',
};

/**
 * What the page took from a dismissal, said back.
 *
 * "Not for me" with no acknowledgement is a button that might do nothing, and
 * the viewer has no way to tell. Naming the inference does two jobs: it proves
 * the signal landed, and it exposes the reasoning for correction, because the
 * viewer who sees "fewer first-time hosts" and thinks *no, that is not it, I
 * just hate ceramics* has learned something about the page that no amount of
 * silent model-updating would have told them.
 */
function learned(reason: Reason): string {
  switch (reason.kind) {
    case 'follow-host':
      return `Fewer from ${reason.host}`;
    case 'panas-going':
      return 'Noted — who else is going matters less to you';
    case 'tag-match':
      return `Fewer ${nameList(reason.tags).toLowerCase()} events`;
    case 'new-host':
      return 'Fewer first-time hosts';
    case 'popular':
      return 'Fewer of the big ones';
  }
}

/**
 * /mock/events — the events discover page.
 *
 * The question is "what is on, near me, soon, that I would like", and the last
 * clause is the hard one. The first draft of this mock answered it with five
 * filter menus over a chronological list, which is a search results page: it
 * requires the viewer to already know the answer and merely narrow to it, and
 * it leaves anybody who arrived with "I don't know, surprise me" — which is
 * most people, most of the time — staring at controls.
 *
 * So the spine here is lanes, and every lane heading is a reason. The page
 * commits to a claim about why each event is in front of you, states it on the
 * card in checkable specifics, and gives you a control to say it got it wrong.
 * Four reasons, computed in `_reasons.ts` from columns that exist today:
 * hosts you follow, panas who have RSVPed, tags you have actually turned up
 * for, and hosts nobody has heard of yet.
 *
 * That last lane is the one worth defending. Every ranker reaches for
 * attendance first, and attendance is self-reinforcing — the big event is
 * shown because it is big, so it gets bigger. On a directory that exists for
 * small local makers that is not a neutral default, it is the product
 * backwards. So popularity appears exactly twice: inverted, as "new hosts,
 * small rooms", and at the very bottom under a heading admitting you would
 * have found those anyway.
 *
 * The calendar is kept, demoted to a second tab, because a discover page with
 * no "just show me everything" escape hatch is infuriating and people do
 * genuinely ask what is on Saturday. It is the old draft, intact, in the place
 * it earns rather than the place it was.
 *
 * Drawn inside a `BrowserFrame` rather than full bleed, which the README warns
 * makes a surface read as a picture of a website. That warning is about
 * `/mock/feed`, where the question was "does this feel like its own site".
 * Here the address bar *is* half the proposal — the mock was drawn when Events
 * was going to be `events.panamia.club`, and shipped as `panamia.club/e` instead,
 * so the bar is the part of the picture that changed.
 */
export function EventsDiscover() {
  const [tab, setTab] = useState<'foryou' | 'calendar'>('foryou');
  const [when, setWhen] = useState<WhenBucket | 'all'>('all');
  const [day, setDay] = useState<string | null>(null);
  const [types, setTypes] = useState<EventType[]>([]);
  const [counties, setCounties] = useState<EventCounty[]>([]);
  const [sort, setSort] = useState<EventSort>('soonest');
  const [going, setGoing] = useState<string[]>([]);
  const [dismissed, setDismissed] = useState<
    { event: MockEvent; reason: Reason }[]
  >([]);
  const [signedIn, setSignedIn] = useState(true);
  const [menuOpen, setMenuOpen] = useState(true);

  /* The pool the lanes are built from. `when` is shared with the calendar tab
     on purpose: narrowing to the weekend here and then switching tabs should
     not throw the answer away, because the viewer's availability did not
     change when they changed how they were looking. */
  const pool = useMemo(
    () =>
      eventsInWindow(when).filter(
        (event) => !dismissed.some((d) => d.event.id === event.id)
      ),
    [when, dismissed]
  );

  const { lanes, leftovers } = useMemo(
    () => buildLanes(pool, { signedIn }),
    [pool, signedIn]
  );

  const lastDismissed = dismissed[dismissed.length - 1] ?? null;

  /* Every number on the page is counted off the fixtures. The README's rule,
     and the reason the summary line and the day chips cannot disagree. */
  const days: DayChip[] = useMemo(() => {
    const order: string[] = [];
    const counts = new Map<string, number>();
    for (const event of MOCK_EVENTS) {
      if (!counts.has(event.day)) order.push(event.day);
      counts.set(event.day, (counts.get(event.day) ?? 0) + 1);
    }
    return order.map((d) => ({ day: d, count: counts.get(d) ?? 0 }));
  }, []);

  /* One count per facet option, so each menu row can say what it would return
     before it is clicked. Counted off the fixtures rather than typed, and
     deliberately counted against the *unfiltered* set: a count that moved as
     you filtered would make an option read as empty when it is merely empty
     in combination, which is the thing it exists to warn you about. */
  const counts: FacetCounts = useMemo(() => {
    const whenCounts: Record<string, number> = { all: MOCK_EVENTS.length };
    const type: Record<string, number> = {};
    const county: Record<string, number> = {};
    for (const event of MOCK_EVENTS) {
      whenCounts[event.bucket] = (whenCounts[event.bucket] ?? 0) + 1;
      type[event.type] = (type[event.type] ?? 0) + 1;
      county[event.county] = (county[event.county] ?? 0) + 1;
    }
    return { when: whenCounts, type, county };
  }, []);

  const shown = useMemo(() => {
    const matched = MOCK_EVENTS.filter((event) => {
      if (day !== null) {
        if (event.day !== day) return false;
      } else if (when !== 'all' && event.bucket !== when) {
        return false;
      }
      if (types.length > 0 && !types.includes(event.type)) return false;
      if (counties.length > 0 && !counties.includes(event.county)) return false;
      return true;
    });

    /* Soonest is the fixture order, which `_data.ts` keeps chronological.
       Sorting by anything else is a copy, because MOCK_EVENTS is module state
       shared with the lanes above. */
    return sort === 'going'
      ? [...matched].sort((a, b) => b.going - a.going)
      : matched;
  }, [when, day, types, counties, sort]);

  /* Grouped by day rather than listed flat. It only holds while the list is
     chronological: ranked by how many people are going, the days interleave
     and the same walk would emit a heading per card, which is not a grouping.
     So that sort renders one flat list and the headings go away with the order
     that earned them. */
  const grouped = sort === 'soonest';

  const groups = useMemo(() => {
    if (!grouped) return [];
    const out: { day: string; bucket: WhenBucket; events: MockEvent[] }[] = [];
    for (const event of shown) {
      const last = out[out.length - 1];
      if (last && last.day === event.day) last.events.push(event);
      else out.push({ day: event.day, bucket: event.bucket, events: [event] });
    }
    return out;
  }, [shown, grouped]);

  const toggleGoing = (id: string) =>
    setGoing((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    );

  const clearFilters = () => {
    setWhen('all');
    setDay(null);
    setTypes([]);
    setCounties([]);
  };

  const laneCount = lanes.reduce((n, lane) => n + lane.events.length, 0);

  return (
    <>
      <div className="mock-toolbar">
        <span className="mock-toolbar-badge">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          Mock
        </span>

        <span className="mock-toolbar-host">
          <Lock className="h-3 w-3 flex-none" aria-hidden="true" />
          {MOCK_HOST}
          {MOCK_PATH}
        </span>

        {/* Signed out is not a smaller version of signed in. Three of the four
            reasons this page can give are joins against the viewer, so without
            an account they are not zero — they are unknowable, and the page has
            to be a different page rather than this one with gaps in it. */}
        <div className="mock-switch ml-auto">
          <button
            type="button"
            data-active={signedIn}
            onClick={() => setSignedIn(true)}
          >
            Signed in
          </button>
          <button
            type="button"
            data-active={!signedIn}
            onClick={() => {
              setSignedIn(false);
              setMenuOpen(false);
            }}
          >
            Signed out
          </button>
        </div>

        <Link href="/mock/directory-unified" className="mock-toolbar-link">
          Directory cards
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      <BrowserFrame hostname={MOCK_HOST} path={MOCK_PATH}>
        <DirectoryMasthead
          menuOpen={menuOpen}
          onToggleMenu={() => setMenuOpen((open) => !open)}
          signedIn={signedIn}
          onSignIn={() => {
            setSignedIn(true);
            setMenuOpen(true);
          }}
        />

        {/* `.dirscope` is load-bearing, not decoration: the --story-* palette
            is scoped to `body:has(.dirsearch), body:has(.dirscope)` in
            globals.css, so a page carrying neither renders on a transparent
            background with nothing in the console to say why. */}
        <main className="dirscope">
          <div className="dirsearch-band">
            <div className="container mx-auto px-4">
              <div className="mx-auto max-w-[58rem]">
                <span className="section-eyebrow">Events</span>

                {/* The whole control surface of the discovery tab: one
                    sentence with one blank in it. The menu trigger always
                    prints its own label before its value, so the label is
                    "I'm free" rather than the axis name — the control reads
                    "I'm free · this weekend", a phrase about the viewer's
                    situation rather than a column in the events table.

                    Only on the discovery tab. The calendar tab carries its own
                    When menu in DiscoverChrome, and two controls over one axis
                    is the bug where the page contradicts itself: a second
                    trigger naming the same state can only ever agree
                    redundantly or disagree confusingly. */}
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                  <h1 className="text-pana-ink text-[1.75rem] leading-tight font-black tracking-[-0.02em]">
                    What&rsquo;s on
                  </h1>
                  {tab === 'foryou' && (
                    <div className="dirsearch-menurow !m-0 !p-0">
                      <FilterMenu
                        label="I’m free"
                        single
                        defaultValue="all"
                        selected={[when]}
                        onChange={(next) => {
                          setWhen((next[0] ?? 'all') as WhenBucket | 'all');
                          setDay(null);
                        }}
                        caption="The only thing this page cannot work out for itself."
                        options={[
                          {
                            value: 'today',
                            label: 'tonight',
                            hint: `${counts.when.today ?? 0} on`,
                          },
                          {
                            value: 'weekend',
                            label: 'this weekend',
                            hint: `${counts.when.weekend ?? 0} on`,
                          },
                          {
                            value: 'month',
                            label: 'later this month',
                            hint: `${counts.when.month ?? 0} on`,
                          },
                          {
                            value: 'all',
                            label: 'any time',
                            hint: `${MOCK_EVENTS.length} on`,
                          },
                        ]}
                      />
                    </div>
                  )}
                </div>

                <p className="text-pana-ink/60 mt-2 text-[0.9375rem] font-semibold">
                  {tab === 'foryou' ? (
                    lanes.length > 0 ? (
                      <>
                        {laneCount} picked for you out of {pool.length}
                        {when === 'all' ? '' : ` ${WHEN_SENTENCE[when]}`} — each
                        one says why.
                      </>
                    ) : (
                      <>
                        {pool.length}
                        {when === 'all' ? '' : ` ${WHEN_SENTENCE[when]}`}. Too
                        few to find a pattern in, so here is all of it.
                      </>
                    )
                  ) : (
                    <>
                      {shown.length} of {MOCK_EVENTS.length} events, filtered
                      the way you asked.
                    </>
                  )}
                </p>

                {/* The calendar is a tab rather than the page. Demoting it is
                    the point; deleting it would be a different mistake, since
                    "just show me everything on Saturday" is a real thing
                    people want and a discover page that refuses it is a
                    discover page people route around. */}
                <div
                  className="border-pana-ink/10 mt-5 inline-flex gap-1 rounded-full border p-1"
                  role="tablist"
                  aria-label="How to browse"
                >
                  {(
                    [
                      ['foryou', 'For you'],
                      ['calendar', 'The whole calendar'],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={tab === key}
                      onClick={() => setTab(key)}
                      className={`rounded-full px-4 py-1.5 text-[0.875rem] font-black transition-colors ${
                        tab === key
                          ? 'bg-pana-ink text-pana-cream'
                          : 'text-pana-ink/60 hover:text-pana-ink'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="container mx-auto px-4 pb-16">
            {tab === 'foryou' ? (
              <>
                {/* Undo rather than a confirmation. A dismissal that cannot be
                    taken back makes the control risky to try, and a control
                    people are afraid of collects no signal at all. */}
                {lastDismissed && (
                  <div className="border-pana-ink/15 bg-pana-butter-2 mx-auto mt-8 flex max-w-[58rem] flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border px-4 py-3">
                    <span className="text-pana-ink text-[0.875rem] font-black">
                      Hidden &ldquo;{lastDismissed.event.title}&rdquo;
                    </span>
                    <span className="text-pana-ink/60 text-[0.875rem] font-semibold">
                      {learned(lastDismissed.reason)}
                    </span>
                    <button
                      type="button"
                      className="text-pana-indigo ml-auto inline-flex items-center gap-1.5 text-[0.875rem] font-black underline-offset-4 hover:underline"
                      onClick={() => setDismissed((d) => d.slice(0, -1))}
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                      Undo
                    </button>
                  </div>
                )}

                {/* Signed out, the page says which reasons it cannot compute
                    and why, instead of showing four empty shelves. */}
                {!signedIn && (
                  <section className="border-pana-ink/15 mx-auto mt-8 max-w-[58rem] rounded-2xl border border-dashed px-5 py-5">
                    <h2 className="text-pana-ink text-[1.0625rem] font-black">
                      Three of the four reasons need to know who you are
                    </h2>
                    <p className="text-pana-ink/65 mt-1.5 text-[0.9375rem] font-semibold">
                      Hosts you follow, panas who are going and events like ones
                      you have been to are all joins against your account. They
                      are not empty right now — they are unanswerable. What is
                      below is everything that can be worked out about a
                      stranger.
                    </p>
                    <div className="dirsearch-empty-actions justify-start">
                      <button
                        type="button"
                        className="dirsearch-empty-primary inline-flex items-center gap-2"
                        onClick={() => {
                          setSignedIn(true);
                          setMenuOpen(true);
                        }}
                      >
                        <UserPlus className="h-4 w-4" aria-hidden="true" />
                        Sign in
                      </button>
                    </div>
                  </section>
                )}

                {pool.length === 0 ? (
                  <div className="dirsearch-empty">
                    <CalendarPlus className="h-12 w-12" aria-hidden="true" />
                    <h2 className="dirsearch-empty-title">
                      Nothing left <em>in this window</em>
                    </h2>
                    <p className="dirsearch-empty-lede">
                      You have hidden everything in this window. Widen the
                      window, or put some back.
                    </p>
                    <div className="dirsearch-empty-actions">
                      <button
                        type="button"
                        className="dirsearch-empty-primary"
                        onClick={() => setWhen('all')}
                      >
                        Any time
                      </button>
                      <button
                        type="button"
                        className="dirsearch-empty-secondary"
                        onClick={() => setDismissed([])}
                      >
                        Put them all back
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {lanes.map((lane) => (
                      <section key={lane.id} className="pt-10">
                        <div className="mx-auto mb-4 max-w-[58rem]">
                          <h2 className="text-pana-ink text-[1.375rem] font-black tracking-[-0.015em]">
                            {lane.title}
                          </h2>
                          <p className="text-pana-ink/55 mt-1 text-[0.875rem] font-semibold">
                            {lane.note}
                          </p>
                        </div>

                        <ul className="dirsearch-grid">
                          {lane.events.map(({ event, reason }) => (
                            <li key={event.id}>
                              <EventCard
                                event={event}
                                going={going.includes(event.id)}
                                onToggleGoing={toggleGoing}
                                reason={reason}
                                onDismiss={(e, r) =>
                                  setDismissed((d) => [
                                    ...d,
                                    { event: e, reason: r },
                                  ])
                                }
                              />
                            </li>
                          ))}
                        </ul>
                      </section>
                    ))}

                    {leftovers.length > 0 && (
                      <section className="pt-10">
                        <div className="border-pana-ink/10 mx-auto mb-4 max-w-[58rem] border-t pt-8">
                          <h2 className="text-pana-ink text-[1.375rem] font-black tracking-[-0.015em]">
                            {lanes.length > 0
                              ? 'You would have found these anyway'
                              : when === 'all'
                                ? 'Everything coming up'
                                : `Everything ${WHEN_SENTENCE[when]}`}
                          </h2>
                          <p className="text-pana-ink/55 mt-1 text-[0.875rem] font-semibold">
                            {lanes.length > 0
                              ? 'The biggest things on. Last rather than first, because they do not need the help.'
                              : 'Not enough in this window to find a pattern in. Said plainly rather than dressed as a recommendation.'}
                          </p>
                        </div>

                        <ul className="dirsearch-grid">
                          {leftovers.map((event) => (
                            <li key={event.id}>
                              <EventCard
                                event={event}
                                going={going.includes(event.id)}
                                onToggleGoing={toggleGoing}
                                reason={{
                                  kind: 'popular',
                                  going: event.going,
                                }}
                                onDismiss={(e, r) =>
                                  setDismissed((d) => [
                                    ...d,
                                    { event: e, reason: r },
                                  ])
                                }
                              />
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}
                  </>
                )}
              </>
            ) : (
              <>
                <DiscoverChrome
                  when={when}
                  onWhen={setWhen}
                  day={day}
                  onDay={setDay}
                  types={types}
                  onTypes={setTypes}
                  counties={counties}
                  onCounties={setCounties}
                  sort={sort}
                  onSort={setSort}
                  days={days}
                  counts={counts}
                  totalCount={MOCK_EVENTS.length}
                  shownCount={shown.length}
                />

                {shown.length === 0 ? (
                  /* The directory's own empty state, reused whole. An events
                     page that invents a second one is an events page that will
                     word it differently, and "nothing here" said two ways is
                     the clearest possible signal that two teams built two
                     pages. */
                  <div className="dirsearch-empty">
                    <CalendarPlus className="h-12 w-12" aria-hidden="true" />
                    <h2 className="dirsearch-empty-title">
                      Nothing on with <em>those filters</em>
                    </h2>
                    <p className="dirsearch-empty-lede">
                      The calendar thins out midweek. Widen the window, or check
                      what else is happening around it.
                    </p>
                    <div className="dirsearch-empty-actions">
                      <button
                        type="button"
                        className="dirsearch-empty-primary"
                        onClick={clearFilters}
                      >
                        Show everything
                      </button>
                      <button
                        type="button"
                        className="dirsearch-empty-secondary"
                        onClick={() => setTab('foryou')}
                      >
                        Let the page choose
                      </button>
                    </div>
                  </div>
                ) : grouped ? (
                  groups.map((group) => (
                    <section key={group.day} className="pt-8">
                      {/* Capped to `.dirsearch-grid`'s own 58rem and centred
                          with it. A heading that spans the container while the
                          cards below sit in a narrower centred column reads as
                          two layouts rather than one list with days in it. */}
                      <div className="mx-auto mb-4 flex max-w-[58rem] flex-wrap items-baseline gap-x-3 gap-y-1">
                        <h2 className="text-pana-ink text-[1.0625rem] font-black tracking-[-0.01em]">
                          {group.bucket === 'today' ? 'Tonight' : group.day}
                        </h2>
                        {group.bucket === 'today' && (
                          <span className="text-pana-ink/45 text-[0.8125rem] font-bold">
                            {group.day}
                          </span>
                        )}
                        <span className="text-pana-ink/45 ml-auto text-[0.8125rem] font-bold">
                          {group.events.length}{' '}
                          {group.events.length === 1 ? 'event' : 'events'}
                        </span>
                      </div>

                      <ul className="dirsearch-grid">
                        {group.events.map((event) => (
                          <li key={event.id}>
                            <EventCard
                              event={event}
                              going={going.includes(event.id)}
                              onToggleGoing={toggleGoing}
                            />
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))
                ) : (
                  <ul className="dirsearch-grid pt-8">
                    {shown.map((event) => (
                      <li key={event.id}>
                        <EventCard
                          event={event}
                          going={going.includes(event.id)}
                          onToggleGoing={toggleGoing}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}

            {/* The directory's closing band, which on this page has somewhere
                better to point than "add your business". Held to the same
                58rem `.dirsearch-cta` uses, so the column does not widen at
                the foot of the page. */}
            <section className="dirsearch-tail mx-auto max-w-[58rem]">
              <span className="section-eyebrow">Hosting something</span>
              <h2 className="section-display">
                Put it on the calendar everyone already checks
              </h2>
              <p className="section-lede">
                Markets, workshops, openings, build nights. Listing is free, and
                it lands in the same place people look for the makers.
              </p>
              <div className="dirsearch-tail-actions">
                <Link href="/e/new" className="dirsearch-tail-primary">
                  <CalendarPlus className="h-4 w-4" aria-hidden="true" />
                  Add an event
                </Link>
                <Link
                  href="/directory"
                  className="link-arrow text-pana-indigo font-bold"
                >
                  Browse the directory
                </Link>
              </div>
            </section>

            {/* Per app/mock/README.md, a mock names its own route so a
                screenshot taken out of context still says where it came from. */}
            <p className="mx-auto mt-6 max-w-[58rem] text-center text-xs opacity-60">
              Design mock — <code>/mock/events</code>, drawn as{' '}
              <code>
                {MOCK_HOST}
                {MOCK_PATH}
              </code>
              . Events is a surface in <code>lib/panaverse/surfaces.ts</code>{' '}
              with <code>subdomain: null</code>, so it lives on the root domain
              at a path, and nothing here reads the database. Cards, band,
              filter menus and account menu are the shipping classes; the reason
              lanes, the &ldquo;not for me&rdquo; loop and the Events
              tile&rsquo;s destination are the proposal. Reasons are computed in{' '}
              <code>_reasons.ts</code>, never written into the fixtures.{' '}
              <code>events</code> has no price column, so no card shows a door
              price.
            </p>
          </div>
        </main>
      </BrowserFrame>
    </>
  );
}
