import { db } from '@/lib/db';
import { articles, profiles, users } from '@/lib/schema';
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { DIRECTORY_ACCOUNT_TYPES } from '@/lib/accounts';
import { PANA_OFFERINGS } from '@/lib/panaverse/offerings';

type SitemapEntry = {
  url: string;
  lastModified?: Date | string;
  changeFrequency?:
    'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: number;
};

const SITE_URL = process.env.NEXT_PUBLIC_HOST_URL ?? 'https://pana.social';

/**
 * The six offerings' front pages.
 *
 * Driven from the registry rather than typed out, for the same reason the nav
 * drawer is: these six are what the site is, and a hand-kept copy of the list
 * is a copy that will be one short the next time one is added.
 *
 * They sit above the rest because they are now the site's primary navigation
 * — the whole of the menu — so they are the pages a crawler should reach
 * first after the homepage.
 */
const OFFERING_ROUTES: SitemapEntry[] = PANA_OFFERINGS.map((offering) => ({
  url: `${SITE_URL}${offering.href}`,
  changeFrequency: 'weekly',
  priority: 0.8,
}));

const STATIC_ROUTES: SitemapEntry[] = [
  { url: SITE_URL, priority: 1.0, changeFrequency: 'weekly' },
  { url: `${SITE_URL}/about-us`, changeFrequency: 'monthly' },
  { url: `${SITE_URL}/a`, changeFrequency: 'daily' },
  // `/directorio` was here, and it is a `redirect('/d')` — a sitemap entry
  // that resolves to a different URL than the one submitted. `/directory` is
  // a real page now and is in `OFFERING_ROUTES` above, so the redirect no
  // longer needs to stand in for it.
  { url: `${SITE_URL}/donate`, changeFrequency: 'monthly' },
  { url: `${SITE_URL}/shop`, changeFrequency: 'weekly', priority: 0.8 },
  { url: `${SITE_URL}/podcasts`, changeFrequency: 'weekly' },
  { url: `${SITE_URL}/m/discover`, changeFrequency: 'weekly' },
  { url: `${SITE_URL}/form/get-listed`, changeFrequency: 'monthly' },
  { url: `${SITE_URL}/form/contact-us`, changeFrequency: 'monthly' },
  { url: `${SITE_URL}/form/join-the-team`, changeFrequency: 'monthly' },
  { url: `${SITE_URL}/legal/terms`, changeFrequency: 'monthly' },
  { url: `${SITE_URL}/legal/privacy`, changeFrequency: 'monthly' },
  { url: `${SITE_URL}/legal/dmca`, changeFrequency: 'monthly' },
  {
    url: `${SITE_URL}/doc/affiliate-terms-and-conditions`,
    changeFrequency: 'monthly',
  },
];

export default async function sitemap(): Promise<SitemapEntry[]> {
  const [publishedArticles, publicProfiles] = await Promise.all([
    db.query.articles.findMany({
      where: eq(articles.status, 'published'),
      columns: { slug: true, updatedAt: true },
    }),
    db
      .select({
        screenname: sql<
          string | null
        >`COALESCE(${profiles.screenname}, ${users.screenname})`,
        updatedAt: profiles.updatedAt,
      })
      // Driven from `profiles`, with a LEFT join: a business listing submitted
      // through /form/get-listed keeps `profiles.userId` NULL
      // permanently and is administered through `profileOwners`, so driving
      // from `users` dropped every listing in the directory before any filter
      // below could run. /p/[handle] resolves the profile's own screenname
      // first and falls back to its owner's, so a listing carries its handle
      // here without a user row. Same construct as getSearch(), featured and
      // suggest.
      .from(profiles)
      .leftJoin(users, eq(profiles.userId, users.id))
      .where(
        and(
          sql`COALESCE(${profiles.screenname}, ${users.screenname}) IS NOT NULL`,
          // Also the gate on unapproved submissions: /form/get-listed
          // writes active: false until a human approves it, and
          // delete-account's tombstone clears it. Not merely a liveness check.
          eq(profiles.active, true),
          // Members are not listings. Every signed-in user has an active
          // profile now, so without this the sitemap would publish every
          // personal account to search engines. A listing with no user carries
          // no account type to test and is a listing by definition.
          or(
            isNull(profiles.userId),
            inArray(users.accountType, DIRECTORY_ACCOUNT_TYPES)
          )
        )
      ),
  ]);

  const articleRoutes: SitemapEntry[] = publishedArticles.map((a) => ({
    url: `${SITE_URL}/a/${a.slug}`,
    lastModified: a.updatedAt ?? undefined,
    changeFrequency: 'monthly',
    priority: 0.7,
  }));

  const profileRoutes: SitemapEntry[] = publicProfiles.map((p) => ({
    url: `${SITE_URL}/p/${p.screenname}`,
    lastModified: p.updatedAt ?? undefined,
    changeFrequency: 'monthly',
    priority: 0.6,
  }));

  return [
    ...STATIC_ROUTES,
    ...OFFERING_ROUTES,
    ...articleRoutes,
    ...profileRoutes,
  ];
}
