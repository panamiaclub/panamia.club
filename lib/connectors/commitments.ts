import { and, asc, eq, gte, inArray, isNull, ne, desc, sql } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';

import { db, type DbInstance } from '@/lib/db';
import {
  connectorCommitments,
  connectorEvents,
  events,
  profiles,
  venues,
} from '@/lib/schema';
import { HOUSES } from '@/lib/connectors/model';
import type { ConnectorLoad } from '@/lib/connectors/hours';
import type {
  AssignableEvent,
  EventKind,
  EventStaffing,
} from '@/lib/connectors/event-link';
import type { CommitmentProgress, HouseId } from '@/lib/connectors/model';
import { officialHostGroupId } from '@/lib/server/official-host';

/**
 * Commitments: what a connector is actually doing.
 *
 * These used to live inside `profiles.connector`. drizzle/0056 moved them out
 * because the admin console can now set a task for somebody, and the blob was
 * only ever safe while each row had exactly one writer. The old route said so
 * itself — "if a second writer ever appears, this needs to move to its own
 * table rather than grow a lock" — and this is that move.
 *
 * ## One row type, three origins
 *
 * A task staff put on your board and a commitment you made yourself are the
 * same thing to everyone downstream: something you are going to do, in a
 * house, by roughly when, at some stage of done. They differ only in who
 * asked, which is one nullable column rather than a second table.
 *
 * `assignedBy` identifies staff assignments. `opportunityId` identifies an
 * opportunity the connector chose; neither set means self-authored work.
 *
 * ## Who may do what
 *
 * Progress is the connector's, always. Staff can put something on your board;
 * they cannot tick it off for you, because the only person who knows whether
 * the zines got dropped off is the person who did or did not drop them off.
 *
 * Deletion splits the other way. You may delete what you wrote — changing
 * your mind about your own commitment is the point of having one. You may not
 * delete what staff assigned you, because a task you can remove is a task you
 * were never really given, and the programme would have no way to tell "done"
 * from "gone". Declining an assignment is a conversation, and it leaves the
 * row visible until somebody has it.
 */

const HOUSE_IDS = new Set<string>(HOUSES.map((h) => h.id));
const PROGRESS_VALUES: ReadonlySet<string> = new Set([
  'notSet',
  'inProgress',
  'done',
]);

export const WHAT_MAX = 500;
export const WHEN_MAX = 120;

/**
 * A guard against one person's board growing without bound, not a product
 * rule. Nobody is meant to hit it; if somebody does, something is wrong with
 * how they are using the page rather than with how much they are doing.
 */
export const MAX_COMMITMENTS = 200;

export interface ConnectorCommitment {
  id: string;
  what: string;
  /** Free text on purpose: "this month", "before the 14th", "Saturdays". */
  when: string | null;
  house: HouseId;
  progress: CommitmentProgress;
  createdAt: string;
  /** Rough size in minutes. `null` means nobody has estimated it. */
  estimatedMinutes: number | null;
  /**
   * The event this staffs, if any. At most one of the two is set — see
   * `lib/connectors/event-link.ts` for why there are two columns.
   */
  eventId: string | null;
  connectorEventId: string | null;
  opportunityId: string | null;
  /**
   * The event's name, when the row came from a query that joined for it.
   * Absent — not null — when it was never looked up. See `toCommitment`.
   */
  eventTitle?: string | null;
  /** The user who set this as a task. `null` means self-authored. */
  assignedBy: string | null;
  assignedAt: string | null;
}

/** A commitment plus whose it is, for the programme-wide admin view. */
export interface ConnectorCommitmentWithOwner extends ConnectorCommitment {
  profileId: string;
  ownerName: string;
}

/**
 * The attached event's title, whichever table it lives in.
 *
 * One expression shared by both list queries so they cannot drift. The CHECK
 * in 0061 guarantees at most one side is non-null, so `coalesce` is a choice
 * between a value and a null rather than between two values.
 */
const EVENT_TITLE = sql<
  string | null
