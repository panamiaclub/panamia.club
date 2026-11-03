import { and, eq, inArray, lte, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  listingRefreshCycles as cycles,
  listingRefreshDeliveries as deliveries,
  profiles,
  users,
} from '@/lib/schema';
import { sendTemplateEmail } from '@/lib/email';
import {
  daysAfter,
  LISTING_REFRESH_DAYS,
  LISTING_REMINDER_COUNT,
  LISTING_REMINDER_DAYS,
  LISTING_FINAL_NOTICE_DAYS,
  refreshDigest,
  refreshSecret,
  refreshStopPath,
} from '@/lib/listing-refresh';
import { listingReviewPath } from '@/lib/listing-url';
import {
  refreshRecipients,
  type RefreshTransaction,
} from '@/lib/server/listing-refresh';
import {
  listingStatus,
  pauseGuard,
  cancelListingRefreshes,
} from '@/lib/server/listing-refresh-status';
import { issueListingInvitationInTransaction } from '@/lib/server/listing-invitations';
import { BUSINESS_INTAKE_SOURCE } from '@/lib/server/profile-owners';
import { DIRECTORY_ACCOUNT_TYPES } from '@/lib/accounts';
import { revalidatePublicListing } from '@/lib/server/profile';
import { revalidatePath } from 'next/cache';
import { GhlClient } from '@/lib/ghl';

export const LISTING_REFRESH_JOB = 'listing-refresh';
export interface ListingRefreshReport {
  noticesSent: number;
  remindersSent: number;
  held: number;
  paused: number;
  errors: number;
}
interface PreparedMessage {
  deliveryId: string;
  cycleId: string;
  profileId: string;
  round: number;
  email: string;
  params: Record<string, unknown>;
}

function origin(): URL {
  const url = new URL(process.env.NEXT_PUBLIC_HOST_URL ?? '');
  if (
    url.username ||
    url.password ||
    (url.protocol !== 'https:' &&
      !(
        url.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      ))
  ) {
    throw new Error('A valid Pana origin is required for listing reminders.');
  }
  return url;
}

async function business(
  profile: typeof profiles.$inferSelect,
  tx: RefreshTransaction
) {
  if (listingStatus(profile.status).source === BUSINESS_INTAKE_SOURCE)
    return true;
  if (!profile.userId) return false;
  const [user] = await tx
    .select({ type: users.accountType })
    .from(users)
    .where(eq(users.id, profile.userId));
  return DIRECTORY_ACCOUNT_TYPES.some((type) => type === user?.type);
}

