/**
 * Publish Article API
 *
 * UPSTREAM REFERENCE: external/activities.next/lib/activities/actions/
 * Publish an article that meets all requirements
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { articles, users, profiles } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { isPublishable } from '@/lib/article';
import { isAuthor as isArticleAuthor } from '@/lib/article/permissions';
import { articlesConsentGate } from '@/lib/article/consent';
import { isVideoUrl } from '@/lib/media/is-video-url';
import type { ArticleStatus } from '@/lib/schema';
import {
  crosspostArticle,
  type ArticleContributor,
} from '@/lib/relay/crosspost-client';

interface RouteParams {
  params: Promise<{ slug: string }>;
}

// CC license enum -> SPDX-ish label + canonical URL for the article footer/tag.
const CC_LICENSES: Record<string, { label: string; url: string }> = {
  'cc-by-4': {
    label: 'CC BY 4.0',
    url: 'https://creativecommons.org/licenses/by/4.0/',
  },
  'cc-by-sa-4': {
    label: 'CC BY-SA 4.0',
    url: 'https://creativecommons.org/licenses/by-sa/4.0/',
  },
  'cc-0': {
    label: 'CC0 1.0',
    url: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
};

// Resolve a stored coverImage to a durable, absolute URL. The editor/preview
// may persist a Vite image-optimizer proxy (/_vinext/image?url=…) or a
// site-relative path; neither is portable to external Nostr clients, so unwrap
// the proxy and absolutize against the public host.
function normalizeImageUrl(
  raw: string | undefined,
  host: string
): string | undefined {
  if (!raw) return undefined;
  let u = raw;
  if (u.includes('/_vinext/image')) {
    const m = u.match(/[?&]url=([^&]+)/);
    if (m) u = decodeURIComponent(m[1]);
  }
  if (u.startsWith('/') && host) u = host.replace(/\/$/, '') + u;
  return u;
}

// This instance's authoritative home relay. Must match the relay worker's
// NOSTR_HOME_RELAY. `nostr_event_id` is keyed solely off this relay's
// acceptance: entries in NOSTR_ARTICLE_CROSSPOST_LIST are additional mirrors,
// so their OK/failure must not change whether we record the event as live here.
const NOSTR_HOME_RELAY =
  process.env.NOSTR_HOME_RELAY ?? 'wss://relay.pana.social';

function isHomeRelay(url: string): boolean {
  try {
    return new URL(url).host === new URL(NOSTR_HOME_RELAY).host;
  } catch {
    return false;
  }
}

// Resolve a userId to an ArticleContributor, attaching their Nostr pubkey from
// their profile if they are relay-enrolled.
async function resolveContributor(
  userId: string,
  role: ArticleContributor['role']
): Promise<ArticleContributor> {
  const [user, profile] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, userId) }),
    db.query.profiles.findFirst({ where: eq(profiles.userId, userId) }),
  ]);
  return {
    role,
    name: user?.name || user?.screenname || undefined,
    pubkey: profile?.nostrPubkey || undefined,
  };
}

interface CoAuthor {
  userId: string;
  status: string;
}

interface ReviewedBy {
  userId: string;
  status: string;
}

/**
 * POST /api/articles/[slug]/publish
 * Publish an article
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

    const articleDoc = await db.query.articles.findFirst({
      where: eq(articles.slug, slug),
    });
    if (!articleDoc) {
      return NextResponse.json(
        { success: false, error: 'Article not found' },
        { status: 404 }
      );
    }

    // Only author can publish
    if (!isArticleAuthor(articleDoc, session.user.id)) {
      return NextResponse.json(
        { success: false, error: 'Only the author can publish this article' },
        { status: 403 }
      );
    }

    // Require current Articles-terms consent (server parity with the client
    // gate; see lib/article/consent.ts).
    const consentBlock = await articlesConsentGate(session.user.id);
    if (consentBlock) return consentBlock;

    // Check if article can be published
    if (articleDoc.status === 'published') {
      return NextResponse.json(
        { success: false, error: 'Article is already published' },
        { status: 400 }
      );
    }

    if (articleDoc.status === 'removed') {
      return NextResponse.json(
        { success: false, error: 'Cannot publish a removed article' },
        { status: 400 }
      );
    }

    // Staff updates bypass the collaboration gate, so re-verify admin at publish
    // time — an article's type could have been set while the author was an admin.
    if (articleDoc.articleType === 'staff_update' && !session.user.isAdmin) {
      return NextResponse.json(
        { success: false, error: 'Only admins can publish staff updates' },
        { status: 403 }
      );
    }

    // Check publishability requirements
    const coAuthors = articleDoc.coAuthors as unknown as CoAuthor[] | null;
    const reviewedBy = articleDoc.reviewedBy as unknown as ReviewedBy | null;

    const publishCheck = isPublishable({
      title: articleDoc.title,
      content: articleDoc.content,
      coAuthors: coAuthors || [],
      reviewedBy: reviewedBy || undefined,
      status: articleDoc.status as ArticleStatus,
      articleType: articleDoc.articleType,
    });
    if (!publishCheck.publishable) {
      return NextResponse.json(
        { success: false, error: publishCheck.reason },
        { status: 400 }
      );
    }

    // Resolve attribution for the NIP-23 crosspost. Articles are signed by the
    // shared relay key, so these human bylines (author + accepted co-authors +
    // approved reviewer) carry the credit the signing pubkey can't. Each
    // contributor's Nostr pubkey is attached if they are relay-enrolled.
    const contributors: ArticleContributor[] = [];
    if (articleDoc.authorId) {
      contributors.push(
        await resolveContributor(articleDoc.authorId, 'author')
      );
    }
    for (const ca of coAuthors || []) {
      if (ca.status === 'accepted' && ca.userId) {
        contributors.push(await resolveContributor(ca.userId, 'coauthor'));
      }
    }
    if (reviewedBy?.userId && reviewedBy.status === 'approved') {
      contributors.push(
        await resolveContributor(reviewedBy.userId, 'reviewer')
      );
    }

    const license = CC_LICENSES[articleDoc.ccLicense];
    const host = process.env.NEXT_PUBLIC_HOST_URL ?? '';
    const canonicalUrl = host
      ? `${host.replace(/\/$/, '')}/a/${articleDoc.slug}`
      : undefined;

    // Crosspost as a NIP-23 (kind-30023) event via the relay worker. Failure
    // must not block the local publish — it is surfaced as a warning only.
    const publishedAt = new Date();
    let nostrEventId: string | null = null;
    let crosspost: Awaited<ReturnType<typeof crosspostArticle>> | null = null;
    let crosspostError: string | null = null;
    // A video cover isn't a NIP-23 image and crossposting video isn't
    // implemented, so only image covers are sent to the relay.
    const coverIsVideo = isVideoUrl(articleDoc.coverImage);
    try {
      crosspost = await crosspostArticle({
        slug: articleDoc.slug,
        title: articleDoc.title,
        summary: articleDoc.excerpt || undefined,
        content: articleDoc.content,
        tags: articleDoc.tags || [],
        articleType: articleDoc.articleType,
        coverImage: coverIsVideo
          ? undefined
          : normalizeImageUrl(articleDoc.coverImage || undefined, host),
        coverImageAlt: coverIsVideo
          ? undefined
          : articleDoc.coverImageAlt || undefined,
        publishedAt: Math.floor(publishedAt.getTime() / 1000),
        contributors,
        license: license?.label,
        licenseUrl: license?.url,
        canonicalUrl,
      });
    } catch (err) {
      crosspostError =
        err instanceof Error ? err.message : 'crosspost request failed';
      console.error('Article crosspost failed:', err);
    }

    // Persist nostrEventId only when the home relay (NOSTR_HOME_RELAY) accepted
    // it — additional mirrors don't count — so the DB never claims an event that
    // isn't live on our authoritative relay.
    const homeAccepted =
      !!crosspost && crosspost.results.some((r) => r.ok && isHomeRelay(r.url));
    nostrEventId = homeAccepted ? crosspost!.eventId : null;

    const delivered = !!crosspost && crosspost.results.some((r) => r.ok);
    const crosspostStatus: 'delivered' | 'no-targets' | 'failed' = delivered
      ? 'delivered'
      : crosspost && crosspost.results.length === 0
        ? 'no-targets'
        : 'failed';
    const crosspostDetail =
      crosspostError ??
      crosspost?.results.find((r) => !r.ok)?.error ??
      crosspost?.note ??
      null;
    const acceptedRelays = (crosspost?.results ?? [])
      .filter((r) => r.ok)
      .map((r) => r.url);
    const failedRelays = (crosspost?.results ?? [])
      .filter((r) => !r.ok)
      .map((r) => ({ url: r.url, error: r.error ?? null }));

    // Publish the article
    const [updatedArticle] = await db
      .update(articles)
      .set({ status: 'published', publishedAt, nostrEventId })
      .where(eq(articles.id, articleDoc.id))
      .returning();

    return NextResponse.json({
      success: true,
      data: {
        slug: updatedArticle.slug,
        status: updatedArticle.status,
        publishedAt: updatedArticle.publishedAt,
        nostrEventId: updatedArticle.nostrEventId,
        crosspost: {
          status: crosspostStatus,
          detail: crosspostDetail,
          acceptedRelays,
          failedRelays,
        },
      },
    });
  } catch (error) {
    console.error('Error publishing article:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to publish article' },
      { status: 500 }
    );
  }
}
