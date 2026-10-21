import { and, eq, isNotNull, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { profiles } from '@/lib/schema';
import {
  HOUSES,
  PODS,
  type HouseId,
  type PodId,
  type TierId,
} from '@/lib/connectors/model';

/**
 * Connectors programme membership, as stored on `profiles.connector`.
 *
 * This is the real thing that replaced the fixture roster. The surface
 * originally shipped as a mock: a hardcoded demo connector was shown to
 * everybody, so a signed-in member was greeted by somebody else's name. The
 * column added in drizzle/0055_profile_connector.sql is what this module
 * reads and writes.
 *
 * ## Why parse rather than cast
 *
 * The sibling blobs on `profiles` are read with a straight `as` cast (see
 * `app/m/profile/page.tsx` doing `profile.mentoring as ProfileMentoring`).
 * That is fine when the only writer is a form you control and the only reader
 * renders a string. It is not fine here, because this blob decides programme
 * state: which houses you are in and what tier you are shown at.
 *
 * A cast asserts a shape that nothing checks. Anything already in the column —
 * written by an older build, hand-edited during support, or restored from a
 * backup taken before a shape change — would flow straight into the page and
 * fail somewhere further away, as a blank house pill or a crash in `getHouse`.
 * `parseConnector` instead returns `null` for anything it does not recognise,
 * so a malformed blob degrades to "not a connector yet" — a state the UI
 * already handles and the member can fix by joining again.
 *
 * It also drops unknown houses rather than rejecting the whole record, which
 * is what lets a house be retired from `HOUSES` without stranding every member
 * who had picked it.
 *
 * ## Why there is a status
 *
 * Applying is not joining. The programme accepts people rather than letting
 * anyone who finds the URL award themselves a place, so a record exists from
 * the moment somebody applies and only counts as membership once staff have
 * said yes. This mirrors `venues.status`, which goes `pending_review` →
 * `active` through `app/api/admin/venues/[slug]/approve/route.ts`.
 *
 * The status lives inside this blob rather than in a new column, so adding the
 * gate needed no migration — 0055 already shipped the column, and a jsonb
 * value has no shape for the database to disagree with.
 */

/**
 * Where an application has got to.
 *
 * `pending` is the state everybody starts in. `active` is the only one that
 * means "is a connector" — it is what gates HQ, the pod headcount and the
 * ability to record a commitment.
 */
export type ConnectorStatus = 'pending' | 'active' | 'declined' | 'inactive';

export interface ProfileConnector {
  status: ConnectorStatus;
  pod: PodId;
  houses: HouseId[];
  /**
   * Always 1 on join. Stored rather than derived because tiers move over time
   * and staff can change one from the console — see `setHousesAndTier`.
   */
  tier: TierId;
  /** What this person said they can bring. Free text, may be empty. */
  bring: string;
  /** When they applied. Not when they were accepted — see `decidedAt`. */
  appliedAt: string;
  /** When staff accepted or declined them, and who did it. */
  decidedAt: string | null;
  decidedBy: string | null;
  /** Staff offboarding is distinct from declining the original application. */
  offboardedAt: string | null;
  offboardedBy: string | null;
  /** Internal staff note. Never rendered to the member. */
  offboardReason: string | null;
}

const POD_IDS = new Set<string>(PODS.map((p) => p.id));
const HOUSE_IDS = new Set<string>(HOUSES.map((h) => h.id));
const STATUSES: ReadonlySet<string> = new Set([
  'pending',
  'active',
  'declined',
  'inactive',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Turn whatever is in the column into membership, or `null`.
 *
 * `null` is returned for a record with no recognised house as well as for a
 * malformed one. A connector who is in no house has nothing for HQ to show
 * and no way to reach the tier ladder, so treating that as "not joined yet"
 * routes them back to the form instead of to an empty dashboard.
 *
 * A missing or unrecognised status reads as `pending`, never `active`. This
 * fails closed: the failure mode of guessing wrong is either "somebody waits
 * for an approval they already had" or "somebody is in the programme without
 * being accepted", and only the first is recoverable by a human clicking
 * Accept. It also means the records written in the window between the column
 * shipping and this gate landing are reviewed rather than grandfathered in.
 */
export function parseConnector(value: unknown): ProfileConnector | null {
  if (!isRecord(value)) return null;

  const pod = value.pod;
  if (typeof pod !== 'string' || !POD_IDS.has(pod)) return null;

  const houses = Array.isArray(value.houses)
    ? value.houses.filter(
        (h): h is HouseId => typeof h === 'string' && HOUSE_IDS.has(h)
      )
    : [];
  if (houses.length === 0) return null;

  const tier = value.tier;

  /* `joinedAt` is the name this field had before applying and being accepted
   * were separate events. Records written then are applications. */
  const appliedAt =
    typeof value.appliedAt === 'string'
      ? value.appliedAt
      : typeof value.joinedAt === 'string'
        ? value.joinedAt
        : new Date(0).toISOString();

  return {
    status:
      typeof value.status === 'string' && STATUSES.has(value.status)
        ? (value.status as ConnectorStatus)
        : 'pending',
    pod: pod as PodId,
    houses: [...new Set(houses)],
    tier: tier === 1 || tier === 2 || tier === 3 ? (tier as TierId) : 1,
    bring: typeof value.bring === 'string' ? value.bring.trim() : '',
    appliedAt,
    decidedAt: typeof value.decidedAt === 'string' ? value.decidedAt : null,
    decidedBy: typeof value.decidedBy === 'string' ? value.decidedBy : null,
    offboardedAt:
      typeof value.offboardedAt === 'string' ? value.offboardedAt : null,
    offboardedBy:
      typeof value.offboardedBy === 'string' ? value.offboardedBy : null,
    offboardReason:
      typeof value.offboardReason === 'string'
        ? value.offboardReason.trim()
        : null,
  };
}

export interface ConnectorIdentity {
  profileId: string;
  /** What to greet them as. Falls back through the names a profile may have. */
  displayName: string;
  /**
   * Their Pana profile photo, or `null` if they have not set one.
   *
   * The same `primaryImageCdn` the account bubble in the masthead draws, so
   * the face in the greeting and the face in the corner are one picture. A
   * member who changes it in settings changes both.
   */
  imageUrl: string | null;
  membership: ProfileConnector;
}

/** The best name a profile has, preferring what they chose to be called. */
function displayNameOf(profile: {
  name: string;
  screenname: string | null;
  email: string;
}): string {
  return (
    profile.name.trim() ||
    profile.screenname?.trim() ||
    profile.email.split('@')[0]
  );
}

/**
 * The signed-in person's own membership, or `null` if they have not applied.
 *
 * Returns pending and declined applications too. HQ needs to tell those three
 * states apart — "we have your application", "you were not taken on this time"
 * and "you have not applied" are different pages — so the filtering is left to
 * the caller rather than done here.
 *
 * Deliberately keyed on `profiles.userId` rather than going through
 * `getActiveProfile`. That helper resolves the profile somebody is *acting
 * as*, which may be a business listing they administer — and membership of
 * the Connectors programme belongs to the human, not to their shop. Using the
 * active profile would let one person hold several memberships and would put
 * a business's name in the HQ greeting.
 */
export async function getMyConnector(
  userId: string
): Promise<ConnectorIdentity | null> {
  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.userId, userId),
    columns: {
      id: true,
      name: true,
      screenname: true,
      email: true,
      connector: true,
      primaryImageCdn: true,
    },
  });
  if (!profile) return null;

  const membership = parseConnector(profile.connector);
  if (!membership) return null;

  return {
    profileId: profile.id,
    displayName: displayNameOf(profile),
    imageUrl: profile.primaryImageCdn ?? null,
    membership,
  };
}

