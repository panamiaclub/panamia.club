// Directory search utilities (migrated from MongoDB Atlas Search to PostgreSQL)
import { db } from '@/lib/db';
import { profiles, users } from '@/lib/schema';
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { DIRECTORY_ACCOUNT_TYPES } from '@/lib/accounts';
import { ProfileDescriptions, ProfileMentoring } from '@/lib/interfaces';
import { extractCoordinates } from './profile';
import { calcDistance } from '@/lib/geolocation';
import { countyList, profileCategoryList } from '@/lib/lists';
import {
  effectiveDirectoryRadius,
  matchesDirectoryRadius,
  type DirectoryRadius,
} from '@/lib/directory-radius';
import {
  getHostsWithUpcomingEvents,
  getNextEventForHosts,
  getRecommenderAvatarsForProfiles,
  getSignalCountsForProfiles,
  type DirectoryEvent,
  type DirectorySignalCounts,
} from './directory-enrich';

/**
 * How the results are ordered.
 *
 * `nearest` is only offered once the visitor has shared a location — an order
 * the viewer cannot account for is worse than an arbitrary one.
 */
export type DirectorySort = 'relevance' | 'nearest' | 'recommended' | 'name';

const SORTS: DirectorySort[] = ['relevance', 'nearest', 'recommended', 'name'];

export function isDirectorySort(value: unknown): value is DirectorySort {
  return typeof value === 'string' && SORTS.includes(value as DirectorySort);
}

interface SearchInterface {
  pageNum: number;
  pageLimit: number;
  searchTerm: string;
  filterCategories: string;
  geolat: string;
  geolng: string;
  radius: DirectoryRadius;
  resultsView: string;
  sort?: DirectorySort;
  certifiedOnly?: boolean;
  withEventsOnly?: boolean;
  mentorsOnly?: boolean;
  expertise?: string;
  languages?: string;
  freeOnly?: boolean;
}

/**
 * Map a stored value onto the canonical key the filters use.
 *
 * Three vocabularies reach these columns. The account form writes the
 * canonical `lib/lists` values (`food`, `miami_dade`). The MongoDB migration
 * copies whatever the old site held, which is display labels (`Food`) and free
 * text built from them (`Food & Drink`). Left alone, a listing tagged
 * `Food & Drink` never matches the Food chip and the filter silently returns
 * nothing — a category that looks empty rather than broken.
 *
 * Unrecognised text is returned as-is so it still reads on the card; it simply
 * has no chip to match. Guessing further would file a listing under something
 * its owner never chose.
 */
function canonical(raw: string, vocabulary: { desc: string; value: string }[]) {
  const needle = raw.trim().toLowerCase();
  if (!needle) return raw;

  const match = (text: string) =>
    vocabulary.find(
      (entry) =>
        entry.value.toLowerCase() === text || entry.desc.toLowerCase() === text
    );

  const direct = match(needle);
  if (direct) return direct.value;

  // "Food & Drink" and "Broward/Ft Lauderdale" are one chosen entry plus an
  // elaboration, so the leading term is the one the owner picked.
  const head = needle.split(/[&/,(]/)[0].trim();
  if (head && head !== needle) {
    const loose = match(head);
    if (loose) return loose.value;
  }

  return raw;
}

/**
 * Keys of a profile's category-style JSONB column.
 *
 * The column holds two shapes depending on when the row was written: a
 * `{ food: true }` map from the listing form, and a plain array on older rows.
 * Both are read here rather than in each caller, because a search that
 * silently matches nothing on half the corpus is the worst kind of bug —
 * it looks like an empty directory rather than a broken query.
 */
function jsonKeys(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((entry): entry is string => typeof entry === 'string');
  }
  if (raw && typeof raw === 'object') {
    return Object.entries(raw as Record<string, unknown>)
      .filter(([, on]) => on === true)
      .map(([key]) => key);
  }
  return [];
}

export function categoryKeys(raw: unknown): string[] {
  return jsonKeys(raw).map((key) => canonical(key, profileCategoryList));
}

function countyKeys(raw: unknown): string[] {
  return jsonKeys(raw).map((key) => canonical(key, countyList));
}

