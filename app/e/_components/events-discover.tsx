'use client';

import { useMemo, useOptimistic, useState, useTransition } from 'react';
import Link from 'next/link';
import { CalendarPlus, RotateCcw, UserPlus } from 'lucide-react';
import { FilterMenu } from '@/components/ui/filter-menu';
import {
  buildCategoryRails,
  buildLanes,
  type DiscoveryEvent,
  type Reason,
  type WhenBucket,
} from '@/lib/events/lanes';
import {
  dateKey,
  formatDayHeading,
  formatWeekdayLong,
} from '@/lib/events/format';
import { dismissEvent, undismissEvent } from '../_actions';
import { EventCard, nameList } from './event-card';

const WHEN_SENTENCE: Record<WhenBucket | 'all', string> = {
  today: 'tonight',
  weekend: 'this weekend',
  month: 'later this month',
  later: 'further out',
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
 * /e — what is on, and why you would want to be there.
 *
 * The question a person arrives with is "what is on, near me, soon, that I
 * would like", and the last clause is the hard one. The page this replaced
 * answered a different question — "list every upcoming event" — in a flat grid
 * sorted by date, which is a calendar rather than a discovery surface. The
 * obvious fix, a row of filter menus, is the same mistake in a new costume: it
 * requires the viewer to already know the answer and merely narrow to it, and
 * leaves anybody who arrived with "I don't know, surprise me" — which is most
 * people, most of the time — staring at controls.
 *
 * So the spine here is lanes, and every lane heading is a reason. The page
 * commits to a claim about why each event is in front of you, states it on the
 * card in checkable specifics, and gives you a control to say it got it wrong.
 * Four reasons, computed in lib/events/discovery.ts from columns that exist
 * today: hosts you follow, panas who have RSVPed, tags you have actually
 * turned up for, and hosts nobody has heard of yet.
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
 * genuinely ask what is on Saturday. It is chronological and complete, one
 * rail per day: the day is the unit you scan, so a busy Saturday costs a
 * sweep rather than a screen. The /mock/events draft carried type and county
 * facets there; neither is shipped, because `events` has no category column
 * and county lives a venue join away, and a facet whose values have to be
 * invented is a filter that will disagree with the data the first time
 * somebody checks.
 */
export function EventsDiscover({
  events,
  dismissedIds,
  signedIn,
}: {
  events: DiscoveryEvent[];
  dismissedIds: string[];
  signedIn: boolean;
}) {
  const [tab, setTab] = useState<'foryou' | 'calendar'>('foryou');
  const [when, setWhen] = useState<WhenBucket | 'all'>('all');
  const [, startTransition] = useTransition();

  /* The dismissal set is optimistic because the whole value of the control is
     that it answers instantly. A round trip before the card goes away makes
     "not for me" feel like a form submission, and the undo banner underneath
     it would appear a beat after the thing it is undoing. */
  const [hidden, setHidden] = useOptimistic(
    new Set(dismissedIds),
    (current: Set<string>, change: { id: string; hide: boolean }) => {
      const next = new Set(current);
      if (change.hide) next.add(change.id);
      else next.delete(change.id);
      return next;
    }
  );

  /* The last dismissal, kept only so the banner can name it. Deliberately not
     a stack: "undo" here means "that one, just now", and a page that quietly
     accumulated a history the viewer cannot see would be promising a depth of
     correction the banner does not offer. */
  const [lastDismissed, setLastDismissed] = useState<{
    event: DiscoveryEvent;
    reason: Reason;
  } | null>(null);

  const visible = useMemo(
    () => events.filter((event) => !hidden.has(event.id)),
    [events, hidden]
  );

  /* The pool the lanes are built from. `when` is shared with the calendar tab
     on purpose: narrowing to the weekend here and then switching tabs should
     not throw the answer away, because the viewer's availability did not
     change when they changed how they were looking. */
  const pool = useMemo(
    () =>
      when === 'all'
        ? visible
        : visible.filter((event) => event.bucket === when),
    [visible, when]
  );

  const { lanes, leftovers } = useMemo(
    () => buildLanes(pool, { signedIn }),
    [pool, signedIn]
  );

  /* Built from the same pool rather than from `leftovers`, so a rail is a
     complete answer to "what music is on" instead of "what music is on that
     nothing above already mentioned". See buildCategoryRails for the full
     argument; the short version is that the two sections are the same
     catalogue read two ways, which is why the page gives them separate
     headings instead of pretending they are one list. */
  const rails = useMemo(() => buildCategoryRails(pool), [pool]);

  /* Counted off the real rows rather than typed, so the menu hints and the
     summary line cannot disagree. Counted against the undismissed set but
     *before* the window narrows, because a count that moved as you filtered
     would make a window read as empty when it is merely empty in combination
     — which is the thing it exists to warn you about. */
  const counts = useMemo(() => {
    const out: Record<string, number> = { all: visible.length };
    for (const event of visible) {
      out[event.bucket] = (out[event.bucket] ?? 0) + 1;
    }
    return out;
  }, [visible]);

  const onDismiss = (event: DiscoveryEvent, reason: Reason) => {
    setLastDismissed({ event, reason });
    startTransition(async () => {
      setHidden({ id: event.id, hide: true });
      await dismissEvent(event.id, reason.kind);
    });
  };

  const onUndo = () => {
    if (!lastDismissed) return;
    const { id } = lastDismissed.event;
    setLastDismissed(null);
    startTransition(async () => {
      setHidden({ id, hide: false });
      await undismissEvent(id);
    });
  };

  const laneCount = lanes.reduce((n, lane) => n + lane.events.length, 0);

  /* Grouped by day. Only holds while the list is chronological, which it is:
     the server orders by starts_at and nothing here re-sorts it.

     Keyed on `dateKey` rather than the formatted `day`, which reads "Sat 10"
     and so is not unique: a window wide enough to span months puts two
     different Saturday the 10ths in the list, and as a React key that is a
     duplicate. The grouping itself was never wrong — the two are far apart in
     a chronological list and never adjacent — but the keys were. */
  const groups = useMemo(() => {
    const out: {
      key: string;
      weekday: string;
      date: string;
      bucket: WhenBucket;
      events: DiscoveryEvent[];
    }[] = [];
    for (const event of pool) {
      const at = new Date(event.startsAt);
      const key = dateKey(at, event.timezone);
      const last = out[out.length - 1];
      if (last && last.key === key) {
        last.events.push(event);
        continue;
      }
      /* Weekday and date come off the event's own timestamp and timezone, and
         deliberately not off `relativeDayLabel`: that one takes a `now`, and a
         `now` read during render is a different instant on the server than in
         the browser, so "Today" would render one thing and hydrate to another.
         `bucket` is the server's answer to that same question and is already
         on the event, so "Tonight" stays server-decided. */
      out.push({
        key,
        weekday: formatWeekdayLong(at, event.timezone),
        date: formatDayHeading(at, event.timezone),
        bucket: event.bucket,
        events: [event],
      });
    }
    return out;
  }, [pool]);

  return (
    /* `.dirscope` is load-bearing, not decoration: the --story-* palette is
       scoped to `body:has(.dirsearch), body:has(.dirscope)` in globals.css, so
       a page carrying neither renders on a transparent background with nothing
       in the console to say why. */
    <main className="dirscope">
      <div className="dirsearch-band">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-[58rem]">
            <span className="section-eyebrow">Events</span>

            {/* The whole control surface of the discovery tab: one sentence
                with one blank in it. The menu trigger always prints its own
                label before its value, so the label is "I'm free" rather than
                the axis name — the control reads "I'm free · this weekend", a
                phrase about the viewer's situation rather than a column in the
                events table.

                There is exactly one, and that is the design argument in one
                component. Availability is the single thing only the viewer
                knows; everything else — what is good, who is going, what is
                like what they already liked — the page can work out, and
                should, because that is what a discover page is for. Asking for
                category, county and sort order is asking the viewer to do the
                recommending.

                Only on the discovery tab: the calendar tab is already a window
                onto the same `when`, and a second control naming the same
                state can only agree redundantly or disagree confusingly. */}
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
                    onChange={(next) =>
                      setWhen((next[0] ?? 'all') as WhenBucket | 'all')
                    }
                    caption="The only thing this page cannot work out for itself."
                    options={[
                      {
                        value: 'today',
                        label: 'tonight',
                        hint: `${counts.today ?? 0} on`,
                      },
                      {
                        value: 'weekend',
                        label: 'this weekend',
                        hint: `${counts.weekend ?? 0} on`,
                      },
                      {
                        value: 'month',
                        label: 'later this month',
                        hint: `${counts.month ?? 0} on`,
                      },
                      {
                        value: 'all',
                        label: 'any time',
                        hint: `${visible.length} on`,
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
                    {when === 'all' ? '' : ` ${WHEN_SENTENCE[when]}`} — each one
                    says why.
                  </>
                ) : (
                  <>
                    {pool.length}
                    {when === 'all' ? '' : ` ${WHEN_SENTENCE[when]}`}. Too few
                    to find a pattern in, so here is all of it.
                  </>
                )
              ) : (
                <>
                  Everything coming up, soonest first
                  {when === 'all' ? '' : `, ${WHEN_SENTENCE[when]}`}.
                </>
              )}
            </p>

            {/* The calendar is a tab rather than the page. Demoting it is the
                point; deleting it would be a different mistake, since "just
                show me everything on Saturday" is a real thing people want and
                a discover page that refuses it is one people route around. */}
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
                taken back makes the control risky to try, and a control people
                are afraid of collects no signal at all. */}
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
                  onClick={onUndo}
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  Undo
                </button>
              </div>
            )}

            {/* Signed out, the page says which reasons it cannot compute and
                why, instead of showing four empty shelves. */}
            {!signedIn && (
              <section className="border-pana-ink/15 mx-auto mt-8 max-w-[58rem] rounded-2xl border border-dashed px-5 py-5">
                <h2 className="text-pana-ink text-[1.0625rem] font-black">
                  Three of the four reasons need to know who you are
                </h2>
                <p className="text-pana-ink/65 mt-1.5 text-[0.9375rem] font-semibold">
                  Hosts you follow, panas who are going and events like ones you
                  have been to are all joins against your account. They are not
                  empty right now — they are unanswerable. What is below is
                  everything that can be worked out about a stranger.
                </p>
                <div className="dirsearch-empty-actions justify-start">
                  <Link
                    href="/login"
                    className="dirsearch-empty-primary inline-flex items-center gap-2"
                  >
                    <UserPlus className="h-4 w-4" aria-hidden="true" />
                    Sign in
                  </Link>
                </div>
              </section>
            )}

            {pool.length === 0 ? (
              <EmptyWindow
                when={when}
                onAnyTime={() => setWhen('all')}
                hiddenCount={hidden.size}
              />
            ) : (
              <>
                {lanes.map((lane) => (
                  <section key={lane.id} className="pt-10">
                    <div className="mx-auto max-w-[58rem]">
                      <h2 className="text-pana-ink text-[1.375rem] font-black tracking-[-0.015em]">
                        {lane.title}
                      </h2>
                      <p className="text-pana-ink/55 mt-1 text-[0.875rem] font-semibold">
                        {lane.note}
                      </p>
                    </div>

                    {/* Rails, like the subjects below. A lane card still
                        carries its reason and its "Not for me" — those are
                        what make the lane arguable, and `compact` drops only
                        the blurb — so the argument survives the format. What
                        it buys is that a lane is no longer a column of
                        full-width blocks you scroll past two at a time: three
                        lanes now fit the screen a single one used to. */}
                    <ul className="events-rail-track">
                      {lane.events.map(({ event, reason }) => (
                        <li key={event.id} className="events-rail-item">
                          <EventCard
                            event={event}
                            reason={reason}
                            compact
                            onDismiss={signedIn ? onDismiss : undefined}
                          />
                        </li>
                      ))}
                      <RailGhosts />
                    </ul>
                  </section>
                ))}

                {rails.length > 0 && (
                  <section className="pt-10">
                    <div className="border-pana-ink/10 mx-auto mb-1 max-w-[58rem] border-t pt-8">
                      <h2 className="text-pana-ink text-[1.375rem] font-black tracking-[-0.015em]">
                        Browse by subject
                      </h2>
                      <p className="text-pana-ink/55 mt-1 text-[0.875rem] font-semibold">
                        {lanes.length > 0
                          ? 'The same events again, sorted by what they are rather than why you were shown them.'
                          : 'Nothing here is guessing at your taste. These are just the subjects with something on.'}
                      </p>
                    </div>

                    {rails.map((rail) => (
                      <div key={rail.id} className="events-rail">
                        <div className="mx-auto max-w-[58rem]">
                          <h3 className="text-pana-ink text-[1.0625rem] font-black tracking-[-0.01em]">
                            {rail.title}
                          </h3>
                          <p className="text-pana-ink/55 mt-0.5 text-[0.8125rem] font-semibold">
                            {rail.note}
                          </p>
                        </div>

                        {/* No reason and no dismiss, same as the calendar tab:
                            the viewer picked the subject, so a card that
                            explained itself would be answering a question
                            nobody asked. */}
                        <ul className="events-rail-track">
                          {rail.events.map((event) => (
                            <li key={event.id} className="events-rail-item">
                              <EventCard event={event} compact />
                            </li>
                          ))}
                          <RailGhosts />
                        </ul>
                      </div>
                    ))}
                  </section>
                )}

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
                            reason={{ kind: 'popular', going: event.going }}
                            onDismiss={signedIn ? onDismiss : undefined}
                          />
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </>
            )}
          </>
        ) : pool.length === 0 ? (
          <EmptyWindow
            when={when}
            onAnyTime={() => setWhen('all')}
            hiddenCount={hidden.size}
          />
        ) : (
          groups.map((group) => (
            <section key={group.key} className="pt-8">
              {/* Capped to the track's own 58rem inset and centred with it, so
                  the heading starts on the same line as the first card under
                  it. A heading that spans the container while the cards below
                  sit in a narrower centred column reads as two layouts rather
                  than one calendar with days in it. */}
              <div className="mx-auto flex max-w-[58rem] flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="text-pana-ink text-[1.0625rem] font-black tracking-[-0.01em]">
                  {group.bucket === 'today' ? 'Tonight' : group.weekday}
                </h2>
                {/* The weekday is named on every row, today's included. A row
                    headed only "Tonight" says nothing about where in the week
                    you are, and once you have scrolled a few days down the
                    date alone makes you count. */}
                <span className="text-pana-ink/45 text-[0.8125rem] font-bold">
                  {group.bucket === 'today'
                    ? `${group.weekday}, ${group.date}`
                    : group.date}
                </span>
                <span className="text-pana-ink/45 ml-auto text-[0.8125rem] font-bold">
                  {group.events.length}{' '}
                  {group.events.length === 1 ? 'event' : 'events'}
                </span>
              </div>

              {/* One rail per day, so the calendar is read down by day and
                  across by event rather than as a single column you scroll
                  past a day at a time.

                  Uncapped, unlike the lanes and the subject rails. Those two
                  are selections and are allowed to stop early; a calendar that
                  silently omits an event is just wrong. The count above is
                  what tells you how far the row runs. */}
              <ul className="events-rail-track">
                {group.events.map((event) => (
                  <li key={event.id} className="events-rail-item">
                    <EventCard event={event} compact />
                  </li>
                ))}
                <RailGhosts />
              </ul>
            </section>
          ))
        )}
      </div>
    </main>
  );
}

