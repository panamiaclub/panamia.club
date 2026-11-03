import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  listingRefreshCycles as cycles,
  listingRefreshDeliveries as deliveries,
  profiles,
  profileOwners,
  users,
} from '@/lib/schema';
import { getEditableProfile } from './active-profile';
import { DIRECTORY_ACCOUNT_TYPES } from '@/lib/accounts';
import { BUSINESS_INTAKE_SOURCE } from './profile-owners';
import {
  OPEN_REFRESH_STATES,
  type ListingReviewState,
  refreshDigest,
} from '@/lib/listing-refresh';
import {
  isReviewPausedListing,
  listingStatus,
  cancelListingRefreshes,
} from './listing-refresh-status';
import { listingInvitationIdentifier } from '@/lib/listing-invitation';
import { verification } from '@/lib/schema';
import { revalidatePublicListing } from './profile';
import { revalidatePath } from 'next/cache';

export type RefreshTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];
export type RefreshProfile = typeof profiles.$inferSelect;
export interface RefreshFailure {
  success: false;
  error: string;
  status: 400 | 403 | 404 | 409;
}
const fail = (
  error: string,
  status: RefreshFailure['status'] = 409
): RefreshFailure => ({ success: false, error, status });

export async function currentRefreshCycle(
  profileId: string,
  reader: Pick<typeof db, 'select'> = db
) {
  const [cycle] = await reader
    .select()
    .from(cycles)
    .where(
      and(
        eq(cycles.profileId, profileId),
        inArray(cycles.state, OPEN_REFRESH_STATES)
      )
    )
    .limit(1);
  return cycle ?? null;
}

export async function refreshRecipients(
  profile: RefreshProfile,
  tx: Pick<typeof db, 'select'> = db
) {
  const managers = await tx
    .select({
      userId: users.id,
      email: users.email,
      optedOut: profiles.emailOptedOut,
      ghlOptedOut: profiles.ghlOptedOut,
      ghlContactId: profiles.ghlContactId,
    })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id)).where(sql`
    ${users.id} IN (
      SELECT user_id FROM profile_owners WHERE profile_id = ${profile.id}
    ) OR ${users.id} = ${profile.userId}
  `);
  const suppressed =
    profile.emailOptedOut ||
    profile.ghlOptedOut ||
    Boolean(listingStatus(profile.status).listingRefreshOptOutAt) ||
    managers.some((manager) => manager.optedOut || manager.ghlOptedOut);
  const emails = [
    ...new Set(
      (managers.length
        ? managers.map((manager) => manager.email)
        : [profile.email]
      ).map((email) => email.trim().toLowerCase())
    ),
  ].sort();
  const valid =
    emails.length > 0 &&
    emails.every((email) =>
      /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(email)
    );
  const ghlContactIds = [
    ...new Set(
      (managers.length
        ? managers.map((manager) => manager.ghlContactId)
        : [profile.ghlContactId]
      ).filter((id): id is string => Boolean(id))
    ),
  ].sort();
  return {
    emails,
    owned: managers.length > 0,
    suppressed,
    valid,
    ghlContactIds,
    routingHash: await refreshDigest(JSON.stringify([emails, ghlContactIds])),
  };
}

export async function startListingRefresh(
  profileId: string,
  operatorId: string
) {
  return db.transaction(async (tx) => {
    const [profile] = await tx
      .select()
      .from(profiles)
      .where(eq(profiles.id, profileId))
      .for('update');
    if (!profile || !profile.active)
      return fail('Only a published business can be enrolled.', 404);
    const [user] = profile.userId
      ? await tx
          .select({ accountType: users.accountType })
          .from(users)
          .where(eq(users.id, profile.userId))
      : [];
    if (
      listingStatus(profile.status).source !== BUSINESS_INTAKE_SOURCE &&
      !DIRECTORY_ACCOUNT_TYPES.some((type) => type === user?.accountType)
    ) {
      return fail('Only a directory business can be enrolled.', 400);
    }
    if (await currentRefreshCycle(profileId, tx))
      return fail('This business already has an open review cycle.');
    const recipients = await refreshRecipients(profile, tx);
    if (recipients.suppressed)
      return fail(
        'Email reminders are opted out for this listing or its manager.'
      );
    if (!recipients.valid)
      return fail(
        'Correct the notification email before starting this review.',
        400
      );
    const [cycle] = await tx
      .insert(cycles)
      .values({
        profileId,
        createdByUserId: operatorId,
        state: 'queued',
        reminderCount: 0,
        nextReminderAt: new Date(),
      })
      .returning();
    return { success: true as const, cycleId: cycle.id };
  });
}

