/**
 * DELETE ACCOUNT PRE-FLIGHT — GET
 *
 * Returns a data summary and blocker check for the account deletion wizard.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { getOwnedBillingCustomerIds } from '@/lib/server/billing';
import { eq, and, or, gt, inArray, count } from 'drizzle-orm';
import {
  users,
  articles,
  events,
  mentorSessions,
  socialStatuses,
  venues,
} from '@/lib/schema';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }

  const userId = session.user.id;

  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    with: {
      accounts: { columns: { providerId: true } },
      profile: {
        columns: {
          id: true,
          ghlContactId: true,
          stripeCustomerId: true,
          primaryImageCdn: true,
          galleryImages: true,
        },
        with: { socialActor: { columns: { id: true } } },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const profile = user.profile;
  const billingCustomerIds = await getOwnedBillingCustomerIds(userId);
  const blockers: string[] = [];

  // Check blockers
  if (profile) {
    const futureHosted = await db.query.events.findMany({
      where: and(
        eq(events.hostProfileId, profile.id),
        eq(events.status, 'published'),
        gt(events.startsAt, new Date())
      ),
      columns: { id: true },
    });
    if (futureHosted.length > 0) {
      blockers.push(
        `You are hosting ${futureHosted.length} upcoming event(s). Cancel or transfer them first.`
      );
    }

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
    const venuesWithFuture = operatedVenues.filter((v) => v.events.length > 0);
    if (venuesWithFuture.length > 0) {
      blockers.push(
        `You operate ${venuesWithFuture.length} venue(s) with upcoming events.`
      );
    }
  }

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
      `You have ${pendingSessions.length} pending/scheduled mentoring session(s).`
    );
  }

  // Build summary
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  // Articles
  const userArticles = await db.query.articles.findMany({
    where: eq(articles.authorId, userId),
    columns: { id: true, publishedAt: true },
  });
  const articlesArchived = userArticles.filter(
    (a) => a.publishedAt && a.publishedAt < threeMonthsAgo
  ).length;

  // Social posts
  let socialPostsTotal = 0;
  if (profile?.socialActor) {
    const [result] = await db
      .select({ total: count() })
      .from(socialStatuses)
      .where(eq(socialStatuses.actorId, profile.socialActor.id));
    socialPostsTotal = Number(result.total);
  }

  // Events
  let eventsHosted = 0;
  let eventsOrganized = 0;
  let eventsAttended = 0;
  let eventsArchived = 0;

  if (profile) {
    const hosted = await db.query.events.findMany({
      where: eq(events.hostProfileId, profile.id),
      columns: { id: true, status: true },
    });
    eventsHosted = hosted.length;
    eventsArchived = hosted.filter((e) => e.status === 'completed').length;
  }

  // Mentor sessions
  const completedSessions = await db.query.mentorSessions.findMany({
    where: and(
      or(
        eq(mentorSessions.mentorUserId, userId),
        eq(mentorSessions.menteeUserId, userId)
      ),
      eq(mentorSessions.status, 'completed')
    ),
    columns: { id: true },
  });

  // Media file count estimate
  let mediaFiles = 0;
  if (profile?.primaryImageCdn) mediaFiles++;
  if (profile?.galleryImages && Array.isArray(profile.galleryImages)) {
    mediaFiles += (profile.galleryImages as unknown[]).length;
  }

  // Third-party services
  const providerIds = user.accounts.map((a) => a.providerId);

  return NextResponse.json({
    canDelete: blockers.length === 0,
    blockers,
    summary: {
      articles: {
        total: userArticles.length,
        archived: articlesArchived,
        preArchive: userArticles.length - articlesArchived,
      },
      socialPosts: { total: socialPostsTotal },
      events: {
        hosted: eventsHosted,
        organized: eventsOrganized,
        attended: eventsAttended,
        archived: eventsArchived,
      },
      mentorSessions: {
        completed: completedSessions.length,
        pending: pendingSessions.length,
      },
      mediaFiles,
      thirdParty: {
        stripe: billingCustomerIds.length > 0,
        ghl: !!profile?.ghlContactId,
        google: providerIds.includes('google'),
        apple: providerIds.includes('apple'),
      },
    },
  });
}
