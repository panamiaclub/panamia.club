'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ADMIN_CHROME } from '@/lib/admin/theme';
import { HOUSES, PODS, TIERS, getPod } from '@/lib/connectors/model';
import type { HouseId, PodId, TierId } from '@/lib/connectors/model';
import { CADENCES, CADENCE_LABEL } from '@/lib/connectors/events-model';
import type { Cadence, ConnectorEvent } from '@/lib/connectors/events-model';
import { localInputToIso } from '@/lib/datetime-local';
import { eventValue } from '@/lib/connectors/event-link';
import type { AssignableEvent, EventKind } from '@/lib/connectors/event-link';
import {
  HOUR_PRESETS,
  MAX_HOURS,
  formatMinutes,
  minutesToHoursInput,
  parseHours,
} from '@/lib/connectors/hours';
import { EventCard, formatDay } from '@/components/connectors/dashboard-parts';
import SurfaceLink from '@/components/panaverse/SurfaceLink';
import { saveConnectorWork as post } from '@/lib/connectors/client';

/**
 * Programme gatherings above public events in the picker.
 *
 * Not alphabetical and not by date across the two: a connector is far more
 * often assigned to the programme's own huddles and trainings than to a
 * public party, so the common choice sits where the cursor already is.
 */
const PROGRAMME_FIRST: ReadonlyArray<{ kind: EventKind; label: string }> = [
  { kind: 'programme', label: 'Connector events' },
  { kind: 'public', label: 'Panamia events' },
];

/**
 * The three things the admin console can actually change: who is in which
 * house, what somebody has been asked to do, and what is on the calendar.
 *
 * They live in one file because they share the same small vocabulary — the
 * post helper, the busy/error pair, the field styling — and splitting them
 * across three files would mean three copies of it.
 *
 * ## Why every panel refreshes the page after a write
 *
 * Every number on this console is counted from rows somewhere else on it.
 * Moving somebody between houses changes the house tallies; assigning a task
 * changes the headline count of open work. Updating local state alone would
 * leave the band disagreeing with the table underneath it, which is the exact
 * failure this page replaced the spreadsheet to avoid.
 */

const FIELD =
  'w-full rounded-lg border-2 border-pana-ink/25 bg-white px-3 py-2 text-sm text-pana-ink outline-none focus:border-pana-indigo';
const LABEL =
  'block text-xs font-extrabold uppercase tracking-wide text-pana-ink/60';

function Err({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="border-pana-red bg-pana-red/10 text-pana-ink mt-3 rounded-lg border-2 px-3 py-2 text-sm font-bold"
    >
      {message}
    </p>
  );
}

/* ------------------------------------------------------------------ roster */

export interface RosterRow {
  profileId: string;
  displayName: string;
  pod: PodId;
  houses: HouseId[];
  tier: TierId;
}

type RosterDraft = Pick<RosterRow, 'houses' | 'tier'>;

function sameRosterChoices(left: RosterDraft, right: RosterDraft): boolean {
  return (
    left.tier === right.tier &&
    left.houses.length === right.houses.length &&
    left.houses.every((house) => right.houses.includes(house))
  );
}

/**
 * The roster, editable in place.
 *
 * The mock had an "Assign a house" queue listing connectors who had joined
 * without one. That queue can never have anybody in it — a membership with no
 * recognised house does not parse as a membership at all, so there is no such
 * thing as a connector without a house. The real need is to change an answer
 * somebody already gave, which means the whole roster is the editor.
 */