/**
 * How well a profile answers the search term, according to Postgres.
 *
 * Replaces a hand-written score ladder that ran in Node over every active
 * profile. Three things were wrong with it and all three are fixed here by
 * handing the question to the database:
 *
 *   - the query was one opaque string, so "kitchen bohemian" found nothing
 *     while "bohemian kitchen" worked
 *   - nothing was stemmed, so "foods" found nothing while "food" worked
 *   - nothing was accent-folded, so Sazon and Sazón were different businesses
 *
 * The query is OR'd across three text-search configurations. English and
 * Spanish because the community writes in both and one stemmer would serve
 * half of it worse than the other half; `simple` because it is the only arm
 * that survives a query made *entirely* of stop words. Searching "the" alone
 * reduces the stemmed arms to an empty tsquery, which matches nothing, so a
 * business named "The Hall" would be unreachable by its own first word. Note
 * this really does need the whole query to be stop words -- "the hall" is
 * fine without the simple arm, because "hall" survives stemming. Do not
 * delete the arm after testing a query that still has one real word in it.
 *
 * `ts_rank_cd` handles relevance from the column weights set in migration
 * 0040, but it has no concept of "this *is* the business you named". The two
 * boosts below restore the top of the old ladder, which encoded a real
 * product rule: someone typing a business name exactly should get that
 * business first, not fourth behind three listings that mention it.
 */
const RANK_WEIGHTS = '{0.1,0.3,0.6,1.0}';
const EXACT_NAME_BOOST = 1000;
const PREFIX_NAME_BOOST = 100;

/**
 * Trigram fallback, for when full-text search finds nothing.
 *
 * Every arm of the query above is exact-match-after-stemming, so one wrong
 * letter is indistinguishable from a word that isn't there: "bohemain" finds
 * nothing at all. That is the worst possible answer, because a typo is
 * invisible to the person who made it -- the directory looks empty rather
 * than misspelled.
 *
 * This runs only when the text search returned zero rows. Firing on empty
 * rather than on "too few" keeps fuzzy matches from polluting queries that
 * already work, costs nothing on the happy path, and means the two result
 * sets never mix, so there is no ranking conflict to reconcile.
 *
 * Three details here are load-bearing and none of them are visible in review:
 *
 *   - word_similarity(), not similarity(). similarity() compares the whole
 *     column, so a short query against a multi-word name is diluted by the
 *     words it didn't mention: "kitchn" scores 0.26 against "Bohemian
 *     Kitchen" and is missed at every usable threshold, while
 *     word_similarity scores 0.71. Measured, not assumed.
 *   - the %> operator, not word_similarity(...) >= n. Only the operator can
 *     use the GIN index; the function form is a sequential scan. At 20k rows
 *     that is 0.09ms against 49ms, and the two read almost identically.
 *   - `pana_unaccent(p.name)` on the left of %>, matching the indexed
 *     expression exactly, or the index is skipped.
 *
 * The threshold is 0.5 rather than pg_trgm's default 0.6 because 0.6 drops
 * real typos: "bisayne yoga" -> "Biscayne Bay Yoga" scores 0.58. Re-measured
 * against a 20k-name corpus, 0.6 loses "bohemain" and "bisayne yoga"
 * outright, so the cost of the default is a silent miss rather than a wrong
 * match. 0.5 held up; it was calibrated on 15 rows and survived 20k.
 *
 * What does degrade at scale is precision, and it tracks how many businesses
 * share the misspelled word rather than the size of the table. A distinctive
 * word still lands the target near the top: "wynwod print" is 2nd of 12.
 * A generic one buries it: "kitchn" is 34th of 375, because word_similarity
 * scores every "<something> Kitchen" name identically and the tiebreak is
 * then arbitrary. That is tolerable, because it returns the same set the
 * corrected spelling would have -- the failure mode is a broad list, not a
 * confident wrong answer. Reordering does not rescue it: ranking by
 * whole-string similarity, or by shortest name, was measured and moves the
 * generic case further down (34th -> 69th) while only helping cases that
 * already worked.
 */
const TRIGRAM_THRESHOLD = 0.5;
const TRIGRAM_LIMIT = 50;

/**
 * How deep the term arm reads before it stops caring.
 *
 * Without a bound this query returns every row whose search_vector matches at
 * all, and a common word matches a large fraction of the directory. Those ids
 * then become an IN list on the row fetch below, so a one-word search would
 * ship thousands of ids to Postgres and pull thousands of full rows back to
 * pick twenty. The cost scales with how generic the word is, which is exactly
 * backwards — the vaguest searches paid the most.
 *
 * The cut is by final score, boosts included, so the listing somebody named
 * exactly is never the row that falls off the end. 500 is well past where
 * relevance ordering still means anything: nobody pages to result 480, and
 * anything below that is matching on a single low-weight token.
 *
 * The trade-off is real and worth stating. Category, radius, certification and
 * mentoring filters run in memory after this, so a filter that only matches
 * listings ranked below 500 for the term will not see them. That is the same
 * bargain the trigram arm already makes at 50, and it only bites when a term
 * is broad enough to fill 500 slots AND the filter is narrow enough to miss
 * all of them. Pushing those filters into SQL is the real fix; it needs the
 * JSONB vocabulary reconciliation in canonical() to move into Postgres first.
 */
