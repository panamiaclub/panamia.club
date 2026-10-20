'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { ArrowRight, ChevronRight, Clock } from 'lucide-react';
import { isVideoUrl } from '@/lib/media/is-video-url';
import { useRail } from './rail';

export interface HomeArticle {
  id: string;
  slug: string;
  href?: string;
  title: string;
  excerpt?: string;
  articleType: 'business_update' | 'community_commentary' | 'staff_update';
  coverImage?: string;
  coverImageAlt?: string;
  readingTime?: number;
  publishedAt: string;
  author: {
    screenname?: string | null;
  };
}

interface RecentArticlesResponse {
  success: boolean;
  data?: {
    articles: HomeArticle[];
  };
  error?: string;
}

const ARTICLE_TYPE_KEYS = {
  business_update: 'articles.types.businessUpdate',
  community_commentary: 'articles.types.commentary',
  staff_update: 'articles.types.staffUpdate',
} as const;

const ARTICLE_ACCENTS = [
  'var(--story-orange)',
  'var(--story-coral)',
  'var(--story-red)',
] as const;

export const MOCK_HOME_ARTICLES: HomeArticle[] = [
  {
    id: 'mock-little-river-market',
    slug: 'little-river-market',
    href: '/a',
    title: 'The Saturday Market That Became a Neighborhood Ritual',
    excerpt:
      'How a handful of vendors turned an empty lot into a weekly place for food, music, and familiar faces.',
    articleType: 'community_commentary',
    coverImage: '/img/directory/market-01.jpg',
    coverImageAlt: 'An outdoor neighborhood market in South Florida',
    readingTime: 6,
    publishedAt: '2026-10-12T14:00:00.000Z',
    author: { screenname: 'localwithluz' },
  },
  {
    id: 'mock-cafe-third-place',
    slug: 'cafes-as-third-places',
    href: '/a',
    title: 'Why the Corner Café Still Matters',
    excerpt:
      'A local café is more than a counter and a cup. It can be the room where collaborators, neighbors, and new ideas meet.',
    articleType: 'business_update',
    coverImage: '/img/directory/cafe-02.jpg',
    coverImageAlt: 'A colorful independent café',
    readingTime: 4,
    publishedAt: '2026-10-08T14:00:00.000Z',
    author: { screenname: 'cafecito305' },
  },
  {
    id: 'mock-community-dinner',
    slug: 'what-we-learned-at-the-community-table',
    href: '/a',
    title: 'What We Learned Around the Community Table',
    excerpt:
      'Panas from three counties shared what they are building, what is getting in the way, and where cooperation can begin.',
    articleType: 'staff_update',
    coverImage: '/img/impact/pana-social-dinner.webp',
    coverImageAlt: 'Panas sharing a meal at a long community table',
    readingTime: 8,
    publishedAt: '2026-10-03T14:00:00.000Z',
    author: { screenname: 'panamia' },
  },
  {
    id: 'mock-public-art',
    slug: 'public-art-belongs-to-everyone',
    href: '/a',
    title: 'Public Art Belongs to Everyone Who Walks Past It',
    excerpt:
      'Meet the local artists making walls, sidewalks, and storefronts feel more like the communities around them.',
    articleType: 'community_commentary',
    coverImage: '/img/directory/art-02.jpg',
    coverImageAlt: 'Colorful artwork made by a local artist',
    readingTime: 5,
    publishedAt: '2026-09-27T14:00:00.000Z',
    author: { screenname: 'madeinbroward' },
  },
  {
    id: 'mock-heat-resilience',
    slug: 'designing-for-a-hotter-south-florida',
    href: '/a',
    title: 'Designing for a Hotter South Florida',
    excerpt:
      'Shade, water, native plants, and neighborhood knowledge are already shaping a more resilient way to gather.',
    articleType: 'community_commentary',
    coverImage: '/img/impact/heatwave-visions.webp',
    coverImageAlt: 'A community vision for climate resilience',
    readingTime: 7,
    publishedAt: '2026-09-19T14:00:00.000Z',
    author: { screenname: 'solarpunkmia' },
  },
  {
    id: 'mock-bakery-growth',
    slug: 'from-home-kitchen-to-neighborhood-bakery',
    href: '/a',
    title: 'From a Home Kitchen to a Neighborhood Bakery',
    excerpt:
      'One Pana shares the small decisions, community support, and stubborn optimism behind opening their first storefront.',
    articleType: 'business_update',
    coverImage: '/img/directory/bakery-01.jpg',
    coverImageAlt: 'Fresh pastries from a local bakery',
    readingTime: 5,
    publishedAt: '2026-09-11T14:00:00.000Z',
    author: { screenname: 'dulcesdelbarrio' },
  },
];

interface HomeArticleRailProps {
  initialArticles?: HomeArticle[];
}

