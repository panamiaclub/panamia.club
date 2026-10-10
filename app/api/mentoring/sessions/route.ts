import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { mentorSessions, profiles } from '@/lib/schema';
import type { SessionType, SessionStatus } from '@/lib/schema';
import { and, eq, or } from 'drizzle-orm';
import { ProfileMentoring } from '@/lib/interfaces';
import { createSessionSchema } from '@/lib/validations/session';
import { nanoid } from 'nanoid';

// GET - List sessions for current user
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const role = searchParams.get('role'); // 'mentor' | 'mentee' | 'all'
  const status = searchParams.get('status'); // 'pending' | 'scheduled' | 'completed' | 'all'

  // Build where condition
  const roleCondition =
    role === 'mentor'
      ? eq(mentorSessions.mentorEmail, session.user.email)
      : role === 'mentee'
        ? eq(mentorSessions.menteeEmail, session.user.email)
        : or(
            eq(mentorSessions.mentorEmail, session.user.email),
            eq(mentorSessions.menteeEmail, session.user.email)
          );

  const statusCondition =
    status && status !== 'all'
      ? eq(mentorSessions.status, status as SessionStatus)
      : undefined;

  const sessionsList = await db.query.mentorSessions.findMany({
    where: and(roleCondition, statusCondition),
    orderBy: (ms, { desc }) => [desc(ms.scheduledAt)],
    limit: 50,
  });

  return NextResponse.json({ sessions: sessionsList });
}

// POST - Create new session request (requires mentor confirmation)
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const validation = createSessionSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: validation.error },
      { status: 400 }
    );
  }

  const { mentorEmail, scheduledAt, duration, topic, sessionType } =
    validation.data;

  // Verify mentor exists and has mentoring enabled
  const mentor = await db.query.profiles.findFirst({
    where: eq(profiles.email, mentorEmail),
  });

  const mentoring = mentor?.mentoring as ProfileMentoring | null;
  if (!mentor || !mentoring?.enabled) {
    return NextResponse.json(
      { error: 'Mentor not found or mentoring not enabled' },
      { status: 404 }
    );
  }

  // Mentor must have a userId (linked to PostgreSQL auth)
  if (!mentor.userId) {
    return NextResponse.json(
      { error: 'Mentor account not properly configured' },
      { status: 400 }
    );
  }

  // Create session with unique ID
  // Status is 'pending' until mentor accepts
  const sessionId = nanoid(16);
  const [newSession] = await db
    .insert(mentorSessions)
    .values({
      mentorEmail,
      menteeEmail: session.user.email,
      scheduledAt: new Date(scheduledAt),
      duration,
      topic,
      sessionType: sessionType as SessionType,
      sessionId,
      status: 'pending',
    })
    .returning();

  return NextResponse.json({ session: newSession }, { status: 201 });
}