const SEARCH_RANKING_LIMIT = 500;

async function trigramRanking(trimmed: string): Promise<Map<string, number>> {
  const rows = (await db.transaction(async (tx) => {
    // Both GUCs in one statement, because each one costs a network round trip
    // and this path already pays for BEGIN and COMMIT. The transaction itself
    // cannot go: set_config(..., true) is SET LOCAL, and SET LOCAL outside a
    // transaction is a no-op with a warning — the threshold would silently
    // revert to pg_trgm's 0.6 default and drop the typos this exists to catch.
    //
    // search_path: pg_trgm's operators live wherever the extension was
    // installed, which is an "extensions" schema on Supabase and public on
    // plain Postgres. Naming both covers either; Postgres ignores entries that
    // don't exist. Migration 0041 asserts the extension is in one of them.
    //
    // A GUC can't be a bind parameter in SET, but it can here.
    await tx.execute(
      sql`SELECT set_config('search_path', 'public, extensions', true),
                 set_config('pg_trgm.word_similarity_threshold', ${String(TRIGRAM_THRESHOLD)}, true)`
    );
    return await tx.execute(sql`
      SELECT p.id,
             word_similarity(pana_unaccent(${trimmed}), pana_unaccent(p.name)) AS sim
      FROM profiles p
      WHERE p.active = true
        AND pana_unaccent(p.name) %> ${trimmed}
      ORDER BY sim DESC
      LIMIT ${TRIGRAM_LIMIT}
    `);
  })) as unknown as Array<{ id: string; sim: number | string }>;

  const ranking = new Map<string, number>();
  for (const row of rows) {
    ranking.set(row.id, Number(row.sim) || 0);
  }
  return ranking;
}

async function searchRanking(term: string): Promise<Map<string, number>> {
  const trimmed = term.trim();
  if (!trimmed) return new Map();

  const rows = (await db.execute(sql`
    WITH q AS (
      SELECT websearch_to_tsquery('english', pana_unaccent(${trimmed}))
          || websearch_to_tsquery('spanish', pana_unaccent(${trimmed}))
          || websearch_to_tsquery('simple',  pana_unaccent(${trimmed})) AS tsq
    ),
    m AS (
      SELECT p.id,
             ts_rank_cd(${RANK_WEIGHTS}::float4[], p.search_vector, q.tsq) AS rank,
             (lower(pana_unaccent(p.name)) = lower(pana_unaccent(${trimmed}))) AS exact_name,
             starts_with(lower(pana_unaccent(p.name)), lower(pana_unaccent(${trimmed}))) AS prefix_name
      FROM profiles p, q
      WHERE p.active = true AND p.search_vector @@ q.tsq
    )
    SELECT m.id, m.rank, m.exact_name, m.prefix_name
    FROM m
    -- Ordered by the same score the Map below stores, boosts included, so the
    -- LIMIT cuts the tail rather than an exact name match that happened to
    -- have a low ts_rank_cd. The casts keep the CASE arms from resolving to
    -- integer against the float4 rank, which would truncate the sum.
    ORDER BY m.rank
           + CASE WHEN m.exact_name THEN ${EXACT_NAME_BOOST}::float4 ELSE 0::float4 END
           + CASE WHEN m.prefix_name THEN ${PREFIX_NAME_BOOST}::float4 ELSE 0::float4 END DESC
    LIMIT ${SEARCH_RANKING_LIMIT}
  `)) as unknown as Array<{
    id: string;
    rank: number | string;
    exact_name: boolean;
    prefix_name: boolean;
  }>;

  const ranking = new Map<string, number>();
  for (const row of rows) {
    const base = Number(row.rank) || 0;
    ranking.set(
      row.id,
      base +
        (row.exact_name ? EXACT_NAME_BOOST : 0) +
        (row.prefix_name ? PREFIX_NAME_BOOST : 0)
    );
  }
  if (ranking.size === 0) return trigramRanking(trimmed);
  return ranking;
}

