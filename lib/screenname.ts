import { db } from '@/lib/db';
import {
  users,
  profiles,
  screennameHistory,
  socialActors,
  socialGroups,
} from '@/lib/schema';
import { and, eq, isNull, ne, notInArray, or, sql } from 'drizzle-orm';

// Reserved screennames that cannot be used
export const RESERVED_SCREENNAMES = [
  'admin',
  'administrator',
  'pana',
  'panamia',
  'support',
  'help',
  'system',
  'moderator',
  'mod',
  'staff',
  'official',
  'anonymous',
  'deleted',
  'former',
  'member',
  'user',
  'root',
  'api',
  'www',
  'mail',
  'email',
  'test',
  'null',
  'undefined',
];

// Screenname validation rules
const MIN_LENGTH = 3;
const MAX_LENGTH = 24;
const VALID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*[a-zA-Z0-9]$/;
const SINGLE_CHAR_PATTERN = /^[a-zA-Z0-9]$/;

export interface ScreennameValidationResult {
  valid: boolean;
  error?: string;
}

export interface ScreennameValidationOptions {
  /**
   * Accept a name from RESERVED_SCREENNAMES.
   *
   * For the handles this codebase holds for itself, which is the whole reason
   * they are reserved -- nothing else may take `panamia`, and Panamia has to
   * be able to. Never set this from request data: the list exists to stop a
   * pana registering as `admin` or `support`, and a caller that forwards a
   * user-supplied flag here turns the list off.
   *
   * Only the format gate is relaxed. Uniqueness is still enforced, so this
   * cannot be used to take a name somebody already holds.
   */
  allowReserved?: boolean;
}

/**
 * Validates a screenname format without checking database uniqueness.
 * Rules:
 * - 3-24 characters
 * - Alphanumeric, underscore, and hyphen only
 * - Cannot start or end with underscore or hyphen
 * - Not a reserved word, unless `options.allowReserved` says otherwise
 */
export function validateScreenname(
  name: string,
  options?: ScreennameValidationOptions
): ScreennameValidationResult {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Screenname is required' };
  }

  const trimmed = name.trim();

  if (trimmed.length < MIN_LENGTH) {
    return {
      valid: false,
      error: `Screenname must be at least ${MIN_LENGTH} characters`,
    };
  }

  if (trimmed.length > MAX_LENGTH) {
    return {
      valid: false,
      error: `Screenname must be no more than ${MAX_LENGTH} characters`,
    };
  }

  // For screennames of exactly 3 characters, allow single alphanumeric if length is 1
  // Otherwise check the pattern
  if (trimmed.length === 1) {
    if (!SINGLE_CHAR_PATTERN.test(trimmed)) {
      return {
        valid: false,
        error:
          'Screenname must contain only letters, numbers, underscores, or hyphens',
      };
    }
  } else if (trimmed.length === 2) {
    // Two character names: both must be alphanumeric
    if (!/^[a-zA-Z0-9]{2}$/.test(trimmed)) {
      return {
        valid: false,
        error: 'Screenname cannot start or end with underscore or hyphen',
      };
    }
  } else if (!VALID_PATTERN.test(trimmed)) {
    // Check if it contains invalid characters
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      return {
        valid: false,
        error:
          'Screenname must contain only letters, numbers, underscores, or hyphens',
      };
    }
    // Otherwise it starts/ends with invalid chars
    return {
      valid: false,
      error: 'Screenname cannot start or end with underscore or hyphen',
    };
  }

  // Check reserved words (case-insensitive)
  if (
    !options?.allowReserved &&
    RESERVED_SCREENNAMES.includes(trimmed.toLowerCase())
  ) {
    return { valid: false, error: 'This screenname is reserved' };
  }

  return { valid: true };
}

