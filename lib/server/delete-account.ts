/**
 * Account Deletion Executor
 *
 * Orchestrates permanent deletion of a user account, cleaning up all data,
 * third-party services, R2 media, and ActivityPub federation records.
 *
 * Content that has passed its archive threshold becomes part of the community
 * record under CC license — users choose to keep attribution or anonymize.
 * Social posts are always fully deleted.
 */

import { db } from '@/lib/db';
import { eq, and, or, inArray, gt, sql } from 'drizzle-orm';
import {
  users,
  profiles,
  accounts,
  sessions,
  verification,
  articles,
  notifications,
  contactSubmissions,
  newsletterSignups,
  mentorSessions,
  intakeForms,
  emailMigrations,
  interactions,
  profileSignals,
  recommendationLists,
  socialActors,
  socialStatuses,
  socialFollows,
  socialBlocks,
  socialDmRequests,
  socialLikes,
  socialAttachments,
  socialTags,
  articleAnnouncements,
  deletionLogs,
  events,
  eventAttendees,
  eventBookmarks,
  venues,
  relayGroupMembers,
  relayGroupJoinPending,
  relayGroupLeavePending,
  relayGroupInvites,
} from '@/lib/schema';
import { applyDepartureRules } from '@/lib/relay/group-lifecycle';
import { createId } from '@paralleldrive/cuid2';
import { deleteFile } from '@/lib/blob/api';
import { revokeAllOAuthTokens } from '@/lib/oauth-revoke';
import { signedHeaders } from '@/lib/federation/crypto/sign';
import { GhlClient } from '@/lib/ghl';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeleteAccountOptions {
  attributionChoice: 'keep' | 'anonymize';
  ip?: string;
}

export interface DeleteAccountResult {
  success: boolean;
  deletionLogId: string;
  error?: string;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const THREE_MONTHS_AGO = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 3);
  return d;
};

async function safeDelete(
  label: string,
  fn: () => Promise<{ length?: number } | unknown[]>,
  counts: Record<string, number>,
  warnings: string[]
): Promise<number> {
  try {
    const result = await fn();
    const count = Array.isArray(result) ? result.length : 0;
    counts[label] = (counts[label] ?? 0) + count;
    return count;
  } catch (error) {
    const msg = `Failed to delete ${label}: ${error instanceof Error ? error.message : String(error)}`;
    console.error(`delete-account:${label}:error`, error);
    warnings.push(msg);
    return 0;
  }
}

