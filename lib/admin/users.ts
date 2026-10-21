import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  or,
  sql,
} from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  profileOwners,
  profiles,
  sessions,
  userLocks,
  users,
} from '@/lib/schema';
import { isAdminEmail } from '@/lib/server/admin-emails';
import { containsPattern } from '@/lib/admin/user-search';
import { checkReason, reasonError } from '@/lib/admin/user-locks';
import { isAccountType } from '@/lib/admin/user-filters';
import type { UserSort, UserState } from '@/lib/admin/user-filters';

/**
 * Reading and locking accounts, for the admin console.
 *
 * ## Locking is three writes, not one
 *
 * `users.locked_at` has existed since the first migration and nothing ever
 * wrote it — but the reason that was safe to leave alone is that nothing
 * *enforced* it either. Setting the column on its own produces a console that
 * says "Locked" and a member who carries on browsing, because their session
 * cookie is still valid and no code path has ever consulted the column.
 *
 * So a lock here is always three things in one transaction:
 *
 *   1. set `users.locked_at`             — the state
 *   2. delete the account's `sessions`   — the effect, immediately
 *   3. insert a `user_locks` row         — the record of who and why
 *
 * Step 2 is the one that is easy to leave out and impossible to notice
 * missing: without it the lock takes effect whenever the member next signs
 * in, which for somebody actively abusing the site is precisely never.
 *
 * Refusing the *next* sign-in is the other half and lives in auth.ts, in the
 * session-create hook. Both halves are needed; neither is sufficient.
 */

/** A row as the accounts list renders it. */
export interface AdminUserRow {
  id: string;
  email: string;
  name: string | null;
  screenname: string | null;
  accountType: string;
  emailVerified: boolean;
  createdAt: Date;
  lockedAt: Date | null;
  /** Listings this person administers. Shown before the lock button, not after. */
  administers: number;
  hasProfile: boolean;
  /** ADMIN_EMAILS membership. Cannot be revoked from the database. */
  isSuperAdmin: boolean;
  /** profiles.roles.admin. */
  grantedAdmin: boolean;
  isAdmin: boolean;
  isContentModerator: boolean;
}

export const USERS_PER_PAGE = 25;

/** The states the list can be narrowed to. Anything else is treated as 'all'. */
export {
  USER_STATES,
  ACCOUNT_TYPES,
  isUserState,
  isAccountType,
  isUserSort,
} from '@/lib/admin/user-filters';
export type {
  UserState,
  UserSort,
  AccountType,
} from '@/lib/admin/user-filters';

export interface ListUsersOptions {
  query?: string | null;
  state?: UserState;
  accountType?: string | null;
  sort?: UserSort;
  page?: number;
}

export interface ListUsersResult {
  rows: AdminUserRow[];
  total: number;
  page: number;
  totalPages: number;
}

/**
 * Search and filter accounts.
 *
 * `staff` is deliberately *not* a SQL filter. Admin is the union of a column
 * and an environment variable, and the environment half cannot be expressed
 * in a WHERE clause at all — so filtering for staff in SQL would silently
 * omit every founder, which is the one group most likely to be looked up this
 * way. It is applied after the rows come back instead, and the count is
 * adjusted to match so the pager does not promise pages that are empty.
 */