export function HomeArticleRail({
  initialArticles,
}: HomeArticleRailProps = {}) {
  const { t, i18n } = useTranslation('home');
  const [articles, setArticles] = useState<HomeArticle[]>(
    initialArticles || []
  );
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    initialArticles ? 'ready' : 'loading'
  );
  const { railRef, rail, syncRail, nudge } =
    useRail<HTMLDivElement>('.home-article-card');

  useEffect(() => {
    if (initialArticles) {
      return;
    }

    const controller = new AbortController();

    async function loadArticles() {
      try {
        const response = await fetch('/api/articles/recent?limit=8', {
          signal: controller.signal,
        });
        const result = (await response.json()) as RecentArticlesResponse;

        if (!response.ok || !result.success || !result.data) {
          throw new Error(result.error || 'Failed to load articles');
        }

        setArticles(result.data.articles);
        setStatus('ready');
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        console.error('Failed to load homepage articles:', error);
        setStatus('error');
      }
    }

    loadArticles();
    return () => controller.abort();
  }, [initialArticles]);

  useEffect(() => {
    syncRail();
  }, [articles, syncRail]);

  const dateLocale = i18n.resolvedLanguage?.startsWith('es')
    ? 'es-US'
    : 'en-US';

  const advanceArticles = () => {
    const track = railRef.current;
    if (!track) return;

    if (rail.next) {
      nudge(1);
      return;
    }

    track.scrollTo({ left: 0, behavior: 'smooth' });
  };

  return (
    <section className="home-section story-articles">
      <div className="container mx-auto px-4">
        <div className="home-articles-heading" data-rv>
          <div>
            <span className="section-eyebrow">{t('articles.eyebrow')}</span>
            <h2 className="section-display mt-4">
              {t('articles.titlePlain')}
            </h2>
            <p className="section-lede mt-3 max-w-2xl">
              {t('articles.subtitle')}
            </p>
          </div>

          <Link href="/a" className="link-arrow home-articles-all">
            {t('articles.viewAll')}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>

      {status === 'loading' && (
        <div className="home-articles-track" aria-label={t('articles.loading')}>
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="home-article-card home-article-card-loading"
              aria-hidden="true"
            >
              <div className="home-article-media" />
              <div className="home-article-copy">
                <span />
                <h3 />
                <p />
              </div>
            </div>
          ))}
        </div>
      )}

      {status === 'error' && (
        <div className="container mx-auto px-4">
          <div className="home-articles-empty">
            <p>{t('articles.loadError')}</p>
            <Link href="/a" className="link-arrow">
              {t('articles.viewAll')}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      )}

      {status === 'ready' && articles.length === 0 && (
        <div className="container mx-auto px-4">
          <div className="home-articles-empty">
            <div>
              <h3>{t('articles.noArticles')}</h3>
              <p>{t('articles.noArticlesDesc')}</p>
            </div>
            <Link href="/a/new" className="link-arrow">
              {t('articles.writeArticle')}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      )}

      {status === 'ready' && articles.length > 0 && (
        <div className="home-articles-rail" data-rv>
          <div
            className="home-articles-track"
            ref={railRef}
            onScroll={syncRail}
          >
            {articles.map((article, index) => (
              <Link
                key={article.id}
                href={article.href || `/a/${article.slug}`}
                className="home-article-card"
                style={{
                  '--home-article-accent':
                    ARTICLE_ACCENTS[index % ARTICLE_ACCENTS.length],
                } as CSSProperties}
              >
                <div className="home-article-media">
                  {article.coverImage ? (
                    isVideoUrl(article.coverImage) ? (
                      <video
                        src={article.coverImage}
                        autoPlay
                        muted
                        loop
                        playsInline
                        preload="metadata"
                        aria-label={
                          article.coverImageAlt || article.title
                        }
                      />
                    ) : (
                      <Image
                        src={article.coverImage}
                        alt={article.coverImageAlt || article.title}
                        fill
                        unoptimized
                        sizes="(max-width: 640px) 82vw, 24rem"
                      />
                    )
                  ) : (
                    <div className="home-article-monogram" aria-hidden="true">
                      P
                    </div>
                  )}
                </div>

                <div className="home-article-copy">
                  <span className="home-article-type">
                    {t(ARTICLE_TYPE_KEYS[article.articleType])}
                  </span>
                  <h3>{article.title}</h3>
                  {article.excerpt && <p>{article.excerpt}</p>}

                  <div className="home-article-meta">
                    <span>
                      {article.author.screenname
                        ? `@${article.author.screenname}`
                        : t('articles.communityAuthor')}
                    </span>
                    <span>
                      {article.readingTime && (
                        <>
                          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                          {t('articles.readingTime', {
                            count: article.readingTime,
                          })}
                        </>
                      )}
                    </span>
                    <time dateTime={article.publishedAt}>
                      {new Date(article.publishedAt).toLocaleDateString(
                        dateLocale,
                        {
                          month: 'short',
                          day: 'numeric',
                        }
                      )}
                    </time>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          <div className="home-articles-nav">
            <button
              type="button"
              className="rail-nav-btn"
              onClick={advanceArticles}
              aria-label={
                rail.next ? t('articles.next') : t('articles.returnToFirst')
              }
            >
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
