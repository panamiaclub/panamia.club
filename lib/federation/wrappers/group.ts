/**
 * Group Lifecycle
 *
 * Creating a group, and getting in and out of one.
 *
 * A group is an actor. Creating one mints a real social_actors row with
 * type='Group' and its own signing keypair, so everything the federation layer
 * already does for people -- signing, addressing, delivery, WebFinger, the
 * actor endpoint -- works for a group with no special casing. The alternative
 * was a parallel delivery path for groups, which would have to reimplement all
 * of that and then drift from it.
 *
 * @see docs/GROUPS-ROADMAP.md
 */

import { db } from '@/lib/db';
import {
  socialActors,
  socialGroups,
  socialGroupMembers,
  toPublicActor,
} from '@/lib/schema';
import type {
  PublicSocialActor,
  SocialGroup,
  SocialGroupMember,
  SocialGroupJoinPolicy,
  SocialGroupRole,
  SocialGroupVisibility,
} from '@/lib/schema';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { ACTIVITY_WINDOW_DAYS } from '@/lib/server/group-search';
import { generateActorKeyPair } from '../crypto/keys';
import { notifyJoinRequested } from './group-notify';
import { validateScreennameFull } from '@/lib/screenname';
import {
  socialConfig,
  getActorUrl,
  getInboxUrl,
  getOutboxUrl,
  getFollowersUrl,
  getFollowingUrl,
} from '../index';

/**
 * Caps on the two free-form lists. Both are rendered in full on the group
 * page, and both are written by whoever runs the group rather than by staff,
 * so they need an upper bound that is generous for real use and useless for
 * abuse.
 */
export const MAX_GROUP_TOPICS = 12;
export const MAX_GROUP_RULES = 20;
export const MAX_GROUP_RULE_LENGTH = 280;
export const MAX_GROUP_NAME_LENGTH = 80;
export const MAX_GROUP_SUMMARY_LENGTH = 500;

export interface CreateGroupInput {
  /** The group's handle. Shares the flat namespace with people and listings. */
  handle: string;
  name: string;
  summary?: string;
  topics?: string[];
  rules?: string[];
  visibility?: SocialGroupVisibility;
  joinPolicy?: SocialGroupJoinPolicy;
  /** The profile starting the group, recorded for moderation history. */
  createdByProfileId: string;
  /** The actor starting the group. Becomes its first admin. */
  founderActorId: string;
  /**
   * Let the handle come from RESERVED_SCREENNAMES.
   *
   * For `panamia` and nothing else today: the name is reserved precisely so
   * that Panamia-the-organisation can hold it, and without this the seed
   * script is refused by the validator that is protecting the name for it.
   *
   * Not reachable over HTTP. POST /api/social/groups builds this input field
   * by field rather than spreading the request body, so a client cannot set
   * it by adding a key -- keep it that way.
   */
  allowReservedHandle?: boolean;
}

export type CreateGroupResult =
  | { success: true; group: SocialGroup; actor: PublicSocialActor }
  | { success: false; error: string };

/**
 * The editable half of a group.
 *
 * Every field is optional and absence means "leave it alone", which is what
 * lets `summary: null` mean "clear it" without colliding with "not sent".
 * `handle` is absent on purpose -- see `updateGroup`.
 */
export interface UpdateGroupInput {
  name?: string;
  /** Null or empty clears the description. Undefined leaves it. */
  summary?: string | null;
  /** Replaces the whole list. `[]` clears it. */
  topics?: string[];
  /** Replaces the whole list. `[]` clears it. */
  rules?: string[];
  visibility?: SocialGroupVisibility;
  joinPolicy?: SocialGroupJoinPolicy;
}

export type UpdateGroupResult =
  | { success: true; group: SocialGroup; actor: PublicSocialActor }
  | { success: false; error: string };

/**
 * The enum values, as arrays.
 *
 * Exported because both the create and the update route have to reject an
 * unknown value with a 400 rather than letting Postgres raise it, and both
 * were otherwise keeping their own copy.
 */
export const GROUP_VISIBILITIES: SocialGroupVisibility[] = [
  'public',
  'private',
];
export const GROUP_JOIN_POLICIES: SocialGroupJoinPolicy[] = [
  'open',
  'request',
  'invite',
];

export type JoinGroupResult =
  | { success: true; membership: SocialGroupMember; pending: boolean }
  | { success: false; error: string };

