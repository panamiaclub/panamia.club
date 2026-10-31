/**
 * Recommendation Lists — all reads and writes go through here.
 *
 * Named, ordered lists of directory listings a pana vouches for, each entry
 * carrying that pana's own note. The note is the feature. The directory can
 * already tell you a cafe exists; it cannot tell you that someone you trust
 * orders the same thing there every Tuesday.
 *
 * ## Why this module exists at all
 *
 * The same reason lib/federation/wrappers/group-visibility.ts exists: every
 * caller that can see a list has to apply the identical predicate, and twelve
 * hand-copied checks is twelve chances to write OR where you meant AND. The
 * visibility rule lives in `listVisibilityFilter` / `canViewList` and nowhere
 * else. Routes ask this module; they do not re-derive.
 *
 * ## Ownership is keyed to users.id, not profiles.id
 *
 * Deliberately matching profile_signals. A list is a recommendation with a
 * frame around it, made in a named human's voice, so switching hats must not
 * silently re-attribute it — and a business must not be able to vouch for
 * anyone. The seam this creates: ActivityPub actors hang off
 * social_actors.profileId, so `attributedTo` has to resolve through the
 * owner's own profile's actor. `getOwnerHandle` is that resolution, in one
 * place, for the same reason as above.
 */
import { db } from '@/lib/db';
import {
  profiles,
  recommendationListItems,
  recommendationLists,
  users,
} from '@/lib/schema';
import type { RecommendationListVisibility } from '@/lib/schema';
import { DIRECTORY_ACCOUNT_TYPES } from '@/lib/accounts';
import { BUSINESS_INTAKE_SOURCE } from '@/lib/server/profile-owners';
import { listingPublicPath } from '@/lib/listing-url';
import { socialConfig } from '@/lib/federation';
import {
  MAX_ITEMS_PER_LIST,
  MAX_LISTS_PER_OWNER,
} from '@/lib/validations/recommendation-list';
import { and, asc, eq, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

export type RecommendationList = typeof recommendationLists.$inferSelect;
export type RecommendationListItem =
  typeof recommendationListItems.$inferSelect;

/**
 * Errors this module throws. Routes map these to status codes; nothing else
 * in here reaches for NextResponse, because the wrapper is also what the db
 * tests drive directly.
 */
export type ListErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'NOT_A_DIRECTORY_LISTING'
  | 'DUPLICATE_ENTRY'
  | 'LIST_FULL'
  | 'TOO_MANY_LISTS'
  | 'INCOMPLETE_ORDER';

export class RecommendationListError extends Error {
  constructor(
    public readonly code: ListErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'RecommendationListError';
  }
}

// ---------------------------------------------------------------------------
// Visibility — the single predicate
// ---------------------------------------------------------------------------

/**
 * There is no "panas-only" value, and that is a decision rather than an
 * omission.
 *
 * Followers-only would have to be enforced on a pull endpoint that remote
 * servers fetch without presenting an identity. Enforcing it would require
 * signed GETs, which this codebase does not implement. Shipping a visibility
 * level the server cannot actually enforce is worse than not offering it: the
 * author would believe their list was restricted while it was served to
 * anyone who asked. So the ladder is private / unlisted / public, matching
 * event_visibility's honest split, with `unlisted` meaning exactly what it
 * means for events — reachable by direct URL, absent from listings.
 */
export function canViewList(
  list: Pick<RecommendationList, 'ownerUserId' | 'visibility'>,
  viewerUserId: string | null,
  { direct = false }: { direct?: boolean } = {}
): boolean {
  if (viewerUserId && viewerUserId === list.ownerUserId) return true;
  if (list.visibility === 'public') return true;
  // Unlisted is reachable only when the caller already knows the exact list,
  // never from an enumeration of somebody's profile.
  if (list.visibility === 'unlisted' && direct) return true;
  return false;
}

/**
 * SQL form of the same rule, for the enumeration case. `direct` has no
 * analogue here on purpose: enumerating a profile is precisely the context in
 * which unlisted must not appear.
 */
export function listVisibilityFilter(viewerUserId: string | null): SQL {
  const isPublic = eq(recommendationLists.visibility, 'public');
  if (!viewerUserId) return isPublic;
  return or(isPublic, eq(recommendationLists.ownerUserId, viewerUserId)) as SQL;
}

// ---------------------------------------------------------------------------
// Businesses-only guard
// ---------------------------------------------------------------------------

/**
 * You can recommend a directory listing. You cannot recommend a person.
 *
 * Enforced here rather than as a DB CHECK because the test is cross-table:
 * a profile is a directory listing if it came from the public business intake
 * form (no linked user at all) or if its owning account opted into the
 * directory by choosing directory or hybrid. That mirrors
 * isPersonalProfile() in lib/server/profile.ts, inverted — and like that
 * function it resolves ambiguity conservatively, refusing anything it cannot
 * positively identify as a listing.
 *
 * The product reason: a list is a vouch for somewhere you can go. Pointing it
 * at a person turns a directory feature into an unconsented endorsement of a
 * human being, which is a different feature with different consent questions.
 */
export async function assertDirectoryProfile(
  profileId: string
): Promise<{ id: string; name: string }> {
  const row = await db
    .select({
      id: profiles.id,
      name: profiles.name,
      source: sql<string | null>`${profiles.status}->>'source'`,
      accountType: users.accountType,
    })
    .from(profiles)
    .leftJoin(users, eq(profiles.userId, users.id))
    .where(eq(profiles.id, profileId))
    .limit(1);

  const profile = row[0];
  if (!profile) {
    throw new RecommendationListError('NOT_FOUND', 'Business not found');
  }

  const isIntakeListing = profile.source === BUSINESS_INTAKE_SOURCE;
  const isDirectoryAccount =
    !!profile.accountType &&
    (DIRECTORY_ACCOUNT_TYPES as readonly string[]).includes(
      profile.accountType
    );

  if (!isIntakeListing && !isDirectoryAccount) {
    throw new RecommendationListError(
      'NOT_A_DIRECTORY_LISTING',
      'Only directory listings can be added to a list'
    );
  }

  return { id: profile.id, name: profile.name ?? 'Unnamed listing' };
}

// ---------------------------------------------------------------------------
// Identity: slug + federated URI
// ---------------------------------------------------------------------------

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'list'
  );
}

