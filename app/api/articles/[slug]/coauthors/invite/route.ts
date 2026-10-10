/**
 * Co-Author Invitation API
 *
 * UPSTREAM REFERENCE: external/activities.next/lib/activities/actions/
 * Invite a user to co-author an article
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { articlesConsentGate } from '@/lib/article/consent';
import { db } from '@/lib/db';
import { articles } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { isAuthor as isArticleAuthor } from '@/lib/article/permissions';

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
 * POST /api/articles/[slug]/coauthors/invite
 * Invite a user to be a co-author
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

    // Verify current user has a profile
    const currentProfile = await db.query.profiles.findFirst({
      where: (t, { eq }) => eq(t.userId, session.user.id),
    });
    if (!currentProfile) {
      return NextResponse.json(
        { success: false, error: 'Profile not found' },
        { status: 404 }
      );
    }

    const articleDoc = await db.query.articles.findFirst({
      where: (t, { eq }) => eq(t.slug, slug),
    });
    if (!articleDoc) {
      return NextResponse.json(
        { success: false, error: 'Article not found' },
        { status: 404 }
      );
    }

    // Only author can invite co-authors
    if (!isArticleAuthor(articleDoc, session.user.id)) {
      return NextResponse.json(
        { success: false, error: 'Only the author can invite co-authors' },
        { status: 403 }
      );
    }

    // Can only invite for draft articles
    if (
      articleDoc.status !== 'draft' &&
      articleDoc.status !== 'revision_needed'
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'Can only invite co-authors for draft articles',
        },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { userId, message } = body;

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'User ID is required' },
        { status: 400 }
      );
    }

    // Verify invitee has a profile with screenname
    const inviteeProfile = await db.query.profiles.findFirst({
      where: (t, { eq }) => eq(t.userId, userId),
      with: { user: { columns: { screenname: true } } },
    });
    if (!inviteeProfile) {
      return NextResponse.json(
        { success: false, error: 'User profile not found' },
        { status: 404 }
      );
    }

    if (!inviteeProfile.user?.screenname) {
      return NextResponse.json(
        { success: false, error: 'User must have a screenname to be invited' },
        { status: 400 }
      );
    }

    // Check if already invited or is author
    if (userId === session.user.id) {
      return NextResponse.json(
        { success: false, error: 'Cannot invite yourself' },
        { status: 400 }
      );
    }

    const coAuthors = (articleDoc.coAuthors as unknown as CoAuthor[]) || [];
    const existingInvite = coAuthors.find((ca) => ca.userId === userId);
    if (existingInvite) {
      return NextResponse.json(
        { success: false, error: 'User has already been invited' },
        { status: 400 }
      );
    }

    // Add co-author invitation
    const newCoAuthors = [
      ...coAuthors,
      {
        userId,
        invitedAt: new Date().toISOString(),
        invitationMessage: message || undefined,
        status: 'pending',
      },
    ];

    await db
      .update(articles)
      .set({ coAuthors: newCoAuthors })
      .where(eq(articles.id, articleDoc.id));

    return NextResponse.json({
      success: true,
      message: 'Invitation sent',
    });
  } catch (error) {
    console.error('Error inviting co-author:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to send invitation' },
      { status: 500 }
    );
  }
}