function collectMediaUrls(obj: unknown): string[] {
  if (!obj) return [];
  const urls: string[] = [];
  if (typeof obj === 'string' && obj.startsWith('http')) {
    urls.push(obj);
  } else if (Array.isArray(obj)) {
    for (const item of obj) {
      urls.push(...collectMediaUrls(item));
    }
  } else if (typeof obj === 'object') {
    for (const val of Object.values(obj as Record<string, unknown>)) {
      urls.push(...collectMediaUrls(val));
    }
  }
  return urls;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function deleteAccount(
  userId: string,
  options: DeleteAccountOptions
): Promise<DeleteAccountResult> {
  const warnings: string[] = [];
  const deletedTables: Record<string, number> = {};
  const thirdPartyResults: Record<string, boolean> = {};
  const archivedContentIds: string[] = [];
  const logId = createId();

  // -----------------------------------------------------------------------
  // 1. Load context
  // -----------------------------------------------------------------------
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    with: {
      accounts: true,
      profile: {
        with: { socialActor: true },
      },
    },
  });

  if (!user) {
    return {
      success: false,
      deletionLogId: logId,
      error: 'User not found',
      warnings,
    };
  }

  const profile = user.profile;
  const socialActor = profile?.socialActor ?? null;

  // -----------------------------------------------------------------------
  // 2. Pre-flight blockers
  // -----------------------------------------------------------------------
  const blockers: string[] = [];

  if (profile) {
    // Future events hosted
    const futureHosted = await db.query.events.findMany({
      where: and(
        eq(events.hostProfileId, profile.id),
        eq(events.status, 'published'),
        gt(events.startsAt, new Date())
      ),
      columns: { id: true, title: true },
    });
    if (futureHosted.length > 0) {
      blockers.push(
        `You are hosting ${futureHosted.length} upcoming event(s). Cancel or transfer them first.`
      );
    }

    // Venues with future events
    const operatedVenues = await db.query.venues.findMany({
      where: eq(venues.operatorProfileId, profile.id),
      columns: { id: true },
      with: {
        events: {
          where: and(
            eq(events.status, 'published'),
            gt(events.startsAt, new Date())
          ),
          columns: { id: true },
        },
      },
    });
    const venuesWithFutureEvents = operatedVenues.filter(
      (v) => v.events.length > 0
    );
    if (venuesWithFutureEvents.length > 0) {
      blockers.push(
        `You operate ${venuesWithFutureEvents.length} venue(s) with upcoming events.`
      );
    }
  }

  // Pending mentor sessions
  const pendingSessions = await db.query.mentorSessions.findMany({
    where: and(
      or(
        eq(mentorSessions.mentorUserId, userId),
        eq(mentorSessions.menteeUserId, userId)
      ),
      inArray(mentorSessions.status, ['pending', 'scheduled'])
    ),
    columns: { id: true },
  });
  if (pendingSessions.length > 0) {
    blockers.push(
      `You have ${pendingSessions.length} pending/scheduled mentoring session(s). Complete or cancel them first.`
    );
  }

  if (blockers.length > 0) {
    return {
      success: false,
      deletionLogId: logId,
      error: blockers.join(' '),
      warnings,
    };
  }

  // -----------------------------------------------------------------------
  // 3. Create deletion log (audit trail even if process fails partway)
  // -----------------------------------------------------------------------
  await db.insert(deletionLogs).values({
    id: logId,
    userId,
    email: user.email,
    screenname: user.screenname ?? null,
    attributionChoice: options.attributionChoice,
    ip: options.ip ?? null,
  });

  try {
    // -------------------------------------------------------------------
    // 4. Classify archive thresholds
    // -------------------------------------------------------------------
    const threeMonthsAgo = THREE_MONTHS_AGO();

    // Articles by this user
    const userArticles = await db.query.articles.findMany({
      where: eq(articles.authorId, userId),
      columns: { id: true, publishedAt: true, coverImage: true, status: true },
    });
    const archivedArticles = userArticles.filter(
      (a) => a.publishedAt && a.publishedAt < threeMonthsAgo
    );
    const preArchiveArticles = userArticles.filter(
      (a) => !a.publishedAt || a.publishedAt >= threeMonthsAgo
    );

    // Events hosted by this profile
    let allHostedEvents: {
      id: string;
      status: string;
      startsAt: Date;
      coverImage: string | null;
    }[] = [];
    let archivedEvents: typeof allHostedEvents = [];
    let preArchiveEvents: typeof allHostedEvents = [];

    if (profile) {
      allHostedEvents = await db.query.events.findMany({
        where: eq(events.hostProfileId, profile.id),
        columns: { id: true, status: true, startsAt: true, coverImage: true },
      });
      archivedEvents = allHostedEvents.filter((e) => e.status === 'completed');
      preArchiveEvents = allHostedEvents.filter(
        (e) => e.status !== 'completed'
      );
    }

    // NOTE: event_photos was dropped in the Nostr event-model merge; there is
    // no per-profile event photo ownership to clean up anymore.

    // -------------------------------------------------------------------
    // 5. Handle archived content based on attribution choice
    // -------------------------------------------------------------------
    if (options.attributionChoice === 'anonymize') {
      // Anonymize archived articles
      if (archivedArticles.length > 0) {
        const ids = archivedArticles.map((a) => a.id);
        await db
          .update(articles)
          .set({ authorId: null })
          .where(inArray(articles.id, ids));
        archivedContentIds.push(...ids);
      }

      // Archived (completed) events cannot be host-anonymized: under the Nostr
      // event model host_profile_id is required (NOT NULL, ON DELETE RESTRICT)
      // and the profile row is hard-deleted on the 'anonymize' path, so these
      // events must be deleted along with their attendees.
      if (archivedEvents.length > 0 && profile) {
        const ids = archivedEvents.map((e) => e.id);
        await safeDelete(
          'eventAttendees',
          () =>
            db
              .delete(eventAttendees)
              .where(inArray(eventAttendees.eventId, ids))
              .returning({ id: eventAttendees.id }),
          deletedTables,
          warnings
        );
        await safeDelete(
          'events',
          () =>
            db
              .delete(events)
              .where(inArray(events.id, ids))
              .returning({ id: events.id }),
          deletedTables,
          warnings
        );
      }
    } else {
      // 'keep' — leave content as-is (the profile is tombstoned, not deleted,
      // so hosted events keep a valid host FK); record what was preserved.
      archivedContentIds.push(
        ...archivedArticles.map((a) => a.id),
        ...archivedEvents.map((e) => e.id)
      );
    }

    // -------------------------------------------------------------------
    // 6. Delete pre-archive content
    // -------------------------------------------------------------------
    // Pre-archive articles
    if (preArchiveArticles.length > 0) {
      const ids = preArchiveArticles.map((a) => a.id);
      // Delete announcements for these articles
      await safeDelete(
        'articleAnnouncements',
        () =>
          db
            .delete(articleAnnouncements)
            .where(inArray(articleAnnouncements.articleId, ids))
            .returning({ id: articleAnnouncements.id }),
        deletedTables,
        warnings
      );
      // Delete social statuses linked to these articles
      const linkedStatuses = await db.query.socialStatuses.findMany({
        where: inArray(socialStatuses.articleId, ids),
        columns: { id: true },
      });
      if (linkedStatuses.length > 0) {
        const statusIds = linkedStatuses.map((s) => s.id);
        await safeDelete(
          'socialTags',
          () =>
            db
              .delete(socialTags)
              .where(inArray(socialTags.statusId, statusIds))
              .returning({ id: socialTags.id }),
          deletedTables,
          warnings
        );
        await safeDelete(
          'socialAttachments',
          () =>
            db
              .delete(socialAttachments)
              .where(inArray(socialAttachments.statusId, statusIds))
              .returning({ id: socialAttachments.id }),
          deletedTables,
          warnings
        );
        await safeDelete(
          'socialLikes',
          () =>
            db
              .delete(socialLikes)
              .where(inArray(socialLikes.statusId, statusIds))
              .returning({ id: socialLikes.id }),
          deletedTables,
          warnings
        );
        await safeDelete(
          'socialStatuses',
          () =>
            db
              .delete(socialStatuses)
              .where(inArray(socialStatuses.id, statusIds))
              .returning({ id: socialStatuses.id }),
          deletedTables,
          warnings
        );
      }
      await safeDelete(
        'articles',
        () =>
          db
            .delete(articles)
            .where(inArray(articles.id, ids))
            .returning({ id: articles.id }),
        deletedTables,
        warnings
      );
    }

    // Pre-archive events: delete attendees first, then the events.
    if (preArchiveEvents.length > 0 && profile) {
      const ids = preArchiveEvents.map((e) => e.id);
      await safeDelete(
        'eventAttendees',
        () =>
          db
            .delete(eventAttendees)
            .where(inArray(eventAttendees.eventId, ids))
            .returning({ id: eventAttendees.id }),
        deletedTables,
        warnings
      );
      await safeDelete(
        'events',
        () =>
          db
            .delete(events)
            .where(inArray(events.id, ids))
            .returning({ id: events.id }),
        deletedTables,
        warnings
      );
    }

    // -------------------------------------------------------------------
    // 7. Update co-author references
    // -------------------------------------------------------------------
    try {
      // Find articles by other users that mention this user in coAuthors
      const coAuthoredArticles = await db
        .select({ id: articles.id, coAuthors: articles.coAuthors })
        .from(articles)
        .where(sql`${articles.coAuthors}::text LIKE ${'%' + userId + '%'}`);
      for (const article of coAuthoredArticles) {
        if (!Array.isArray(article.coAuthors)) continue;
        const updated = (
          article.coAuthors as {
            userId: string | null;
            screenname: string;
            status: string;
          }[]
        ).map((ca) =>
          ca.userId === userId
            ? {
                userId: null,
                screenname: 'Previous Member',
                status: 'removed',
              }
            : ca
        );
        await db
          .update(articles)
          .set({ coAuthors: updated })
          .where(eq(articles.id, article.id));
      }
    } catch (error) {
      warnings.push(
        `Failed to update co-author references: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // -------------------------------------------------------------------
    // 8. Delete social data (always fully deleted)
    // -------------------------------------------------------------------
    if (socialActor) {
      // Get all status IDs for this actor
      const actorStatuses = await db.query.socialStatuses.findMany({
        where: eq(socialStatuses.actorId, socialActor.id),
        columns: { id: true, uri: true },
        with: { attachments: { columns: { id: true, url: true } } },
      });
      const statusIds = actorStatuses.map((s) => s.id);

      if (statusIds.length > 0) {
        // Delete attachments
        await safeDelete(
          'socialAttachments',
          () =>
            db
              .delete(socialAttachments)
              .where(inArray(socialAttachments.statusId, statusIds))
              .returning({ id: socialAttachments.id }),
          deletedTables,
          warnings
        );
        // Delete tags
        await safeDelete(
          'socialTags',
          () =>
            db
              .delete(socialTags)
              .where(inArray(socialTags.statusId, statusIds))
              .returning({ id: socialTags.id }),
          deletedTables,
          warnings
        );
        // Delete likes ON these statuses (from other users)
        await safeDelete(
          'socialLikes(received)',
          () =>
            db
              .delete(socialLikes)
              .where(inArray(socialLikes.statusId, statusIds))
              .returning({ id: socialLikes.id }),
          deletedTables,
          warnings
        );
      }

      // Delete likes BY this actor
      await safeDelete(
        'socialLikes(given)',
        () =>
          db
            .delete(socialLikes)
            .where(eq(socialLikes.actorId, socialActor.id))
            .returning({ id: socialLikes.id }),
        deletedTables,
        warnings
      );

      // Delete follows (both directions)
      await safeDelete(
        'socialFollows(outgoing)',
        () =>
          db
            .delete(socialFollows)
            .where(eq(socialFollows.actorId, socialActor.id))
            .returning({ id: socialFollows.id }),
        deletedTables,
        warnings
      );
      await safeDelete(
        'socialFollows(incoming)',
        () =>
          db
            .delete(socialFollows)
            .where(eq(socialFollows.targetActorId, socialActor.id))
            .returning({ id: socialFollows.id }),
        deletedTables,
        warnings
      );

      // Delete blocks and mutes (both directions)
      //
      // Outgoing rows are this person's own safety decisions and leave with
      // them. Incoming rows — where somebody else blocked this actor — are
      // deleted too, because the actor row they point at is going away; a
      // block against an account that no longer exists protects nobody and
      // would dangle. The other person's list simply gets shorter.
      await safeDelete(
        'socialBlocks(outgoing)',
        () =>
          db
            .delete(socialBlocks)
            .where(eq(socialBlocks.actorId, socialActor.id))
            .returning({ id: socialBlocks.id }),
        deletedTables,
        warnings
      );
      await safeDelete(
        'socialBlocks(incoming)',
        () =>
          db
            .delete(socialBlocks)
            .where(eq(socialBlocks.targetActorId, socialActor.id))
            .returning({ id: socialBlocks.id }),
        deletedTables,
        warnings
      );

      // Delete DM requests (both directions)
      //
      // The foreign keys are ON DELETE CASCADE, so these rows would go anyway
      // when the actor row below is deleted. They are deleted explicitly for
      // the same reason the blocks above are: safeDelete records counts into
      // deletedTables, which is the deletion log the privacy framework relies
      // on. A cascade is silent, and "we deleted your correspondence requests"
      // is exactly the kind of claim that should be evidenced rather than
      // implied.
      await safeDelete(
        'socialDmRequests(sent)',
        () =>
          db
            .delete(socialDmRequests)
            .where(eq(socialDmRequests.senderActorId, socialActor.id))
            .returning({ id: socialDmRequests.id }),
        deletedTables,
        warnings
      );
      await safeDelete(
        'socialDmRequests(received)',
        () =>
          db
            .delete(socialDmRequests)
            .where(eq(socialDmRequests.recipientActorId, socialActor.id))
            .returning({ id: socialDmRequests.id }),
        deletedTables,
        warnings
      );

      // Delete article announcements by this actor
      await safeDelete(
        'articleAnnouncements',
        () =>
          db
            .delete(articleAnnouncements)
            .where(eq(articleAnnouncements.actorId, socialActor.id))
            .returning({ id: articleAnnouncements.id }),
        deletedTables,
        warnings
      );

      // Delete statuses
      if (statusIds.length > 0) {
        await safeDelete(
          'socialStatuses',
          () =>
            db
              .delete(socialStatuses)
              .where(inArray(socialStatuses.id, statusIds))
              .returning({ id: socialStatuses.id }),
          deletedTables,
          warnings
        );
      }

      // Delete social actor
      await safeDelete(
        'socialActors',
        () =>
          db
            .delete(socialActors)
            .where(eq(socialActors.id, socialActor.id))
            .returning({ id: socialActors.id }),
        deletedTables,
        warnings
      );
    }

    // -------------------------------------------------------------------
    // 9. Delete always-deletable data
    // -------------------------------------------------------------------
    await safeDelete(
      'notifications(sent)',
      () =>
        db
          .delete(notifications)
          .where(eq(notifications.actor, userId))
          .returning({ id: notifications.id }),
      deletedTables,
      warnings
    );
    await safeDelete(
      'notifications(received)',
      () =>
        db
          .delete(notifications)
          .where(eq(notifications.target, userId))
          .returning({ id: notifications.id }),
      deletedTables,
      warnings
    );
    // consent_receipts are intentionally NOT deleted here: they are a
    // compliance_record (proof the user accepted a given policy version) and
    // are retained under a legitimate-interest basis after account deletion.
    // See app/legal/privacy/policy.json. The FK was dropped in migration 0027
    // so the row survives removal of the users row.
    await safeDelete(
      'contactSubmissions',
      () =>
        db
          .delete(contactSubmissions)
          .where(eq(contactSubmissions.email, user.email))
          .returning({ id: contactSubmissions.id }),
      deletedTables,
      warnings
    );
    await safeDelete(
      'newsletterSignups',
      () =>
        db
          .delete(newsletterSignups)
          .where(eq(newsletterSignups.email, user.email))
          .returning({ id: newsletterSignups.id }),
      deletedTables,
      warnings
    );
    await safeDelete(
      'mentorSessions',
      () =>
        db
          .delete(mentorSessions)
          .where(
            or(
              eq(mentorSessions.mentorUserId, userId),
              eq(mentorSessions.menteeUserId, userId)
            )
          )
          .returning({ id: mentorSessions.id }),
      deletedTables,
      warnings
    );
    await safeDelete(
      'intakeForms',
      () =>
        db
          .delete(intakeForms)
          .where(eq(intakeForms.email, user.email))
          .returning({ id: intakeForms.id }),
      deletedTables,
      warnings
    );
    await safeDelete(
      'emailMigrations',
      () =>
        db
          .delete(emailMigrations)
          .where(eq(emailMigrations.userId, userId))
          .returning({ id: emailMigrations.id }),
      deletedTables,
      warnings
    );
    await safeDelete(
      'interactions',
      () =>
        db
          .delete(interactions)
          .where(eq(interactions.email, user.email))
          .returning({ id: interactions.id }),
      deletedTables,
      warnings
    );

    // Saves and recommendations this person made. Deleted explicitly rather
    // than left to the users FK cascade, because an anonymized account keeps
    // its users row — and a recommendation is a public statement attributed to
    // a named human. Leaving it behind would keep vouching for a business on
    // behalf of someone who asked to be forgotten.
    await safeDelete(
      'profileSignals',
      () =>
        db
          .delete(profileSignals)
          .where(eq(profileSignals.userId, userId))
          .returning({ id: profileSignals.id }),
      deletedTables,
      warnings
    );

    // The lists this person published, and (by FK cascade within the same
    // statement) the notes on them. Same reasoning as profileSignals above and
    // deliberately adjacent to it: a list is a recommendation with a frame
    // around it, published under a named human's voice. The users row survives
    // anonymization, so the FK cascade never fires — without this, a pana who
    // asked to be forgotten would go on vouching for five businesses in their
    // own words.
    await safeDelete(
      'recommendationLists',
      () =>
        db
          .delete(recommendationLists)
          .where(eq(recommendationLists.ownerUserId, userId))
          .returning({ id: recommendationLists.id }),
      deletedTables,
      warnings
    );

    // Remaining event attendee rows for this profile (organizer/note tables
    // were dropped in the Nostr event-model merge).
    if (profile) {
      await safeDelete(
        'eventBookmarks',
        () =>
          db
            .delete(eventBookmarks)
            .where(eq(eventBookmarks.profileId, profile.id))
            .returning({ id: eventBookmarks.id }),
        deletedTables,
        warnings
      );
      await safeDelete(
        'eventAttendees',
        () =>
          db
            .delete(eventAttendees)
            .where(eq(eventAttendees.profileId, profile.id))
            .returning({ id: eventAttendees.id }),
        deletedTables,
        warnings
      );
    }

    // Article announcements by author (userId)
    await safeDelete(
      'articleAnnouncements(author)',
      () =>
        db
          .delete(articleAnnouncements)
          .where(eq(articleAnnouncements.authorId, userId))
          .returning({ id: articleAnnouncements.id }),
      deletedTables,
      warnings
    );

    // -------------------------------------------------------------------
    // 10. Third-party cleanup (best-effort)
    // -------------------------------------------------------------------

    // Stripe
    if (profile?.stripeCustomerId) {
      try {
        const Stripe = (await import('stripe')).default;
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '');
        // Cancel active subscriptions
        const subs = await stripe.subscriptions.list({
          customer: profile.stripeCustomerId,
          status: 'active',
        });
        for (const sub of subs.data) {
          await stripe.subscriptions.cancel(sub.id);
        }
        await stripe.customers.del(profile.stripeCustomerId);
        thirdPartyResults.stripe = true;
      } catch (error) {
        console.error('delete-account:stripe:error', error);
        thirdPartyResults.stripe = false;
        warnings.push('Stripe cleanup failed');
      }
    }

    // GHL
    if (profile?.ghlContactId) {
      try {
        const ghl = GhlClient.create();
        if (ghl) {
          await ghl.deleteContact(profile.ghlContactId);
          thirdPartyResults.ghl = true;
        }
      } catch (error) {
        console.error('delete-account:ghl:error', error);
        thirdPartyResults.ghl = false;
        warnings.push('GHL cleanup failed');
      }
      // TODO(GHL): Trigger GoHighLevel flow email "Your account has been deleted"
    }

    // OAuth revocation
    try {
      const oauthResults = await revokeAllOAuthTokens(user.accounts);
      Object.assign(thirdPartyResults, oauthResults);
    } catch (error) {
      console.error('delete-account:oauth:error', error);
      warnings.push('OAuth token revocation failed');
    }

    // -------------------------------------------------------------------
    // 11. R2 media cleanup
    // -------------------------------------------------------------------
    const mediaUrls: string[] = [];
    if (profile) {
      if (profile.primaryImageCdn) mediaUrls.push(profile.primaryImageCdn);
      mediaUrls.push(...collectMediaUrls(profile.galleryImages));
    }
    for (const a of preArchiveArticles) {
      if (a.coverImage) mediaUrls.push(a.coverImage);
    }
    for (const e of preArchiveEvents) {
      if (e.coverImage) mediaUrls.push(e.coverImage);
    }
    if (socialActor) {
      const actorStatuses = await db.query.socialStatuses
        .findMany({
          where: eq(socialStatuses.actorId, socialActor.id),
          with: { attachments: { columns: { url: true } } },
        })
        .catch(() => []);
      for (const s of actorStatuses) {
        for (const att of s.attachments) {
          if (att.url) mediaUrls.push(att.url);
        }
      }
    }

    for (const url of mediaUrls) {
      try {
        await deleteFile(url);
      } catch {
        warnings.push(`Failed to delete media: ${url}`);
      }
    }

    // -------------------------------------------------------------------
    // 12. ActivityPub cleanup
    // -------------------------------------------------------------------
    if (socialActor?.privateKey && socialActor.uri) {
      try {
        // Get followers to notify
        const followers = await db.query.socialFollows
          .findMany({
            where: eq(socialFollows.targetActorId, socialActor.id),
            with: {
              actor: { columns: { inboxUrl: true, sharedInboxUrl: true } },
            },
          })
          .catch(() => []);

        const deleteActivity = {
          '@context': 'https://www.w3.org/ns/activitystreams',
          id: `${socialActor.uri}#delete`,
          type: 'Delete',
          actor: socialActor.uri,
          to: ['https://www.w3.org/ns/activitystreams#Public'],
          object: socialActor.uri,
        };

        // Deduplicate inboxes
        const inboxes = new Set<string>();
        for (const f of followers) {
          const inbox = f.actor?.sharedInboxUrl ?? f.actor?.inboxUrl;
          if (inbox) inboxes.add(inbox);
        }

        for (const inboxUrl of inboxes) {
          try {
            const headers = signedHeaders(
              socialActor,
              'post',
              inboxUrl,
              deleteActivity
            );
            await fetch(inboxUrl, {
              method: 'POST',
              headers,
              body: JSON.stringify(deleteActivity),
            });
          } catch {
            // Best-effort — don't warn for each failed federation delivery
          }
        }
      } catch (error) {
        console.error('delete-account:activitypub:error', error);
        warnings.push('ActivityPub deletion notifications partially failed');
      }
    }

    // -------------------------------------------------------------------
    // 13. Relay / Nostr cleanup (Resilience module)
    // -------------------------------------------------------------------
    // These tables key off the Nostr pubkey and have no FK to profiles, so
    // nothing cascades. Without this the roster rows outlive the account and
    // still tie a pubkey — and therefore that person's relay activity — to a
    // group. The pubkey itself is cleared with the profile below.
    //
    // relay_reports is deliberately NOT touched. Abuse reports are a
    // moderation_record in app/legal/privacy/policy.json: they must outlive
    // the accounts they concern, or deleting your account would erase the
    // reports filed against you.
    //
    // Events already published to Nostr are beyond reach by design — the
    // in_the_wind class in policy.json. Removing the pubkey here does not and
    // cannot retract them; a NIP-09 delete is advisory and only our own relay
    // is guaranteed to honor it.
    if (profile?.nostrPubkey) {
      const pubkey = profile.nostrPubkey;

      // Capture the roster before it goes away: once the membership rows are
      // gone there is no way to find which groups this account was in, and
      // each of them needs the departure rules applied afterward.
      const memberOf = await db
        .select({ groupId: relayGroupMembers.groupId })
        .from(relayGroupMembers)
        .where(eq(relayGroupMembers.pubkey, pubkey));

      await safeDelete(
        'relayGroupMembers',
        () =>
          db
            .delete(relayGroupMembers)
            .where(eq(relayGroupMembers.pubkey, pubkey))
            .returning({ groupId: relayGroupMembers.groupId }),
        deletedTables,
        warnings
      );

      await safeDelete(
        'relayGroupJoinPending',
        () =>
          db
            .delete(relayGroupJoinPending)
            .where(eq(relayGroupJoinPending.pubkey, pubkey))
            .returning({ groupId: relayGroupJoinPending.groupId }),
        deletedTables,
        warnings
      );

      await safeDelete(
        'relayGroupLeavePending',
        () =>
          db
            .delete(relayGroupLeavePending)
            .where(eq(relayGroupLeavePending.pubkey, pubkey))
            .returning({ groupId: relayGroupLeavePending.groupId }),
        deletedTables,
        warnings
      );

      // Deleting the membership rows is a departure like any other: a group
      // this account created passes to its longest-tenured remaining member,
      // and a group left with nobody in it is removed. Without this, a
      // member-created group would outlive its only member as an empty shell
      // whose created_by points at a pubkey no account owns any more.
      //
      // Best-effort per group: one failure here must not abort a deletion
      // request that has already removed the account's other data.
      for (const { groupId } of memberOf) {
        try {
          await applyDepartureRules(db, groupId);
        } catch (err) {
          warnings.push(
            `relay group lifecycle for ${groupId}: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }
      }
    }

    // Invitations this account sent or received. Cascaded by the users FK when
    // the row is deleted, but the account may be anonymized rather than
    // hard-deleted, so clear them explicitly: an invitation from an account
    // that no longer exists is not answerable.
    await safeDelete(
      'relayGroupInvites',
      () =>
        db
          .delete(relayGroupInvites)
          .where(
            or(
              eq(relayGroupInvites.invitedUserId, userId),
              eq(relayGroupInvites.invitedByUserId, userId)
            )
          )
          .returning({ id: relayGroupInvites.id }),
      deletedTables,
      warnings
    );

    // -------------------------------------------------------------------
    // 14. Delete profile
    // -------------------------------------------------------------------
    if (profile) {
      if (options.attributionChoice === 'keep') {
        // Tombstone: clear sensitive fields but keep name for attribution
        await db
          .update(profiles)
          .set({
            userId: null,
            phoneNumber: null,
            pronouns: null,
            primaryImageId: null,
            primaryImageCdn: null,
            addressName: null,
            addressLine1: null,
            addressLine2: null,
            addressLine3: null,
            addressLocality: null,
            addressRegion: null,
            addressPostalCode: null,
            addressCountry: null,
            addressLat: null,
            addressLng: null,
            addressGooglePlaceId: null,
            addressHours: null,
            active: false,
            socials: null,
            galleryImages: null,
            mentoring: null,
            availability: null,
            verification: null,
            roles: null,
            gentedepana: null,
            status: null,
            administrative: null,
            linkedProfiles: null,
            ghlContactId: null,
            stripeCustomerId: null,
            neighborhoods: null,
            verifiedZipCode: null,
            // A pubkey is a unique, permanent, cross-relay-correlatable
            // identifier. Leaving it on a tombstoned profile would let anyone
            // tie "Former Member" back to that person's Nostr activity, which
            // defeats the anonymization.
            nostrPubkey: null,
            nostrPubkeySource: null,
          })
          .where(eq(profiles.id, profile.id));
        deletedTables['profiles(tombstoned)'] = 1;
      } else {
        // Full delete
        await safeDelete(
          'profiles',
          () =>
            db
              .delete(profiles)
              .where(eq(profiles.id, profile.id))
              .returning({ id: profiles.id }),
          deletedTables,
          warnings
        );
      }
    }

    // -------------------------------------------------------------------
    // 15. Delete auth records
    // -------------------------------------------------------------------
    await safeDelete(
      'verification',
      () =>
        db
          .delete(verification)
          .where(eq(verification.identifier, user.email))
          .returning({ id: verification.id }),
      deletedTables,
      warnings
    );
    await safeDelete(
      'sessions',
      () =>
        db
          .delete(sessions)
          .where(eq(sessions.userId, userId))
          .returning({ id: sessions.id }),
      deletedTables,
      warnings
    );
    await safeDelete(
      'accounts',
      () =>
        db
          .delete(accounts)
          .where(eq(accounts.userId, userId))
          .returning({ id: accounts.id }),
      deletedTables,
      warnings
    );
    await safeDelete(
      'users',
      () =>
        db
          .delete(users)
          .where(eq(users.id, userId))
          .returning({ id: users.id }),
      deletedTables,
      warnings
    );

    // -------------------------------------------------------------------
    // 16. Keep screennameHistory (federation 410 Gone continues working)
    // -------------------------------------------------------------------
    // No action needed — rows are intentionally preserved.

    // -------------------------------------------------------------------
    // 17. Finalize deletion log
    // -------------------------------------------------------------------
    await db
      .update(deletionLogs)
      .set({
        completedAt: new Date(),
        deletedTables,
        thirdPartyResults,
        archivedContentIds,
      })
      .where(eq(deletionLogs.id, logId));

    return { success: true, deletionLogId: logId, warnings };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('delete-account:fatal', error);

    // Update log with error
    await db
      .update(deletionLogs)
      .set({
        error: msg,
        deletedTables,
        thirdPartyResults,
        archivedContentIds,
      })
      .where(eq(deletionLogs.id, logId))
      .catch(() => {});

    return { success: false, deletionLogId: logId, error: msg, warnings };
  }
}