/**
 * Slugs are unique per owner and frozen once assigned, so collisions are
 * resolved at creation time with a numeric suffix rather than by rewriting
 * anything later. Renaming a list never touches the slug: it is carried in
 * the federated id URI, which remote servers keep forever.
 */
async function mintSlug(ownerUserId: string, title: string): Promise<string> {
  const base = slugify(title);
  const taken = await db
    .select({ slug: recommendationLists.slug })
    .from(recommendationLists)
    .where(eq(recommendationLists.ownerUserId, ownerUserId));
  const used = new Set(taken.map((t) => t.slug));
  if (!used.has(base)) return base;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

/**
 * The owner's public handle, resolved user -> profile -> screenname.
 *
 * Falls back to the users row because a profile screenname is nullable, and
 * returns null when neither exists — in which case the list simply has no
 * federated identity yet, rather than one built on a placeholder that would
 * be wrong forever.
 */
export async function getOwnerHandle(
  ownerUserId: string
): Promise<string | null> {
  const row = await db
    .select({
      profileScreenname: profiles.screenname,
      userScreenname: users.screenname,
    })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(users.id, ownerUserId))
    .limit(1);
  const found = row[0];
  if (!found) return null;
  return found.profileScreenname ?? found.userScreenname ?? null;
}

/**
 * Advertised ActivityPub `id`.
 *
 * Points at the public web surface while the JSON-LD is served from
 * /api/federation/lists/[listId] — exactly the split
 * app/api/federation/events/[slug]/route.ts already uses, and built on the
 * federation domain rather than the UI host for the reason documented in
 * lib/federation/domain.ts.
 */
