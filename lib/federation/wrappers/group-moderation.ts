/**
 * Acting on a group's membership.
 *
 * The write half of the roster. `group-members.ts` answers who is in a group;
 * this decides who gets in, who runs it, and who is shown the door.
 *
 * Every function here takes the actor doing the acting, not just the target,
 * because every rule in this file is about the relationship between the two.
 * "Can this be done" is never a property of the target alone -- removing a
 * member is fine, removing the last admin is not, and a moderator removing
 * another moderator is a fight rather than moderation.
 *
 * The three invariants, each enforced in exactly one place below:
 *
 *  1. A group always keeps at least one active admin. A group without one can
 *     never approve a request, change a setting, or be deleted -- it is
 *     stranded, and nothing in the product can rescue it.
 *  2. A moderator may only act on plain members. Role changes are admin-only
 *     because they decide who runs the group, which is the same reason
 *     editing the group is admin-only.
 *  3. member_count counts active rows and nothing else. Every transition here
 *     either changes a row's active-ness or does not, and the count follows
 *     that one fact rather than being recomputed per action.
 *
 * @see lib/federation/wrappers/group-members.ts  the read half
 * @see docs/GROUPS-ROADMAP.md
 */

import { db } from '@/lib/db';
import { socialGroupMembers, socialGroups } from '@/lib/schema';
import type { SocialGroupMember, SocialGroupRole } from '@/lib/schema';
import { and, eq, ne, sql } from 'drizzle-orm';
import { notifyGroupChat } from '@/lib/group-chat-notify';
import {
  notifyBanned,
  notifyRemoved,
  notifyRequestApproved,
  notifyRequestRejected,
  notifyRoleChanged,
} from './group-notify';

export type ModerationResult =
  | { success: true; membership: SocialGroupMember | null }
  | { success: false; error: string; status: 400 | 403 | 404 | 409 };

/** What an actor may do, resolved once and reused by every check below. */
interface Actor {
  id: string;
  role: SocialGroupRole;
}

function fail(
  error: string,
  status: 400 | 403 | 404 | 409 = 400
): ModerationResult {
  return { success: false, error, status };
}

/**
 * Whether removing this actor's admin rights would strand the group.
 *
 * Counts *other* active admins, so it answers "is anyone else holding this up"
 * rather than "how many admins are there". Called before every demotion,
 * removal and ban, which is the whole set of ways to stop being an admin
 * through this module. `leaveGroup` holds the fourth copy for the one path
 * that does not come through here.
 */
async function isLastAdmin(groupId: string, actorId: string): Promise<boolean> {
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

  return count === 0;
}

/**
 * Whether `actor` outranks `target` enough to act on them.
 *
 * Admins may act on anyone, including each other -- a group needs some way to
 * resolve an admin who has gone bad, and the last-admin guard is what stops
 * that from emptying the room.
 *
 * Moderators may act only on plain members. Letting them act on each other
 * turns a disagreement between peers into whoever clicks first, and letting
 * them act on admins inverts the hierarchy outright.
 */
function outranks(actor: Actor, target: SocialGroupMember): boolean {
  if (actor.role === 'admin') return true;
  if (actor.role === 'moderator') return target.role === 'member';
  return false;
}

/**
 * Apply a membership change and keep member_count honest in the same
 * transaction.
 *
 * `wasActive` and `isActive` are passed rather than derived because two of the
 * six actions delete the row, and a deleted row cannot be asked what it used
 * to be. Taking both as arguments makes every caller state its transition
 * explicitly, which is the part that is easy to get wrong.
 */
async function applyChange(
  membership: SocialGroupMember,
  wasActive: boolean,
  isActive: boolean,
  change:
    | { delete: true }
    | {
        role?: SocialGroupRole;
        status?: 'active' | 'banned';
        joinedAt?: Date | null;
      }
): Promise<SocialGroupMember | null> {
  const result = await db.transaction(async (tx) => {
    let row: SocialGroupMember | null = null;

    if ('delete' in change) {
      await tx
        .delete(socialGroupMembers)
        .where(eq(socialGroupMembers.id, membership.id));
    } else {
      const [updated] = await tx
        .update(socialGroupMembers)
        .set(change)
        .where(eq(socialGroupMembers.id, membership.id))
        .returning();
      row = updated;
    }

    if (wasActive !== isActive) {
      await tx
        .update(socialGroups)
        .set({
          memberCount: isActive
            ? sql`${socialGroups.memberCount} + 1`
            : // GREATEST matches leaveGroup: if the count has already drifted,
              // refuse to make it negative rather than reconciling here.
              sql`GREATEST(${socialGroups.memberCount} - 1, 0)`,
        })
        .where(eq(socialGroups.id, membership.groupId));
    }

    return row;
  });
  await notifyGroupChat(membership.groupId, { kind: 'membership' }, [
    membership.actorId,
  ]);
  return result;
}