export type LeaveGroupResult =
  { success: true; left: true } | { success: false; error: string };

/**
 * Turn a topic list into the `{ topic: true }` flag map the column stores.
 *
 * Lowercased and de-duplicated on the way in, because the map's keys ARE the
 * identity of a topic -- "Printmaking" and "printmaking" would otherwise be
 * two different facets that never match each other in search.
 */
function toTopicFlags(topics: string[]): Record<string, boolean> {
  const flags: Record<string, boolean> = {};
  for (const raw of topics) {
    const topic = raw.trim().toLowerCase();
    if (topic) flags[topic] = true;
  }
  return flags;
}

/**
 * Turn the stored flag map back into a list.
 *
 * The inverse of `toTopicFlags`, needed because the edit form has to show
 * someone what their topics currently are before they can change them.
 * Sorted so the order is stable between renders -- object key order is an
 * implementation detail nobody should be able to see shift.
 */
export function fromTopicFlags(flags: Record<string, boolean>): string[] {
  return Object.keys(flags)
    .filter((topic) => flags[topic])
    .sort();
}

/**
 * Drop blank rules and trim the rest.
 *
 * A rule that is only whitespace is not a rule, and letting one through would
 * render as an empty numbered line on the group page.
 */
function normalizeRules(rules: string[]): string[] {
  return rules.map((rule) => rule.trim()).filter(Boolean);
}

/**
 * The limits a group's prose fields must satisfy, as one function.
 *
 * Shared by create and update rather than written twice. A cap enforced only
 * on the way in is a cap that can be edited around afterwards, which is the
 * entire failure mode this prevents.
 *
 * Only checks the fields it is handed, so update can validate a subset.
 * Returns the message to show, or null when everything passes.
 */
function validateGroupFields(input: {
  name?: string;
  summary?: string;
  topics?: string[];
  rules?: string[];
}): string | null {
  if (input.name !== undefined) {
    if (!input.name) return 'A group name is required';
    if (input.name.length > MAX_GROUP_NAME_LENGTH) {
      return `A group name must be no more than ${MAX_GROUP_NAME_LENGTH} characters`;
    }
  }

  if (input.summary && input.summary.length > MAX_GROUP_SUMMARY_LENGTH) {
    return `A group description must be no more than ${MAX_GROUP_SUMMARY_LENGTH} characters`;
  }

  if (input.topics && input.topics.length > MAX_GROUP_TOPICS) {
    return `A group can have at most ${MAX_GROUP_TOPICS} topics`;
  }

  if (input.rules) {
    if (input.rules.length > MAX_GROUP_RULES) {
      return `A group can have at most ${MAX_GROUP_RULES} rules`;
    }
    if (input.rules.some((rule) => rule.length > MAX_GROUP_RULE_LENGTH)) {
      return `A rule must be no more than ${MAX_GROUP_RULE_LENGTH} characters`;
    }
  }

  return null;
}

/**
 * Create a group, its actor, and its founding admin membership.
 */
export async function createGroup(
  input: CreateGroupInput
): Promise<CreateGroupResult> {
  const handle = input.handle.trim();
  const name = input.name.trim();
  const summary = input.summary?.trim() || undefined;
  const topics = input.topics ?? [];
  const rules = normalizeRules(input.rules ?? []);

  const invalid = validateGroupFields({ name, summary, topics, rules });
  if (invalid) {
    return { success: false, error: invalid };
  }

  // The handle goes through the same validator people and listings use, so a
  // group cannot take a name a pana already answers to. See lib/screenname.ts.
  // `allowReservedHandle` relaxes only the reserved-word list; the format and
  // uniqueness gates still apply.
  const handleCheck = await validateScreennameFull(
    handle,
    undefined,
    undefined,
    { allowReserved: input.allowReservedHandle === true }
  );
  if (!handleCheck.valid) {
    return { success: false, error: handleCheck.error ?? 'Invalid handle' };
  }

  const { publicKey, privateKey } = generateActorKeyPair();

  // One transaction: an actor with no group row is unusable and invisible, and
  // a group with no admin cannot be administered. Either all three rows land
  // or none do.
  const created = await db.transaction(async (tx) => {
    const [actor] = await tx
      .insert(socialActors)
      .values({
        username: handle,
        domain: socialConfig.domain,
        type: 'Group',
        // Deliberately null. A group is not a directory listing and has no
        // profile; social_actors.profile_id is unique but nullable, and
        // Postgres permits any number of NULLs in a unique index.
        profileId: null,
        uri: getActorUrl(handle),
        inboxUrl: getInboxUrl(handle),
        outboxUrl: getOutboxUrl(handle),
        followersUrl: getFollowersUrl(handle),
        followingUrl: getFollowingUrl(handle),
        publicKey,
        privateKey,
        name,
        summary,
      })
      .returning();

    const [group] = await tx
      .insert(socialGroups)
      .values({
        actorId: actor.id,
        createdByProfileId: input.createdByProfileId,
        topics: toTopicFlags(topics),
        rules,
        visibility: input.visibility ?? 'public',
        joinPolicy: input.joinPolicy ?? 'open',
        // The founder, counted immediately rather than left for the insert
        // below to increment.
        memberCount: 1,
      })
      .returning();

    await tx.insert(socialGroupMembers).values({
      groupId: group.id,
      actorId: input.founderActorId,
      role: 'admin',
      status: 'active',
      joinedAt: new Date(),
    });

    return { group, actor };
  });

  return {
    success: true,
    group: created.group,
    actor: toPublicActor(created.actor),
  };
}

