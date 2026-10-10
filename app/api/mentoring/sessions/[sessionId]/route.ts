import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { mentorSessions } from '@/lib/schema';
import { and, eq, or } from 'drizzle-orm';
import {
  updateSessionNotesSchema,
  cancelSessionSchema,
} from '@/lib/validations/session';

// GET - Get session details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const mentorSession = await db.query.mentorSessions.findFirst({
    where: and(
      eq(mentorSessions.sessionId, sessionId),
      or(
        eq(mentorSessions.mentorEmail, session.user.email),
        eq(mentorSessions.menteeEmail, session.user.email)
      )
    ),
  });

  if (!mentorSession) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  return NextResponse.json({ session: mentorSession });
}

// PATCH - Update session (notes, status)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  const session = await auth();
  if (!session?.user?.id || !session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { action } = body;

  if (action === 'update_notes') {
    const validation = updateSessionNotesSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Validation failed' }, { status: 400 });
    }

    const updated = await db
      .update(mentorSessions)
      .set({ notes: validation.data.notes })
      .where(
        and(
          eq(mentorSessions.sessionId, sessionId),
          or(
            eq(mentorSessions.mentorEmail, session.user.email),
            eq(mentorSessions.menteeEmail, session.user.email)
          )
        )
      )
      .returning();

    if (updated.length === 0) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Fetch the updated session
    const updatedSession = await db.query.mentorSessions.findFirst({
      where: eq(mentorSessions.sessionId, sessionId),
    });

    return NextResponse.json({ session: updatedSession });
  }

  if (action === 'cancel') {
    const validation = cancelSessionSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Validation failed' }, { status: 400 });
    }

    // Find session first
    const mentorSession = await db.query.mentorSessions.findFirst({
      where: and(
        eq(mentorSessions.sessionId, sessionId),
        or(
          eq(mentorSessions.mentorEmail, session.user.email),
          eq(mentorSessions.menteeEmail, session.user.email)
        )
      ),
    });

    if (!mentorSession) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Can only cancel pending or scheduled sessions
    if (!['pending', 'scheduled'].includes(mentorSession.status)) {
      return NextResponse.json(
        {
          error: `Cannot cancel a session with status: ${mentorSession.status}`,
        },
        { status: 400 }
      );
    }

    // Update session
    const [updatedSession] = await db
      .update(mentorSessions)
      .set({
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelledBy: session.user.email,
        cancelReason: validation.data.reason,
      })
      .where(eq(mentorSessions.id, mentorSession.id))
      .returning();

    return NextResponse.json({ session: updatedSession });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