/** The acting member, or a refusal if they have no standing to act at all. */
async function resolveActor(
  groupId: string,
  actorId: string
): Promise<
  { ok: true; actor: Actor } | { ok: false; result: ModerationResult }
> {
  const membership = await db.query.socialGroupMembers.findFirst({
    where: and(
      eq(socialGroupMembers.groupId, groupId),
      eq(socialGroupMembers.actorId, actorId)
    ),
  });

  if (
    !membership ||
    membership.status !== 'active' ||
    membership.role === 'member'
  ) {
    return {
      ok: false,
      result: fail('Only an admin or moderator can do this', 403),
    };
  }

  return { ok: true, actor: { id: actorId, role: membership.role } };
}

/** The target row, or a refusal if it is not in this group. */
async function resolveTarget(
  groupId: string,
  memberId: string
): Promise<
  | { ok: true; target: SocialGroupMember }
  | { ok: false; result: ModerationResult }
> {
  const target = await db.query.socialGroupMembers.findFirst({
    where: and(
      eq(socialGroupMembers.id, memberId),
      eq(socialGroupMembers.groupId, groupId)
    ),
  });

  if (!target) {
    return { ok: false, result: fail('No such member of this group', 404) };
  }

  return { ok: true, target };
}

/**
 * Resolve both sides and confirm the actor may act on this target.
 *
 * Self-targeting is refused for everything except a role change. Removing
 * yourself is leaving, which has its own endpoint, its own semantics for a
 * withdrawn request, and its own copy of the last-admin guard; a second way to
 * do it is a second way to get it wrong. Changing your own role is different:
 * an admin handing the group over and stepping down to moderator can only be
 * done here, and the last-admin guard already covers the dangerous half.
 */
async function gate(
  groupId: string,
  actorId: string,
  memberId: string,
  options: { allowSelf?: boolean } = {}
): Promise<
  | { ok: true; actor: Actor; target: SocialGroupMember }
  | { ok: false; result: ModerationResult }
> {
  const resolvedActor = await resolveActor(groupId, actorId);
  if (!resolvedActor.ok) return resolvedActor;

  const resolvedTarget = await resolveTarget(groupId, memberId);
  if (!resolvedTarget.ok) return resolvedTarget;

  const { actor } = resolvedActor;
  const { target } = resolvedTarget;

  if (target.actorId === actorId && !options.allowSelf) {
    return {
      ok: false,
      result: fail('Use Leave group to remove yourself', 400),
    };
  }

  if (target.actorId !== actorId && !outranks(actor, target)) {
    return {
      ok: false,
      result: fail('You cannot act on this member', 403),
    };
  }

  return { ok: true, actor, target };
}

/**
 * Let a pending request in.
 *
 * Sets joinedAt now rather than when they asked, so "member since" reflects
 * when they were actually part of the group. Someone who waited a week in the
 * queue did not spend that week as a member.
 */
export async function approveRequest(
  groupId: string,
  actorId: string,
  memberId: string
): Promise<ModerationResult> {
  const resolved = await gate(groupId, actorId, memberId);
  if (!resolved.ok) return resolved.result;

  const { target } = resolved;
  if (target.status !== 'pending') {
    return fail('That request is no longer pending', 409);
  }

  const membership = await applyChange(target, false, true, {
    status: 'active',
    joinedAt: new Date(),
  });

  await notifyRequestApproved(groupId, actorId, target.actorId);

  return { success: true, membership };
}

/**
 * Turn a pending request down.
 *
 * Deletes the row rather than banning. Not being let in once is not a verdict
 * on somebody forever, and in an open group they could have walked in without
 * asking anyway. Banning is the deliberate, separate action.
 */