/**
 * The empty slots at the end of a short row.
 *
 * Three of them because the widest column fits just under three cards, so
 * three is the most that can ever show; the flexbox and the container
 * queries in globals.css decide how many are actually drawn and how wide
 * each one is, and a row with enough cards to overflow collapses the whole
 * thing to nothing.
 *
 * Rendering a fixed three and letting layout do the arithmetic is the point.
 * The alternative is measuring the track and counting, which means a resize
 * observer, a number that is wrong for one frame after every resize, and a
 * second copy of the column maths that has to be kept in step with the CSS
 * that already does it.
 */
function RailGhosts() {
  return (
    <li className="events-rail-ghosts" aria-hidden="true">
      <span className="events-rail-ghost" />
      <span className="events-rail-ghost" />
      <span className="events-rail-ghost" />
    </li>
  );
}

/**
 * Nothing in this window.
 *
 * Two different sentences depending on why, because "you have hidden
 * everything" and "there is nothing on" need different answers and offering
 * "put them back" to somebody who has hidden nothing is a button that cannot
 * work.
 */
function EmptyWindow({
  when,
  onAnyTime,
  hiddenCount,
}: {
  when: WhenBucket | 'all';
  onAnyTime: () => void;
  hiddenCount: number;
}) {
  return (
    <div className="dirsearch-empty">
      <CalendarPlus className="h-12 w-12" aria-hidden="true" />
      <h2 className="dirsearch-empty-title">
        Nothing on <em>{when === 'all' ? 'yet' : WHEN_SENTENCE[when]}</em>
      </h2>
      <p className="dirsearch-empty-lede">
        {hiddenCount > 0
          ? 'You have hidden everything in this window. Widen it, or put some back from your settings.'
          : when === 'all'
            ? 'No upcoming events have been published yet. Yours could be the first.'
            : 'The calendar thins out midweek. Try a wider window.'}
      </p>
      <div className="dirsearch-empty-actions">
        {when !== 'all' && (
          <button
            type="button"
            className="dirsearch-empty-primary"
            onClick={onAnyTime}
          >
            Any time
          </button>
        )}
        <Link href="/e/new" className="dirsearch-empty-secondary">
          Post an event
        </Link>
      </div>
    </div>
  );
}