export async function listUsers(
  options: ListUsersOptions = {}
): Promise<ListUsersResult> {
  const page = Math.max(1, Math.floor(options.page ?? 1));
  const query = (options.query ?? '').trim();
  const state = options.state ?? 'all';
  const type = options.accountType;
  const sort = options.sort ?? 'newest';

  const filters = [];

  if (query.length > 0) {
    const pattern = containsPattern(query);
    filters.push(
      or(
        ilike(users.name, pattern),
        ilike(users.screenname, pattern),
        ilike(users.email, pattern)
      )
    );
  }

  if (isAccountType(type)) {
    filters.push(sql`${users.accountType} = ${type}`);
  }

  if (state === 'locked') filters.push(isNotNull(users.lockedAt));
  if (state === 'unverified') filters.push(eq(users.emailVerified, false));

  const where = filters.length > 0 ? and(...filters) : undefined;

  // Correlated subquery rather than a join + group by: a user with four
  // listings must stay one row. A join here multiplied the page and made the
  // pager disagree with the list.
  const administersCount = sql<number>`(
    SELECT COUNT(*) FROM ${profileOwners} WHERE ${profileOwners.userId} = ${users.id}
  )`;

  const baseSelect = {
    id: users.id,
    email: users.email,
    name: users.name,
    screenname: users.screenname,
    accountType: users.accountType,
    emailVerified: users.emailVerified,
    createdAt: users.createdAt,
    lockedAt: users.lockedAt,
    administers: administersCount,
    roles: profiles.roles,
    profileId: profiles.id,
  };

  // 'owners' and 'staff' both need the derived columns, so they are applied
  // after the read. That means paging them would lie, so those two states read
  // a wide slice once and page in memory. The table is small enough that this
  // is cheaper than the alternative and honest either way.
  const postFiltered = state === 'owners' || state === 'staff';
  const postProcessed = postFiltered || sort === 'roles';
  const nameOrder = sql<string>`lower(coalesce(nullif(${users.name}, ''), nullif(${users.screenname}, ''), ${users.email}))`;
  const order =
    sort === 'oldest'
      ? asc(users.createdAt)
      : sort === 'name-asc'
        ? asc(nameOrder)
        : sort === 'name-desc'
          ? desc(nameOrder)
          : desc(users.createdAt);

  const rowsRaw = await db
    .select(baseSelect)
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(where)
    .orderBy(order)
    .limit(postProcessed ? 2000 : USERS_PER_PAGE)
    .offset(postProcessed ? 0 : USERS_PER_PAGE * (page - 1));

  let mapped: AdminUserRow[] = rowsRaw.map((row) => {
    const roles = (row.roles ?? {}) as {
      admin?: boolean;
      contentModerator?: boolean;
    };
    const isSuperAdmin = isAdminEmail(row.email);
    const grantedAdmin = roles.admin === true;
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      screenname: row.screenname,
      accountType: row.accountType,
      emailVerified: row.emailVerified,
      createdAt: row.createdAt,
      lockedAt: row.lockedAt,
      administers: Number(row.administers ?? 0),
      hasProfile: row.profileId !== null,
      isSuperAdmin,
      grantedAdmin,
      isAdmin: isSuperAdmin || grantedAdmin,
      isContentModerator: roles.contentModerator === true,
    };
  });

  let total: number;

  if (postProcessed) {
    if (state === 'owners') {
      mapped = mapped.filter((row) => row.administers > 0);
    } else if (state === 'staff') {
      mapped = mapped.filter((row) => row.isAdmin || row.isContentModerator);
    }
    if (sort === 'roles') {
      const roleRank = (row: AdminUserRow) =>
        row.isSuperAdmin
          ? 0
          : row.grantedAdmin
            ? 1
            : row.isContentModerator
              ? 2
              : 3;
      const name = (row: AdminUserRow) =>
        row.name || row.screenname || row.email;
      mapped.sort(
        (a, b) =>
          roleRank(a) - roleRank(b) ||
          name(a).localeCompare(name(b), undefined, { sensitivity: 'base' })
      );
    }
    total = mapped.length;
    mapped = mapped.slice(USERS_PER_PAGE * (page - 1), USERS_PER_PAGE * page);
  } else {
    const [counted] = await db
      .select({ total: count() })
      .from(users)
      .leftJoin(profiles, eq(profiles.userId, users.id))
      .where(where);
    total = Number(counted?.total ?? 0);
  }

  return {
    rows: mapped,
    total,
    page,
    totalPages: total > 0 ? Math.ceil(total / USERS_PER_PAGE) : 1,
  };
}

export interface UserStats {
  total: number;
  locked: number;
  unverified: number;
}

export async function userStats(): Promise<UserStats> {
  const [[all], [locked], [unverified]] = await Promise.all([
    db.select({ total: count() }).from(users),
    db.select({ total: count() }).from(users).where(isNotNull(users.lockedAt)),
    db
      .select({ total: count() })
      .from(users)
      .where(eq(users.emailVerified, false)),
  ]);
  return {
    total: Number(all?.total ?? 0),
    locked: Number(locked?.total ?? 0),
    unverified: Number(unverified?.total ?? 0),
  };
}

export interface LockHistoryEntry {
  id: string;
  userId: string;
  action: string;
  reason: string;
  actorEmail: string;
  createdAt: Date;
}

/**
 * The most recent lock entry for each of the given accounts.
 *
 * Batched over the page rather than fetched per row, because the alternative
 * is a query per account and this is rendered inside a list.
 *
 * It exists because an audit trail nobody reads is just storage. The reason
 * somebody was locked is the first thing asked when they write in, and if
 * answering that needs database access then in practice it does not get
 * answered — it gets guessed at, or the account quietly stays locked.
 */
