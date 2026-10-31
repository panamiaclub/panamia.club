import { db } from '@/lib/db';
import { events, profiles, users, venues } from '@/lib/schema';
import {
  countGroups,
  searchGroups as searchSocialGroups,
} from '@/lib/server/group-search';
import {
  and,
  eq,
  gte,
  inArray,
  isNull,
  notInArray,
  or,
  sql,
} from 'drizzle-orm';
import { DIRECTORY_ACCOUNT_TYPES } from '@/lib/accounts';
import { categoryKeys } from '@/lib/server/directory';
import type { Scope, ScopeCounts } from '@/lib/directory-scopes';
import { onlineBusinessLocation } from '@/lib/online-zip';

/**
 * Full-page search for the scopes that are not the business directory.
 *
 * Three functions rather than one generic one, for the same reason
 * lib/server/suggest.ts has four queries rather than a UNION: the kinds share
 * a search box and nothing else. Different tables, different visibility rules,
 * different sort orders, and different ideas of what a result even looks like.
 *
 * The relationship to the other two search layers is worth being explicit
 * about, because there are now three and they are easy to confuse:
 *
 *   suggest.ts       ten rows, per keystroke, ILIKE, all four kinds merged.
 *   directory.ts     the business scope only, tsvector + a pile of facet
 *                    filters reconciled in memory.
 *   this file        one scope at a time, tsvector, full result set, paged.
 *
 * What this shares with directory.ts is the ranking shape, deliberately:
 * the same tsquery built across english/spanish/simple, the same
 * ts_rank_cd weights, and the same exact/prefix name boosts. A pana searching
 * "sazon" should see the same *kind* of ordering whichever scope they are in,
 * even though the rows come from different tables.
 *
 * What it does not share is the in-memory filtering. Those passes exist in
 * directory.ts to reconcile category and county columns that hold several
 * different shapes; events and groups have no such legacy, so their filters
 * stay in SQL and their pagination is a LIMIT/OFFSET rather than a slice of an
 * array that was fully loaded first.
 */

// Mirrors lib/server/directory.ts. ts_rank_cd takes weights in {D,C,B,A}
// order, so these read backwards: D is 0.1 and A is 1.0.
const RANK_WEIGHTS = '{0.1,0.3,0.6,1.0}';

// Large enough to dominate ts_rank_cd, which lands in the 0..1 range in
// practice. An exact name match is not "a very relevant result", it is the
// thing that was asked for, and no amount of term frequency should outrank it.
const EXACT_NAME_BOOST = 1000;
const PREFIX_NAME_BOOST = 100;

export const SCOPE_PAGE_SIZE = 24;

/**
 * The generated tsvector columns, referenced as raw SQL.
 *
 * They are deliberately absent from lib/schema/index.ts — profiles.search_vector
 * has been missing from it since 0040 — and that absence is load-bearing rather
 * than an oversight. Declaring a column there puts it in drizzle's default
 * projection, so every `db.query.events.findMany()` in the codebase would start
 * shipping a tsvector it has no use for. Naming the physical column here keeps
 * the cost where the benefit is.
 *
 * Safe to hardcode the table qualifier because none of the queries below alias
 * their tables; lib/server/directory.ts does the same thing with an alias.
 */
const profileVector = sql`"profiles"."search_vector"`;
const eventVector = sql`"events"."search_vector"`;

/**
 * The tsquery every scope matches against.
 *
 * websearch_to_tsquery rather than plainto_tsquery so quoted phrases and
 * negation work the way people expect from a search box. OR'd across three
 * configurations because a term may be English, Spanish, or a proper noun
 * that no stemmer should touch — see migration 0040 for why the columns are
 * indexed the same three ways.
 *
 * Exported for `searchUpcomingEvents` in lib/event.ts. That one returns full
 * event rows for `EventCard` rather than the flattened `ScopeSearchResult`
 * this file deals in, so it cannot call `searchEvents` — but it must match the
 * same term the same way, or /e would disagree with the typeahead that sent
 * someone there.
 */
export const searchTsQuery = (term: string) => sql`(
  websearch_to_tsquery('english', pana_unaccent(${term}))
  || websearch_to_tsquery('spanish', pana_unaccent(${term}))
  || websearch_to_tsquery('simple',  pana_unaccent(${term}))
)`;

/** Local alias, so the body of this file reads as it always has. */
const tsquery = searchTsQuery;

