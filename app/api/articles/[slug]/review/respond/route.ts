/**
 * Review Response API
 *
 * UPSTREAM REFERENCE: external/activities.next/lib/activities/actions/
 * Approve article or request revisions
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { articlesConsentGate } from '@/lib/article/consent';
import { db } from '@/lib/db';
import { articles } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import type { ArticleStatus } from '@/lib/schema';

interface RouteParams {
  params: Promise<{ slug: string }>;
}

interface ReviewComment {
  id: string;
  text: string;
  contentRef?: string;
  createdAt: string;
  resolved: boolean;
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
  comments: ReviewComment[];
  approvedAt?: string;
}

/**
 * POST /api/articles/[slug]/review/respond
 * Approve the article or request revisions
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

    // Verify current user is the assigned reviewer
    const reviewedBy = articleDoc.reviewedBy as unknown as ReviewedBy | null;
    if (!reviewedBy || reviewedBy.userId !== session.user.id) {
      return NextResponse.json(
        { success: false, error: 'You are not the assigned reviewer' },
        { status: 403 }
      );
    }

    // Can only respond to pending reviews
    if (reviewedBy.status !== 'pending') {
      return NextResponse.json(
        { success: false, error: 'Review has already been completed' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { action, checklist, comment } = body;

    if (!action || !['approve', 'revision_needed'].includes(action)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid action. Must be "approve" or "revision_needed"',
        },
        { status: 400 }
      );
    }

    // Update checklist if provided
    const updatedChecklist = checklist
      ? {
          factsVerified: checklist.factsVerified || false,
          sourcesChecked: checklist.sourcesChecked || false,
          communityStandards: checklist.communityStandards || false,
        }
      : reviewedBy.checklist;

    let updatedReviewedBy: ReviewedBy;
    let newStatus: string;

    // For approval, verify checklist is complete
    if (action === 'approve') {
      const { factsVerified, sourcesChecked, communityStandards } =
        updatedChecklist;

      if (!factsVerified || !sourcesChecked || !communityStandards) {
        return NextResponse.json(
          {
            success: false,
            error: 'All checklist items must be verified before approval',
          },
          { status: 400 }
        );
      }

      updatedReviewedBy = {
        ...reviewedBy,
        checklist: updatedChecklist,
        status: 'approved',
        approvedAt: new Date().toISOString(),
      };
      newStatus = 'draft'; // Back to draft, now publishable
    } else {
      // Add revision comment if provided
      const comments = [...reviewedBy.comments];
      if (comment) {
        comments.push({
          id: `comment-${Date.now()}`,
          text: comment,
          createdAt: new Date().toISOString(),
          resolved: false,
        });
      }

      updatedReviewedBy = {
        ...reviewedBy,
        checklist: updatedChecklist,
        status: 'revision_needed',
        comments,
      };
      newStatus = 'revision_needed';
    }

    await db
      .update(articles)
      .set({
        reviewedBy: updatedReviewedBy as unknown as Record<string, unknown>,
        status: newStatus as ArticleStatus,
      })
      .where(eq(articles.id, articleDoc.id));

    return NextResponse.json({
      success: true,
      message:
        action === 'approve'
          ? 'Article approved'
          : 'Revision request sent to authors',
    });
  } catch (error) {
    console.error('Error responding to review:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to submit review response' },
      { status: 500 }
    );
  }
}