export function buildListUri(handle: string, slug: string): string {
  return `https://${socialConfig.domain}/p/${handle}/lists/${slug}`;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Resolve a public handle to the owning user id.
 *
 * Checks the profile screenname first and the users row second, matching the
 * flat namespace /p/:handle resolves against (see lib/screenname.ts). Returns
 * null rather than throwing so callers can answer 404 for "no such pana" and
 * "that pana has no visible lists" identically.
 */
export async function resolveOwnerUserIdByHandle(
  handle: string
): Promise<string | null> {
  const byProfile = await db
    .select({ userId: profiles.userId })
    .from(profiles)
    .where(eq(profiles.screenname, handle))
    .limit(1);
  if (byProfile[0]?.userId) return byProfile[0].userId;

  const byUser = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.screenname, handle))
    .limit(1);
  return byUser[0]?.id ?? null;
}

export async function getListById(
  listId: string
): Promise<RecommendationList | null> {
  const row = await db.query.recommendationLists.findFirst({
    where: eq(recommendationLists.id, listId),
  });
  return row ?? null;
}

/**
 * Items in running order. Ordered by (position, createdAt) so that a
 * duplicate position — which the reorder path makes very hard to produce, but
 * which is not forbidden by a constraint — degrades to a stable order rather
 * than an arbitrary one.
 */
export async function getListItems(listId: string) {
  return db
    .select({
      id: recommendationListItems.id,
      listId: recommendationListItems.listId,
      profileId: recommendationListItems.profileId,
      profileNameAtAdd: recommendationListItems.profileNameAtAdd,
      note: recommendationListItems.note,
      position: recommendationListItems.position,
      createdAt: recommendationListItems.createdAt,
      profileScreenname: profiles.screenname,
      profileName: profiles.name,
      // Joined for the profile card's sake, not the federation payload: a
      // recommendation that renders as a bare name reads like a bookmark,
      // and the whole point is that it reads like a person vouching.
      profileImage: profiles.primaryImageCdn,
      profileCategories: profiles.categories,
      profileActive: profiles.active,
    })
    .from(recommendationListItems)
    .leftJoin(
      profiles,
      and(
        eq(recommendationListItems.profileId, profiles.id),
        eq(profiles.active, true)
      )
    )
    .where(eq(recommendationListItems.listId, listId))
    .orderBy(
      asc(recommendationListItems.position),
      asc(recommendationListItems.createdAt)
    );
}

