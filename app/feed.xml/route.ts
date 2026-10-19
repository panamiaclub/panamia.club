/**
 * RSS Feed
 *
 * UPSTREAM REFERENCE: external/activities.next/lib/services/timelines/
 * RSS 2.0 feed of all published articles
 */

import { Feed } from 'feed';
import { db } from '@/lib/db';
import { articles, users } from '@/lib/schema';
import { eq, inArray } from 'drizzle-orm';

const SITE_URL = process.env.NEXT_PUBLIC_HOST_URL || 'https://panamia.club';

async function generateFeed() {
  const feed = new Feed({
    title: 'Pana MIA Community Articles',
    description:
      'Stories, updates, and perspectives from the South Florida community',
    id: SITE_URL,
    link: `${SITE_URL}/a`,
    language: 'en',
    image: `${SITE_URL}/logo.png`,
    favicon: `${SITE_URL}/favicon.ico`,
    copyright: `All rights reserved ${new Date().getFullYear()}, Pana MIA`,
    feedLinks: {
      rss2: `${SITE_URL}/feed.xml`,
      json: `${SITE_URL}/feed.json`,
    },
  });

  // Get recent published articles
  const articleList = await db.query.articles.findMany({
    where: eq(articles.status, 'published'),
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
      content: article.content,
      author: [{ name: authorName }],
      date: new Date(article.publishedAt!),
      category: article.tags?.map((tag: string) => ({ name: tag })) || [],
      image: article.coverImage || undefined,
    });
  }

  return feed;
}

export async function GET() {
  try {
    const feed = await generateFeed();

    return new Response(feed.rss2(), {
      headers: {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    });
  } catch (error) {
    console.error('Error generating RSS feed:', error);
    return new Response('Error generating feed', { status: 500 });
  }
}