>`coalesce(${events.title}, ${connectorEvents.title})`;

function isHouse(value: string): value is HouseId {
  return HOUSE_IDS.has(value);
}

export function isProgress(value: unknown): value is CommitmentProgress {
  return typeof value === 'string' && PROGRESS_VALUES.has(value);
}

/**
 * The database has CHECK constraints on both of these, so a bad value cannot
 * get in through this application. It can still be sitting in a row written
 * before the constraint existed, or put there by hand during support, so rows
 * that fail to make sense are dropped rather than rendered — the same thing
 * `parseConnector` does with a malformed membership blob, and for the same
 * reason: a dashboard showing a commitment in no house is worse than one
 * showing a commitment fewer.
 */
type Row = {
  id: string;
  what: string;
  when: string | null;
  house: string;
  progress: string;
  createdAt: Date;
  estimatedMinutes: number | null;
  eventId: string | null;
  connectorEventId: string | null;
  opportunityId: string | null;
  assignedBy: string | null;
  assignedAt: Date | null;
  /** Joined in by the list queries only; absent on the insert's own return. */
  eventTitle?: string | null;
};

function toCommitment(row: Row): ConnectorCommitment | null {
  if (!isHouse(row.house)) return null;
  if (!isProgress(row.progress)) return null;

  return {
    id: row.id,
    what: row.what,
    when: row.when,
    house: row.house,
    progress: row.progress,
    createdAt: row.createdAt.toISOString(),
    estimatedMinutes: row.estimatedMinutes,
    eventId: row.eventId,
    connectorEventId: row.connectorEventId,
    opportunityId: row.opportunityId,
    /* Spread rather than set to null when missing. `createCommitment` does not
     * join, and reporting "no event" on a row that was just given one would be
     * wrong in a way the caller cannot detect. Absent says "not looked up". */
    ...(row.eventTitle !== undefined ? { eventTitle: row.eventTitle } : {}),
    assignedBy: row.assignedBy,
    assignedAt: row.assignedAt?.toISOString() ?? null,
  };
}

/**
 * Everything one connector is carrying, oldest first.
 *
 * Oldest first because a board is read as a history of what you took on, and
 * re-ordering it by urgency would need a notion of urgency that free-text
 * "when" cannot supply.
 */
export async function listCommitments(
  profileId: string
): Promise<ConnectorCommitment[]> {
  const rows = await db
    .select({
      id: connectorCommitments.id,
      what: connectorCommitments.what,
      when: connectorCommitments.when,
      house: connectorCommitments.house,
      progress: connectorCommitments.progress,
      createdAt: connectorCommitments.createdAt,
      estimatedMinutes: connectorCommitments.estimatedMinutes,
      eventId: connectorCommitments.eventId,
      connectorEventId: connectorCommitments.connectorEventId,
      opportunityId: connectorCommitments.opportunityId,
      eventTitle: EVENT_TITLE,
      assignedBy: connectorCommitments.assignedBy,
      assignedAt: connectorCommitments.assignedAt,
    })
    .from(connectorCommitments)
    .leftJoin(events, eq(events.id, connectorCommitments.eventId))
    .leftJoin(
      connectorEvents,
      eq(connectorEvents.id, connectorCommitments.connectorEventId)
    )
    .where(eq(connectorCommitments.profileId, profileId))
    .orderBy(asc(connectorCommitments.createdAt));

  return rows
    .map(toCommitment)
    .filter((c): c is ConnectorCommitment => c !== null);
}

export async function countCommitments(profileId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(connectorCommitments)
    .where(eq(connectorCommitments.profileId, profileId));

  return row?.count ?? 0;
}

export interface NewCommitment {
  profileId: string;
  what: string;
  when: string | null;
  house: HouseId;
  /** Rough size in minutes. Omit when nobody has estimated it. */
  estimatedMinutes?: number | null;
  /**
   * The event this staffs. Built by `eventColumns` so the pair cannot come
   * apart; passing both set violates the CHECK in drizzle/0061.
   */
  eventId?: string | null;
  connectorEventId?: string | null;
  /** Omit for a self-authored commitment; pass a user id for a staff task. */
  assignedBy?: string | null;
}