export async function rejectRequest(
  groupId: string,
  actorId: string,
  memberId: string
): Promise<ModerationResult> {
  const resolved = await gate(groupId, actorId, memberId);
  if (!resolved.ok) return resolved.result;

  const { target } = resolved;
  if (target.status !== 'pending') {
    return fail('That request is no longer pending', 409);
  }

  // A pending row was never counted, so this changes nothing.
  await applyChange(target, false, false, { delete: true });

  await notifyRequestRejected(groupId, actorId, target.actorId);

  return { success: true, membership: null };
}

/**
 * Change what someone may do in the group.
 *
 * Admin-only. Moderators run a group day to day; deciding who runs it is not
 * that, and is the same line the group's own settings sit behind.
 */
export async function setMemberRole(
  groupId: string,
  actorId: string,
  memberId: string,
  role: SocialGroupRole
): Promise<ModerationResult> {
  const resolved = await gate(groupId, actorId, memberId, { allowSelf: true });
  if (!resolved.ok) return resolved.result;

  const { actor, target } = resolved;

  if (actor.role !== 'admin') {
    return fail('Only an admin can change roles', 403);
  }

  if (target.status !== 'active') {
    return fail('Only an active member can hold a role', 409);
  }

  if (target.role === role) {
    return { success: true, membership: target };
  }

  if (target.role === 'admin' && (await isLastAdmin(groupId, target.actorId))) {
    return fail(
      'They are the only admin. Make someone else an admin first.',
      409
    );
  }

  // A role change never touches active-ness, so the count does not move.
  const membership = await applyChange(target, true, true, { role });

  await notifyRoleChanged(groupId, actorId, target.actorId, role);

  return { success: true, membership };
}

/**
 * Take someone out of the group.
 *
 * Deletes the row, which in an open group means they can walk back in. That is
 * deliberate: removal is for "not right now", and the thing that makes it
 * stick is a ban.
 */
export async function removeMember(
  groupId: string,
  actorId: string,
  memberId: string
): Promise<ModerationResult> {
  const resolved = await gate(groupId, actorId, memberId);
  if (!resolved.ok) return resolved.result;

  const { target } = resolved;

  if (target.status === 'banned') {
    return fail('They are already banned from this group', 409);
  }

  if (
    target.role === 'admin' &&
    target.status === 'active' &&
    (await isLastAdmin(groupId, target.actorId))
  ) {
    return fail(
      'They are the only admin. Make someone else an admin first.',
      409
    );
  }

  const wasActive = target.status === 'active';
  await applyChange(target, wasActive, false, { delete: true });

  await notifyRemoved(groupId, actorId, target.actorId);

  return { success: true, membership: null };
}

/**
 * Keep someone out.
 *
 * The row stays, and that is the enforcement -- an open group is one click to
 * join, so deleting the row would let a banned pana walk straight back in.
 * `joinGroup` checks for exactly this row before creating a new one.
 */
export async function banMember(
  groupId: string,
  actorId: string,
  memberId: string
): Promise<ModerationResult> {
  const resolved = await gate(groupId, actorId, memberId);
  if (!resolved.ok) return resolved.result;

  const { target } = resolved;

  if (target.status === 'banned') {
    return { success: true, membership: target };
  }

  if (
    target.role === 'admin' &&
    target.status === 'active' &&
    (await isLastAdmin(groupId, target.actorId))
  ) {
    return fail(
      'They are the only admin. Make someone else an admin first.',
      409
    );
  }

  const wasActive = target.status === 'active';

  /* Demoted on the way out. A banned row keeping 'admin' would make the next
     ban of a real admin look like it had company, and isLastAdmin counts
     active rows only -- but the role is what a future reader would see. */
  const membership = await applyChange(target, wasActive, false, {
    status: 'banned',
    role: 'member',
    joinedAt: null,
  });

  await notifyBanned(groupId, actorId, target.actorId);

  return { success: true, membership };
}

/**
 * Lift a ban.
 *
 * Deletes the tombstone rather than reactivating it, so the group's join
 * policy decides what happens next. Un-banning is "you may ask again", not
 * "you are back in" -- and in a request-only group those are very different.
 */
export async function unbanMember(
  groupId: string,
  actorId: string,
  memberId: string
): Promise<ModerationResult> {
  const resolved = await gate(groupId, actorId, memberId);
  if (!resolved.ok) return resolved.result;

  const { target } = resolved;

  if (target.status !== 'banned') {
    return fail('They are not banned from this group', 409);
  }

  // A banned row was not counted, so removing it changes nothing.
  await applyChange(target, false, false, { delete: true });

  return { success: true, membership: null };
}