export async function latestLocksFor(
  userIds: string[]
): Promise<Map<string, LockHistoryEntry>> {
  const found = new Map<string, LockHistoryEntry>();
  if (userIds.length === 0) return found;

  const rows = await db
    .select({
      id: userLocks.id,
      userId: userLocks.userId,
      action: userLocks.action,
      reason: userLocks.reason,
      actorEmail: userLocks.actorEmail,
      createdAt: userLocks.createdAt,
    })
    .from(userLocks)
    .where(inArray(userLocks.userId, userIds))
    .orderBy(desc(userLocks.createdAt));

  // Ordered newest first, so the first row seen per user is the current one.
  for (const row of rows)
    if (!found.has(row.userId)) found.set(row.userId, row);
  return found;
}

/** Full history for one account, newest first. */
export async function lockHistory(userId: string): Promise<LockHistoryEntry[]> {
  return db
    .select({
      id: userLocks.id,
      userId: userLocks.userId,
      action: userLocks.action,
      reason: userLocks.reason,
      actorEmail: userLocks.actorEmail,
      createdAt: userLocks.createdAt,
    })
    .from(userLocks)
    .where(eq(userLocks.userId, userId))
    .orderBy(desc(userLocks.createdAt))
    .limit(50);
}

/** Shortest reason accepted — see lib/admin/user-locks.ts, shared with the form. */
export { REASON_MIN, REASON_MAX } from '@/lib/admin/user-locks';

export type LockOutcome =
  { ok: true; sessionsRevoked: number } | { ok: false; error: string };

interface LockActor {
  userId: string | null;
  email: string;
}

/**
 * Lock an account: set the column, kill the sessions, record the reason.
 *
 * Refuses to lock anyone holding admin, in either tier. That is not
 * politeness — it closes the two ways this button could be turned against the
 * product. A granted admin cannot lock the founder who could revoke them, and
 * two admins cannot lock each other into a stalemate nobody on the site can
 * resolve. Removing someone's admin first is the deliberate extra step, and it
 * is a different tier of permission on a different screen.
 */
export async function lockUser(
  userId: string,
  reason: string,
  actor: LockActor
): Promise<LockOutcome> {
  const trimmed = reason.trim();
  const problem = checkReason(trimmed);
  if (problem) return { ok: false, error: reasonError(problem) };

  if (actor.userId && actor.userId === userId) {
    return { ok: false, error: 'You cannot lock your own account.' };
  }

  const [target] = await db
    .select({
      id: users.id,
      email: users.email,
      lockedAt: users.lockedAt,
      roles: profiles.roles,
    })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);

  if (!target) return { ok: false, error: 'No such account.' };
  if (target.lockedAt)
    return { ok: false, error: 'That account is already locked.' };

  const roles = (target.roles ?? {}) as { admin?: boolean };
  if (isAdminEmail(target.email) || roles.admin === true) {
    return {
      ok: false,
      error:
        'That account holds admin. Remove the role first, on Roles & permissions.',
    };
  }

  const now = new Date();
  let revoked = 0;

  await db.transaction(async (tx) => {
    await tx.update(users).set({ lockedAt: now }).where(eq(users.id, userId));

    // The half that makes the lock immediate. Without it the member keeps the
    // session they already hold and the lock only bites at next sign-in.
    const killed = await tx
      .delete(sessions)
      .where(eq(sessions.userId, userId))
      .returning({ id: sessions.id });
    revoked = killed.length;

    await tx.insert(userLocks).values({
      userId,
      action: 'lock',
      reason: trimmed,
      actorUserId: actor.userId,
      actorEmail: actor.email,
      createdAt: now,
    });
  });

  return { ok: true, sessionsRevoked: revoked };
}

/**
 * Unlock an account.
 *
 * Does not restore sessions — they were deleted, not suspended, and the member
 * signs in again. Writing the reason is required here too: "unlocked" with no
 * note is the same unreviewable entry as a lock with no note, and an appeal
 * that succeeded is worth more in the log than one that merely stopped.
 */
export async function unlockUser(
  userId: string,
  reason: string,
  actor: LockActor
): Promise<LockOutcome> {
  const trimmed = reason.trim();
  const problem = checkReason(trimmed);
  if (problem) return { ok: false, error: reasonError(problem) };

  const [target] = await db
    .select({ id: users.id, lockedAt: users.lockedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!target) return { ok: false, error: 'No such account.' };
  if (!target.lockedAt)
    return { ok: false, error: 'That account is not locked.' };

  await db.transaction(async (tx) => {
    await tx.update(users).set({ lockedAt: null }).where(eq(users.id, userId));
    await tx.insert(userLocks).values({
      userId,
      action: 'unlock',
      reason: trimmed,
      actorUserId: actor.userId,
      actorEmail: actor.email,
    });
  });

  return { ok: true, sessionsRevoked: 0 };
}