/**
 * Rank expression shared by all three scopes.
 *
 * `nameColumn` is whatever that kind calls its title, because the boosts are
 * about the name specifically: a group called "Pana MIA Public" must lead the
 * results for "pana mia public" even if some other group's about text repeats
 * those words more often.
 */
const rankExpr = (
  vectorColumn: unknown,
  nameColumn: unknown,
  term: string
) => sql<number>`(
  ts_rank_cd(${RANK_WEIGHTS}::float4[], ${vectorColumn}, ${tsquery(term)})
  + CASE WHEN lower(pana_unaccent(${nameColumn})) = lower(pana_unaccent(${term}))
         THEN ${EXACT_NAME_BOOST} ELSE 0 END
  + CASE WHEN starts_with(lower(pana_unaccent(${nameColumn})), lower(pana_unaccent(${term})))
         THEN ${PREFIX_NAME_BOOST} ELSE 0 END
)`;

/**
 * One result, in the shape the directory card renders.
 *
 * Every field past `href` is a slot the card draws only when it is filled, and
 * the whole point of the list is that the four kinds fill the same slots with
 * different nouns rather than getting four different cards:
 *
 *                business        pana            group           event
 *   subtitle     five words      five words      purpose         —
 *   handle       —               @handle         —               —
 *   where        city            city            —               venue city
 *   when         —               —               —               starts at
 *   blurb        details         details         summary         description
 *   pills        categories      categories      topics          —
 *   signal       —               —               88 members      —
 *   certified    yes/no          yes/no          —               —
 *
 * A blank column is a fact about the data, not about the kind: groups have no
 * place because a group is not anywhere, and events have no member count
 * because attendance is not public. Where a kind genuinely has nothing to put
 * in a slot the row does not render, which is the same rule that already makes
 * the business card differ between a claimed and an unclaimed listing.
 *
 * Distance stays out on purpose. It is measured from the searcher to a
 * listing's address, and three of the four kinds either have no address or do
 * not publish one — the business directory computes it in its own query and
 * keeps it on its own card.
 */
export interface ScopeResult {
  id: string;
  name: string;
  subtitle: string | null;
  href: string;
  imageUrl: string | null;
  /** Second-line metadata the card renders under the subtitle, if any. */
  meta: string | null;
  /** `@handle`, when the kind has one worth disambiguating by. */
  handle: string | null;
  /** Where this is, already formatted — nothing here geocodes. */
  where: string | null;
  /** A moment worth acting on, already formatted in the subject's timezone. */
  when: string | null;
  /** Prose. The card clamps it; this does not truncate. */
  blurb: string | null;
  /** Categories, topics or tags — the same pill row either way. */
  pills: string[];
  /** The community number this kind is measured by, already in words. */
  signal: string | null;
  /**
   * Pana Certified. Only profiles can hold it, but it has to travel with the
   * result: without it a certified business loses its badge the moment it is
   * listed under Everything instead of under Businesses.
   */
  certified: boolean;
}

export interface ScopeSearchResult {
  results: ScopeResult[];
  total: number;
  page: number;
  totalPages: number;
}

const empty = (page: number): ScopeSearchResult => ({
  results: [],
  total: 0,
  page,
  totalPages: 0,
});

function paginate(page: number, pageSize: number) {
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  return { page: safePage, offset: (safePage - 1) * pageSize };
}

/**
 * Panas — the members themselves.
 *
 * Signed-in only. The caller is responsible for establishing that, and passing
 * a viewer who is not signed in is a caller bug rather than something to
 * silently degrade: see the route, which redirects instead. The reasoning is
 * suggest.ts's, unchanged — `lib/accounts` keeps personal accounts out of the
 * public directory because they are people who search it rather than appear in
 * it, and a public page that enumerates the membership would undo that.
 *
 * No new index was needed here. A pana is the same `profiles` row as a
 * business with a different account type, so 0040's search_vector already
 * covers it; this is a filter relaxation, not a new corpus.
 */
