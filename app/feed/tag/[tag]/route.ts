/**
 * Tag-filtered RSS Feed
 *
 * UPSTREAM REFERENCE: external/activities.next/lib/services/timelines/
 * RSS feed of articles by tag
 */

import { NextRequest } from 'next/server';
import { Feed } from 'feed';
import { db } from '@/lib/db';
import { articles, users } from '@/lib/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';

const SITE_URL = process.env.NEXT_PUBLIC_HOST_URL || 'https://panamia.club';

interface RouteParams {
  params: Promise<{ tag: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { tag } = await params;
    const decodedTag = decodeURIComponent(tag).toLowerCase();

    const feed = new Feed({
      title: `Pana MIA Articles - #${decodedTag}`,
      description: `Articles tagged with #${decodedTag}`,
      id: `${SITE_URL}/a?tag=${decodedTag}`,
      link: `${SITE_URL}/a?tag=${decodedTag}`,
      language: 'en',
      copyright: `All rights reserved ${new Date().getFullYear()}, Pana MIA`,
      feedLinks: {
        rss2: `${SITE_URL}/feed/tag/${decodedTag}`,
      },
    });

    // Get articles with this tag
    const articleList = await db.query.articles.findMany({
      where: and(
        eq(articles.status, 'published'),
        sql`${articles.tags} @> ARRAY[${decodedTag}]::text[]`
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
    console.error('Error generating tag feed:', error);
    return new Response('Error generating feed', { status: 500 });
  }
}