/**
 * Profile directory search.
 *
 * The term arm runs in Postgres against the search_vector added in migration
 * 0040. Categories, radius, mentoring and certification are still filtered in
 * memory after the candidate rows are loaded.
 */
export const getSearch = async ({
  pageNum,
  pageLimit,
  searchTerm,
  filterCategories,
  geolat,
  geolng,
  radius,
  resultsView: _resultsView,
  sort = 'relevance',
  certifiedOnly,
  withEventsOnly,
  mentorsOnly,
  expertise,
  languages,
  freeOnly,
}: SearchInterface) => {
  const viewerLat = Number(geolat);
  const viewerLng = Number(geolng);
  const hasViewerLocation =
    Number.isFinite(viewerLat) &&
    Number.isFinite(viewerLng) &&
    !(viewerLat === 0 && viewerLng === 0);

  // Relevance is decided in Postgres before anything is loaded, so the term
  // arm reads only rows that actually match instead of the whole table.
  const ranking = searchTerm ? await searchRanking(searchTerm) : null;

  // Nothing matched the words, so no combination of filters can produce a
  // result. Returning here avoids loading the directory to filter it to zero.
  if (ranking && ranking.size === 0) {
    return {
      success: true,
      data: [],
      pagination: { page: pageNum, limit: pageLimit, total: 0, totalPages: 0 },
    };
  }

  // Load the candidate profiles, then apply filters before pagination and
  // enrichment so totals and page boundaries describe the actual result set.
  const allProfiles = await db.query.profiles.findMany({
    // Named explicitly rather than taking the default of every column. The
    // profiles table is wide — roughly fifteen JSONB columns covering
    // availability, verification, roles, administrative, status, linked
    // profiles and more — and none of it is read by a search result. Left to
    // the default, every one of those blobs crossed the wire for every
    // candidate row, on a query whose whole job is to keep twenty of them.
    //
    // Anything added here has to be something transformProfile, the in-memory
    // filters, or distanceFor actually reads. A card that renders blank is the
    // symptom of a column dropped from this list.
    columns: {
      id: true,
      name: true,
      screenname: true,
      // The join key for the `user` relation below. Drizzle adds it to the
      // select on its own, but naming it keeps that from being load-bearing:
      // the screenname fallback silently going null is a subtle failure.
      userId: true,
      primaryImageCdn: true,
      addressLocality: true,
      // extractCoordinates reads the columns first and falls back to the
      // legacy `geo` blob, so it needs all three.
      addressLat: true,
      addressLng: true,
      geo: true,
      onlineOnly: true,
      panaCertifiedAt: true,
      categories: true,
      counties: true,
      descriptions: true,
      socials: true,
      galleryImages: true,
      mentoring: true,
    },
    where: and(
      eq(profiles.active, true),
      // Narrow to the term matches found above. Without a term this is absent
      // and browse still considers the whole directory.
      ranking ? inArray(profiles.id, [...ranking.keys()]) : undefined,
      // Every signed-in user now has an active profile, so `active` alone no
      // longer distinguishes a listing from a member. Narrow by account type in
      // SQL rather than in the in-memory passes below, which would otherwise
      // scan every personal account on each search.
      or(
        // Unclaimed legacy listings predate accounts entirely — they have no
        // user to carry an account type, but they are listings by definition.
        isNull(profiles.userId),
        inArray(
          profiles.userId,
          db
            .select({ id: users.id })
            .from(users)
            .where(inArray(users.accountType, DIRECTORY_ACCOUNT_TYPES))
        )
      )
    ),
    with: { user: { columns: { screenname: true } } },
    orderBy: (p, { asc }) => [asc(p.name)],
  });

  let filtered = allProfiles;

  // Filter by categories
  if (filterCategories) {
    const cats = filterCategories.split('+').filter(Boolean);
    filtered = filtered.filter((p) => {
      const categories = categoryKeys(p.categories);
      return cats.some((cat) => categories.includes(cat));
    });
  }

  // Filter by mentoring
  if (mentorsOnly || expertise || languages || freeOnly) {
    filtered = filtered.filter((p) => {
      const mentoring = p.mentoring as ProfileMentoring | null;
      if (!mentoring?.enabled) return false;

      if (expertise && !mentoring.expertise?.includes(expertise)) return false;
      if (languages && !mentoring.languages?.includes(languages)) return false;
      if (freeOnly && (mentoring.hourlyRate ?? 0) > 0) return false;

      return true;
    });
  }

  // Pana Certified is a timestamp, not a flag — the column answers "since
  // when", and the filter only asks "at all".
  if (certifiedOnly) {
    filtered = filtered.filter((p) => p.panaCertifiedAt != null);
  }

  // A finite radius describes places the viewer can visit. Online-only
  // listings and listings without coordinates therefore do not match it.
  // Without usable viewer coordinates the public fallback is the full South
  // Florida directory, even if a stale client asks for a finite radius.
  const locationContext = {
    hasViewerLocation,
    viewerLat,
    viewerLng,
  };
  const effectiveRadius = effectiveDirectoryRadius(radius, hasViewerLocation);
  if (effectiveRadius !== 'all') {
    filtered = filtered.filter((p) =>
      matchesDirectoryRadius(
        distanceFor(p, locationContext),
        effectiveRadius,
        p.onlineOnly === true
      )
    );
  }

  // Applied before pagination, so it has to look at every survivor rather than
  // the page. One query for the whole set of hosts, not one per listing.
  if (withEventsOnly) {
    const hosts = await getHostsWithUpcomingEvents();
    filtered = filtered.filter((p) => hosts.has(p.id));
  }

  // Order the whole filtered set before slicing. Sorting the page instead
  // would only shuffle the twenty rows that alphabetical order happened to
  // put first, which looks like sorting without being it.
  //
  // "Most recommended" is the one order that needs data from another table
  // before it can be applied, so the counts for the whole filtered set are
  // fetched here and handed down to the enrichment rather than read twice.
  const countsForSort =
    sort === 'recommended'
      ? await getSignalCountsForProfiles(filtered.map((p) => p.id))
      : null;

  const ordered = sortProfiles(filtered, {
    sort,
    ranking,
    ...locationContext,
    counts: countsForSort,
  });

  const total = ordered.length;
  const skip = pageNum > 1 ? (pageNum - 1) * pageLimit : 0;
  const data = await enrichPage(
    ordered.slice(skip, skip + pageLimit),
    countsForSort
  );

  return {
    success: true,
    data,
    pagination: {
      page: pageNum,
      limit: pageLimit,
      total,
      totalPages: Math.ceil(total / pageLimit),
    },
  };
};

