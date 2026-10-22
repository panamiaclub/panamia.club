import { nanoid } from 'nanoid';
import { eq, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/auth';
import { db } from '@/lib/db';
import {
  referralAttributions,
  referralCodes,
  referralEvents,
} from '@/lib/schema';

async function responseFor(request: NextRequest, userId: string) {
  const [codeRow, milestoneRows] = await Promise.all([
    db.query.referralCodes.findFirst({
      where: eq(referralCodes.userId, userId),
      columns: { code: true },
    }),
    db
      .select({
        people:
          sql<number>`count(distinct ${referralEvents.attributionId})`.mapWith(
            Number
          ),
        accounts:
          sql<number>`count(*) filter (where ${referralEvents.eventType} = 'account_created')`.mapWith(
            Number
          ),
        directory:
          sql<number>`count(*) filter (where ${referralEvents.eventType} = 'directory_submitted')`.mapWith(
            Number
          ),
        connectors:
          sql<number>`count(*) filter (where ${referralEvents.eventType} = 'connector_active')`.mapWith(
            Number
          ),
      })
      .from(referralEvents)
      .innerJoin(
        referralAttributions,
        eq(referralEvents.attributionId, referralAttributions.id)
      )
      .where(eq(referralAttributions.referrerUserId, userId)),
  ]);

  const code = codeRow?.code ?? null;
  const milestones = milestoneRows[0] ?? {
    people: 0,
    accounts: 0,
    directory: 0,
    connectors: 0,
  };
  const baseUrl =
    process.env.NEXT_PUBLIC_HOST_URL?.replace(/\/$/, '') ||
    new URL(request.url).origin;
  return NextResponse.json({
    code,
    referralUrl: code ? new URL(`/r/${code}`, baseUrl).toString() : null,
    milestones,
  });
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return responseFor(request, session.user.id);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await db
    .insert(referralCodes)
    .values({ code: nanoid(12), userId: session.user.id })
    .onConflictDoNothing({ target: referralCodes.userId });

  return responseFor(request, session.user.id);
}
