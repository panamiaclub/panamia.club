/**
 * Author RSS Feed
 *
 * UPSTREAM REFERENCE: external/activities.next/lib/services/timelines/
 * RSS feed of articles by author screenname
 */

import { NextRequest } from 'next/server';
import { Feed } from 'feed';
import { db } from '@/lib/db';
import { articles, users } from '@/lib/schema';
import { and, eq } from 'drizzle-orm';

const SITE_URL = process.env.NEXT_PUBLIC_HOST_URL || 'https://panamia.club';

interface RouteParams {
  params: Promise<{ screenname: string }>;
}

interface CoAuthor {
  userId: string;
  status: string;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { screenname } = await params;
    const decodedScreenname = decodeURIComponent(screenname);

    // Find author by screenname
    const author = await db.query.users.findFirst({
      where: eq(users.screenname, decodedScreenname),
      columns: { id: true, screenname: true },
    });
    if (!author) {
      return new Response('Author not found', { status: 404 });
    }

    const authorName = author.screenname
      ? `@${author.screenname}`
      : 'Anonymous';

    const feed = new Feed({
      title: `Pana MIA Articles by ${authorName}`,
      description: `Articles written by ${authorName}`,
      id: `${SITE_URL}/feed/author/${decodedScreenname}`,
      link: `${SITE_URL}/a`,
      language: 'en',
      copyright: `All rights reserved ${new Date().getFullYear()}, Pana MIA`,
      feedLinks: {
        rss2: `${SITE_URL}/feed/author/${decodedScreenname}`,
      },
    });

    // Get articles by this author (primary author)
    const primaryArticles = await db.query.articles.findMany({
      where: and(
        eq(articles.status, 'published'),
        eq(articles.authorId, author.id)
      ),
      orderBy: (t, { desc }) => [desc(t.publishedAt)],
      limit: 50,
    });

    // Get articles where this user is a co-author
    const allPublishedArticles = await db.query.articles.findMany({
      where: eq(articles.status, 'published'),
      orderBy: (t, { desc }) => [desc(t.publishedAt)],
    });
    const coAuthoredArticles = allPublishedArticles.filter((a) => {
      const coAuthors = (a.coAuthors as unknown as CoAuthor[]) || [];
      return coAuthors.some(
        (ca) => ca.userId === author.id && ca.status === 'accepted'
      );
    });

    // Combine and dedupe
    const articleMap = new Map(primaryArticles.map((a) => [a.id, a]));
    for (const coAuthored of coAuthoredArticles) {
      if (!articleMap.has(coAuthored.id)) {
        articleMap.set(coAuthored.id, coAuthored);
      }
    }
    const articleList = Array.from(articleMap.values())
      .sort(
        (a, b) =>
          new Date(b.publishedAt!).getTime() -
          new Date(a.publishedAt!).getTime()
      )
      .slice(0, 50);

    for (const article of articleList) {
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
    console.error('Error generating author feed:', error);
    return new Response('Error generating feed', { status: 500 });
  }
}