type ProfileRow = Record<string, unknown> & {
  id: string;
  name: string;
  user?: { screenname?: string | null } | null;
};

interface LocationContext {
  hasViewerLocation: boolean;
  viewerLat: number;
  viewerLng: number;
}

/**
 * Miles from the viewer, used for finite-radius filtering and "Nearest".
 *
 * Never sent to the client. The card computes its own "x miles away" in the
 * browser from the viewer's precise coordinates, the same way the profile
 * page does, so the two screens round identically and the exact location
 * never leaves the device. What arrives here is deliberately coarse — two
 * decimal places, about a kilometre — which is plenty to order a list and not
 * enough to place somebody's home.
 *
 * Online-only businesses are excluded deliberately rather than by accident:
 * the address on file for one is usually the owner's home, so measuring to it
 * is both misleading and a privacy leak.
 */
function distanceFor(p: ProfileRow, ctx: LocationContext): number | null {
  if (!ctx.hasViewerLocation) return null;
  if (p.onlineOnly === true) return null;

  const coordinates = extractCoordinates(p);
  if (!coordinates) return null;

  const [lng, lat] = coordinates;
  return calcDistance(ctx.viewerLat, ctx.viewerLng, lat, lng);
}

function sortProfiles(
  rows: ProfileRow[],
  options: LocationContext & {
    sort: DirectorySort;
    ranking: Map<string, number> | null;
    counts: Map<string, DirectorySignalCounts> | null;
  }
): ProfileRow[] {
  const { sort } = options;

  if (sort === 'name') {
    // The query already returns name-ascending.
    return rows;
  }

  if (sort === 'recommended') {
    const counts = options.counts;
    // Ties keep the query's alphabetical order, which matters here: most
    // listings have zero recommendations, so without a stable tiebreak the
    // bulk of the directory would reorder itself between requests.
    return [...rows].sort(
      (a, b) =>
        (counts?.get(b.id)?.recommends ?? 0) -
        (counts?.get(a.id)?.recommends ?? 0)
    );
  }

  if (sort === 'nearest') {
    // Without a location there is no distance to sort by, and silently
    // returning some other order under a "Nearest" label is worse than
    // ignoring the request.
    if (!options.hasViewerLocation) return rows;

    return [...rows].sort((a, b) => {
      const da = distanceFor(a, options);
      const db_ = distanceFor(b, options);
      // Listings we cannot place sink below every listing we can — including
      // online-only ones, which are not far away so much as nowhere.
      if (da === null && db_ === null) return 0;
      if (da === null) return 1;
      if (db_ === null) return -1;
      return da - db_;
    });
  }

  // Relevance. Scores come from Postgres (see searchRanking); browse has no
  // term and therefore no ranking, in which case the query's alphabetical
  // order already stands.
  const scores = options.ranking;
  if (!scores) return rows;

  // Stable within a score band: equally relevant listings stay alphabetical
  // rather than reordering between requests for no visible reason.
  return [...rows].sort(
    (a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0)
  );
}

