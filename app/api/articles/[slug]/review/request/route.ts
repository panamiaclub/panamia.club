/**
 * Review Request API
 *
 * UPSTREAM REFERENCE: external/activities.next/lib/activities/actions/
 * Request a review for an article
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { articlesConsentGate } from '@/lib/article/consent';
import { db } from '@/lib/db';
import { articles, profiles } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import {
  isAuthor as isArticleAuthor,
  isAcceptedCoAuthor,
} from '@/lib/article/permissions';

interface RouteParams {
  params: Promise<{ slug: string }>;
}

interface CoAuthor {
  userId: string;
  status: string;
}

interface ReviewedBy {
  userId: string;
  requestedAt: string;
  invitationMessage?: string;
  status: string;
  checklist: {
    factsVerified: boolean;
    sourcesChecked: boolean;
    communityStandards: boolean;
  };
  comments: { id: string; text: string }[];
}

/**
 * POST /api/articles/[slug]/review/request
 * Request a user to review the article
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
      where: eq(articles.slug, slug),
    });
    if (!articleDoc) {
      return NextResponse.json(
        { success: false, error: 'Article not found' },
        { status: 404 }
      );
    }

    // Check if user is author or accepted co-author
    const coAuthors = (articleDoc.coAuthors as unknown as CoAuthor[]) || [];
    if (
      !isArticleAuthor(articleDoc, session.user.id) &&
      !isAcceptedCoAuthor(articleDoc, session.user.id)
    ) {
      return NextResponse.json(
        { success: false, error: 'Only authors can request reviews' },
        { status: 403 }
      );
    }

    // Can only request review for draft or revision_needed articles
    if (
      articleDoc.status !== 'draft' &&
      articleDoc.status !== 'revision_needed'
    ) {
      return NextResponse.json(
        { success: false, error: 'Can only request review for draft articles' },
        { status: 400 }
      );
    }

    // Check if there's already a pending review
    const reviewedBy = articleDoc.reviewedBy as unknown as ReviewedBy | null;
    if (reviewedBy?.status === 'pending') {
      return NextResponse.json(
        { success: false, error: 'A review is already pending' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { userId, message } = body;

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Reviewer user ID is required' },
        { status: 400 }
      );
    }

    // Verify reviewer has a profile with screenname
    const reviewerProfile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, userId),
      with: { user: { columns: { screenname: true } } },
    });
    if (!reviewerProfile) {
      return NextResponse.json(
        { success: false, error: 'Reviewer profile not found' },
        { status: 404 }
      );
    }

    if (!reviewerProfile.user?.screenname) {
      return NextResponse.json(
        { success: false, error: 'Reviewer must have a screenname' },
        { status: 400 }
      );
    }

    // Cannot request review from author or co-authors
    if (userId === session.user.id) {
      return NextResponse.json(
        { success: false, error: 'Cannot request review from yourself' },
        { status: 400 }
      );
    }

    const isReviewerCoAuthor = coAuthors.some(
      (ca) => ca.userId === userId && ca.status === 'accepted'
    );
    if (isReviewerCoAuthor) {
      return NextResponse.json(
        { success: false, error: 'Cannot request review from a co-author' },
        { status: 400 }
      );
    }

    // Set up review request
    const newReviewedBy: ReviewedBy = {
      userId,
      requestedAt: new Date().toISOString(),
      invitationMessage: message || undefined,
      status: 'pending',
      checklist: {
        factsVerified: false,
        sourcesChecked: false,
        communityStandards: false,
      },
      comments: [],
    };

    await db
      .update(articles)
      .set({
        reviewedBy: newReviewedBy as unknown as Record<string, unknown>,
        status: 'pending_review',
      })
      .where(eq(articles.id, articleDoc.id));

    return NextResponse.json({
      success: true,
      message: 'Review request sent',
    });
  } catch (error) {
    console.error('Error requesting review:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to request review' },
      { status: 500 }
    );
  }
}
