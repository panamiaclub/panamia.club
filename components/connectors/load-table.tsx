'use client';

import { useState } from 'react';

import { HOUSES, parseHouseFocus, type HouseId } from '@/lib/connectors/model';
import { ADMIN_CHROME } from '@/lib/admin/theme';
import { SetTaskForm } from '@/components/connectors/admin-console';
import { ConnectorHousePills } from '@/components/connectors/dashboard-parts';
import type { AssignableEvent } from '@/lib/connectors/event-link';
import {
  describeLoad,
  formatMinutes,
  loadBand,
  LOAD_BAND_LABEL,
  type ConnectorLoad,
} from '@/lib/connectors/hours';

/**
 * Who has room to take something on.
 *
 * ## It is a bar chart of other people, not a gauge
 *
 * There is no capacity figure anywhere in this programme — `lib/connectors/
 * model.ts` quotes the deck saying the tiers "do not correspond to how
 * developed someone is" and that "everyone starts in Tier 1", and the join
 * form's "what I can bring" is free prose. So nothing here can be divided by
 * anything, and a "72% full" meter would be quoting a denominator somebody
 * made up.
 *
 * The bar is therefore scaled against the busiest person on the roster. That
 * is a real comparison and it answers the real question — not "is Ana at
 * capacity" but "of these people, who is carrying least" — and it re-scales
 * itself as the programme's workload changes rather than ageing into a
 * fiction.
 *
 * ## Unestimated work is shown, never zeroed
 *
 * Every commitment written before drizzle/0059 has no size. Folding those to
 * zero would make somebody carrying six unsized errands look completely free,
 * which is the exact error this table exists to prevent — the staffer would
 * hand them a seventh. So the unsized count rides alongside the total, and a
 * row whose work is entirely unsized says so instead of showing "0h".
 *
 * ## Sorted by who is freest, unless you say otherwise
 *
 * Ascending by default, because the page's job is finding somebody to assign
 * to. A table sorted busiest-first makes you read to the bottom for the
 * answer. People with nothing open sort first and are the point of the whole
 * page.
 *
 * Name is the alternative because the other real task here is looking one
 * person up — somebody asks what they are carrying, or you are checking
 * whether you already gave them something this week. Under the load sort
 * their position depends on everyone else's workload, so it moves between
 * visits and there is nowhere to aim. A–Z puts them where you expect.
 *
 * There is deliberately no busiest-first option. It would answer "who is
 * overloaded", which is a real question, but the chip already says
 * "Carrying the most" and a third button costs more than it returns.
 *
 * ## The list scrolls rather than growing
 *
 * The roster is open-ended, and this panel shares a row with the assign form
 * from `xl` up. Left unbounded, thirty connectors push the page metres past
 * the form it is meant to be read next to, which defeats putting them side by
 * side at all. So the rows scroll inside a fixed height and the legend stays
 * pinned underneath, where it is still legible while you scroll.
 *
 * The count sits above the list because a scroll container hides its own
 * size: without it there is no way to tell eight connectors from forty.
 *
 * ## Houses ride with the name
 *
 * They used to sit on a line of their own under the bar. Moved up beside the
 * name they cost no height at all, and they belong there: which houses
 * somebody is in is part of who they are, not a footnote to their workload.
 * Explicit major/minor labels help staff find somebody's focus without
 * restricting assignments to those houses.
 *
 * Folding them up, and putting the button on the bar's line, took the row
 * from three lines to two. The same cap that showed five connectors now
 * shows nine.
 */

/* Typed as plain strings, not HouseId: `houses` comes off a JSON column, so a
 * value that is no longer a known house is possible and should render as
 * itself rather than fail a lookup. */
const HOUSE_BY_ID = new Map<string, (typeof HOUSES)[number]>(
  HOUSES.map((h) => [h.id, h])
);

/**
 * The houses somebody is in, as chips beside their name.
 *
 * Carries each house's own colour because that colour is part of the
 * programme model, not decoration — a connector learns "I am indigo" from the
 * join form and the front page, and this is the same badge. The palette was
 * measured against 4.5:1 for small bold text in a pill, which is exactly this
 * use, so the fills are safe to apply directly.
 *
 * Written as inline custom properties rather than Tailwind classes:
 * `bg-${house.color}` produces a class that exists nowhere in the stylesheet,
 * because Tailwind only emits utilities it can read as whole strings at build
 * time. Every other house chip in the programme is drawn this way.
 *
 * A house the model no longer knows renders as its raw id in a neutral chip.
 * That is a membership somebody really has, and dropping it silently would
 * misreport who is in what; showing the id says plainly that it needs fixing.
 *
 * No houses at all gets its own chip rather than blank space. A task cannot be
 * filed without a house, so an unplaced connector is not merely undecorated —
 * they cannot be given anything until it is sorted.
 */
