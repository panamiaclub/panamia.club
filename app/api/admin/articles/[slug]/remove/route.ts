/**
 * Admin Article Remove API
 *
 * UPSTREAM REFERENCE: external/activities.next/lib/activities/actions/
 * Admin-only endpoint to remove (soft delete) a published article
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
 * POST /api/admin/articles/[slug]/remove
 * Remove a published article with reason (admin only)
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

    // Can only remove published articles
    if (articleDoc.status !== 'published') {
      return NextResponse.json(
        { success: false, error: 'Can only remove published articles' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { reason } = body;

    if (!reason || typeof reason !== 'string' || reason.trim().length < 10) {
      return NextResponse.json(
        {
          success: false,
          error: 'A removal reason of at least 10 characters is required',
        },
        { status: 400 }
      );
    }

    // The reason is kept on the article row as an audit trail for other
    // admins. Removal does not notify the author or co-authors.
    const [updatedArticle] = await db
      .update(articles)
      .set({
        status: 'removed',
        deletedAt: new Date(),
        deletedBy: session.user.id,
        deletionReason: reason.trim(),
      })
      .where(eq(articles.id, articleDoc.id))
      .returning();

    return NextResponse.json({
      success: true,
      data: {
        slug: updatedArticle.slug,
        status: updatedArticle.status,
        deletedAt: updatedArticle.deletedAt,
        deletedBy: currentProfile?.name || 'Admin',
      },
    });
  } catch (error) {
    console.error('Error removing article:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to remove article' },
      { status: 500 }
    );
  }
}
