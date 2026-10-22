import { desc, eq, max, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { referralAttributions, referralEvents, users } from '@/lib/schema';
import { checkAdminAuth } from '@/lib/server/admin-auth';

export async function GET() {
  const admin = await checkAdminAuth();
  if (!admin) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  try {
    const people =
      sql<number>`count(distinct ${referralEvents.attributionId})`.mapWith(
        Number
      );
    const accounts =
      sql<number>`count(*) filter (where ${referralEvents.eventType} = 'account_created')`.mapWith(
        Number
      );
    const directory =
      sql<number>`count(*) filter (where ${referralEvents.eventType} = 'directory_submitted')`.mapWith(
        Number
      );
    const connectors =
      sql<number>`count(*) filter (where ${referralEvents.eventType} = 'connector_active')`.mapWith(
        Number
      );
    const rows = await db
      .select({
        userId: users.id,
        name: users.name,
        screenname: users.screenname,
        email: users.email,
        people,
        accounts,
        directory,
        connectors,
        lastReferralAt: max(referralEvents.createdAt),
      })
      .from(referralEvents)
      .innerJoin(
        referralAttributions,
        eq(referralEvents.attributionId, referralAttributions.id)
      )
      .innerJoin(users, eq(referralAttributions.referrerUserId, users.id))
      .groupBy(users.id, users.name, users.screenname, users.email)
      .orderBy(
        desc(people),
        desc(accounts),
        desc(directory),
        desc(connectors),
        users.name,
        users.email
      );

    return NextResponse.json({
      totals: rows.reduce(
        (totals, row) => ({
          people: totals.people + row.people,
          accounts: totals.accounts + row.accounts,
          directory: totals.directory + row.directory,
          connectors: totals.connectors + row.connectors,
        }),
        { people: 0, accounts: 0, directory: 0, connectors: 0 }
      ),
      referrers: rows.map((row, index) => ({
        rank: index + 1,
        ...row,
        lastReferralAt: row.lastReferralAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    console.error('[admin/referrals] load failed', error);
    return NextResponse.json(
      { error: 'Could not load referral results.' },
      { status: 500 }
    );
  }
}