function HousePills({
  houses,
  majorHouse,
  minorHouse,
}: Pick<LoadRow, 'houses' | 'majorHouse' | 'minorHouse'>) {
  const focus = parseHouseFocus({ majorHouse, minorHouse });
  if (focus) {
    return (
      <ConnectorHousePills
        houses={[focus.majorHouse, focus.minorHouse]}
        majorHouse={focus.majorHouse}
        minorHouse={focus.minorHouse}
      />
    );
  }

  if (houses.length === 0) {
    return (
      <span className="border-pana-ink/25 text-pana-ink/50 rounded-full border-2 border-dotted px-2 py-0.5 text-[0.6875rem] font-extrabold">
        No house yet
      </span>
    );
  }

  return (
    <>
      {houses.map((id) => {
        const house = HOUSE_BY_ID.get(id);
        if (!house) {
          return (
            <span
              key={id}
              title="This house is no longer in the programme model"
              className="border-pana-ink/25 text-pana-ink/50 rounded-full border-2 border-dotted px-2 py-0.5 text-[0.6875rem] font-extrabold"
            >
              {id}
            </span>
          );
        }
        return (
          <span
            key={id}
            className="rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold"
            style={{
              backgroundColor: `var(--color-${house.color})`,
              color: `var(--color-${house.onColor})`,
            }}
          >
            {house.name}
          </span>
        );
      })}
    </>
  );
}

export interface LoadRow {
  profileId: string;
  displayName: string;
  houses: string[];
  majorHouse: HouseId | null;
  minorHouse: HouseId | null;
  load: ConnectorLoad;
}

/* Ink on all four, so the chip never has to change its text colour. Butter
 * reads as "available" without being a green that implies a health check.
 *
 * Outlined, unlike the house chips beside them, because the two palettes
 * collide: Narrative Shifters and the "Steady" band are both pana-blue, and a
 * row can carry one of each. Colour alone would make them the same object
 * read twice. The border makes the load band a different kind of thing at a
 * glance — and it is the louder of the two on purpose, since it is what this
 * page is for. */
const BAND_CLASS = {
  free: 'bg-pana-butter text-pana-ink',
  light: 'bg-pana-butter-2 text-pana-ink',
  steady: 'bg-pana-blue text-pana-ink',
  heaviest: 'bg-pana-flame text-pana-ink',
} as const;

type SortMode = 'room' | 'name';

const SORT_LABEL: Record<SortMode, string> = {
  room: 'Most room',
  name: 'Name',
};