export async function searchPanas(
  term: string,
  page = 1,
  pageSize = SCOPE_PAGE_SIZE
): Promise<ScopeSearchResult> {
  const trimmed = term.trim();
  const { page: safePage, offset } = paginate(page, pageSize);
  if (!trimmed) return empty(safePage);

  const handle = sql<
    string | null
  >`COALESCE(${profiles.screenname}, ${users.screenname})`;
  const fiveWords = sql<string | null>`${profiles.descriptions}->>'fiveWords'`;
  const details = sql<string | null>`${profiles.descriptions}->>'details'`;

  const where = and(
    eq(profiles.active, true),
    sql`COALESCE(${profiles.screenname}, ${users.screenname}) IS NOT NULL`,
    // Spread because DIRECTORY_ACCOUNT_TYPES is `as const` and notInArray
    // needs a mutable array of the enum's values.
    notInArray(users.accountType, [...DIRECTORY_ACCOUNT_TYPES]),
    sql`${profileVector} @@ ${tsquery(trimmed)}`
  );

  const [rows, totals] = await Promise.all([
    db
      .select({
        id: profiles.id,
        name: profiles.name,
        screenname: handle,
        primaryImageCdn: profiles.primaryImageCdn,
        addressLocality: profiles.addressLocality,
        fiveWords,
        details,
        categories: profiles.categories,
        panaCertifiedAt: profiles.panaCertifiedAt,
        rank: rankExpr(profileVector, profiles.name, trimmed),
      })
      .from(profiles)
      // Inner, unlike the business search: a pana is defined by the account,
      // so a profile row with no user is by definition not one.
      .innerJoin(users, eq(profiles.userId, users.id))
      .where(where)
      .orderBy(
        sql`${rankExpr(profileVector, profiles.name, trimmed)} DESC`,
        profiles.name
      )
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(profiles)
      .innerJoin(users, eq(profiles.userId, users.id))
      .where(where),
  ]);

  const total = totals[0]?.count ?? 0;
  return {
    results: rows.map((row) => ({
      id: row.id,
      name: row.name,
      // A pana is the same `profiles` row as a business with a different
      // account type, so the same five words describe them — and where a pana
      // has not written any, the handle still says which Maria this is.
      subtitle: row.fiveWords ?? (row.screenname ? `@${row.screenname}` : null),
      // Kept separately as well as in the subtitle fallback: two members can
      // share a display name, but not a handle, so the card shows it beside
      // the name whatever the subtitle ended up being.
      handle: row.screenname ? `@${row.screenname}` : null,
      href: `/p/${row.screenname}`,
      imageUrl: row.primaryImageCdn,
      meta: row.addressLocality,
      where: row.addressLocality,
      when: null,
      blurb: row.details,
      pills: categoryKeys(row.categories),
      signal: null,
      certified: row.panaCertifiedAt != null,
    })),
    total,
    page: safePage,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * Pana Social groups.
 *
 * Delegates to lib/server/group-search.ts for both the rows and the total, so
 * the scope page, the tab count and the typeahead all resolve the same term
 * through one matcher. That module ranks two generated tsvectors against each
 * other with shared weights; a second query here would order the page
 * differently from the dropdown that leads to it.
 *
 * Signed-in only, because /g/[handle] is. Private groups are included —
 * identity fields only, never group content — which is that module's
 * documented stance rather than a relaxation of it.
 */
export async function searchGroups(
  term: string,
  page = 1,
  pageSize = SCOPE_PAGE_SIZE
): Promise<ScopeSearchResult> {
  const trimmed = term.trim();
  const { page: safePage, offset } = paginate(page, pageSize);
  if (!trimmed) return empty(safePage);

  const [rows, total] = await Promise.all([
    searchSocialGroups({ term: trimmed, limit: pageSize, offset }),
    countGroups(trimmed),
  ]);

  return {
    results: rows.map((row) => ({
      id: row.id,
      // A remote group can arrive without a display name; the handle is the
      // only thing guaranteed to be there, and it is what the URL uses.
      name: row.name ?? row.handle,
      subtitle: null,
      handle: `@${row.handle}`,
      href: `/g/${row.handle}`,
      imageUrl: row.iconUrl,
      meta: null,
      // A group is not anywhere. It has members, not an address, so the place
      // row stays empty rather than being filled with something invented.
      where: null,
      when: null,
      blurb: row.summary,
      // Topics are the group's own free-form tags, not directory categories,
      // so they are not run through `categoryKeys` — there is no canonical
      // list to reconcile them against.
      pills: Object.entries(row.topics)
        .filter(([, on]) => on === true)
        .map(([topic]) => topic),
      signal: row.memberCount
        ? `${row.memberCount} ${row.memberCount === 1 ? 'member' : 'members'}`
        : null,
      certified: false,
    })),
    total,
    page: safePage,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * Upcoming events.
 *
 * Public, filtered to exactly what /e/[slug] shows a stranger: published,
 * public — not unlisted, whose whole point is to be reachable only by someone
 * holding the link — and not already over.
 *
 * Sorted by date, not by rank, and that is the one place this scope
 * deliberately departs from the others. Among events that all match the term,
 * the soonest is nearly always the one meant; "which Saturday market" is a
 * question about the next one. Rank still decides *membership* in the result
 * set, it just doesn't decide the order within it.
 */
export async function searchEvents(
  term: string,
  page = 1,
  pageSize = SCOPE_PAGE_SIZE
): Promise<ScopeSearchResult> {
  const trimmed = term.trim();
  const { page: safePage, offset } = paginate(page, pageSize);
  if (!trimmed) return empty(safePage);

  const where = and(
    eq(events.status, 'published'),
    eq(events.visibility, 'public'),
    gte(events.startsAt, new Date()),
    sql`${eventVector} @@ ${tsquery(trimmed)}`
  );

  const [rows, totals] = await Promise.all([
    db
      .select({
        id: events.id,
        slug: events.slug,
        title: events.title,
        description: events.description,
        coverImage: events.coverImage,
        startsAt: events.startsAt,
        timezone: events.timezone,
        mode: events.mode,
        venueName: venues.name,
        venueCity: venues.city,
      })
      .from(events)
      // Left: online-only events have no venue row, and an inner join would
      // hide an entire event mode from search.
      .leftJoin(venues, eq(venues.id, events.venueId))
      .where(where)
      .orderBy(events.startsAt)
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(events)
      .leftJoin(venues, eq(venues.id, events.venueId))
      .where(where),
  ]);

  const total = totals[0]?.count ?? 0;
  return {
    results: rows.map((row) => {
      const online = row.mode === 'online';
      // Venue then city, because "Bakehouse Art Complex · Wynwood" answers
      // both "where is it" and "do I know it" where either alone answers one.
      const place = online
        ? 'Online'
        : [row.venueName, row.venueCity].filter(Boolean).join(' · ') || null;

      return {
        id: row.id,
        name: row.title,
        subtitle: null,
        handle: null,
        href: `/e/${row.slug}`,
        imageUrl: row.coverImage,
        meta: online ? 'Online' : row.venueCity,
        where: place,
        when: formatEventWhen(row.startsAt, row.timezone),
        blurb: row.description,
        // An event's topics live on the groups and businesses hosting it
        // rather than on the event itself, so there is nothing honest to pill.
        pills: [],
        // Attendance is not public, so there is no number to show.
        signal: null,
        certified: false,
      };
    }),
    total,
    page: safePage,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * How soon an event is, in the event's own timezone.
 *
 * Same reasoning as suggest.ts's copy: an event in Miami is on the day Miami
 * says it is, regardless of where it is being searched from, and this renders
 * on the server so it cannot depend on the reader's clock.
 */
function formatEventWhen(startsAt: Date, timezone: string): string | null {
  if (Number.isNaN(startsAt.getTime())) return null;
  try {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: timezone,
    }).format(startsAt);
  } catch {
    // An invalid tz in one row must not take the whole page down with it.
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }).format(startsAt);
  }
}

/**
 * Businesses, as plain ranked rows.
 *
 * Deliberately *not* the function behind /directory/search. That page is the
 * directory proper: county and category facets, a map, distance sorting, the
 * whole apparatus in getSearch(). This is the stripped-down version the
 * "Everything" scope needs, where businesses are one of four short lists and
 * none of that apparatus has anywhere to live.
 *
 * Having two is the honest outcome. Threading an "omit the facets" flag
 * through getSearch() would make the directory's main query answer to a
 * caller that wants none of what it does.
 *
 * The visibility predicate, though, is copied from getSearch() exactly and has
 * to stay copied: active, reachable at a handle, and not a personal account.
 * If that one changes, this must too.
 */
export async function searchDirectory(
  term: string,
  page = 1,
  pageSize = SCOPE_PAGE_SIZE
): Promise<ScopeSearchResult> {
  const trimmed = term.trim();
  const { page: safePage, offset } = paginate(page, pageSize);
  if (!trimmed) return empty(safePage);

  const handle = sql<string>`COALESCE(${profiles.screenname}, ${users.screenname})`;
  const fiveWords = sql<string | null>`${profiles.descriptions}->>'fiveWords'`;
  const details = sql<string | null>`${profiles.descriptions}->>'details'`;

  const where = and(
    eq(profiles.active, true),
    sql`COALESCE(${profiles.screenname}, ${users.screenname}) IS NOT NULL`,
    or(
      isNull(profiles.userId),
      inArray(users.accountType, DIRECTORY_ACCOUNT_TYPES)
    ),
    sql`${profileVector} @@ ${tsquery(trimmed)}`
  );

  const ranking = rankExpr(profileVector, profiles.name, trimmed);

  const [rows, totals] = await Promise.all([
    db
      .select({
        id: profiles.id,
        name: profiles.name,
        handle,
        fiveWords,
        details,
        categories: profiles.categories,
        addressLocality: profiles.addressLocality,
        onlineOnly: profiles.onlineOnly,
        addressPostalCode: profiles.addressPostalCode,
        panaCertifiedAt: profiles.panaCertifiedAt,
        primaryImageCdn: profiles.primaryImageCdn,
      })
      .from(profiles)
      // Left, not inner: an unclaimed listing keeps profiles.userId NULL
      // permanently, and an inner join would drop the directory's main
      // content type before any filter above runs.
      .leftJoin(users, eq(profiles.userId, users.id))
      .where(where)
      .orderBy(sql`${ranking} DESC`, profiles.name)
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(profiles)
      .leftJoin(users, eq(profiles.userId, users.id))
      .where(where),
  ]);

  const total = totals[0]?.count ?? 0;
  return {
    results: rows.map((row) => ({
      id: row.id,
      name: row.name,
      subtitle: row.fiveWords,
      handle: null,
      href: `/p/${row.handle}`,
      imageUrl: row.primaryImageCdn,
      meta: row.addressLocality,
      // The same sentence the business card uses, so a business reads the
      // same in the Everything scope as it does in the directory proper.
      where: row.onlineOnly
        ? onlineBusinessLocation(row.addressPostalCode)
        : row.addressLocality,
      when: null,
      blurb: row.details,
      pills: categoryKeys(row.categories),
      // Recommend and save counts are a second query per page in the
      // directory proper. The Everything scope shows four businesses among
      // twelve other things; it is not worth that round trip here.
      signal: null,
      certified: row.panaCertifiedAt != null,
    })),
    total,
    page: safePage,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * Directory listings that match, counted but not fetched.
 *
 * Used only to label the directory tab from another scope, so the count is
 * honest about what pressing it will show. Mirrors getSearch()'s account
 * type predicate exactly; if that one changes, this must too.
 */
export async function countDirectory(term: string): Promise<number> {
  const trimmed = term.trim();
  if (!trimmed) return 0;

  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(profiles)
    .where(
      and(
        eq(profiles.active, true),
        or(
          // Unclaimed legacy listings predate accounts entirely — no user row
          // to carry an account type, but listings by definition.
          isNull(profiles.userId),
          inArray(
            profiles.userId,
            db
              .select({ id: users.id })
              .from(users)
              .where(inArray(users.accountType, DIRECTORY_ACCOUNT_TYPES))
          )
        ),
        sql`${profileVector} @@ ${tsquery(trimmed)}`
      )
    );

  return rows[0]?.count ?? 0;
}

/** Count panas matching, for the scope tab label. Signed-in callers only. */
export async function countPanas(term: string): Promise<number> {
  const trimmed = term.trim();
  if (!trimmed) return 0;
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(profiles)
    .innerJoin(users, eq(profiles.userId, users.id))
    .where(
      and(
        eq(profiles.active, true),
        sql`COALESCE(${profiles.screenname}, ${users.screenname}) IS NOT NULL`,
        notInArray(users.accountType, [...DIRECTORY_ACCOUNT_TYPES]),
        sql`${profileVector} @@ ${tsquery(trimmed)}`
      )
    );
  return rows[0]?.count ?? 0;
}

/**
 * Count groups matching, for the scope tab label.
 *
 * Re-exported rather than reimplemented so the count and the page cannot drift
 * apart — see the note on countGroups in lib/server/group-search.ts.
 */
export { countGroups };

/** Count upcoming public events matching, for the scope tab label. */
export async function countEvents(term: string): Promise<number> {
  const trimmed = term.trim();
  if (!trimmed) return 0;
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(events)
    .where(
      and(
        eq(events.status, 'published'),
        eq(events.visibility, 'public'),
        gte(events.startsAt, new Date()),
        sql`${eventVector} @@ ${tsquery(trimmed)}`
      )
    );
  return rows[0]?.count ?? 0;
}

/** A kind that could not be searched at all, as opposed to one that matched
 *  nothing. `null` results and the `unavailable` set below both mean the
 *  former; zero and an empty result list both mean the latter.
 *
 *  An alias for `Scope` rather than a narrowing of it. It was
 *  `Exclude<Scope, 'all'>` while the scope list carried an Everything option
 *  that was a view over the other four rather than a kind anything could be
 *  searched as. The option is gone, so every scope is now a searchable kind;
 *  the name survives because the `unavailable` set and the per-kind runners
 *  below read better saying "kind" than "scope". */
export type ScopeKind = Scope;

export interface ScopeCountsResult {
  counts: ScopeCounts;
  /** Kinds whose query threw. Empty in the normal case. */
  unavailable: ReadonlySet<ScopeKind>;
}

/**
 * Run one kind's query, and treat a thrown query as that kind being down
 * rather than as the whole page being down.
 *
 * The directory searches four kinds backed by four different sets of database
 * objects, and they do not ship or migrate in lockstep: `events.search_vector`
 * arrived in 0049, `social_*.search_vector` in 0045, `profiles.search_vector`
 * back in 0040. A deploy that lands code before its migration leaves exactly
 * one of them missing — and before this, that single missing column threw out
 * of `countAllScopes`, which every scoped route awaits before it renders
 * anything, so all five routes returned 500 while three of the four kinds were
 * perfectly searchable.
 *
 * Degrading per kind is not the same as hiding the failure: the error is
 * logged, and callers get `unavailable` so the page can say which part of
 * search is down instead of quietly reporting "no matches", which would be a
 * lie about the data rather than a statement about the outage.
 */
async function perKind<T>(
  kind: ScopeKind,
  run: () => Promise<T>,
  onFailure: T,
  failed: Set<ScopeKind>
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    console.error(`Directory search unavailable for kind "${kind}":`, error);
    failed.add(kind);
    return onFailure;
  }
}

/**
 * Every scope's result count for one term, for the scope bar.
 *
 * Runs the four counts concurrently. `viewerIsSignedIn` is the only access
 * input, exactly as in getSuggestions: the members-only scopes report zero to
 * an anonymous visitor rather than a real count, because the count itself
 * leaks how many members match a name.
 *
 * Keyed by scope rather than by table so the bar can index it with the scope
 * it is rendering, and there is one vocabulary — `pana`, not `panas` here and
 * `pana` there — across the route, the chips and the menu.
 *
 * A kind whose count throws reports zero and is named in `unavailable`; see
 * perKind for why one kind's outage must not decide the whole page's fate.
 */
export async function countAllScopes(
  term: string,
  viewerIsSignedIn: boolean
): Promise<ScopeCountsResult> {
  const unavailable = new Set<ScopeKind>();
  const [directory, pana, group, event] = await Promise.all([
    perKind('directory', () => countDirectory(term), 0, unavailable),
    viewerIsSignedIn
      ? perKind('pana', () => countPanas(term), 0, unavailable)
      : Promise.resolve(0),
    viewerIsSignedIn
      ? perKind('group', () => countGroups(term), 0, unavailable)
      : Promise.resolve(0),
    perKind('event', () => countEvents(term), 0, unavailable),
  ]);
  return { counts: { directory, pana, group, event }, unavailable };
}

/**
 * One kind's results, or `null` if that kind could not be searched.
 *
 * The null is the honest answer and the reason this does not just return
 * `empty(page)`: a caller that cannot tell "nothing matched" from "this index
 * is missing" can only render the wrong one of those two sentences.
 */
export async function searchKindSafely(
  kind: ScopeKind,
  term: string,
  page: number,
  pageSize: number
): Promise<ScopeSearchResult | null> {
  const failed = new Set<ScopeKind>();
  const run = () => {
    switch (kind) {
      case 'directory':
        return searchDirectory(term, page, pageSize);
      case 'pana':
        return searchPanas(term, page, pageSize);
      case 'group':
        return searchGroups(term, page, pageSize);
      case 'event':
        return searchEvents(term, page, pageSize);
    }
  };
  const result = await perKind<ScopeSearchResult | null>(
    kind,
    run,
    null,
    failed
  );
  return result;
}
