import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { DIRECTORY_ACCOUNT_TYPES } from '@/lib/accounts';
import type { DirectoryRoster } from '@/lib/admin/directory';
import { db } from '@/lib/db';
import type { ProfileDescriptions } from '@/lib/interfaces';
import { profileCategoryList } from '@/lib/lists';
import { profiles, profileOwners, users } from '@/lib/schema';
import { categoryKeys } from '@/lib/server/directory';
import {
  cancelListingRefreshes,
  listingStatus,
} from '@/lib/server/listing-refresh-status';

// Match the public directory's account-type policy, but retain previously
// published inactive listings. Undecided/declined applications stay in review.
const rosterCondition = and(
  or(
    isNull(profiles.userId),
    inArray(
      profiles.userId,
      db
        .select({ id: users.id })
        .from(users)
        .where(inArray(users.accountType, DIRECTORY_ACCOUNT_TYPES))
    )
  ),
  or(
    eq(profiles.active, true),
    sql`${profiles.status}->>'approved' is not null`,
    sql`${profiles.status}->>'published' is not null`,
    sql`${profiles.status}->'directoryVisibility'->>'changedAt' is not null`
  )
);

export async function getDirectoryRoster(): Promise<DirectoryRoster> {
  const rows = await db
    .select({
      id: profiles.id,
      name: profiles.name,
      categories: profiles.categories,
      descriptions: profiles.descriptions,
      locality: profiles.addressLocality,
      region: profiles.addressRegion,
      onlineOnly: profiles.onlineOnly,
      email: profiles.email,
      phone: profiles.phoneNumber,
      joined: profiles.createdAt,
      active: profiles.active,
      screenname: sql<
        string | null
      >`coalesce(${profiles.screenname}, ${users.screenname})`,
      owner: users.name,
      ownerId: users.id,
    })
    .from(profiles)
    .leftJoin(users, eq(users.id, profiles.userId))
    .where(rosterCondition)
    .orderBy(desc(profiles.createdAt), profiles.id);

  const owners = rows.length
    ? await db
        .select({
          profileId: profileOwners.profileId,
          name: users.name,
        })
        .from(profileOwners)
        .innerJoin(users, eq(users.id, profileOwners.userId))
        .where(
          and(
            inArray(
              profileOwners.profileId,
              rows.map((row) => row.id)
            ),
            eq(profileOwners.role, 'owner')
          )
        )
        .orderBy(users.name, users.id)
    : [];
  const ownerNames = new Map<string, Set<string>>();
  for (const owner of owners) {
    const names = ownerNames.get(owner.profileId) ?? new Set<string>();
    names.add(owner.name || 'Owner name not provided');
    ownerNames.set(owner.profileId, names);
  }

  return {
    asOf: new Date().toISOString(),
    businesses: rows.map((row) => {
      const categories = categoryKeys(row.categories).map(
        (key) =>
          profileCategoryList.find((category) => category.value === key)
            ?.desc ?? key
      );
      const descriptions = row.descriptions as ProfileDescriptions | null;
      const names = ownerNames.get(row.id) ?? new Set<string>();
      if (row.ownerId) names.add(row.owner || 'Owner name not provided');
      return {
        id: row.id,
        name: row.name,
        category:
          categories.join(', ') || descriptions?.tags || 'Uncategorized',
        location: row.onlineOnly
          ? 'Online'
          : [row.locality, row.region].filter(Boolean).join(', ') ||
            'Not provided',
        owner: [...names].join('; ') || 'Unclaimed',
        email: row.email,
        phone: row.phone ?? '',
        joined: row.joined.toISOString(),
        active: row.active,
        screenname: row.screenname,
      };
    }),
  };
}

export async function setDirectoryVisibility({
  profileId,
  active,
  expectedActive,
  changedBy,
}: {
  profileId: string;
  active: boolean;
  expectedActive: boolean;
  changedBy: string;
}) {
  return db.transaction(async (tx) => {
    const [profile] = await tx
      .select()
      .from(profiles)
      .where(and(eq(profiles.id, profileId), rosterCondition))
      .for('update');
    if (!profile) return { ok: false as const, reason: 'not-found' as const };
    if (profile.active !== expectedActive) {
      return { ok: false as const, reason: 'conflict' as const };
    }

    const status = listingStatus(profile.status);
    status.directoryVisibility = {
      active,
      changedAt: new Date().toISOString(),
      changedBy,
    };
    delete status.refreshPause;
    await tx
      .update(profiles)
      .set({ active, status })
      .where(eq(profiles.id, profileId));
    await cancelListingRefreshes(tx, profileId);

    const user = profile.userId
      ? await tx.query.users.findFirst({
          where: eq(users.id, profile.userId),
          columns: { screenname: true },
        })
      : undefined;
    return {
      ok: true as const,
      screenname: profile.screenname ?? user?.screenname,
    };
  });
}