/**
 * Add a commitment, or assign one.
 *
 * `assignedAt` is set here rather than by the caller so that the pair cannot
 * come apart — the table has a CHECK requiring both halves or neither, and
 * the single place that can violate it is the single place that writes it.
 */
export async function createCommitment(
  input: NewCommitment
): Promise<ConnectorCommitment> {
  const assignedBy = input.assignedBy ?? null;
  const estimatedMinutes = input.estimatedMinutes ?? null;
  const eventId = input.eventId ?? null;
  const connectorEventId = input.connectorEventId ?? null;
  const now = new Date();

  const row = {
    id: createId(),
    profileId: input.profileId,
    what: input.what,
    when: input.when,
    house: input.house,
    progress: 'notSet' as const,
    estimatedMinutes,
    eventId,
    connectorEventId,
    opportunityId: null,
    assignedBy,
    assignedAt: assignedBy ? now : null,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(connectorCommitments).values(row);

  return {
    id: row.id,
    what: row.what,
    when: row.when,
    house: input.house,
    progress: 'notSet',
    createdAt: now.toISOString(),
    estimatedMinutes,
    eventId,
    connectorEventId,
    opportunityId: null,
    assignedBy,
    assignedAt: assignedBy ? now.toISOString() : null,
  };
}

/**
 * Move one of your own commitments along.
 *
 * Scoped by `profileId` in the WHERE rather than fetched and checked, so there
 * is no window between the check and the write, and so a guessed id belonging
 * to somebody else updates nothing instead of updating theirs. Returns false
 * when nothing matched, which the route turns into a 404.
 *
 * Applies to assigned tasks too: staff set what you are doing, you say how
 * far along it is.
 */
export async function setCommitmentProgress(
  profileId: string,
  commitmentId: string,
  progress: CommitmentProgress
): Promise<boolean> {
  const updated = await db
    .update(connectorCommitments)
    .set({ progress, updatedAt: new Date() })
    .where(
      and(
        eq(connectorCommitments.id, commitmentId),
        eq(connectorCommitments.profileId, profileId)
      )
    )
    .returning({ id: connectorCommitments.id });

  return updated.length > 0;
}

/**
 * Delete one of your own commitments.
 *
 * The `assignedBy IS NULL` clause is the rule, enforced in the WHERE: you can
 * drop what you wrote, not what you were asked to do. A connector trying to
 * delete an assigned task matches no row and gets the same "could not find
 * that" as a bad id — which is honest, because as far as this operation is
 * concerned there is nothing there to delete.
 */
export async function removeOwnCommitment(
  profileId: string,
  commitmentId: string
): Promise<boolean> {
  const deleted = await db
    .delete(connectorCommitments)
    .where(
      and(
        eq(connectorCommitments.id, commitmentId),
        eq(connectorCommitments.profileId, profileId),
        sql`${connectorCommitments.assignedBy} IS NULL`
      )
    )
    .returning({ id: connectorCommitments.id });

  return deleted.length > 0;
}

/** Staff removing a task they set. Not scoped to an owner — see the module docblock. */
export async function removeCommitmentAsStaff(
  commitmentId: string
): Promise<boolean> {
  const deleted = await db
    .delete(connectorCommitments)
    .where(eq(connectorCommitments.id, commitmentId))
    .returning({ id: connectorCommitments.id });

  return deleted.length > 0;
}

/**
 * Does this commitment exist on this person's board, and who put it there?
 *
 * Only for telling a failed write apart from a forbidden one after the fact.
 * The writes above enforce ownership in their own WHERE clauses, so this is
 * never the thing granting access — calling it first and then trusting the
 * answer would reintroduce exactly the gap those clauses close. It runs after
 * a write has already declined, purely so the member is told "that one was
 * assigned to you" instead of "not found".
 */
export async function findCommitment(
  profileId: string,
  commitmentId: string
): Promise<{ assignedBy: string | null } | null> {
  const [row] = await db
    .select({ assignedBy: connectorCommitments.assignedBy })
    .from(connectorCommitments)
    .where(
      and(
        eq(connectorCommitments.id, commitmentId),
        eq(connectorCommitments.profileId, profileId)
      )
    )
    .limit(1);

  return row ?? null;
}

/**
 * Programme work, newest first. Dashboard previews remain capped; the
 * filterable coordination view passes null to include the whole programme.
 */
export async function listOpenCommitments(
  limit: number | null = 50,
  includeCompleted = false
): Promise<ConnectorCommitmentWithOwner[]> {
  const query = db
    .select({
      id: connectorCommitments.id,
      what: connectorCommitments.what,
      when: connectorCommitments.when,
      house: connectorCommitments.house,
      progress: connectorCommitments.progress,
      createdAt: connectorCommitments.createdAt,
      estimatedMinutes: connectorCommitments.estimatedMinutes,
      eventId: connectorCommitments.eventId,
      connectorEventId: connectorCommitments.connectorEventId,
      opportunityId: connectorCommitments.opportunityId,
      eventTitle: EVENT_TITLE,
      assignedBy: connectorCommitments.assignedBy,
      assignedAt: connectorCommitments.assignedAt,
      profileId: connectorCommitments.profileId,
      name: profiles.name,
      screenname: profiles.screenname,
      email: profiles.email,
    })
    .from(connectorCommitments)
    .innerJoin(profiles, eq(profiles.id, connectorCommitments.profileId))
    .leftJoin(events, eq(events.id, connectorCommitments.eventId))
    .leftJoin(
      connectorEvents,
      eq(connectorEvents.id, connectorCommitments.connectorEventId)
    )
    .where(
      includeCompleted ? undefined : ne(connectorCommitments.progress, 'done')
    )
    .orderBy(desc(connectorCommitments.createdAt));
  const rows = await (limit === null ? query : query.limit(limit));

  return rows.flatMap((row) => {
    const base = toCommitment(row);
    if (!base) return [];
    return [
      {
        ...base,
        profileId: row.profileId,
        ownerName:
          row.name.trim() || row.screenname?.trim() || row.email.split('@')[0],
      },
    ];
  });
}

/**
 * How many commitments the programme is carrying, split by state.
 *
 * One grouped query rather than three counts, so the three numbers cannot
 * disagree with each other — which is the whole promise the admin page makes
 * about its stat band.
 */
export async function commitmentTotals(): Promise<{
  total: number;
  open: number;
  done: number;
  assigned: number;
}> {
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      done: sql<number>`count(*) filter (where ${connectorCommitments.progress} = 'done')::int`,
      assigned: sql<number>`count(*) filter (where ${connectorCommitments.assignedBy} is not null)::int`,
    })
    .from(connectorCommitments);

  const total = row?.total ?? 0;
  const done = row?.done ?? 0;

  return { total, open: total - done, done, assigned: row?.assigned ?? 0 };
}

