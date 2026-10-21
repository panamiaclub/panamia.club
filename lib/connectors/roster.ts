import { and, eq, isNotNull, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { profiles } from '@/lib/schema';
import {
  parseConnector,
  type ProfileConnector,
} from '@/lib/connectors/membership';
import { HOUSES, PODS, TIERS } from '@/lib/connectors/model';
import type { HouseId, PodId, TierId } from '@/lib/connectors/model';

/**
 * The programme's view of itself: who is in it, and how they are spread.
 *
 * `membership.ts` answers "what is this one person's record". This answers
 * "what does the programme look like", which is a different question with a
 * different shape — aggregates, rosters, and the writes only staff can make.
 *
 * ## There is no such thing as an unassigned connector
 *
 * The mock's console had an "Assign a house" panel listing people who had
 * joined without picking one. That state cannot occur: `parseConnector`
 * returns `null` for a record with no recognised house, so a house-less
 * membership is not a connector with a gap — it is not a connector at all,
 * and HQ already routes those people back to the join form.
 *
 * So assignment is not filling in a blank. It is *moving* somebody: adding a
 * second house when they start doing that work too, or correcting one picked
 * in haste at signup. The console reflects that — it edits the whole roster
 * rather than offering a queue of the unassigned that would always be empty.
 *
 * ## Why the tallies are counted in JavaScript
 *
 * Houses are an array inside a JSONB blob, so counting them in SQL means
 * `jsonb_array_elements` and a lateral join, and the result still has to be
 * reconciled with `parseConnector`'s rules about which houses count — a
 * retired house is dropped from a membership by the parser but would still be
 * counted by the database.
 *
 * One query that reads every active member and tallies in memory keeps a
 * single definition of what a house membership is. The programme is tens of
 * people; the day it is thousands, this becomes a materialised count and the
 * parser's rules move into the migration that builds it.
 */

/** Only `active` memberships are in these numbers. Applying is not joining. */
const IS_CONNECTOR = and(
  isNotNull(profiles.connector),
  sql`${profiles.connector} ->> 'status' = 'active'`
);

export interface RosterMember {
  profileId: string;
  displayName: string;
  email: string;
  imageUrl: string | null;
  membership: ProfileConnector;
}

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
 * Everybody in the programme, by name.
 *
 * Sorted by display name rather than by join date because this is the list you
 * come to when you are looking for a specific person to move between houses,
 * and alphabetical is the only order you can search by eye.
 */
export async function listRoster(): Promise<RosterMember[]> {
  const rows = await db.query.profiles.findMany({
    where: IS_CONNECTOR,
    columns: {
      id: true,
      name: true,
      screenname: true,
      email: true,
      connector: true,
      primaryImageCdn: true,
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
          imageUrl: profile.primaryImageCdn ?? null,
          membership,
        },
      ];
    })
    .sort((a, b) =>
      a.displayName.localeCompare(b.displayName, undefined, {
        sensitivity: 'base',
      })
    );
}

export interface Tally {
  id: string;
  label: string;
  count: number;
}

export interface RosterTallies {
  pods: Tally[];
  houses: Tally[];
  tiers: Tally[];
  total: number;
}

/**
 * How the programme is spread, counted from the roster it is given.
 *
 * Takes the roster as an argument rather than querying, so a page that already
 * has the list does not fetch it twice and the band provably counts the same
 * rows the table below it renders. That is the promise the console makes about
 * its own numbers: if the band and the table disagree, it is a bug here and
 * not in how you read it.
 *
 * Every pod, house and tier appears even at zero. A missing row reads as "no
 * data"; an explicit nought reads as "nobody is doing this", which is the fact
 * worth seeing — an empty house is the thing somebody needs to act on.
 *
 * House counts sum to more than the headcount, because a connector can be in
 * several. That is a property of the programme, not a bug in the tally.
 */
export function rosterTallies(roster: readonly RosterMember[]): RosterTallies {
  const podCounts = new Map<PodId, number>(PODS.map((p) => [p.id, 0]));
  const houseCounts = new Map<HouseId, number>(HOUSES.map((h) => [h.id, 0]));
  const tierCounts = new Map<TierId, number>(TIERS.map((t) => [t.id, 0]));

  for (const member of roster) {
    const { pod, houses, tier } = member.membership;
    podCounts.set(pod, (podCounts.get(pod) ?? 0) + 1);
    tierCounts.set(tier, (tierCounts.get(tier) ?? 0) + 1);
    for (const house of houses) {
      houseCounts.set(house, (houseCounts.get(house) ?? 0) + 1);
    }
  }

  return {
    total: roster.length,
    pods: PODS.map((p) => ({
      id: p.id,
      label: p.name,
      count: podCounts.get(p.id) ?? 0,
    })),
    houses: HOUSES.map((h) => ({
      id: h.id,
      label: h.name,
      count: houseCounts.get(h.id) ?? 0,
    })),
    tiers: TIERS.map((t) => ({
      id: String(t.id),
      label: `Tier ${t.id} — ${t.name}`,
      count: tierCounts.get(t.id) ?? 0,
    })),
  };
}

/** How many applications are waiting. Cheap enough to ask for on its own. */
export async function countPendingApplications(): Promise<number> {
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
 * Move somebody between houses, or change their tier.
 *
 * Read-modify-write on the membership blob, which deserves a word now that
 * staff can write it too. 0056 took commitments out of this column precisely
 * so that this write would be safe: what is left — status, pod, houses, tier,
 * bring — changes a handful of times in a membership's whole life, and the
 * two writers are the member editing their own join form and an admin editing
 * the roster. The window where those collide is seconds wide and reachable
 * only if both are typing about the same person at once.
 *
 * It is still a window. If the console grows a second staff-facing write on
 * this column, this needs the same treatment commitments got rather than a
 * comment explaining why it is probably fine.
 *
 * Refuses anything that is not an accepted member: a pending application is
 * decided through the queue, which is where the accept/decline reasoning
 * lives, and quietly editing an applicant's houses here would move them
 * without ever deciding on them.
 */
export async function setHousesAndTier(
  profileId: string,
  houses: readonly HouseId[],
  tier: TierId
): Promise<ProfileConnector | null> {
  if (houses.length === 0) return null;

  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.id, profileId),
    columns: { id: true, connector: true },
  });
  if (!profile) return null;

  const membership = parseConnector(profile.connector);
  if (!membership || membership.status !== 'active') return null;

  const next: ProfileConnector = {
    ...membership,
    houses: [...new Set(houses)],
    tier,
  };

  await db
    .update(profiles)
    .set({ connector: next })
    .where(eq(profiles.id, profileId));

  return next;
}

export async function offboardConnector(
  profileId: string,
  adminUserId: string,
  reason: string
): Promise<ProfileConnector | null> {
  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.id, profileId),
    columns: { id: true, connector: true },
  });
  if (!profile) return null;

  const membership = parseConnector(profile.connector);
  if (!membership || membership.status !== 'active') return null;

  const now = new Date().toISOString();
  const next: ProfileConnector = {
    ...membership,
    status: 'inactive',
    offboardedAt: now,
    offboardedBy: adminUserId,
    offboardReason: reason,
  };

  await db
    .update(profiles)
    .set({ connector: next })
    .where(eq(profiles.id, profileId));

  return next;
}