/**
 * Checks if a screenname is available in the database.
 * Uses case-insensitive comparison.
 *
 * The namespace is FLAT and spans three tables, because /p/:handle and
 * acct:handle@domain resolve humans and businesses through the same path:
 *
 *   - `users.screenname`      — handles held by people
 *   - `profiles.screenname`   — handles held by profiles, including business
 *                               listings that have no user at all
 *   - `social_groups`         — handles held by groups, which live on the
 *                               group's own actor row rather than on any
 *                               profile, because a group has no profile
 *   - `screennameHistory`     — retired handles, kept so federation 410-Gone
 *                               tombstones stay truthful and nobody can
 *                               impersonate a former identity
 *
 * Missing any one of them would let a business take a handle a person already
 * answers to (or vice versa), and the resolvers would then disagree about who
 * `@name` is. Groups are in the same namespace for the same reason: /p/:handle
 * and acct:handle@domain resolve a group through the identical path, so a
 * group named after an existing pana would shadow them.
 *
 * `excludeEmail` identifies the human's unique account, not every profile
 * sharing its contact email. `excludeProfileId` does the same for a listing.
 */
export async function isScreennameAvailable(
  name: string,
  excludeEmail?: string,
  excludeProfileId?: string
): Promise<boolean> {
  // PostgreSQL case-insensitive search - check current users
  const conditions = [
    sql`lower(${users.screenname}) = lower(${name})`,
    ...(excludeEmail ? [ne(users.email, excludeEmail)] : []),
  ];

  const existingUser = await db.query.users.findFirst({
    where: and(...conditions),
  });

  if (existingUser) return false;

  // Check profiles — a claimed business listing holds its handle here and has
  // no users row to be found above.
  const profileConditions = [
    sql`lower(${profiles.screenname}) = lower(${name})`,
    ...(excludeProfileId ? [ne(profiles.id, excludeProfileId)] : []),
    // A person's own profile mirrors their handle, so a plain user rename must
    // not collide with itself. A listing sharing their inbox still blocks.
    ...(excludeEmail
      ? [
          or(
            isNull(profiles.userId),
            notInArray(
              profiles.userId,
              db
                .select({ id: users.id })
                .from(users)
                .where(sql`lower(${users.email}) = lower(${excludeEmail})`)
            )
          ),
        ]
      : []),
  ];

  const existingProfile = await db.query.profiles.findFirst({
    where: and(...profileConditions),
  });

  if (existingProfile) return false;

  // Check groups — a group's handle lives on its own actor row, so neither of
  // the lookups above can see it. Joined through social_groups rather than
  // filtering social_actors on type, so this can only ever match a local group
  // and never a remote actor that happens to share a username.
  const existingGroup = await db
    .select({ id: socialGroups.id })
    .from(socialGroups)
    .innerJoin(socialActors, eq(socialGroups.actorId, socialActors.id))
    .where(sql`lower(${socialActors.username}) = lower(${name})`)
    .limit(1);

  if (existingGroup.length > 0) return false;

  // Check screenname history (cannot claim others' old names)
  // Allow user to reclaim their OWN old screenname
  if (excludeEmail) {
    // Left-joined, not inner-joined. A history row's user_id is a bare id with
    // no FK precisely so the row outlives the account -- and account deletion
    // does delete the user. An inner join drops exactly those orphaned rows,
    // which would hand a deleted person's handle to the next caller and make
    // the 410-Gone tombstone a lie. A group reservation has no user at all, so
    // it would vanish the same way. Unmatched rows therefore block, and only a
    // row demonstrably belonging to this caller is excluded.
    const historical = await db
      .select({ id: screennameHistory.id })
      .from(screennameHistory)
      .leftJoin(users, eq(screennameHistory.userId, users.id))
      .where(
        and(
          sql`lower(${screennameHistory.screenname}) = lower(${name})`,
          sql`${users.email} is null or lower(${users.email}) != lower(${excludeEmail})`
        )
      )
      .limit(1);

    if (historical.length > 0) return false;
  } else {
    const historical = await db.query.screennameHistory.findFirst({
      where: sql`lower(${screennameHistory.screenname}) = lower(${name})`,
    });

    if (historical) return false;
  }

  return true;
}

/**
 * Full validation including database uniqueness check.
 */
export async function validateScreennameFull(
  name: string,
  excludeEmail?: string,
  excludeProfileId?: string,
  options?: ScreennameValidationOptions
): Promise<ScreennameValidationResult> {
  const formatResult = validateScreenname(name, options);
  if (!formatResult.valid) {
    return formatResult;
  }

  const available = await isScreennameAvailable(
    name,
    excludeEmail,
    excludeProfileId
  );
  if (!available) {
    return { valid: false, error: 'This screenname is already taken' };
  }

  return { valid: true };
}