/**
 * Who is working which event, keyed by event id.
 *
 * The mirror image of `connectorLoads`: that one groups open work by the
 * person carrying it, this one groups it by the thing it is for. Same rows,
 * same filter, opposite axis — which is what makes "this event is short two
 * people" and "this connector has room" answerable on the same page.
 *
 * Takes the kind rather than querying both columns at once because the two
 * id spaces are separate and a single map keyed by bare id could collide.
 * Callers hold one kind of event at a time and ask for that.
 *
 * Scoped to an explicit id list so this stays a lookup for events already on
 * screen rather than a scan of every commitment ever made. An empty list is
 * answered without touching the database — a page with no events should cost
 * no query.
 *
 * Open rows only, matching `connectorLoads`. Somebody who finished their shift
 * is no longer staffing the event in any sense a scheduler cares about; the
 * question this answers is "is anyone going to do this", not "did anyone".
 */
export async function eventStaffing(
  kind: EventKind,
  eventIds: string[]
): Promise<Map<string, EventStaffing>> {
  if (eventIds.length === 0) return new Map();

  const column =
    kind === 'public'
      ? connectorCommitments.eventId
      : connectorCommitments.connectorEventId;

  const rows = await db
    .select({
      eventId: column,
      connectors: sql<number>`count(*)::int`,
      estimatedMinutes: sql<number>`coalesce(sum(${connectorCommitments.estimatedMinutes}), 0)::int`,
      unestimated: sql<number>`(count(*) filter (where ${connectorCommitments.estimatedMinutes} is null))::int`,
    })
    .from(connectorCommitments)
    .where(
      and(inArray(column, eventIds), ne(connectorCommitments.progress, 'done'))
    )
    .groupBy(column);

  return new Map(
    rows.flatMap((row) =>
      row.eventId
        ? [
            [
              row.eventId,
              {
                connectors: row.connectors,
                estimatedMinutes: row.estimatedMinutes,
                unestimated: row.unestimated,
              },
            ] as const,
          ]
        : []
    )
  );
}