/** Lists belonging to one owner that `viewerUserId` is allowed to enumerate. */
export async function getVisibleListsForOwner(
  ownerUserId: string,
  viewerUserId: string | null
): Promise<RecommendationList[]> {
  return db
    .select()
    .from(recommendationLists)
    .where(
      and(
        eq(recommendationLists.ownerUserId, ownerUserId),
        listVisibilityFilter(viewerUserId)
      )
    )
    .orderBy(asc(recommendationLists.createdAt));
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

function assertOwner(list: RecommendationList, userId: string): void {
  if (list.ownerUserId !== userId) {
    throw new RecommendationListError(
      'FORBIDDEN',
      'You can only modify your own lists'
    );
  }
}

/**
 * Loads a list and proves the caller owns it, in one step, because every
 * mutation needs both and splitting them is how you end up with a route that
 * checks one and forgets the other.
 */
export async function requireOwnedList(
  listId: string,
  userId: string
): Promise<RecommendationList> {
  const list = await getListById(listId);
  if (!list) {
    throw new RecommendationListError('NOT_FOUND', 'List not found');
  }
  assertOwner(list, userId);
  return list;
}

export async function createList(
  ownerUserId: string,
  input: {
    title: string;
    blurb?: string;
    visibility?: RecommendationListVisibility;
  }
): Promise<RecommendationList> {
  const existing = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(recommendationLists)
    .where(eq(recommendationLists.ownerUserId, ownerUserId));
  if ((existing[0]?.count ?? 0) >= MAX_LISTS_PER_OWNER) {
    throw new RecommendationListError(
      'TOO_MANY_LISTS',
      `You can have at most ${MAX_LISTS_PER_OWNER} lists`
    );
  }

  const slug = await mintSlug(ownerUserId, input.title);
  const visibility = input.visibility ?? 'private';
  const handle = await getOwnerHandle(ownerUserId);

  const [created] = await db
    .insert(recommendationLists)
    .values({
      ownerUserId,
      title: input.title,
      blurb: input.blurb ?? null,
      slug,
      visibility,
      // Minted up front here rather than post-insert (as statuses do) because
      // the URI is derived from owner + slug, both known before the write.
      uri:
        handle && visibility !== 'private' ? buildListUri(handle, slug) : null,
      publishedAt: visibility === 'public' ? new Date() : null,
    })
    .returning();

  return created;
}

export async function updateList(
  listId: string,
  userId: string,
  input: {
    title?: string;
    blurb?: string | null;
    visibility?: RecommendationListVisibility;
  }
): Promise<RecommendationList> {
  const list = await requireOwnedList(listId, userId);

  const patch: Partial<typeof recommendationLists.$inferInsert> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.blurb !== undefined) patch.blurb = input.blurb;

  if (input.visibility !== undefined && input.visibility !== list.visibility) {
    patch.visibility = input.visibility;
    // published_at is "since when has this been public", so it is stamped on
    // the first publish and never moved by later edits — it doubles as the
    // AS2 `published` value, which must be stable.
    if (input.visibility === 'public' && !list.publishedAt) {
      patch.publishedAt = new Date();
    }
    // A list leaving private state acquires its federated identity once. It
    // is never re-minted, so going private and public again keeps the same id.
    if (input.visibility !== 'private' && !list.uri) {
      const handle = await getOwnerHandle(userId);
      if (handle) patch.uri = buildListUri(handle, list.slug);
    }
  }

  const [updated] = await db
    .update(recommendationLists)
    .set(patch)
    .where(eq(recommendationLists.id, listId))
    .returning();

  return updated;
}

export async function deleteList(
  listId: string,
  userId: string
): Promise<void> {
  await requireOwnedList(listId, userId);
  // Items go with it via ON DELETE CASCADE.
  await db
    .delete(recommendationLists)
    .where(eq(recommendationLists.id, listId));
}

export async function addItem(
  listId: string,
  userId: string,
  input: { profileId: string; note: string }
): Promise<RecommendationListItem> {
  const list = await requireOwnedList(listId, userId);
  const target = await assertDirectoryProfile(input.profileId);

  return db.transaction(async (tx) => {
    const rows = await tx
      .select({
        count: sql<number>`count(*)::int`,
        nextPosition: sql<number>`coalesce(max(${recommendationListItems.position}) + 1, 0)`,
      })
      .from(recommendationListItems)
      .where(eq(recommendationListItems.listId, listId));
    const { count, nextPosition } = rows[0] ?? { count: 0, nextPosition: 0 };

    if (count >= MAX_ITEMS_PER_LIST) {
      throw new RecommendationListError(
        'LIST_FULL',
        `A list can hold at most ${MAX_ITEMS_PER_LIST} places`
      );
    }

    // Checked explicitly rather than letting the unique index fire, so the
    // caller gets a sentence instead of a Postgres constraint name.
    const dupe = await tx
      .select({ id: recommendationListItems.id })
      .from(recommendationListItems)
      .where(
        and(
          eq(recommendationListItems.listId, listId),
          eq(recommendationListItems.profileId, input.profileId)
        )
      )
      .limit(1);
    if (dupe.length > 0) {
      throw new RecommendationListError(
        'DUPLICATE_ENTRY',
        'That business is already on this list'
      );
    }

    const [item] = await tx
      .insert(recommendationListItems)
      .values({
        listId,
        profileId: target.id,
        profileNameAtAdd: target.name,
        note: input.note,
        position: nextPosition,
      })
      .returning();

    await tx
      .update(recommendationLists)
      .set({ itemCount: sql`${recommendationLists.itemCount} + 1` })
      .where(eq(recommendationLists.id, list.id));

    return item;
  });
}

