import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  listingRefreshCycles,
  listingRefreshDeliveries,
  profiles,
} from '@/lib/schema';
import { OPEN_REFRESH_STATES, refreshDigest } from '@/lib/listing-refresh';

type Reader = Pick<typeof db, 'select'>;
type Writer = Pick<
  Parameters<Parameters<typeof db.transaction>[0]>[0],
  'select' | 'update'
>;

export function listingStatus(value: unknown): Record<string, unknown> {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid stored listing status.');
  return { ...value };
}

export async function pauseGuard(
  profile: typeof profiles.$inferSelect
): Promise<string> {
  const status = listingStatus(profile.status);
  return refreshDigest(
    JSON.stringify([
      status.source,
      status.approved ?? null,
      status.declined ?? null,
      status.published ?? null,
      status.decidedBy ?? null,
      status.decidedReason ?? null,
      profile.userId,
      profile.administrative,
      profile.socialIneligibleReason,
    ])
  );
}

export async function isReviewPausedListing(
  profile: typeof profiles.$inferSelect | undefined,
  reader: Reader = db
): Promise<boolean> {
  if (!profile || profile.active !== false) return false;
  const marker = listingStatus(profile.status).refreshPause;
  if (
    !marker ||
    typeof marker !== 'object' ||
    !('reason' in marker) ||
    marker.reason !== 'review_overdue' ||
    !('cycleId' in marker) ||
    typeof marker.cycleId !== 'string' ||
    !('guard' in marker) ||
    marker.guard !== (await pauseGuard(profile))
  )
    return false;
  const [cycle] = await reader
    .select({ id: listingRefreshCycles.id })
    .from(listingRefreshCycles)
    .where(
      and(
        eq(listingRefreshCycles.id, marker.cycleId),
        eq(listingRefreshCycles.profileId, profile.id),
        eq(listingRefreshCycles.state, 'paused')
      )
    )
    .limit(1);
  return Boolean(cycle);
}

/** Caller holds the profile lock; all lifecycle writes use that same order. */
export async function cancelListingRefreshes(
  tx: Writer,
  profileId: string
): Promise<void> {
  const cycles = await tx
    .select({ id: listingRefreshCycles.id })
    .from(listingRefreshCycles)
    .where(
      and(
        eq(listingRefreshCycles.profileId, profileId),
        inArray(listingRefreshCycles.state, OPEN_REFRESH_STATES)
      )
    );
  if (!cycles.length) return;
  const ids = cycles.map((cycle) => cycle.id);
  await tx
    .update(listingRefreshCycles)
    .set({
      state: 'cancelled',
      nextReminderAt: null,
      updatedAt: new Date(),
    })
    .where(inArray(listingRefreshCycles.id, ids));
  await tx
    .update(listingRefreshDeliveries)
    .set({ status: 'cancelled' })
    .where(
      and(
        inArray(listingRefreshDeliveries.cycleId, ids),
        eq(listingRefreshDeliveries.status, 'sending')
      )
    );
}