/**
 * Change a group's description of itself.
 *
 * Partial by design: only the fields present are touched, so a form that
 * renders three of six settings cannot silently reset the other three. That
 * matters more than it sounds, because `topics` and `rules` are whole-list
 * replacements -- sending `[]` clears them, which is a legitimate thing to
 * want and indistinguishable from "I did not include this field" unless
 * absence and emptiness are kept separate.
 *
 * **The handle is deliberately not editable here.** It is the group's address,
 * it is shared with the flat screenname namespace, and changing it would
 * break every link to the group, every `host_group_id` deep link, and any
 * remote actor URI already federated. Renaming is a migration, not a setting,
 * and it needs the same handle-reservation machinery a deletion gets.
 *
 * Authorization is the caller's job, the same as `deleteGroup` -- this knows
 * nothing about who is asking.
 *
 * No federation `Update` is broadcast. Groups do not federate their posts yet
 * (Phase 3.5), so no remote server is holding a copy of this actor that is
 * worth correcting. When group federation lands, this is where the Update
 * goes.
 */
export async function updateGroup(
  groupId: string,
  input: UpdateGroupInput
): Promise<UpdateGroupResult> {
  const existing = await db.query.socialGroups.findFirst({
    where: eq(socialGroups.id, groupId),
  });

  if (!existing) {
    return { success: false, error: 'Group not found' };
  }

  const name = input.name?.trim();
  /* An explicit null or an empty string clears the description; undefined
     leaves whatever is there alone. */
  const summary =
    input.summary === undefined
      ? undefined
      : (input.summary?.trim() ?? '') || null;
  const topics = input.topics;
  const rules = input.rules ? normalizeRules(input.rules) : undefined;

  const invalid = validateGroupFields({
    name,
    summary: summary ?? undefined,
    topics,
    rules,
  });
  if (invalid) {
    return { success: false, error: invalid };
  }

  if (input.visibility && !GROUP_VISIBILITIES.includes(input.visibility)) {
    return { success: false, error: 'Unknown visibility' };
  }

  if (input.joinPolicy && !GROUP_JOIN_POLICIES.includes(input.joinPolicy)) {
    return { success: false, error: 'Unknown join policy' };
  }

  const actorChanges: Partial<typeof socialActors.$inferInsert> = {};
  if (name !== undefined) actorChanges.name = name;
  if (summary !== undefined) actorChanges.summary = summary;

  const groupChanges: Partial<typeof socialGroups.$inferInsert> = {};
  if (topics !== undefined) groupChanges.topics = toTopicFlags(topics);
  if (rules !== undefined) groupChanges.rules = rules;
  if (input.visibility !== undefined) {
    groupChanges.visibility = input.visibility;
  }
  if (input.joinPolicy !== undefined) {
    groupChanges.joinPolicy = input.joinPolicy;
  }

  // One transaction, because the name lives on the actor and everything else
  // lives on the group: a half-applied edit would show a new name beside old
  // rules with nothing to say which the member actually saved.
  const updated = await db.transaction(async (tx) => {
    if (Object.keys(actorChanges).length > 0) {
      await tx
        .update(socialActors)
        .set(actorChanges)
        .where(eq(socialActors.id, existing.actorId));
    }

    /* Always write the group row, even when only the name changed, so
       updated_at moves. "Last edited" that ignores half the form is worse
       than no timestamp at all. */
    const [group] = await tx
      .update(socialGroups)
      .set({ ...groupChanges, updatedAt: new Date() })
      .where(eq(socialGroups.id, groupId))
      .returning();

    const actor = await tx.query.socialActors.findFirst({
      where: eq(socialActors.id, existing.actorId),
    });

    return { group, actor };
  });

  if (!updated.actor) {
    return { success: false, error: 'Group actor not found' };
  }

  return {
    success: true,
    group: updated.group,
    actor: toPublicActor(updated.actor),
  };
}

