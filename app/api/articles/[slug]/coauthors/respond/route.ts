/**
 * Co-Author Response API
 *
 * UPSTREAM REFERENCE: external/activities.next/lib/activities/actions/
 * Accept or decline a co-author invitation
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { articlesConsentGate } from '@/lib/article/consent';
import { db } from '@/lib/db';
import { articles } from '@/lib/schema';
import { eq } from 'drizzle-orm';

interface RouteParams {
  params: Promise<{ slug: string }>;
}

interface CoAuthor {
  userId: string;
  invitedAt?: string;
  invitationMessage?: string;
  status: string;
  acceptedAt?: string;
}

/**
 * POST /api/articles/[slug]/coauthors/respond
 * Accept or decline a co-author invitation
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { slug } = await params;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Require current Articles-terms consent (server parity with the client
    // gate; see lib/article/consent.ts).
    const consentBlock = await articlesConsentGate(session.user.id);
    if (consentBlock) return consentBlock;

    const articleDoc = await db.query.articles.findFirst({
      where: (t, { eq }) => eq(t.slug, slug),
    });
    if (!articleDoc) {
      return NextResponse.json(
        { success: false, error: 'Article not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { action } = body;

    if (!action || !['accept', 'decline'].includes(action)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid action. Must be "accept" or "decline"',
        },
        { status: 400 }
      );
    }

    // Find the invitation for this user
    const coAuthors = (articleDoc.coAuthors as unknown as CoAuthor[]) || [];
    const inviteIndex = coAuthors.findIndex(
      (ca) => ca.userId === session.user.id && ca.status === 'pending'
    );

    if (inviteIndex === -1) {
      return NextResponse.json(
        { success: false, error: 'No pending invitation found' },
        { status: 404 }
      );
    }

    // Update invitation status
    const updatedCoAuthors = [...coAuthors];
    if (action === 'accept') {
      updatedCoAuthors[inviteIndex] = {
        ...updatedCoAuthors[inviteIndex],
        status: 'accepted',
        acceptedAt: new Date().toISOString(),
      };
    } else {
      updatedCoAuthors[inviteIndex] = {
        ...updatedCoAuthors[inviteIndex],
        status: 'declined',
      };
    }

    await db
      .update(articles)
      .set({ coAuthors: updatedCoAuthors })
      .where(eq(articles.id, articleDoc.id));

    return NextResponse.json({
      success: true,
      message:
        action === 'accept' ? 'Invitation accepted' : 'Invitation declined',
    });
  } catch (error) {
    console.error('Error responding to invitation:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to respond to invitation' },
      { status: 500 }
    );
  }
}