/**
 * How many connectors are in a pod.
 *
 * Counts accepted members only. A pending applicant is not yet a connector,
 * so including them would inflate the number HQ shows every member of that
 * pod and would quietly tell an applicant their application had landed.
 *
 * Uses the partial expression index from 0055 to find the pod, then filters on
 * status. Counts real members only, so a brand-new pod honestly reads 1 — you
 * — rather than borrowing a number from the fixtures it replaced.
 */
export async function countConnectorsInPod(pod: PodId): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(profiles)
    .where(
      and(
        isNotNull(profiles.connector),
        sql`${profiles.connector} ->> 'pod' = ${pod}`,
        sql`${profiles.connector} ->> 'status' = 'active'`
      )
    );

  return row?.count ?? 0;
}

export interface ConnectorApplication {
  profileId: string;
  displayName: string;
  email: string;
  membership: ProfileConnector;
}

/**
 * Everybody waiting to be let into the programme, oldest application first.
 *
 * Oldest first because this is a queue somebody works through, and the person
 * who has been waiting longest is the one most likely to have given up.
 */
export async function listConnectorApplications(): Promise<
  ConnectorApplication[]
> {
  const rows = await db.query.profiles.findMany({
    where: and(
      isNotNull(profiles.connector),
      sql`${profiles.connector} ->> 'status' = 'pending'`
    ),
    columns: {
      id: true,
      name: true,
      screenname: true,
      email: true,
      connector: true,
    },
  });

  return rows
    .flatMap((profile) => {
      const membership = parseConnector(profile.connector);
      if (!membership) return [];
      return [
        {
          profileId: profile.id,
          displayName: displayNameOf(profile),
          email: profile.email,
          membership,
        },
      ];
    })
    .sort((a, b) =>
      a.membership.appliedAt.localeCompare(b.membership.appliedAt)
    );
}

/**
 * How many applications are waiting, without reading them.
 *
 * The overview's stat band carries this number, but only the applications
 * page renders the rows. Calling `listConnectorApplications().length` for a
 * single figure would pull every pending profile — name, email, the whole
 * JSON column — and then throw all of it away.
 *
 * Counts in SQL on the same predicate the list uses, so the band and the
 * queue cannot disagree.
 */
export async function countConnectorApplications(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(profiles)
    .where(
      and(
        isNotNull(profiles.connector),
        sql`${profiles.connector} ->> 'status' = 'pending'`
      )
    );

  return row?.count ?? 0;
}

/**
 * Accept or decline an application.
 *
 * Reads the record first and writes the parsed shape back, so a decision also
 * normalises whatever was in the column. Returns `null` when there is nothing
 * to decide on, which the route turns into a 404 rather than silently
 * reporting success.
 *
 * Only `pending` records can be decided. Re-deciding an answered application
 * would let a second click on a stale queue page overturn a decision somebody
 * else had already made.
 */
export async function decideConnectorApplication(
  profileId: string,
  decision: 'active' | 'declined',
  adminUserId: string
): Promise<ProfileConnector | null> {
  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.id, profileId),
    columns: { id: true, connector: true },
  });
  if (!profile) return null;

  const membership = parseConnector(profile.connector);
  if (!membership || membership.status !== 'pending') return null;

  const decided: ProfileConnector = {
    ...membership,
    status: decision,
    decidedAt: new Date().toISOString(),
    decidedBy: adminUserId,
    offboardedAt: null,
    offboardedBy: null,
    offboardReason: null,
  };

  await db
    .update(profiles)
    .set({ connector: decided })
    .where(eq(profiles.id, profileId));

  return decided;
}