/**
 * Join a group, or ask to.
 *
 * Idempotent: a repeat call returns the membership that already exists rather
 * than creating a second one or inflating member_count. The unique index on
 * (group_id, actor_id) is the backstop if two calls race.
 */
export async function joinGroup(
  groupId: string,
  actorId: string
): Promise<JoinGroupResult> {
  const group = await db.query.socialGroups.findFirst({
    where: eq(socialGroups.id, groupId),
  });

  if (!group) {
    return { success: false, error: 'Group not found' };
  }

  const existing = await db.query.socialGroupMembers.findFirst({
    where: and(
      eq(socialGroupMembers.groupId, groupId),
      eq(socialGroupMembers.actorId, actorId)
    ),
  });

  if (existing) {
    // A ban is enforced by the row's continued existence. Returning the same
    // generic message as a normal refusal would tell a banned pana nothing
    // useful, so it is explicit -- they already know.
    if (existing.status === 'banned') {
      return { success: false, error: 'You have been removed from this group' };
    }
    return {
      success: true,
      membership: existing,
      pending: existing.status === 'pending',
    };
  }

  if (group.joinPolicy === 'invite') {
    return { success: false, error: 'This group is invite only' };
  }

  const pending = group.joinPolicy === 'request';

  const membership = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(socialGroupMembers)
      .values({
        groupId,
        actorId,
        role: 'member',
        status: pending ? 'pending' : 'active',
        // Null while pending, so "member since" never claims someone joined on
        // the day they merely asked.
        joinedAt: pending ? null : new Date(),
      })
      .returning();

    // Only active memberships are counted, so a request changes nothing here.
    if (!pending) {
      await tx
        .update(socialGroups)
        .set({ memberCount: sql`${socialGroups.memberCount} + 1` })
        .where(eq(socialGroups.id, groupId));
    }

    return row;
  });

  // Only a request needs announcing. Walking into an open group is not news,
  // and the leaders would get a notification per join for something they are
  // not being asked to decide.
  if (pending) {
    await notifyJoinRequested(groupId, actorId);
  }

  return { success: true, membership, pending };
}

/**
 * Leave a group, or withdraw a pending request.
 */