async function hold(tx: RefreshTransaction, cycleId: string, reason: string) {
  await tx
    .update(cycles)
    .set({
      state: 'held',
      holdReason: reason,
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
}

async function prepare(profileId: string, cycleId: string, base: URL) {
  return db.transaction(async (tx) => {
    const [profile] = await tx
      .select()
      .from(profiles)
      .where(eq(profiles.id, profileId))
      .for('update');
    const [cycle] = await tx
      .select()
      .from(cycles)
      .where(eq(cycles.id, cycleId))
      .for('update');
    if (!profile || !cycle || !['queued', 'active'].includes(cycle.state))
      return { messages: [] };
    if (!profile.active || !(await business(profile, tx))) {
      await cancelListingRefreshes(tx, profileId);
      return { messages: [] };
    }
    const recipients = await refreshRecipients(profile, tx);
    if (recipients.suppressed || !recipients.valid) {
      await hold(
        tx,
        cycleId,
        recipients.suppressed ? 'recipient_opted_out' : 'invalid_contact'
      );
      return { messages: [], held: true };
    }
    const now = new Date();
    if (
      cycle.state === 'active' &&
      cycle.reminderCount === LISTING_REMINDER_COUNT
    ) {
      if (!cycle.dueAt || !cycle.lastSentAt)
        throw new Error('Review cycle is missing its confirmed notice dates.');
      if (
        cycle.dueAt > now ||
        daysAfter(cycle.lastSentAt, LISTING_FINAL_NOTICE_DAYS) > now
      )
        return { messages: [] };
      const inboxes = new Set<string>();
      for (const email of [
        ...recipients.emails,
        profile.email.trim().toLowerCase(),
      ])
        inboxes.add(await refreshDigest(email));
      const sent = await tx
        .select({
          round: deliveries.round,
          recipientHash: deliveries.recipientHash,
        })
        .from(deliveries)
        .where(
          and(eq(deliveries.cycleId, cycleId), eq(deliveries.status, 'sent'))
        );
      if (
        Array.from(
          { length: LISTING_REMINDER_COUNT + 1 },
          (_, round) => round
        ).some(
          (round) =>
            !sent.some(
              (delivery) =>
                delivery.round === round && inboxes.has(delivery.recipientHash)
            )
        )
      ) {
        await hold(tx, cycleId, 'contact_changed');
        return { messages: [], held: true };
      }
      const status = listingStatus(profile.status);
      status.refreshPause = {
        reason: 'review_overdue',
        cycleId,
        guard: await pauseGuard(profile),
      };
      await tx
        .update(profiles)
        .set({ active: false, status })
        .where(eq(profiles.id, profileId));
      await tx
        .update(cycles)
        .set({
          state: 'paused',
          pausedAt: now,
          nextReminderAt: null,
          updatedAt: now,
        })
        .where(eq(cycles.id, cycleId));
      return { messages: [], paused: true, screenname: profile.screenname };
    }
    if (!cycle.nextReminderAt || cycle.nextReminderAt > now)
      return { messages: [] };
    const round = cycle.state === 'queued' ? 0 : cycle.reminderCount + 1;
    const existing = await tx
      .select()
      .from(deliveries)
      .where(and(eq(deliveries.cycleId, cycleId), eq(deliveries.round, round)));
    const targets: { email: string; hash: string }[] = [];
    for (const email of recipients.emails) {
      const hash = await refreshDigest(email);
      if (
        !existing.some(
          (row) =>
            row.recipientHash === hash &&
            ['sending', 'sent'].includes(row.status)
        )
      )
        targets.push({ email, hash });
    }
    if (!targets.length) {
      if (
        recipients.emails.length &&
        existing.length &&
        existing.every((row) => row.status === 'sent')
      ) {
        await hold(tx, cycleId, 'reschedule_required');
        return { messages: [], held: true };
      }
      return { messages: [] };
    }
    let reviewPath = listingReviewPath(profileId);
    if (!recipients.owned) {
      const invitation = await issueListingInvitationInTransaction(
        tx,
        profileId,
        `refresh:${cycleId}`
      );
      if (!invitation.success) {
        await hold(tx, cycleId, 'claim_unavailable');
        return { messages: [], held: true };
      }
      reviewPath = invitation.invitationPath;
    }
    const earliest = daysAfter(
      now,
      round === 0
        ? LISTING_REFRESH_DAYS
        : (LISTING_REMINDER_COUNT - round) * LISTING_REMINDER_DAYS +
            LISTING_FINAL_NOTICE_DAYS
    );
    const deadline = new Date(
      Math.max(cycle.dueAt?.getTime() ?? 0, earliest.getTime())
    );
    const messages: PreparedMessage[] = [];
    for (const target of targets) {
      const stopToken = refreshSecret();
      const [delivery] = await tx
        .insert(deliveries)
        .values({
          cycleId,
          round,
          status: 'sending',
          recipientHash: target.hash,
          routingHash: recipients.routingHash,
          stopTokenHash: await refreshDigest(stopToken),
          attemptedAt: now,
        })
        .returning();
      messages.push({
        deliveryId: delivery.id,
        cycleId,
        profileId,
        round,
        email: target.email,
        params: {
          businessName: profile.name,
          deliveryId: delivery.id,
          reviewUrl: new URL(reviewPath, base).toString(),
          stopUrl: new URL(
            refreshStopPath(cycleId, stopToken),
            base
          ).toString(),
          deadline: deadline.toISOString().slice(0, 10),
          finalNotice: round === LISTING_REMINDER_COUNT,
        },
      });
    }
    return { messages };
  });
}

async function preferenceIssue(
  snapshot: typeof profiles.$inferSelect | undefined
): Promise<string | null> {
  if (!snapshot) return null;
  const recipients = await refreshRecipients(snapshot);
  if (recipients.suppressed) return 'recipient_opted_out';
  if (!recipients.ghlContactIds.length) return null;
  try {
    const ghl = GhlClient.create();
    if (!ghl) throw new Error('Email preference lookup is unavailable.');
    for (const id of recipients.ghlContactIds) {
      const contact = await ghl.getContactById(id);
      if (
        contact.dndSettings?.Email?.status === 'active' ||
        (contact.dnd === true &&
          contact.dndSettings?.Email?.status === undefined)
      ) {
        return 'recipient_opted_out';
      }
    }
    return null;
  } catch {
    return 'preference_unavailable';
  }
}

async function beforeSend(
  message: PreparedMessage
): Promise<'ready' | 'held' | 'cancelled'> {
  const snapshot = await db.query.profiles.findFirst({
    where: eq(profiles.id, message.profileId),
  });
  const issue = await preferenceIssue(snapshot);
  return db.transaction(async (tx) => {
    const [profile] = await tx
      .select()
      .from(profiles)
      .where(eq(profiles.id, message.profileId))
      .for('update');
    const [cycle] = await tx
      .select()
      .from(cycles)
      .where(eq(cycles.id, message.cycleId))
      .for('update');
    const [delivery] = await tx
      .select()
      .from(deliveries)
      .where(eq(deliveries.id, message.deliveryId))
      .for('update');
    if (
      !profile ||
      !cycle ||
      !delivery ||
      delivery.status !== 'sending' ||
      !['queued', 'active'].includes(cycle.state)
    )
      return 'cancelled';
    const recipients = await refreshRecipients(profile, tx);
    if (
      !profile.active ||
      recipients.suppressed ||
      issue ||
      recipients.routingHash !== delivery.routingHash
    ) {
      await tx
        .update(deliveries)
        .set({ status: 'cancelled', errorCode: 'contact_changed' })
        .where(eq(deliveries.id, delivery.id));
      await hold(
        tx,
        cycle.id,
        recipients.suppressed
          ? 'recipient_opted_out'
          : issue || 'contact_changed'
      );
      return 'held';
    }
    return 'ready';
  });
}

async function finish(message: PreparedMessage, sent: boolean) {
  return db.transaction(async (tx) => {
    const [profile] = await tx
      .select()
      .from(profiles)
      .where(eq(profiles.id, message.profileId))
      .for('update');
    const [cycle] = await tx
      .select()
      .from(cycles)
      .where(eq(cycles.id, message.cycleId))
      .for('update');
    const [delivery] = await tx
      .select()
      .from(deliveries)
      .where(eq(deliveries.id, message.deliveryId))
      .for('update');
    if (!profile || !cycle || !delivery || delivery.status !== 'sending')
      return;
    const now = new Date();
    await tx
      .update(deliveries)
      .set({
        status: sent ? 'sent' : 'failed',
        sentAt: sent ? now : null,
        errorCode: sent ? null : 'provider_failed',
      })
      .where(eq(deliveries.id, delivery.id));
    if (!['queued', 'active'].includes(cycle.state)) return;
    if (!sent) {
      await hold(tx, cycle.id, 'mail_failed');
      return;
    }
    const recipients = await refreshRecipients(profile, tx);
    if (
      recipients.suppressed ||
      recipients.routingHash !== delivery.routingHash ||
      !profile.active
    ) {
      await hold(
        tx,
        cycle.id,
        recipients.suppressed ? 'recipient_opted_out' : 'contact_changed'
      );
      return;
    }
    const successful = await tx
      .select({ recipientHash: deliveries.recipientHash })
      .from(deliveries)
      .where(
        and(
          eq(deliveries.cycleId, cycle.id),
          eq(deliveries.round, delivery.round),
          eq(deliveries.status, 'sent')
        )
      );
    for (const email of recipients.emails) {
      const hash = await refreshDigest(email);
      if (!successful.some((row) => row.recipientHash === hash)) return;
    }
    if (delivery.round === 0) {
      await tx
        .update(cycles)
        .set({
          state: 'active',
          startedAt: now,
          lastSentAt: now,
          dueAt: daysAfter(now, LISTING_REFRESH_DAYS),
          nextReminderAt: daysAfter(now, LISTING_REMINDER_DAYS),
          updatedAt: now,
        })
        .where(eq(cycles.id, cycle.id));
    } else {
      const grace = daysAfter(
        now,
        (LISTING_REMINDER_COUNT - delivery.round) * LISTING_REMINDER_DAYS +
          LISTING_FINAL_NOTICE_DAYS
      );
      await tx
        .update(cycles)
        .set({
          reminderCount: delivery.round,
          lastSentAt: now,
          dueAt: new Date(
            Math.max(cycle.dueAt?.getTime() ?? 0, grace.getTime())
          ),
          nextReminderAt:
            delivery.round < LISTING_REMINDER_COUNT
              ? daysAfter(now, LISTING_REMINDER_DAYS)
              : null,
          updatedAt: now,
        })
        .where(eq(cycles.id, cycle.id));
    }
  });
}

async function holdAbandoned(): Promise<number> {
  const stale = await db
    .selectDistinct({
      cycleId: deliveries.cycleId,
      profileId: cycles.profileId,
    })
    .from(deliveries)
    .innerJoin(cycles, eq(cycles.id, deliveries.cycleId))
    .where(
      and(
        eq(deliveries.status, 'sending'),
        lte(deliveries.attemptedAt, new Date(Date.now() - 60 * 60 * 1000)),
        inArray(cycles.state, ['queued', 'active'])
      )
    )
    .limit(25);
  for (const entry of stale) {
    await db.transaction(async (tx) => {
      await tx
        .select({ id: profiles.id })
        .from(profiles)
        .where(eq(profiles.id, entry.profileId))
        .for('update');
      const [cycle] = await tx
        .select()
        .from(cycles)
        .where(eq(cycles.id, entry.cycleId))
        .for('update');
      if (!cycle || !['queued', 'active'].includes(cycle.state)) return;
      await tx
        .update(deliveries)
        .set({ status: 'failed', errorCode: 'delivery_unknown' })
        .where(
          and(
            eq(deliveries.cycleId, cycle.id),
            eq(deliveries.status, 'sending')
          )
        );
      await hold(tx, cycle.id, 'delivery_unknown');
    });
  }
  return stale.length;
}

export async function runListingRefreshes(
  limit = 25
): Promise<ListingRefreshReport> {
  const report: ListingRefreshReport = {
    noticesSent: 0,
    remindersSent: 0,
    held: await holdAbandoned(),
    paused: 0,
    errors: 0,
  };
  report.errors = report.held;
  const due = await db
    .select({ id: cycles.id, profileId: cycles.profileId })
    .from(cycles)
    .where(
      and(
        inArray(cycles.state, ['queued', 'active']),
        or(
          lte(cycles.nextReminderAt, new Date()),
          and(
            eq(cycles.reminderCount, LISTING_REMINDER_COUNT),
            lte(cycles.dueAt, new Date())
          )
        )
      )
    )
    .orderBy(sql`coalesce(${cycles.nextReminderAt}, ${cycles.dueAt})`)
    .limit(limit);
  if (!due.length) return report;
  const base = origin();
  for (const cycle of due) {
    const snapshot = await db.query.profiles.findFirst({
      where: eq(profiles.id, cycle.profileId),
    });
    const issue = snapshot?.active ? await preferenceIssue(snapshot) : null;
    if (issue) {
      await db.transaction(async (tx) => {
        await tx
          .select({ id: profiles.id })
          .from(profiles)
          .where(eq(profiles.id, cycle.profileId))
          .for('update');
        const [current] = await tx
          .select()
          .from(cycles)
          .where(eq(cycles.id, cycle.id))
          .for('update');
        if (current && ['queued', 'active'].includes(current.state))
          await hold(tx, cycle.id, issue);
      });
      report.held += 1;
      if (issue === 'preference_unavailable') report.errors += 1;
      continue;
    }
    const work = await prepare(cycle.profileId, cycle.id, base);
    if (work.held) report.held += 1;
    if (work.paused) {
      report.paused += 1;
      revalidatePublicListing(cycle.profileId, work.screenname);
      revalidatePath('/directory/search');
      revalidatePath('/sitemap.xml');
    }
    for (const message of work.messages) {
      const ready = await beforeSend(message);
      if (ready === 'held') report.held += 1;
      if (ready !== 'ready') continue;
      try {
        await sendTemplateEmail(
          'listing.refresh',
          message.params,
          message.email,
          { requireDelivery: true }
        );
      } catch (error) {
        report.errors += 1;
        report.held += 1;
        console.error('[listing-refresh] provider did not confirm delivery', {
          deliveryId: message.deliveryId,
          error: error instanceof Error ? error.name : 'unknown',
        });
        await finish(message, false);
        break;
      }
      await finish(message, true);
      if (message.round > 0) report.remindersSent += 1;
      else report.noticesSent += 1;
    }
  }
  return report;
}