/**
 * Join the extra data onto one page of results.
 *
 * Only ever called with the slice being rendered. Running this over the whole
 * filtered set would issue the same three queries against thousands of ids to
 * throw all but twenty rows away.
 */
async function enrichPage(
  rows: ProfileRow[],
  precomputedCounts: Map<string, DirectorySignalCounts> | null = null
) {
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);
  const [counts, avatars, nextEvents] = await Promise.all([
    // Already in hand when sorting by recommendations — re-reading the same
    // rows a second time would be the only cost of that sort worth avoiding.
    precomputedCounts ?? getSignalCountsForProfiles(ids),
    getRecommenderAvatarsForProfiles(ids),
    getNextEventForHosts(ids),
  ]);

  return rows.map((row) =>
    transformProfile(row, {
      counts: counts.get(row.id) ?? { saves: 0, recommends: 0 },
      recommenderAvatars: avatars.get(row.id) ?? [],
      nextEvent: nextEvents.get(row.id) ?? null,
    })
  );
}

/**
 * Transform Drizzle profile to expected output format
 */
function transformProfile(
  p: ProfileRow & {
    descriptions?: unknown;
    mentoring?: unknown;
  },
  extra: {
    counts: DirectorySignalCounts;
    recommenderAvatars: string[];
    nextEvent: DirectoryEvent | null;
  }
) {
  const descriptions = p.descriptions as ProfileDescriptions | null;
  const mentoring = p.mentoring as ProfileMentoring | null;
  const gallery = (p.galleryImages ?? {}) as Record<string, string | undefined>;

  // /p/[handle] resolves the profile's own screenname first and falls back to
  // the owning user's, so the link has to be built the same way. Reading only
  // the user's would leave a claimed business listing with its own handle
  // unlinked in search while its page exists and works.
  const screenname =
    (p.screenname as string | null) || p.user?.screenname || null;

  const coordinates = extractCoordinates(p);

  return {
    _id: p.id,
    id: p.id,
    name: p.name,
    screenname,
    socials: p.socials,
    five_words: descriptions?.fiveWords,
    details: descriptions?.details,
    images: {
      primaryCDN: p.primaryImageCdn,
    },
    // No cover column exists, so the first gallery photo stands in — the same
    // substitution the profile page makes, so a listing looks like itself in
    // both places.
    coverImage: gallery.gallery1CDN ?? null,
    primary_address: {
      city: p.addressLocality,
    },
    geo: coordinates ? { type: 'Point', coordinates } : null,
    // Carried into search results so a card can suppress "x miles away". An
    // online-only business has no location to visit, and its address on file
    // is typically the owner's home — measuring a distance to it is both
    // wrong and a privacy leak.
    online_only: p.onlineOnly === true,
    categories: categoryKeys(p.categories),
    counties: countyKeys(p.counties),
    certified: p.panaCertifiedAt != null,
    // A listing with a handle has been claimed and has a profile page; one
    // without has neither, and gets the claim CTA instead.
    claimed: screenname != null,
    saves: extra.counts.saves,
    recommends: extra.counts.recommends,
    recommenderAvatars: extra.recommenderAvatars,
    nextEvent: extra.nextEvent
      ? {
          slug: extra.nextEvent.slug,
          title: extra.nextEvent.title,
          startsAt: extra.nextEvent.startsAt.toISOString(),
          timezone: extra.nextEvent.timezone,
          online: extra.nextEvent.online,
          venueCity: extra.nextEvent.venueCity,
        }
      : null,
    mentoring: mentoring
      ? {
          enabled: mentoring.enabled,
          expertise: mentoring.expertise,
          languages: mentoring.languages,
          hourlyRate: mentoring.hourlyRate,
        }
      : undefined,
  };
}
