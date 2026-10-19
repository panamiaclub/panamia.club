/**
 * Article Type RSS Feed
 *
 * UPSTREAM REFERENCE: external/activities.next/lib/services/timelines/
 * RSS feed of articles by type (business_update or community_commentary)
 */

import { NextRequest } from 'next/server';
import { Feed } from 'feed';
import { db } from '@/lib/db';
import { articles, users } from '@/lib/schema';
import { and, eq, inArray } from 'drizzle-orm';
import type { ArticleType } from '@/lib/schema';

const SITE_URL = process.env.NEXT_PUBLIC_HOST_URL || 'https://panamia.club';

interface RouteParams {
  params: Promise<{ type: string }>;
}

const TYPE_LABELS: Record<string, string> = {
  business_update: 'Business Updates',
  community_commentary: 'Community Commentary',
  staff_update: 'Staff Update',
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { type } = await params;

    if (
      !['business_update', 'community_commentary', 'staff_update'].includes(
        type
      )
    ) {
      return new Response('Invalid article type', { status: 400 });
    }

    const typeLabel = TYPE_LABELS[type] || type;

    const feed = new Feed({
      title: `Pana MIA ${typeLabel}`,
      description: `${typeLabel} from the South Florida community`,
      id: `${SITE_URL}/a?type=${type}`,
      link: `${SITE_URL}/a?type=${type}`,
      language: 'en',
      copyright: `All rights reserved ${new Date().getFullYear()}, Pana MIA`,
      feedLinks: {
        rss2: `${SITE_URL}/feed/type/${type}`,
      },
    });

    // Get articles of this type
    const articleList = await db.query.articles.findMany({
      where: and(
        eq(articles.status, 'published'),
        eq(articles.articleType, type as ArticleType)
      ),
      orderBy: (t, { desc }) => [desc(t.publishedAt)],
      limit: 50,
    });

    // Get author info
    const authorIds = [...new Set(articleList.map((a) => a.authorId))].filter(
      (id): id is string => id !== null
    );
    const authorList =
      authorIds.length > 0
        ? await db
            .select({ id: users.id, screenname: users.screenname })
            .from(users)
            .where(inArray(users.id, authorIds))
        : [];
    const authorMap = new Map(
      authorList.map((a) => [a.id, { screenname: a.screenname }])
    );

    for (const article of articleList) {
      const author =
        article.authorId !== null ? authorMap.get(article.authorId) : undefined;
      const authorName = author?.screenname
        ? `@${author.screenname}`
        : 'Anonymous';

      feed.addItem({
        title: article.title,
        id: `${SITE_URL}/a/${article.slug}`,
        link: `${SITE_URL}/a/${article.slug}`,
        description: article.excerpt || '',
        author: [{ name: authorName }],
        date: new Date(article.publishedAt!),
        category: article.tags?.map((t: string) => ({ name: t })) || [],
      });
    }

    return new Response(feed.rss2(), {
      headers: {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    });
  } catch (error) {
    console.error('Error generating type feed:', error);
    return new Response('Error generating feed', { status: 500 });
  }
}