/**
 * The events a commitment may be attached to: everything still ahead.
 *
 * Both lists in one call because the assign form shows one dropdown, and
 * fetching them separately would let the two halves be from different moments.
 *
 * Past events are excluded. You cannot staff something that has happened, and
 * an admin scrolling a year of history to find next Saturday is the failure
 * this list exists to avoid. Cancelled programme events go too — they are not
 * work any more.
 *
 * Public events are limited to published ones: a draft has no date anybody has
 * agreed to, and assigning crew to it would commit people to a plan that may
 * never be announced.
 *
 * They are also limited to events PANAMIA HOSTS. Without that clause this
 * returned every published future event in the directory -- any pana's gig,
 * any club's meetup -- which is wrong twice over. Connectors are not staffed
 * to a stranger's event, and the `limit` below is soonest-first, so a busy
 * directory would push the Panamia event an admin is actually looking for off
 * the end of the list with nothing on screen saying it had been cut. A
 * dropdown that silently omits the answer is worse than a short one.
 *
 * Before Panamia has been set up as a host there is no id to scope to, and
 * the public half is skipped rather than left unfiltered. Returning nothing is
 * honest; returning everyone's events is the bug this clause exists to fix.
 */
export async function listAssignableEvents(): Promise<AssignableEvent[]> {
  const now = new Date();

  // Resolved before the pair rather than inside it: the public query cannot be
  // built without the id. Memoised after the first hit, so this is one extra
  // round trip on a cold isolate and none afterwards.
  const hostGroupId = await officialHostGroupId();

  const [programme, publicRows] = await Promise.all([
    db
      .select({
        id: connectorEvents.id,
        title: connectorEvents.title,
        startsAt: connectorEvents.startsAt,
        location: connectorEvents.location,
        volunteersNeeded: connectorEvents.volunteersNeeded,
      })
      .from(connectorEvents)
      .where(
        and(
          gte(connectorEvents.startsAt, now),
          isNull(connectorEvents.cancelledAt)
        )
      )
      .orderBy(asc(connectorEvents.startsAt))
      .limit(50),
    hostGroupId
      ? db
          .select({
            id: events.id,
            title: events.title,
            startsAt: events.startsAt,
            venueName: venues.name,
          })
          .from(events)
          .leftJoin(venues, eq(venues.id, events.venueId))
          .where(
            and(
              gte(events.startsAt, now),
              eq(events.status, 'published'),
              eq(events.hostGroupId, hostGroupId)
            )
          )
          .orderBy(asc(events.startsAt))
          .limit(50)
      : [],
  ]);

  return [
    ...programme.map((row): AssignableEvent => ({
      kind: 'programme',
      id: row.id,
      title: row.title,
      startsAt: row.startsAt.toISOString(),
      where: row.location,
      volunteersNeeded: row.volunteersNeeded,
    })),
    ...publicRows.map((row): AssignableEvent => ({
      kind: 'public',
      id: row.id,
      title: row.title,
      startsAt: row.startsAt.toISOString(),
      where: row.venueName,
      // Public events have no crew target. See AssignableEvent.
      volunteersNeeded: null,
    })),
  ].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/**
 * Does this event exist and is it still assignable?
 *
 * Called by the write path before inserting, so that a stale dropdown — one
 * rendered before somebody cancelled the event — is a 400 naming the problem
 * rather than a foreign key violation surfacing as a 500. The FK is still
 * what guarantees correctness; this only improves the message.
 *
 * It mirrors `listAssignableEvents` clause for clause, including the Panamia
 * host scope, and has to. The dropdown choosing not to offer somebody else's
 * event is a convenience; this is the gate. A request naming an event id
 * directly never passed through that select, so if the two ever disagree the
 * narrower list is decoration and this is the real rule.
 */
export async function assignableEventExists(
  kind: EventKind,
  id: string,
  options?: {
    database: Pick<DbInstance, 'select'>;
    hostGroupId: string | null;
    lock?: boolean;
  }
): Promise<boolean> {
  const now = new Date();
  const database = options?.database ?? db;

  if (kind === 'programme') {
    const query = database
      .select({ id: connectorEvents.id })
      .from(connectorEvents)
      .where(
        and(
          eq(connectorEvents.id, id),
          gte(connectorEvents.startsAt, now),
          isNull(connectorEvents.cancelledAt)
        )
      )
      .limit(1);
    const [row] = await (options?.lock ? query.for('share') : query);
    return Boolean(row);
  }

  const hostGroupId = options
    ? options.hostGroupId
    : await officialHostGroupId();
  // No Panamia, no Panamia-hosted event. Returning false here keeps the write
  // path shut rather than falling back to "any published event", which is the
  // state this scoping removed.
  if (!hostGroupId) return false;

  const query = database
    .select({ id: events.id })
    .from(events)
    .where(
      and(
        eq(events.id, id),
        gte(events.startsAt, now),
        eq(events.status, 'published'),
        eq(events.hostGroupId, hostGroupId)
      )
    )
    .limit(1);
  const [row] = await (options?.lock ? query.for('share') : query);
  return Boolean(row);
}

/**
 * How much each connector is carrying, keyed by profile.
 *
 * One grouped query over the open rows, for the same reason `commitmentTotals`
 * is one query: three numbers derived separately can disagree, and this set
 * gets rendered as a single sentence about a person.
 *
 * `SUM ... FILTER` and `COUNT ... FILTER` split the sized work from the
 * unsized in the database rather than in a loop here, so a connector whose
 * commitments were all written before drizzle/0059 comes back as
 * `{ open: 4, estimatedMinutes: 0, unestimated: 4 }` — visibly incomplete,
 * rather than as somebody with four things and no work.
 *
 * Returns a Map rather than an array because every caller has a roster in hand
 * and wants to look people up by id. Connectors with nothing open are absent;
 * `EMPTY_LOAD` is the caller's default, which keeps "carrying nothing" and
 * "not in the result" the same thing at the point of use.
 */
export async function connectorLoads(): Promise<Map<string, ConnectorLoad>> {
  const rows = await db
    .select({
      profileId: connectorCommitments.profileId,
      open: sql<number>`count(*)::int`,
      estimatedMinutes: sql<number>`coalesce(sum(${connectorCommitments.estimatedMinutes}), 0)::int`,
      unestimated: sql<number>`(count(*) filter (where ${connectorCommitments.estimatedMinutes} is null))::int`,
    })
    .from(connectorCommitments)
    .where(ne(connectorCommitments.progress, 'done'))
    .groupBy(connectorCommitments.profileId);

  return new Map(
    rows.map((row) => [
      row.profileId,
      {
        open: row.open,
        estimatedMinutes: row.estimatedMinutes,
        unestimated: row.unestimated,
      },
    ])
  );
}