export async function controlListingRefresh(
  profileId: string,
  action: 'hold' | 'cancel' | 'retry',
  reason: string,
  acknowledgeRisk: boolean
) {
  return db.transaction(async (tx) => {
    const [profile] = await tx
      .select()
      .from(profiles)
      .where(eq(profiles.id, profileId))
      .for('update');
    if (!profile) return fail('That listing no longer exists.', 404);
    const cycle = await currentRefreshCycle(profileId, tx);
    if (!cycle) return fail('This business has no open review cycle.', 404);
    if (action === 'cancel') {
      await cancelListingRefreshes(tx, profileId);
      const status = listingStatus(profile.status);
      delete status.refreshPause;
      await tx
        .update(profiles)
        .set({ status })
        .where(eq(profiles.id, profileId));
      await tx
        .delete(verification)
        .where(
          eq(verification.identifier, listingInvitationIdentifier(profileId))
        );
    } else if (action === 'hold') {
      await tx
        .update(cycles)
        .set({
          state: cycle.state === 'paused' ? 'paused' : 'held',
          holdReason: reason,
          nextReminderAt: null,
          updatedAt: new Date(),
        })
        .where(eq(cycles.id, cycle.id));
      await tx
        .update(deliveries)
        .set({ status: 'cancelled' })
        .where(
          and(
            eq(deliveries.cycleId, cycle.id),
            eq(deliveries.status, 'sending')
          )
        );
    } else {
      if (cycle.state !== 'held' || !acknowledgeRisk)
        return fail(
          'Check provider delivery records and acknowledge resend risk before retrying.'
        );
      if (
        cycle.reminderCount >= 4 ||
        [
          'bounced',
          'contact_changed',
          'invalid_contact',
          'reschedule_required',
        ].includes(cycle.holdReason ?? '')
      ) {
        return fail(
          'Cancel this cycle and start a fresh notice window after the delivery issue is resolved.'
        );
      }
      const recipients = await refreshRecipients(profile, tx);
      if (recipients.suppressed)
        return fail(
          'The recipient must opt back in before reminders can resume.'
        );
      if (!recipients.valid)
        return fail('Correct the notification email before retrying.');
      const [last] = await tx
        .select({ routingHash: deliveries.routingHash })
        .from(deliveries)
        .where(eq(deliveries.cycleId, cycle.id))
        .orderBy(desc(deliveries.attemptedAt))
        .limit(1);
      if (last && last.routingHash !== recipients.routingHash)
        return fail(
          'The recipients changed. Start a fresh notice window instead.'
        );
      if (!profile.active)
        return fail('A manually hidden listing cannot restart reminders.');
      await tx
        .update(deliveries)
        .set({ status: 'failed', errorCode: 'delivery_unknown' })
        .where(
          and(
            eq(deliveries.cycleId, cycle.id),
            eq(deliveries.status, 'sending')
          )
        );
      await tx
        .update(cycles)
        .set({
          state: cycle.startedAt ? 'active' : 'queued',
          holdReason: null,
          nextReminderAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(cycles.id, cycle.id));
    }
    return { success: true as const };
  });
}

export async function listingReviewState(
  userId: string,
  profileId: string
): Promise<ListingReviewState | RefreshFailure> {
  const profile = await getEditableProfile(userId, profileId);
  if (!profile) return fail('You do not manage that business.', 403);
  const cycle = await currentRefreshCycle(profileId);
  return {
    profileId,
    lastReviewedAt: profile.lastReviewedAt?.toISOString() ?? null,
    remindersOptedOut: Boolean(
      listingStatus(profile.status).listingRefreshOptOutAt
    ),
    cycle: cycle
      ? {
          id: cycle.id,
          state: cycle.state,
          reminderCount: cycle.reminderCount,
          startedAt: cycle.startedAt?.toISOString() ?? null,
          dueAt: cycle.dueAt?.toISOString() ?? null,
          pausedAt: cycle.pausedAt?.toISOString() ?? null,
          holdReason: cycle.holdReason,
        }
      : null,
  };
}

export async function confirmListingReview(
  userId: string,
  profileId: string,
  expectedCycleId: string | null
) {
  if (!(await getEditableProfile(userId, profileId)))
    return fail('You do not manage that business.', 403);
  const result = await db.transaction(async (tx) => {
    const [profile] = await tx
      .select()
      .from(profiles)
      .where(eq(profiles.id, profileId))
      .for('update');
    if (!profile) return fail('That business no longer exists.', 404);
    const [owner] = await tx
      .select({ id: profileOwners.id })
      .from(profileOwners)
      .where(
        and(
          eq(profileOwners.profileId, profileId),
          eq(profileOwners.userId, userId)
        )
      )
      .for('key share');
    if (profile.userId !== userId && !owner)
      return fail('Your business access changed. Please reload.', 403);
    const cycle = await currentRefreshCycle(profileId, tx);
    if ((cycle?.id ?? null) !== expectedCycleId)
      return fail('The review cycle changed. Reload before confirming.');
    const restored =
      cycle?.state === 'paused' && (await isReviewPausedListing(profile, tx));
    const status = listingStatus(profile.status);
    if (restored) delete status.refreshPause;
    const now = new Date();
    await tx
      .update(profiles)
      .set({
        lastReviewedAt: now,
        ...(restored ? { active: true, status } : {}),
      })
      .where(eq(profiles.id, profileId));
    if (cycle) {
      await tx
        .update(cycles)
        .set({
          state: 'completed',
          completedAt: now,
          confirmedByUserId: userId,
          nextReminderAt: null,
          updatedAt: now,
        })
        .where(eq(cycles.id, cycle.id));
      await tx
        .update(deliveries)
        .set({ status: 'cancelled' })
        .where(
          and(
            eq(deliveries.cycleId, cycle.id),
            eq(deliveries.status, 'sending')
          )
        );
    }
    return {
      success: true as const,
      profileId,
      restored: Boolean(restored),
      reviewedAt: now.toISOString(),
      screenname: profile.screenname,
    };
  });
  if (result.success) {
    revalidatePublicListing(profileId, result.screenname);
    revalidatePath('/directory/search');
    revalidatePath('/sitemap.xml');
  }
  return result;
}

export async function stopListingReminders(cycleId: string, token: string) {
  const [target] = await db
    .select({ profileId: cycles.profileId })
    .from(cycles)
    .where(eq(cycles.id, cycleId));
  if (!target || !/^[a-f0-9]{64}$/.test(token))
    return fail('This stop-reminders link is no longer valid.', 404);
  return db.transaction(async (tx) => {
    const [profile] = await tx
      .select()
      .from(profiles)
      .where(eq(profiles.id, target.profileId))
      .for('update');
    const cycle = await currentRefreshCycle(target.profileId, tx);
    if (!profile || cycle?.id !== cycleId)
      return fail('This review cycle has already ended.', 409);
    const recipients = await refreshRecipients(profile, tx);
    const [proof] = await tx
      .select()
      .from(deliveries)
      .where(
        and(
          eq(deliveries.cycleId, cycleId),
          eq(deliveries.stopTokenHash, await refreshDigest(token))
        )
      )
      .limit(1);
    if (!proof || proof.routingHash !== recipients.routingHash)
      return fail(
        'This stop-reminders link no longer matches the current recipient.',
        403
      );
    const status = listingStatus(profile.status);
    status.listingRefreshOptOutAt = new Date().toISOString();
    await tx
      .update(profiles)
      .set({ status })
      .where(eq(profiles.id, profile.id));
    await tx
      .update(cycles)
      .set({
        state: cycle.state === 'paused' ? 'paused' : 'held',
        holdReason: 'opted_out',
        nextReminderAt: null,
        updatedAt: new Date(),
      })
      .where(eq(cycles.id, cycleId));
    await tx
      .update(deliveries)
      .set({ status: 'cancelled' })
      .where(
        and(eq(deliveries.cycleId, cycleId), eq(deliveries.status, 'sending'))
      );
    return { success: true as const };
  });
}

export async function allowListingReminders(userId: string, profileId: string) {
  const profile = await getEditableProfile(userId, profileId);
  if (!profile) return fail('You do not manage that business.', 403);
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(profiles)
      .where(eq(profiles.id, profileId))
      .for('update');
    if (!current) return fail('That business no longer exists.', 404);
    const [owner] = await tx
      .select({ id: profileOwners.id })
      .from(profileOwners)
      .where(
        and(
          eq(profileOwners.profileId, profileId),
          eq(profileOwners.userId, userId)
        )
      )
      .for('key share');
    if (current.userId !== userId && !owner)
      return fail('Your business access changed.', 403);
    const status = listingStatus(current.status);
    delete status.listingRefreshOptOutAt;
    const cycle = await currentRefreshCycle(profileId, tx);
    if (cycle?.state === 'held' && cycle.holdReason === 'opted_out') {
      await cancelListingRefreshes(tx, profileId);
    }
    await tx.update(profiles).set({ status }).where(eq(profiles.id, profileId));
    return { success: true as const };
  });
}