export async function updateItem(
  listId: string,
  itemId: string,
  userId: string,
  input: { note: string }
): Promise<RecommendationListItem> {
  await requireOwnedList(listId, userId);

  const [updated] = await db
    .update(recommendationListItems)
    .set({ note: input.note })
    .where(
      and(
        eq(recommendationListItems.id, itemId),
        eq(recommendationListItems.listId, listId)
      )
    )
    .returning();

  if (!updated) {
    throw new RecommendationListError('NOT_FOUND', 'Item not found');
  }
  return updated;
}

/**
 * Remove an entry and close the gap, so positions stay contiguous from 0 and
 * the invariant the reorder path relies on is never violated by a delete.
 */
export async function removeItem(
  listId: string,
  itemId: string,
  userId: string
): Promise<void> {
  await requireOwnedList(listId, userId);

  await db.transaction(async (tx) => {
    const [removed] = await tx
      .delete(recommendationListItems)
      .where(
        and(
          eq(recommendationListItems.id, itemId),
          eq(recommendationListItems.listId, listId)
        )
      )
      .returning({ position: recommendationListItems.position });

    if (!removed) {
      throw new RecommendationListError('NOT_FOUND', 'Item not found');
    }

    await tx
      .update(recommendationListItems)
      .set({ position: sql`${recommendationListItems.position} - 1` })
      .where(
        and(
          eq(recommendationListItems.listId, listId),
          sql`${recommendationListItems.position} > ${removed.position}`
        )
      );

    await tx
      .update(recommendationLists)
      .set({
        itemCount: sql`greatest(${recommendationLists.itemCount} - 1, 0)`,
      })
      .where(eq(recommendationLists.id, listId));
  });
}

/**
 * Rewrite the running order as a block.
 *
 * The caller sends every item id in the order it wants. Positions come from
 * the array index, so a payload cannot express two things in third place or
 * quietly drop an entry — an incomplete set is rejected outright rather than
 * silently leaving orphans at stale positions. For lists of five to thirty
 * places, rewriting all of them in one transaction is cheaper than reasoning
 * about a partial update, and far easier to verify.
 */
export async function reorderItems(
  listId: string,
  userId: string,
  itemIds: string[]
): Promise<void> {
  await requireOwnedList(listId, userId);

  await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: recommendationListItems.id })
      .from(recommendationListItems)
      .where(eq(recommendationListItems.listId, listId));

    const existingIds = new Set(existing.map((row) => row.id));
    const sameSize = existingIds.size === itemIds.length;
    const allPresent = itemIds.every((id) => existingIds.has(id));
    if (!sameSize || !allPresent) {
      throw new RecommendationListError(
        'INCOMPLETE_ORDER',
        'itemIds must list every item in this list exactly once'
      );
    }

    for (const [index, id] of itemIds.entries()) {
      await tx
        .update(recommendationListItems)
        .set({ position: index })
        .where(
          and(
            eq(recommendationListItems.id, id),
            eq(recommendationListItems.listId, listId)
          )
        );
    }
  });
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

type ListItemRow = Awaited<ReturnType<typeof getListItems>>[number];

/** Plain JSON for the app's own API. */
export function serializeList(list: RecommendationList, items?: ListItemRow[]) {
  return {
    id: list.id,
    slug: list.slug,
    title: list.title,
    blurb: list.blurb,
    visibility: list.visibility,
    itemCount: list.itemCount,
    uri: list.uri,
    createdAt: list.createdAt.toISOString(),
    updatedAt: list.updatedAt.toISOString(),
    publishedAt: list.publishedAt?.toISOString() ?? null,
    ...(items ? { items: items.map(serializeListItem) } : {}),
  };
}