export function RosterEditor({ rows }: { rows: RosterRow[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Record<string, RosterDraft>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [offboarding, setOffboarding] = useState<string | null>(null);
  const [offboardReason, setOffboardReason] = useState('');

  useEffect(() => {
    setDraft((current) => {
      const next: Record<string, RosterDraft> = {};
      for (const row of rows) {
        const edited = current[row.profileId];
        if (edited && !sameRosterChoices(edited, row)) {
          next[row.profileId] = edited;
        }
      }
      return Object.keys(next).length === Object.keys(current).length
        ? current
        : next;
    });
  }, [rows]);

  if (rows.length === 0) {
    return (
      <p className="text-pana-ink/60 text-sm leading-relaxed">
        There are no active connectors. Accepted applications and reactivated
        connectors appear here.
      </p>
    );
  }

  function toggleHouse(original: RosterRow, house: HouseId) {
    setDraft((current) => {
      const row = current[original.profileId] ?? original;
      const has = row.houses.includes(house);
      return {
        ...current,
        [original.profileId]: {
          tier: row.tier,
          houses: has
            ? row.houses.filter((h) => h !== house)
            : [...row.houses, house],
        },
      };
    });
    setSaved(null);
  }

  async function save(row: RosterRow) {
    const { profileId } = row;
    setBusy(profileId);
    setError(null);
    setSaved(null);

    const failure = await post('/api/admin/connectors/roster', 'PATCH', {
      profileId,
      houses: row.houses,
      tier: row.tier,
    });

    setBusy(null);
    if (failure) {
      setError(failure);
      return;
    }

    setSaved(profileId);
    router.refresh();
  }

  async function offboard(profileId: string) {
    if (!offboardReason.trim()) {
      setError('Record why they are leaving the programme.');
      return;
    }
    setBusy(profileId);
    setError(null);

    const failure = await post('/api/admin/connectors/roster', 'DELETE', {
      profileId,
      reason: offboardReason,
    });

    setBusy(null);
    if (failure) {
      setError(failure);
      return;
    }
    setOffboarding(null);
    setOffboardReason('');
    router.refresh();
  }

  return (
    <>
      <p className="text-pana-ink/70 mb-4 text-sm leading-relaxed">
        A house is not an assignment to hand down — have the conversation first,
        then record what they picked. Somebody can be in more than one.
      </p>

      <div className="flex flex-col gap-3">
        {rows.map((original) => {
          const row = { ...original, ...draft[original.profileId] };
          const dirty = !sameRosterChoices(row, original);

          return (
            <div
              key={row.profileId}
              role="group"
              aria-label={`Connector ${row.displayName}`}
              className="border-pana-ink/15 flex flex-wrap items-center gap-x-4 gap-y-3 border-b-2 pb-3 last:border-b-0"
            >
              <div className="min-w-[10rem] flex-1">
                <p className="font-bold">{row.displayName}</p>
                <p className="text-pana-ink/60 text-xs">
                  {getPod(row.pod).name}
                </p>
              </div>

              <fieldset className="flex flex-wrap gap-1.5">
                <legend className="sr-only">
                  Houses for {row.displayName}
                </legend>
                {HOUSES.map((house) => {
                  const on = row.houses.includes(house.id);
                  return (
                    <label
                      key={house.id}
                      className={`cursor-pointer rounded-full border-2 px-2.5 py-1 text-xs font-extrabold transition ${
                        on
                          ? 'border-pana-ink bg-pana-ink text-pana-cream'
                          : 'border-pana-ink/30 text-pana-ink/60'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={on}
                        onChange={() => toggleHouse(row, house.id)}
                      />
                      {house.name}
                    </label>
                  );
                })}
              </fieldset>

              <label className="flex items-center gap-2 text-xs">
                <span className="sr-only">Tier for {row.displayName}</span>
                <select
                  className={`${FIELD} w-auto py-1.5`}
                  value={row.tier}
                  onChange={(e) => {
                    const tier = Number(e.target.value) as TierId;
                    setDraft((c) => ({
                      ...c,
                      [row.profileId]: {
                        houses: (c[row.profileId] ?? row).houses,
                        tier,
                      },
                    }));
                    setSaved(null);
                  }}
                >
                  {TIERS.map((t) => (
                    <option key={t.id} value={t.id}>
                      Tier {t.id} — {t.name}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={() => save(row)}
                disabled={!dirty || busy === row.profileId}
                className={`rounded-full px-4 py-1.5 text-xs font-extrabold transition disabled:opacity-40 ${ADMIN_CHROME.FILL} ${ADMIN_CHROME.ON_FILL}`}
              >
                {busy === row.profileId
                  ? 'Saving…'
                  : saved === row.profileId && !dirty
                    ? 'Saved'
                    : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setOffboarding(row.profileId);
                  setOffboardReason('');
                  setError(null);
                }}
                disabled={busy === row.profileId}
                className="border-pana-red text-pana-red-deep rounded-full border-2 px-3 py-1 text-xs font-extrabold"
              >
                Offboard
              </button>
              {offboarding === row.profileId ? (
                <div className="border-pana-red/30 bg-pana-red/5 basis-full rounded-xl border-2 p-4">
                  <p className="text-sm font-extrabold">
                    Remove {row.displayName} from Pana Connectors?
                  </p>
                  <p className="text-pana-ink/65 mt-1 text-xs leading-relaxed">
                    They will leave the active roster, scheduling, and Connector
                    notification audience. Their past commitments remain in the
                    record.
                  </p>
                  <label className="mt-3 block">
                    <span className={LABEL}>Internal reason</span>
                    <textarea
                      value={offboardReason}
                      onChange={(event) =>
                        setOffboardReason(event.target.value)
                      }
                      maxLength={500}
                      rows={2}
                      className={`${FIELD} mt-1.5 resize-y`}
                    />
                  </label>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => offboard(row.profileId)}
                      disabled={busy === row.profileId}
                      className="bg-pana-red text-pana-ink rounded-full px-4 py-2 text-xs font-extrabold disabled:opacity-50"
                    >
                      {busy === row.profileId
                        ? 'Offboarding…'
                        : 'Confirm offboarding'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOffboarding(null);
                        setOffboardReason('');
                      }}
                      disabled={busy === row.profileId}
                      className="border-pana-ink/25 rounded-full border-2 px-4 py-2 text-xs font-extrabold"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <Err message={error} />
    </>
  );
}

export interface InactiveRosterRow extends RosterRow {
  offboardReason: string | null;
}

export function InactiveRoster({ rows }: { rows: InactiveRosterRow[] }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restored, setRestored] = useState<string | null>(null);

  async function reactivate(row: InactiveRosterRow) {
    setBusy(row.profileId);
    setError(null);
    setRestored(null);
    const failure = await post('/api/admin/connectors/roster', 'POST', {
      profileId: row.profileId,
    });
    setBusy(null);
    if (failure) {
      setError(failure);
      return;
    }
    setConfirming(null);
    setRestored(`${row.displayName} is back on the active roster.`);
    router.refresh();
  }

  return (
    <>
      <p className="text-pana-ink/70 text-sm leading-relaxed">
        {rows.length === 0
          ? 'No offboarded connectors.'
          : 'Reactivate a connector to restore HQ access at their existing tier. Their preferences, commitments, and offboarding record stay intact. This does not reopen the signup form.'}
      </p>
      {restored ? (
        <p role="status" className="mt-3 text-sm font-bold">
          {restored}
        </p>
      ) : null}
      <div className="mt-4 flex flex-col gap-4">
        {rows.map((row) => (
          <div
            key={row.profileId}
            role="group"
            aria-label={`Offboarded connector ${row.displayName}`}
            className="border-pana-ink/15 border-b-2 pb-4 last:border-b-0"
          >
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-bold [overflow-wrap:anywhere]">
                  {row.displayName}
                </p>
                <p className="text-pana-ink/60 text-xs">
                  {getPod(row.pod).name} / Tier {row.tier}
                </p>
              </div>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => {
                  setConfirming(row.profileId);
                  setError(null);
                  setRestored(null);
                }}
                className={`min-h-11 rounded-full px-4 py-2 text-xs font-extrabold disabled:opacity-50 ${ADMIN_CHROME.FILL} ${ADMIN_CHROME.ON_FILL}`}
              >
                Reactivate
              </button>
            </div>
            {row.offboardReason ? (
              <p className="text-pana-ink/65 mt-2 text-sm [overflow-wrap:anywhere] whitespace-pre-wrap">
                Internal offboarding reason: {row.offboardReason}
              </p>
            ) : null}
            {confirming === row.profileId ? (
              <div className="border-pana-blue/40 mt-3 rounded-xl border-2 p-4">
                <p className="text-sm font-extrabold">
                  Reactivate {row.displayName}?
                </p>
                <p className="text-pana-ink/65 mt-1 text-xs leading-relaxed">
                  They will return to the active roster, scheduling, and
                  Connector notification audience with their existing work.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => reactivate(row)}
                    disabled={busy !== null}
                    className={`min-h-11 rounded-full px-4 py-2 text-xs font-extrabold disabled:opacity-50 ${ADMIN_CHROME.FILL} ${ADMIN_CHROME.ON_FILL}`}
                  >
                    {busy === row.profileId
                      ? 'Reactivating…'
                      : 'Confirm reactivation'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirming(null);
                      setError(null);
                    }}
                    disabled={busy !== null}
                    className="border-pana-ink/25 min-h-11 rounded-full border-2 px-4 py-2 text-xs font-extrabold"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <Err message={error} />
    </>
  );
}

/* ------------------------------------------------------------------- tasks */

export interface TaskTarget {
  profileId: string;
  displayName: string;
  /* Loose on purpose: houses comes off a JSON column, so a value nobody
   * recognises has to survive the trip rather than fail a narrowing. The
   * dropdown below filters against the known houses anyway, so an unknown
   * one simply offers nothing — which is the right outcome. */
  houses: readonly string[];
}

/**
 * Put a task on one connector's board.
 *
 * Bound to a single person rather than offering a picker. It is rendered from
 * a row of the load table, so the connector has already been chosen — by the
 * more useful route of seeing what they are carrying first. Asking again in a
 * dropdown would be asking a question that has just been answered.
 *
 * The house dropdown narrows to the houses this connector is actually in. A
 * task filed under a house somebody does not belong to would show up on their
 * board under a heading that does not apply to them, and would be counted in
 * that house's workload by anybody reading the tallies. Because the person is
 * fixed, that list is known on first render — there is no disabled state
 * waiting on a selection.
 *
 * `onDone` fires only after a save succeeds, so the caller can close the row.
 * A failed submit leaves everything where it is, with the typing intact.
 */
export function SetTaskForm({
  connector,
  events = [],
  onDone,
}: {
  connector: TaskTarget;
  events?: AssignableEvent[];
  onDone?: () => void;
}) {
  const router = useRouter();
  const profileId = connector.profileId;
  const [what, setWhat] = useState('');
  const [when, setWhen] = useState('');
  const [house, setHouse] = useState<string>('');
  const [hours, setHours] = useState('');
  const [event, setEvent] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const houseChoices = HOUSES.filter((h) => connector.houses.includes(h.id));

  async function submit(e: React.FormEvent) {
    e.preventDefault();

    /* Checked here as well as on the route so a typo is caught without a
     * round trip. Blank is allowed and means "not estimated" — the scheduling
     * table reports that as a gap rather than as zero. */
    const estimatedMinutes = parseHours(hours);
    if (estimatedMinutes === 'invalid') {
      setError(`Hours must be a number between 0 and ${MAX_HOURS}.`);
      return;
    }

    setBusy(true);
    setError(null);

    const failure = await post('/api/admin/connectors/tasks', 'POST', {
      profileId,
      what,
      when: when || null,
      house,
      estimatedMinutes,
      event: event || null,
    });

    setBusy(false);
    if (failure) {
      setError(failure);
      return;
    }

    setWhat('');
    setWhen('');
    setHours('');
    setEvent('');
    router.refresh();
    onDone?.();
  }

  return (
    <form onSubmit={submit}>
      {/* Three across once there is room. With the connector already decided
       * these are all the required fields, so on a wide screen they form a
       * single line — the whole ask readable without the eye travelling. The
       * form opens inside a list row, so every line it saves is a line of
       * roster that stays visible underneath it. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label>
          <span className={LABEL}>What</span>
          <input
            required
            maxLength={500}
            className={`${FIELD} mt-1`}
            placeholder="Distribute zines in Allapattah"
            value={what}
            onChange={(e) => setWhat(e.target.value)}
          />
        </label>

        <label>
          <span className={LABEL}>When</span>
          <input
            maxLength={120}
            className={`${FIELD} mt-1`}
            placeholder="Before the end of the month"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
          />
        </label>

        <label>
          <span className={LABEL}>House</span>
          <select
            required
            className={`${FIELD} mt-1`}
            value={house}
            onChange={(e) => setHouse(e.target.value)}
          >
            <option value="">Pick a house</option>
            {houseChoices.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Optional, and placed after the required fields so it never looks like
          a step. Most work is not an event — "drop off zines at four shops"
          has no date on anyone's calendar — so the empty option is the
          default and is phrased as a real choice rather than as a blank.

          Drawn even with nothing to pick, disabled. Hiding it entirely was
          tidier but made the capability undiscoverable: the form jumped
          straight from House to the estimate, and the only way to learn that
          a commitment can name an event was to put one on the calendar and
          notice a new field. A disabled control answers the question in
          place, and says where to go. */}
      <label className="mt-3 block">
        <span className={LABEL}>For an event</span>
        {events.length === 0 ? (
          <select
            className={`${FIELD} mt-1 cursor-not-allowed opacity-60`}
            disabled
            value=""
          >
            <option value="">Nothing on the calendar yet</option>
          </select>
        ) : (
          <select
            className={`${FIELD} mt-1`}
            value={event}
            onChange={(e) => setEvent(e.target.value)}
          >
            <option value="">Not tied to an event</option>
            {PROGRAMME_FIRST.map(({ kind, label }) => {
              const group = events.filter((option) => option.kind === kind);
              if (group.length === 0) return null;
              return (
                <optgroup key={kind} label={label}>
                  {group.map((option) => (
                    <option key={eventValue(option)} value={eventValue(option)}>
                      {formatDay(new Date(option.startsAt))} — {option.title}
                      {option.where ? ` · ${option.where}` : ''}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        )}
      </label>
      {/* Outside the label rather than inside it: the empty-state copy carries
          a link, and a link inside a label is activated twice over — once as
          itself and once as the label's control. */}
      <p className="text-pana-ink/55 mt-2 text-xs leading-relaxed">
        {events.length === 0 ? (
          <>
            Add one under{' '}
            <SurfaceLink
              href="/admin/connectors"
              className="text-pana-indigo font-bold underline underline-offset-2"
            >
              Coming up
            </SurfaceLink>{' '}
            on the Connectors overview, or publish an event with Panamia as the
            host. Only events still ahead of today can be staffed, and only
            Panamia&rsquo;s own — a pana&rsquo;s event is not connector work.
          </>
        ) : (
          <>
            Attaching it counts this person toward that event&rsquo;s crew, so
            the board can tell a staffed event from one nobody has picked up.
          </>
        )}
      </p>

      {/* Presets first, free entry behind them. The estimate is the field most
          likely to be skipped, and skipping it costs the scheduling table its
          figure — a row of one-tap answers is the difference between people
          filling it in and people leaving it blank. Typing an exact number
          stays available for work that needs it. */}
      <fieldset className="mt-3">
        <legend className={LABEL}>How long, roughly</legend>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {HOUR_PRESETS.map((minutes) => {
            const value = minutesToHoursInput(minutes);
            const chosen = hours === value;
            return (
              <button
                key={minutes}
                type="button"
                aria-pressed={chosen}
                onClick={() => setHours(chosen ? '' : value)}
                className={[
                  'rounded-full border-2 px-3 py-1 text-xs font-extrabold transition',
                  chosen
                    ? `${ADMIN_CHROME.FILL} ${ADMIN_CHROME.ON_FILL} border-transparent`
                    : 'border-pana-ink/30 text-pana-ink/70 hover:border-pana-ink hover:text-pana-ink',
                ].join(' ')}
              >
                {formatMinutes(minutes)}
              </button>
            );
          })}

          <label className="flex items-center gap-2">
            <span className="sr-only">Hours</span>
            <input
              type="number"
              min="0"
              max={MAX_HOURS}
              step="0.25"
              inputMode="decimal"
              className={`${FIELD} w-28`}
              placeholder="or hours"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
          </label>

          {hours !== '' && (
            <button
              type="button"
              onClick={() => setHours('')}
              className="text-pana-ink/60 hover:text-pana-ink text-xs font-bold underline underline-offset-4"
            >
              Clear
            </button>
          )}
        </div>
        <p className="text-pana-ink/55 mt-2 text-xs leading-relaxed">
          Optional. Leaving it blank is fine — the task still appears on their
          board, but it will show as unsized on the scheduling page instead of
          counting toward anyone&rsquo;s load.
        </p>
      </fieldset>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="submit"
          disabled={busy || !what || !house}
          className={`rounded-full px-5 py-2 text-sm font-extrabold transition disabled:opacity-40 ${ADMIN_CHROME.FILL} ${ADMIN_CHROME.ON_FILL}`}
        >
          {busy ? 'Adding…' : 'Add commitment'}
        </button>

        {onDone && (
          <button
            type="button"
            onClick={onDone}
            disabled={busy}
            className="text-pana-ink/60 hover:text-pana-ink text-sm font-bold underline underline-offset-4 disabled:opacity-40"
          >
            Cancel
          </button>
        )}
      </div>

      <Err message={error} />
    </form>
  );
}

/* ------------------------------------------------------------------ events */

/** Cancel / reschedule / delete, rendered under an existing event. */
function EventControls({ event }: { event: ConnectorEvent }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [next, setNext] = useState('');

  async function run(
    method: 'PATCH' | 'DELETE',
    body?: unknown,
    query?: string
  ) {
    setBusy(true);
    setError(null);
    const failure = await post(
      `/api/admin/connectors/events${query ?? ''}`,
      method,
      body
    );
    setBusy(false);
    if (failure) {
      setError(failure);
      return;
    }
    setMoving(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      {moving ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex-1">
            <span className={LABEL}>Next date</span>
            <input
              type="datetime-local"
              className={`${FIELD} mt-1`}
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={busy || !next}
            onClick={() => {
              /* Resolved here, in the browser, where the typist's zone is the
               * one that settles it. Posting the raw field put 5pm Miami into
               * the database as 5pm UTC — see lib/datetime-local.ts. */
              const startsAt = localInputToIso(next);
              if (!startsAt) {
                setError('That is not a date and time.');
                return;
              }
              void run('PATCH', { id: event.id, startsAt });
            }}
            className={`rounded-full px-4 py-2 text-xs font-extrabold disabled:opacity-40 ${ADMIN_CHROME.FILL} ${ADMIN_CHROME.ON_FILL}`}
          >
            Move
          </button>
          <button
            type="button"
            onClick={() => setMoving(false)}
            className="text-pana-ink/60 px-2 py-2 text-xs font-bold underline"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 text-xs font-extrabold">
          <button
            type="button"
            onClick={() => setMoving(true)}
            className="border-pana-ink/30 rounded-full border-2 px-3 py-1.5"
          >
            Reschedule
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run('PATCH', {
                id: event.id,
                cancelled: event.cancelledAt === null,
              })
            }
            className="border-pana-ink/30 rounded-full border-2 px-3 py-1.5 disabled:opacity-40"
          >
            {event.cancelledAt === null ? 'Call it off' : 'Back on'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              /* Delete is for the event that should never have been posted.
                 Cancelling tells people it is off; deleting tells them
                 nothing, so it asks first. */
              if (
                window.confirm(
                  'Delete this event? Nobody is told. If it was real and is now off, call it off instead.'
                )
              ) {
                run('DELETE', undefined, `?id=${encodeURIComponent(event.id)}`);
              }
            }}
            className="text-pana-red px-2 py-1.5 underline disabled:opacity-40"
          >
            Delete
          </button>
        </div>
      )}
      <Err message={error} />
    </div>
  );
}

export function EventBoard({
  upcoming,
  staleRecurring,
}: {
  upcoming: ConnectorEvent[];
  staleRecurring: ConnectorEvent[];
}) {
  return (
    <>
      {staleRecurring.length > 0 && (
        <div className="border-pana-burnt bg-pana-butter-2 mb-6 rounded-xl border-2 p-5">
          <h3 className="text-sm font-extrabold tracking-wide uppercase">
            Needs a new date
          </h3>
          <p className="text-pana-ink/70 mt-2 text-sm leading-relaxed">
            These repeat, but their next date has already passed, so members are
            looking at a gathering that has been and gone. Move them forward or
            call them off.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {staleRecurring.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                action={<EventControls event={event} />}
              />
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {upcoming.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            action={<EventControls event={event} />}
          />
        ))}
        <NewEventForm />
      </div>
    </>
  );
}

function NewEventForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [when, setWhen] = useState('');
  const [location, setLocation] = useState('');
  const [lead, setLead] = useState('');
  const [cadence, setCadence] = useState<Cadence>('once');
  const [pod, setPod] = useState('');
  const [volunteersNeeded, setVolunteersNeeded] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();

    /* Converted before anything else, and in the browser: the field is wall
     * clock with no zone, and the server runs in UTC. See
     * lib/datetime-local.ts for the four hours this used to lose. */
    const startsAtIso = localInputToIso(startsAt);
    if (!startsAtIso) {
      setError('That is not a date and time.');
      return;
    }

    setBusy(true);
    setError(null);

    const failure = await post('/api/admin/connectors/events', 'POST', {
      title,
      startsAt: startsAtIso,
      when: when || null,
      location: location || null,
      lead: lead || null,
      cadence,
      pod: pod || null,
      volunteersNeeded: volunteersNeeded === '' ? null : volunteersNeeded,
    });

    setBusy(false);
    if (failure) {
      setError(failure);
      return;
    }

    setTitle('');
    setStartsAt('');
    setWhen('');
    setLocation('');
    setLead('');
    setVolunteersNeeded('');
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border-pana-ink/40 text-pana-ink/70 hover:border-pana-ink hover:text-pana-ink flex min-h-[12rem] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-5 text-lg font-extrabold transition"
      >
        <span aria-hidden>+</span>
        Set an event
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="border-pana-ink flex flex-col gap-2.5 rounded-xl border-2 p-5"
    >
      <h3 className="text-lg leading-tight font-extrabold">Set an event</h3>

      <label>
        <span className={LABEL}>Title</span>
        <input
          required
          maxLength={160}
          className={`${FIELD} mt-1`}
          placeholder="Allapattah pod gathering"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>

      <label>
        <span className={LABEL}>Next date &amp; time</span>
        <input
          required
          type="datetime-local"
          className={`${FIELD} mt-1`}
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
        />
      </label>

      <label>
        <span className={LABEL}>How you say it</span>
        <input
          maxLength={120}
          className={`${FIELD} mt-1`}
          placeholder="Thursdays @ 5p"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
        />
      </label>

      <label>
        <span className={LABEL}>Where</span>
        <input
          maxLength={200}
          className={`${FIELD} mt-1`}
          placeholder="Bryant Park, north side"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
      </label>

      <label>
        <span className={LABEL}>Lead</span>
        <input
          maxLength={120}
          className={`${FIELD} mt-1`}
          placeholder="Who to find when you get there"
          value={lead}
          onChange={(e) => setLead(e.target.value)}
        />
      </label>

      <label>
        <span className={LABEL}>Cadence</span>
        <select
          className={`${FIELD} mt-1`}
          value={cadence}
          onChange={(e) => setCadence(e.target.value as Cadence)}
        >
          {CADENCES.map((c) => (
            <option key={c} value={c}>
              {CADENCE_LABEL[c]}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span className={LABEL}>Pod</span>
        <select
          className={`${FIELD} mt-1`}
          value={pod}
          onChange={(e) => setPod(e.target.value)}
        >
          <option value="">Everyone</option>
          {PODS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span className={LABEL}>Volunteers needed</span>
        <input
          type="number"
          min={1}
          className={`${FIELD} mt-1`}
          placeholder="Leave blank for no cap"
          value={volunteersNeeded}
          onChange={(e) => setVolunteersNeeded(e.target.value)}
        />
      </label>

      <div className="mt-1 flex items-center gap-3">
        <button
          type="submit"
          disabled={busy || !title || !startsAt}
          className={`rounded-full px-5 py-2 text-sm font-extrabold disabled:opacity-40 ${ADMIN_CHROME.FILL} ${ADMIN_CHROME.ON_FILL}`}
        >
          {busy ? 'Adding…' : 'Add event'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-pana-ink/60 text-sm font-bold underline"
        >
          Cancel
        </button>
      </div>

      <Err message={error} />
    </form>
  );
}