export async function stopOwnedListingReminders(
  userId: string,
  profileId: string,
  expectedCycleId: string | null
) {
  if (!(await getEditableProfile(userId, profileId)))
    return fail('You do not manage that business.', 403);
  return db.transaction(async (tx) => {
    const [profile] = await tx
      .select()
      .from(profiles)
      .where(eq(profiles.id, profileId))
      .for('update');
    const [owner] = await tx
      .select({ id: profileOwners.id })
      .from(profileOwners)
      .where(
        and(
          eq(profileOwners.profileId, profileId),
          eq(profileOwners.userId, userId)
        )
      )
      .for('key share');
    if (!profile || (profile.userId !== userId && !owner))
      return fail('Your business access changed.', 403);
    const cycle = await currentRefreshCycle(profileId, tx);
    if ((cycle?.id ?? null) !== expectedCycleId)
      return fail('The review cycle changed. Reload before continuing.');
    const status = listingStatus(profile.status);
    status.listingRefreshOptOutAt = new Date().toISOString();
    await tx.update(profiles).set({ status }).where(eq(profiles.id, profileId));
    if (cycle) {
      await tx
        .update(cycles)
        .set({
          state: cycle.state === 'paused' ? 'paused' : 'held',
          holdReason: 'opted_out',
          nextReminderAt: null,
          updatedAt: new Date(),
        })
        .where(eq(cycles.id, cycle.id));
      await tx
        .update(deliveries)
        .set({ status: 'cancelled' })
        .where(
          and(
            eq(deliveries.cycleId, cycle.id),
            eq(deliveries.status, 'sending')
          )
        );
    }
    return { success: true as const };
  });
}

export async function adminRefreshState(profileId: string) {
  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.id, profileId),
    columns: { id: true, name: true, active: true, lastReviewedAt: true },
  });
  if (!profile) return null;
  const [cycle] = await db
    .select()
    .from(cycles)
    .where(eq(cycles.profileId, profileId))
    .orderBy(desc(cycles.createdAt))
    .limit(1);
  const history = cycle
    ? await db
        .select()
        .from(deliveries)
        .where(eq(deliveries.cycleId, cycle.id))
        .orderBy(desc(deliveries.attemptedAt))
    : [];
  return {
    profile,
    cycle: cycle ?? null,
    deliveries: history.map(
      ({
        recipientHash: _recipient,
        routingHash: _routing,
        stopTokenHash: _proof,
        ...entry
      }) => entry
    ),
  };
}