export function serializeListItem(item: ListItemRow) {
  const unavailable = item.profileId === null || item.profileActive !== true;
  return {
    id: item.id,
    position: item.position,
    note: item.note,
    // Null once the listing is gone. The UI renders this as a tombstone: the
    // author's note and its place in the sequence survive, the link does not.
    profileId: unavailable ? null : item.profileId,
    profileScreenname: item.profileScreenname,
    // The live name when the listing still exists, the snapshot otherwise —
    // so a removed business still reads as a place rather than a blank.
    profileName: item.profileName ?? item.profileNameAtAdd,
    profileNameAtAdd: item.profileNameAtAdd,
    // Both null for a tombstone, because the left join has nothing to supply.
    // That is the correct result rather than a gap to paper over: a business
    // that left the directory should not keep rendering its old storefront.
    profileImage: item.profileImage ?? null,
    profileCategory: firstCategory(item.profileCategories),
    isUnavailable: unavailable,
    createdAt: item.createdAt.toISOString(),
  };
}

/**
 * `profiles.categories` is jsonb, so it arrives as `unknown` and is not
 * guaranteed to be the string array the writer intended. One category is
 * enough here — the card shows a kind of place, not a taxonomy.
 */
function firstCategory(categories: unknown): string | null {
  if (!Array.isArray(categories)) return null;

  const first = categories.find(
    (value): value is string => typeof value === 'string' && value.length > 0
  );

  return first ?? null;
}

/**
 * ActivityStreams 2.0 `OrderedCollection`.
 *
 * Small lists, so the whole thing is inlined as `orderedItems` rather than
 * paged — the outbox pages because an outbox is unbounded, and this is not.
 * Each entry is a `Note` attributed to the list, because the note genuinely is
 * the content; the recommended business rides along as an AS2 `tag` link so
 * remote software that understands neither still renders the sentence a
 * human wrote.
 *
 * Addressing only. Push delivery is deferred exactly as it is for statuses —
 * see lib/federation/wrappers/status.ts and SOCIAL-ROADMAP Phase 6.
 */
export function serializeListAsCollection(
  list: RecommendationList,
  items: ListItemRow[],
  handle: string
) {
  const listUri = list.uri ?? buildListUri(handle, list.slug);
  const actorUri = `https://${socialConfig.domain}/p/${handle}`;

  return {
    '@context': 'https://www.w3.org/ns/activitystreams',
    id: listUri,
    type: 'OrderedCollection',
    name: list.title,
    summary: list.blurb ?? undefined,
    attributedTo: actorUri,
    published: (list.publishedAt ?? list.createdAt).toISOString(),
    updated: list.updatedAt.toISOString(),
    to: ['https://www.w3.org/ns/activitystreams#Public'],
    totalItems: items.length,
    orderedItems: items.map((item, index) => ({
      id: `${listUri}/items/${item.id}`,
      type: 'Note',
      attributedTo: actorUri,
      content: item.note,
      published: item.createdAt.toISOString(),
      // Position is 1-based here only because AS2 consumers render this as a
      // human-facing ordinal; the database stays 0-based.
      name: `${index + 1}. ${item.profileName ?? item.profileNameAtAdd}`,
      tag:
        item.profileId && item.profileActive === true
          ? [
              {
                type: 'Link',
                href: `https://${socialConfig.domain}${listingPublicPath({
                  id: item.profileId,
                  screenname: item.profileScreenname,
                })}`,
                name: item.profileName ?? item.profileNameAtAdd,
              },
            ]
          : [],
    })),
  };
}

export { MAX_ITEMS_PER_LIST, MAX_LISTS_PER_OWNER };
