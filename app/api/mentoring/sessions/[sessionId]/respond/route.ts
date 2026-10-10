/**
 * Mentoring Session Respond API
 *
 * POST /api/mentoring/sessions/[sessionId]/respond
 * Accept or decline a mentoring session request.
 * Only the mentor can respond to session requests.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { mentorSessions } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { respondSessionSchema } from '@/lib/validations/session';

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id || !session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { sessionId } = await params;

  const body = await request.json();
  const validation = respondSessionSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: validation.error },
      { status: 400 }
    );
  }

  const { action, reason } = validation.data;

  // Decline requires a reason
  if (action === 'decline' && !reason) {
    return NextResponse.json(
      { error: 'Reason is required when declining a session' },
      { status: 400 }
    );
  }

  // Find the session
  const mentorSession = await db.query.mentorSessions.findFirst({
    where: eq(mentorSessions.sessionId, sessionId),
  });

  if (!mentorSession) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  // Only the mentor can respond
  if (mentorSession.mentorEmail !== session.user.email) {
    return NextResponse.json(
      { error: 'Only the mentor can respond to session requests' },
      { status: 403 }
    );
  }

  // Can only respond to pending sessions
  if (mentorSession.status !== 'pending') {
    return NextResponse.json(
      {
        error: `Cannot respond to a session with status: ${mentorSession.status}`,
      },
      { status: 400 }
    );
  }

  // Update session based on action
  if (action === 'accept') {
    const [updatedSession] = await db
      .update(mentorSessions)
      .set({ status: 'scheduled' })
      .where(eq(mentorSessions.id, mentorSession.id))
      .returning();

    return NextResponse.json({
      success: true,
      message: 'Session accepted',
      session: updatedSession,
    });
  } else {
    // Decline
    const [updatedSession] = await db
      .update(mentorSessions)
      .set({
        status: 'declined',
        declinedAt: new Date(),
        declinedBy: session.user.email,
        declineReason: reason,
      })
      .where(eq(mentorSessions.id, mentorSession.id))
      .returning();

    return NextResponse.json({
      success: true,
      message: 'Session declined',
      session: updatedSession,
    });
  }
}
