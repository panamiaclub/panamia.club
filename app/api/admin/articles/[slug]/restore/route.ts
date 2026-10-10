/**
 * Admin Article Restore API
 *
 * UPSTREAM REFERENCE: external/activities.next/lib/activities/actions/
 * Admin-only endpoint to restore a removed article
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { profiles, articles } from '@/lib/schema';
import { eq } from 'drizzle-orm';

interface RouteParams {
  params: Promise<{ slug: string }>;
}

/**
 * POST /api/admin/articles/[slug]/restore
 * Restore a removed article back to published (admin only)
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

    // Check admin status from session (set in auth.ts session callback)
    if (!session.user.isAdmin) {
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      );
    }

    // Get current user's profile for response
    const currentProfile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, session.user.id),
    });

    const articleDoc = await db.query.articles.findFirst({
      where: eq(articles.slug, slug),
    });
    if (!articleDoc) {
      return NextResponse.json(
        { success: false, error: 'Article not found' },
        { status: 404 }
      );
    }

    // Can only restore removed articles
    if (articleDoc.status !== 'removed') {
      return NextResponse.json(
        { success: false, error: 'Can only restore removed articles' },
        { status: 400 }
      );
    }

    // Store previous removal info for audit trail
    const previousRemovalReason = articleDoc.deletionReason;

    // Restore article to published. Like removal, this notifies no one; the
    // article simply reappears at its old URL.
    const [updatedArticle] = await db
      .update(articles)
      .set({
        status: 'published',
        // Keep deletedAt, deletedBy, deletionReason for audit trail
      })
      .where(eq(articles.id, articleDoc.id))
      .returning();

    return NextResponse.json({
      success: true,
      data: {
        slug: updatedArticle.slug,
        status: updatedArticle.status,
        restoredBy: currentProfile?.name || 'Admin',
        previousRemovalReason,
      },
    });
  } catch (error) {
    console.error('Error restoring article:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to restore article' },
      { status: 500 }
    );
  }
}