export async function leaveGroup(
  groupId: string,
  actorId: string
): Promise<LeaveGroupResult> {
  const membership = await db.query.socialGroupMembers.findFirst({
    where: and(
      eq(socialGroupMembers.groupId, groupId),
      eq(socialGroupMembers.actorId, actorId)
    ),
  });

  if (!membership) {
    return { success: false, error: 'You are not a member of this group' };
  }

  // Deleting a ban row would let the banned pana walk straight back into an
  // open group, so leaving is not a way out of one.
  if (membership.status === 'banned') {
    return { success: false, error: 'You have been removed from this group' };
  }

  // A group with no admin can never approve a request, change a setting or be
  // deleted -- it is stranded. Refuse rather than create one.
  if (membership.role === 'admin' && membership.status === 'active') {
    const [{ count } = { count: 0 }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(socialGroupMembers)
      .where(
        and(
          eq(socialGroupMembers.groupId, groupId),
          eq(socialGroupMembers.role, 'admin'),
          eq(socialGroupMembers.status, 'active'),
          ne(socialGroupMembers.actorId, actorId)
        )
      );

    if (count === 0) {
      return {
        success: false,
        error:
          'You are the only admin. Make someone else an admin before leaving.',
      };
    }
  }

  const wasActive = membership.status === 'active';

  await db.transaction(async (tx) => {
    await tx
      .delete(socialGroupMembers)
      .where(eq(socialGroupMembers.id, membership.id));

    if (wasActive) {
      // GREATEST guards the count against ever going negative if it has
      // already drifted, which is cheaper than reconciling it here.
      await tx
        .update(socialGroups)
        .set({
          memberCount: sql`GREATEST(${socialGroups.memberCount} - 1, 0)`,
        })
        .where(eq(socialGroups.id, groupId));
    }
  });

  return { success: true, left: true };
}

/**
 * Get a group by its actor's handle, with the actor attached.
 */
export async function getGroupByHandle(handle: string) {
  const actor = await db.query.socialActors.findFirst({
    where: (a, { and: andOp, eq: eqOp }) =>
      andOp(
        eqOp(a.username, handle),
        eqOp(a.domain, socialConfig.domain),
        eqOp(a.type, 'Group')
      ),
    with: { group: true },
  });

  if (!actor?.group) return null;

  // Strip the joined relation before it reaches a response: the group is
  // already returned alongside, and leaving it nested duplicates every field.
  const { group, ...actorRow } = actor;

  return { group, actor: toPublicActor(actorRow) };
}

/**
 * The membership row linking an actor to a group, or null.
 *
 * Callers use this to answer "may this viewer read a private group" and "what
 * does the toolbar say", so it returns pending and banned rows too rather than
 * filtering to active.
 */
export async function getMembership(
  groupId: string,
  actorId: string
): Promise<SocialGroupMember | null> {
  return (
    (await db.query.socialGroupMembers.findFirst({
      where: and(
        eq(socialGroupMembers.groupId, groupId),
        eq(socialGroupMembers.actorId, actorId)
      ),
    })) ?? null
  );
}

export interface PublicGroupMembership {
  id: string;
  handle: string;
  name: string;
  summary: string | null;
  iconUrl: string | null;
  memberCount: number;
}

/**
 * Public groups an actor is an active member of.
 *
 * Feeds the Groups stat in the feed rail and the group cards on a profile, so
 * it is read by anyone looking at anyone -- which is exactly why both filters
 * below are load-bearing:
 *
 *   - visibility 'public' only. A private group appearing on someone's public
 *     profile tells a stranger both that the group exists and that this
 *     person is in it. That is a membership disclosure the person never
 *     agreed to, and it is the reason GroupCard can safely render no privacy
 *     marker at all.
 *   - status 'active' only. A pending request is not a membership, and
 *     showing it would advertise that someone asked to join somewhere before
 *     the admins have decided.
 */
export async function listPublicGroupsForActor(
  actorId: string
): Promise<PublicGroupMembership[]> {
  const rows = await db
    .select({
      id: socialGroups.id,
      handle: socialActors.username,
      name: socialActors.name,
      summary: socialActors.summary,
      iconUrl: socialActors.iconUrl,
      memberCount: socialGroups.memberCount,
    })
    .from(socialGroupMembers)
    .innerJoin(socialGroups, eq(socialGroups.id, socialGroupMembers.groupId))
    .innerJoin(socialActors, eq(socialActors.id, socialGroups.actorId))
    .where(
      and(
        eq(socialGroupMembers.actorId, actorId),
        eq(socialGroupMembers.status, 'active'),
        eq(socialGroups.visibility, 'public')
      )
    )
    .orderBy(asc(socialActors.name));

  // name is nullable on social_actors because remote actors may omit it, but
  // a card with no title is not renderable -- fall back to the handle, which
  // always exists.
  return rows.map((row) => ({
    ...row,
    name: row.name ?? row.handle,
  }));
}

/**
 * The next thing one of your groups has on its calendar.
 *
 * Two fields, not the four a browse card gets. The rail dates a group, it
 * does not name the event -- a title in a 248px column truncates to noise,
 * and the group page is one click away. `timezone` rides along because an
 * event in Miami is on the day Miami says it is regardless of where it is
 * being read from, which is the position the rest of this codebase already
 * takes.
 */
export interface MyGroupNextEvent {
  startsAt: string;
  timezone: string;
}

export interface MyGroupMembership extends PublicGroupMembership {
  visibility: SocialGroupVisibility;
  joinPolicy: SocialGroupJoinPolicy;
  role: SocialGroupRole;
  /** Posts in the last ACTIVITY_WINDOW_DAYS days. */
  postsThisWeek: number;
  /** Next published public event, or null. */
  nextEvent: MyGroupNextEvent | null;
}

/**
 * Every group an actor is an active member of, private ones included.
 *
 * The deliberate opposite of listPublicGroupsForActor, and the two must never
 * be swapped. That one answers "what may a stranger know about this person",
 * so it hides private groups; this one answers "where do I belong", asked by
 * the member about themselves. Hiding a private group from its own member is
 * not privacy, it is a missing group -- they would have no way back to a room
 * they are standing in.
 *
 * Because of that, every caller must already have established that the viewer
 * IS this actor. There is no viewerActorId parameter to get wrong: the route
 * resolves the actor from the session and passes only that.
 *
 * Still 'active' only. A pending request is not yet a membership, and listing
 * it under "your groups" would promise access that the admins have not
 * granted.
 *
 * Carries activity and the next event because the groups rail renders both,
 * and neither is guarded on group visibility the way the browse cards are.
 * That guard exists to stop a stranger reading a private group's pulse off a
 * search result; every row here is a group the caller is standing in, so
 * withholding it would be hiding somebody's own room from them -- the same
 * mistake as hiding the group itself, one field down.
 */
export async function listMyGroups(
  actorId: string
): Promise<MyGroupMembership[]> {
  const rows = await db
    .select({
      id: socialGroups.id,
      handle: socialActors.username,
      name: socialActors.name,
      summary: socialActors.summary,
      iconUrl: socialActors.iconUrl,
      memberCount: socialGroups.memberCount,
      visibility: socialGroups.visibility,
      joinPolicy: socialGroups.joinPolicy,
      role: socialGroupMembers.role,
      /* Correlated subqueries rather than joins: a LEFT JOIN on statuses
         would multiply the membership rows before the count collapsed them,
         and a lateral for the event would still need its own ORDER BY. Both
         ride the same indexes the browse cards use for the identical
         counts -- social_statuses on group_id, events_host_group_id_idx. */
      postsThisWeek: sql<number>`(
        SELECT count(*)::int
        FROM social_statuses s
        WHERE s.group_id = ${socialGroups.id}
          AND s.published > now() - ${`${ACTIVITY_WINDOW_DAYS} days`}::interval
      )`,
      /* Published and public only, even for a member. An unlisted event is
         one the organiser chose not to put on the calendar; surfacing it in a
         rail is listing it. */
      nextEvent: sql<MyGroupNextEvent | null>`(
        SELECT row_to_json(e)
        FROM (
          SELECT ev.starts_at AS "startsAt", ev.timezone
          FROM events ev
          WHERE ev.host_group_id = ${socialGroups.id}
            AND ev.status = 'published'
            AND ev.visibility = 'public'
            AND ev.starts_at > now()
          ORDER BY ev.starts_at ASC
          LIMIT 1
        ) e
      )`,
    })
    .from(socialGroupMembers)
    .innerJoin(socialGroups, eq(socialGroups.id, socialGroupMembers.groupId))
    .innerJoin(socialActors, eq(socialActors.id, socialGroups.actorId))
    .where(
      and(
        eq(socialGroupMembers.actorId, actorId),
        eq(socialGroupMembers.status, 'active')
      )
    )
    .orderBy(asc(socialActors.name));

  return rows.map((row) => ({
    ...row,
    name: row.name ?? row.handle,
    /* count(*) cannot be null, but the driver types it loosely and a NaN
       here would render as a dot on every group. */
    postsThisWeek: Number(row.postsThisWeek) || 0,
    nextEvent: row.nextEvent ?? null,
  }));
}

export async function listMyGroupRequests(actorId: string) {
  const rows = await db
    .select({
      id: socialGroups.id,
      handle: socialActors.username,
      name: socialActors.name,
      iconUrl: socialActors.iconUrl,
    })
    .from(socialGroupMembers)
    .innerJoin(socialGroups, eq(socialGroups.id, socialGroupMembers.groupId))
    .innerJoin(socialActors, eq(socialActors.id, socialGroups.actorId))
    .where(
      and(
        eq(socialGroupMembers.actorId, actorId),
        eq(socialGroupMembers.status, 'pending')
      )
    )
    .orderBy(asc(socialActors.name));
  return rows.map((row) => ({ ...row, name: row.name ?? row.handle }));
}