export function LoadTable({
  rows,
  events = [],
  onViewWork,
}: {
  rows: readonly LoadRow[];
  events?: readonly AssignableEvent[];
  onViewWork?: (profileId: string) => void;
}) {
  const [sort, setSort] = useState<SortMode>('room');
  const [openId, setOpenId] = useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <p className="text-pana-ink/60 text-sm leading-relaxed">
        Nobody on the roster yet. Accept an application and they will appear
        here.
      </p>
    );
  }

  const busiest = Math.max(...rows.map((r) => r.load.estimatedMinutes), 0);

  /* Copied before sorting: the caller's array is a prop, and sorting in place
   * mutates something React handed us. */
  const sorted = [...rows].sort((a, b) => {
    if (sort === 'name') return a.displayName.localeCompare(b.displayName);

    if (a.load.estimatedMinutes !== b.load.estimatedMinutes) {
      return a.load.estimatedMinutes - b.load.estimatedMinutes;
    }
    /* Same sized hours: the tie-break is unsized work, because somebody with
     * three unestimated jobs is not as free as somebody with none. */
    if (a.load.open !== b.load.open) return a.load.open - b.load.open;
    return a.displayName.localeCompare(b.displayName);
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="border-pana-ink/20 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b-2 border-dashed pb-3">
        <span className="text-pana-ink/60 text-xs font-bold">
          {rows.length} connector{rows.length === 1 ? '' : 's'}
        </span>

        <div className="flex items-center gap-2">
          <span className="text-pana-ink/50 text-xs font-bold uppercase">
            Sort
          </span>
          {(['room', 'name'] as const).map((mode) => {
            const chosen = sort === mode;
            return (
              <button
                key={mode}
                type="button"
                aria-pressed={chosen}
                onClick={() => setSort(mode)}
                className={[
                  'rounded-full border-2 px-3 py-1 text-xs font-extrabold transition',
                  chosen
                    ? `${ADMIN_CHROME.FILL} ${ADMIN_CHROME.ON_FILL} border-transparent`
                    : 'border-pana-ink/30 text-pana-ink/70 hover:border-pana-ink hover:text-pana-ink',
                ].join(' ')}
              >
                {SORT_LABEL[mode]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Focusable so the rows can be reached by keyboard once they overflow:
       * a scroll container that only responds to a mouse strands anybody
       * tabbing through. max-h only engages when there is more than fits, so
       * a short roster is unaffected.
       *
       * The cap lifts entirely while a row is open. A form is taller than the
       * window the list scrolls in, so leaving it capped would mean scrolling
       * inside a scroll area to reach your own submit button — and the reason
       * for the cap has lapsed anyway: once you are filling something in you
       * have stopped scanning the roster, which is the only thing the cap is
       * there to protect. */}
      <div
        tabIndex={openId ? -1 : 0}
        role="group"
        aria-label="Connector load"
        className={
          openId
            ? 'pr-1'
            : 'max-h-[38rem] overflow-y-auto overscroll-contain pr-1'
        }
      >
        <ul className="flex flex-col gap-2.5">
          {sorted.map((row) => {
            const band = loadBand(row.load, busiest);
            const open = openId === row.profileId;
            /* Width comes off the same maximum the band does, so the bar and the
             * chip can never tell different stories. */
            const width =
              busiest > 0
                ? Math.round((row.load.estimatedMinutes / busiest) * 100)
                : 0;

            return (
              <li
                key={row.profileId}
                className="border-pana-ink/15 flex flex-col gap-1.5 border-b-2 border-dashed pb-2.5 last:border-b-0 last:pb-0"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-pana-ink text-sm font-extrabold">
                      {row.displayName}
                    </span>
                    <HousePills
                      houses={row.houses}
                      majorHouse={row.majorHouse}
                      minorHouse={row.minorHouse}
                    />
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-pana-ink/70 text-xs tabular-nums">
                      {describeLoad(row.load)}
                    </span>
                    <span
                      className={`border-pana-ink rounded-full border-2 px-2 py-0.5 text-[0.6875rem] font-extrabold ${BAND_CLASS[band]}`}
                    >
                      {LOAD_BAND_LABEL[band]}
                    </span>
                  </span>
                </div>

                {/* The button rides the bar's line rather than taking one of
                 * its own: with the houses moved up to the name there is
                 * nothing else down here, and a control alone on a row reads
                 * as a section break between connectors. */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex min-w-32 flex-1 items-center gap-2">
                    <div className="border-pana-ink bg-pana-cream h-3 flex-1 overflow-hidden rounded-full border-2">
                      <div
                        className="bg-pana-indigo h-full"
                        style={{ width: `${width}%` }}
                      />
                    </div>
                    <span className="text-pana-ink/60 w-14 shrink-0 text-right text-xs font-bold tabular-nums">
                      {row.load.estimatedMinutes > 0
                        ? formatMinutes(row.load.estimatedMinutes)
                        : '—'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {onViewWork && (
                      <button
                        type="button"
                        onClick={() => onViewWork(row.profileId)}
                        className="text-pana-indigo min-h-11 text-xs font-bold underline underline-offset-4"
                      >
                        View work
                        <span className="sr-only"> for {row.displayName}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => setOpenId(open ? null : row.profileId)}
                      className={[
                        'min-h-11 shrink-0 rounded-full border-2 px-3 py-1 text-xs font-extrabold transition',
                        open
                          ? 'border-pana-ink text-pana-ink'
                          : 'border-pana-ink/30 text-pana-ink/70 hover:border-pana-ink hover:text-pana-ink',
                      ].join(' ')}
                    >
                      {open ? 'Close' : 'Give a task'}
                    </button>
                  </div>
                </div>

                {open && (
                  <div className="border-pana-ink/20 bg-pana-cream/50 mt-2 rounded-2xl border-2 border-dashed p-3">
                    <p className="text-pana-ink/70 mb-3 text-xs leading-relaxed">
                      Goes on {row.displayName}&rsquo;s board marked as
                      assigned. They can mark it done — you cannot, and they
                      cannot delete it. Sizing it is optional, but an unsized
                      task will not count toward the bar above.
                    </p>
                    <SetTaskForm
                      connector={row}
                      events={[...events]}
                      onDone={() => setOpenId(null)}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <p className="text-pana-ink/60 border-pana-ink/20 border-t-2 border-dashed pt-3 text-xs leading-relaxed">
        Bars are scaled against the busiest connector shown
        {busiest > 0 ? ` (${formatMinutes(busiest)})` : ''}, not against a
        capacity — the programme has never set one, and the tiers are explicitly
        not a ranking. A dash means nothing open has been sized, not that there
        is nothing to do.
      </p>
    </div>
  );
}
