import { db } from '@/lib/db';
import { events, profiles, users, venues } from '@/lib/schema';
import { searchGroups } from '@/lib/server/group-search';
import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNull,
  notInArray,
  or,
  sql,
} from 'drizzle-orm';
import { DIRECTORY_ACCOUNT_TYPES } from '@/lib/accounts';
import { listingPublicPath } from '@/lib/listing-url';
import { scopesToSearch, type Scope } from '@/lib/directory-scopes';
import {
  SUGGEST_LIMIT,
  SUGGESTION_KINDS,
  type Suggestion,
  type SuggestionKind,
} from '@/lib/suggest';

/**
 * Search autocomplete — the typeahead behind the search box.
 *
 * Deliberately not `getSearch()`: that one loads every active profile and
 * filters in JS, which is fine for a single submit but not for a request per
 * keystroke. Each query below selects only the columns a suggestion row
 * renders, pushes the match into SQL, and caps its own result set.
 *
 * Four kinds come back through one list. They are fetched independently and
 * merged in `mergeSuggestions`, rather than UNION'd, because the kinds have
 * almost nothing in common at the SQL level: different tables, different
 * visibility rules, different notions of "matches", and — for events — a sort
 * by date rather than by name.
 */

// Enough of each kind that a lopsided term still fills the list from one
// source, while the merge below is what decides the actual mix.
const PER_KIND_LIMIT = SUGGEST_LIMIT;

/**
 * Escape a user term for use inside a LIKE pattern.
 *
 * The term is bound as a parameter, so it can't inject SQL — but LIKE still
 * interprets `%` and `_` inside the bound value, so a search for "50_50" would
 * silently match "5000". Paired with an explicit ESCAPE clause below.
 */
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Why every comparison below is wrapped in pana_unaccent().
 *
 * ILIKE folds case but not diacritics, so `'Taller Lucía' ILIKE '%lucia%'` is
 * false. A member typing on a US keyboard — which is most of them, most of the
 * time — got an empty typeahead for any business whose name carries an accent,
 * while pressing Enter found it, because getSearch() unaccents both sides.
 * Miami's directory is full of these: Café, Bodegón, Peluquería, Lucía, José.
 *
 * Unaccenting both sides rather than just the column is deliberate, and is
 * what getSearch() does. Column-only would fix "lucia" -> "Lucía" but break
 * the mirror case, where someone typing "Lucía" on a Spanish keyboard or a
 * phone misses a listing stored without the accent.
 *
 * It also aligns the profile name predicate with the index built for this very
 * query shape: 0041_profile_name_trigram.sql creates a GIN gin_trgm_ops index
 * on pana_unaccent(name) so an `ILIKE '%term%'` on a name can use it, and that
 * migration warns the query must filter on the same expression the index
 * stores or the index is dead weight. The bare column could never have.
 *
 * Measured rather than assumed, and the alignment alone does not buy the
 * scan. Given the name predicate on its own the planner does choose
 * profiles_name_trgm_idx (confirmed with enable_seqscan=off; on a small table
 * it costs out a seq scan first). In the OR'd shape the business query
 * actually issues it bitmap-scans profiles_active_idx and applies all three
 * ILIKEs as a filter, because the two jsonb expressions have no index to OR
 * against. So this makes the name predicate indexable, not indexed. That is
 * worth having as the table grows, or if those jsonb columns are ever indexed,
 * but it is not a performance fix today and shouldn't be cited as one.
 *
 * The events and groups tables have no trigram index, and deliberately get
 * none here: both are small enough that a sequential scan of a name column
 * costs less than the write amplification an index would add. Revisit if
 * either grows by an order of magnitude.
 *
 * That still holds, but it is no longer the whole story: 0044 gave both tables
 * a tsvector and a GIN index anyway. Not for speed -- on these row counts the
 * seq scan above is still the cheaper plan, and this suggest query keeps using
 * ILIKE. It was added because the scoped results pages behind this typeahead
 * match on phrases rather than prefixes, and substring matching answers those
 * badly. Two different queries with two different jobs, deliberately using two
 * different mechanisms. See 0044's header before collapsing them.
 *
 * pana_unaccent is STRICT, so a null `about` or description still yields null
 * and is still excluded, exactly as the bare column was. It is also IMMUTABLE
 * (0040) — the wrapper exists because unaccent() itself is only STABLE.
 */
function patterns(term: string) {
  const escaped = escapeLike(term);
  return { contains: `%${escaped}%`, prefix: `${escaped}%` };
}

const like = (column: unknown, pattern: string) =>
  sql`pana_unaccent(${column}) ILIKE pana_unaccent(${pattern}) ESCAPE '\\'`;

/**
 * Name matches first, and a name that starts with the term ahead of one that
 * merely contains it — "Dan" should lead with Dana, not with a bio that
 * mentions Dan halfway through. Unaccented for the same reason as the filter:
 * otherwise "lucia" would match Taller Lucía in the WHERE and then rank it
 * below every bio mention, which reads as a worse bug than not finding it.
 */
const nameRank = (column: unknown, term: string) => {
  const { contains, prefix } = patterns(term);
  return sql`CASE
    WHEN pana_unaccent(${column}) ILIKE pana_unaccent(${prefix}) ESCAPE '\\' THEN 0
    WHEN pana_unaccent(${column}) ILIKE pana_unaccent(${contains}) ESCAPE '\\' THEN 1
    ELSE 2
  END`;
};

// /p/[handle] resolves the profile's own screenname first and falls back to
// its owner's, the same order lib/server/directory.ts uses. A directory listing
// carries its handle here because it has no user row to carry one.
const handle = sql<
  string | null
>`COALESCE(${profiles.screenname}, ${users.screenname})`;

/**
 * Directory listings: shops, makers, bands, co-ops, non-profits.
 *
 * Public: this is the directory, and the directory is the thing anonymous
 * visitors come to browse.
 */
async function suggestDirectory(term: string): Promise<Suggestion[]> {
  const { contains } = patterns(term);

  // `descriptions` is jsonb, so the searchable text comes out via ->>.
  const fiveWords = sql<string | null>`${profiles.descriptions}->>'fiveWords'`;
  const tags = sql<string | null>`${profiles.descriptions}->>'tags'`;

  const rows = await db
    .select({
      id: profiles.id,
      name: profiles.name,
      screenname: handle,
      primaryImageCdn: profiles.primaryImageCdn,
      addressLocality: profiles.addressLocality,
      fiveWords,
    })
    .from(profiles)
    // Left, not inner: a directory listing submitted through
    // /form/get-listed keeps profiles.userId NULL permanently and is
    // administered through profileOwners, so an inner join drops the
    // directory's main content type before any filter below runs.
    .leftJoin(users, eq(profiles.userId, users.id))
    .where(
      and(
        // Also the gate on unapproved submissions: intake writes
        // active: false, so nothing reaches the typeahead until it is live.
        eq(profiles.active, true),
        // Personal accounts are panas, and are suggested as panas below — to
        // signed-in visitors only. A listing with no user carries no account
        // type to test and is a listing by definition, the same reasoning
        // getSearch() applies.
        or(
          isNull(profiles.userId),
          inArray(users.accountType, DIRECTORY_ACCOUNT_TYPES)
        ),
        or(
          like(profiles.name, contains),
          like(fiveWords, contains),
          like(tags, contains)
        )
      )
    )
    .orderBy(nameRank(profiles.name, term), asc(profiles.name))
    .limit(PER_KIND_LIMIT);

  return rows.map((row) => ({
    kind: 'directory' as const,
    id: row.id,
    name: row.name,
    subtitle:
      [row.fiveWords, row.addressLocality].filter(Boolean).join(' · ') || null,
    href: listingPublicPath(row),
    imageUrl: row.primaryImageCdn,
  }));
}

/**
 * Panas — the members themselves.
 *
 * Signed-in only, and that gate is the whole reason this is a separate query
 * from the businesses above rather than a relaxed filter on it. `lib/accounts`
 * keeps personal accounts out of the public directory on the grounds that they
 * are people who search it rather than appear in it, and an anonymous
 * typeahead that enumerates the membership would undo that in the one place
 * nobody would think to look. Every pana is discoverable — to another pana.
 *
 * Every signed-in member has a profile row (see
 * app/api/user/screenname/set/route.ts) created active with a handle, so the
 * only rows this drops are accounts that never finished picking a screenname
 * and therefore have no /p page to send anyone to.
 */
async function suggestPanas(term: string): Promise<Suggestion[]> {
  const { contains } = patterns(term);

  const rows = await db
    .select({
      id: profiles.id,
      name: profiles.name,
      screenname: handle,
      primaryImageCdn: profiles.primaryImageCdn,
      addressLocality: profiles.addressLocality,
    })
    .from(profiles)
    // Inner, unlike the business query: a pana is defined by the account, so a
    // row with no user is by definition not one.
    .innerJoin(users, eq(profiles.userId, users.id))
    .where(
      and(
        eq(profiles.active, true),
        sql`COALESCE(${profiles.screenname}, ${users.screenname}) IS NOT NULL`,
        // Spread because DIRECTORY_ACCOUNT_TYPES is `as const`, and
        // notInArray only accepts a mutable array of the enum's values.
        notInArray(users.accountType, [...DIRECTORY_ACCOUNT_TYPES]),
        or(
          like(profiles.name, contains),
          like(profiles.screenname, contains),
          like(users.screenname, contains)
        )
      )
    )
    .orderBy(nameRank(profiles.name, term), asc(profiles.name))
    .limit(PER_KIND_LIMIT);

  return rows.map((row) => ({
    kind: 'pana' as const,
    id: row.id,
    // The handle rather than the city: a directory listing is a place you go
    // and a pana is an account you follow, so the identifier is the useful
    // second line. Two members can share a display name; they cannot share a
    // handle.
    subtitle: row.screenname ? `@${row.screenname}` : null,
    name: row.name,
    href: `/p/${row.screenname}`,
    imageUrl: row.primaryImageCdn,
  }));
}

/**
 * Pana Social groups.
 *
 * Delegates to lib/server/group-search.ts rather than running its own query.
 * That module is the one place the two generated tsvectors are ranked against
 * each other, and the weights that make the sum meaningful are only correct if
 * every caller uses them — a second query here with its own ORDER BY would
 * order groups differently in the dropdown than on the page they lead to.
 *
 * Signed-in only, because /g/[handle] is: the surface answers a stranger with
 * a sign-in wall, so an anonymous suggestion would be an offer the destination
 * refuses. The caller enforces that, not this function.
 *
 * Private groups are included, which is deliberate and is main's stance, not a
 * relaxation of it: identity fields only, never group content. A private group
 * with an open request policy is unusable if nobody can find it to ask. See
 * the note on GROUP_COLUMNS in group-search.ts before narrowing this.
 */
async function suggestGroups(term: string): Promise<Suggestion[]> {
  const rows = await searchGroups({ term, limit: PER_KIND_LIMIT });

  return rows.map((row) => ({
    kind: 'group' as const,
    id: row.id,
    name: row.name ?? row.handle,
    subtitle: row.summary,
    href: `/g/${row.handle}`,
    imageUrl: row.iconUrl,
  }));
}

/**
 * How soon an event is, in the words someone would use.
 *
 * Mirrors formatWhen in app/directory/search/_lib/format.ts, but computed on
 * the server and in the event's own timezone: a suggestion row is rendered
 * from a cacheable API response, so it cannot depend on the reader's clock the
 * way a client component can, and an event in Miami is on the day Miami says
 * it is regardless of where it is being searched from.
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
    // An invalid tz in the row must not take the whole typeahead down with it.
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }).format(startsAt);
  }
}

/**
 * Upcoming events.
 *
 * Public, matching /e/[slug] itself, and filtered to exactly what that page
 * shows a stranger: published, public — not unlisted, whose whole point is to
 * be reachable only by someone holding the link — and not already over. Past
 * events are dropped rather than ranked low: "which Saturday market" is a
 * question about the next one, and a suggestion you cannot attend is noise.
 *
 * Sorted by date rather than by name, because among events that all match the
 * term the soonest is nearly always the one meant.
 */
async function suggestEvents(term: string): Promise<Suggestion[]> {
  const { contains } = patterns(term);

  const rows = await db
    .select({
      id: events.id,
      slug: events.slug,
      title: events.title,
      coverImage: events.coverImage,
      startsAt: events.startsAt,
      timezone: events.timezone,
      mode: events.mode,
      venueCity: venues.city,
    })
    .from(events)
    // Left: online-only events have no venue row, and dropping them would hide
    // an entire event mode from search.
    .leftJoin(venues, eq(venues.id, events.venueId))
    .where(
      and(
        eq(events.status, 'published'),
        eq(events.visibility, 'public'),
        gte(events.startsAt, new Date()),
        or(like(events.title, contains), like(events.description, contains))
      )
    )
    .orderBy(asc(events.startsAt))
    .limit(PER_KIND_LIMIT);

  return rows.map((row) => {
    const when = formatEventWhen(row.startsAt, row.timezone);
    const where = row.mode === 'online' ? 'Online' : row.venueCity;
    return {
      kind: 'event' as const,
      id: row.id,
      name: row.title,
      subtitle: [when, where].filter(Boolean).join(' · ') || null,
      href: `/e/${row.slug}`,
      imageUrl: row.coverImage,
    };
  });
}

/**
 * Interleave the kinds into one capped list.
 *
 * Round-robin rather than concatenate-and-truncate. Concatenation makes the
 * list a function of whichever kind happens to be listed first: a term like
 * "market" matches a dozen businesses, and ten of them would fill every slot
 * and hide the market *event* this Saturday, which is very likely what was
 * meant. Taking one from each kind in turn guarantees that every kind with a
 * match is represented before any kind gets a second row, and self-balances
 * when a kind has few or no matches — its turn is simply skipped and the slot
 * goes to whoever is next.
 *
 * Within a kind the order the query returned is preserved, so position 0 of
 * each kind is still that kind's best match.
 */
export function mergeSuggestions(
  byKind: Record<SuggestionKind, Suggestion[]>,
  limit = SUGGEST_LIMIT
): Suggestion[] {
  const merged: Suggestion[] = [];
  const depth = Math.max(...SUGGESTION_KINDS.map((k) => byKind[k].length), 0);

  for (let round = 0; round < depth && merged.length < limit; round += 1) {
    for (const kind of SUGGESTION_KINDS) {
      if (merged.length >= limit) break;
      const row = byKind[kind][round];
      if (row) merged.push(row);
    }
  }

  return merged;
}

/**
 * Each kind's query, reachable by name.
 *
 * The four functions above are independently callable and always were; this
 * only lets a caller that has a kind in hand -- rather than a hardcoded list
 * of four -- ask for it. Typed as a total `Record`, so a fifth kind added to
 * `SUGGESTION_KINDS` fails to compile here instead of quietly never being
 * searched.
 */
const KIND_QUERY: Record<
  SuggestionKind,
  (term: string) => Promise<Suggestion[]>
> = {
  directory: suggestDirectory,
  pana: suggestPanas,
  group: suggestGroups,
  event: suggestEvents,
};

/** Every kind present and empty, so the merge sees a total record either way. */
function emptyByKind(): Record<SuggestionKind, Suggestion[]> {
  return { directory: [], pana: [], group: [], event: [] };
}

/**
 * Every suggestion a given viewer is allowed to see, already merged and capped.
 *
 * Two access inputs, and they are not peers. `viewerIsSignedIn` is the
 * server's own answer, read from the session; `scope` is whatever the query
 * string asked for and is therefore the caller's to lie about. `scopesToSearch`
 * is where they meet, and is the only thing here permitted to decide which
 * kinds run -- so a signed-out `?scope=pana` comes back empty rather than
 * coming back with panas.
 *
 * WHY A SCOPE NARROWS TO ONE KIND, since the opposite was deliberate.
 *
 * This started as a federated box: no scope control existed, so every search
 * asked all four kinds and `mergeSuggestions` round-robined them into one
 * list. That was the right design for a "jump to anything" field and the
 * round-robin below is still written for it.
 *
 * The scope control was then built around this box without ever being wired
 * into it, which left the two disagreeing in public: picking Events and typing
 * "music" returned directory listings, under a chip reading Events, above a
 * row offering to search the directory. The control named one kind and the
 * list ignored it.
 *
 * So the scope now selects, and the cost is accepted rather than unnoticed:
 * Events with no matches shows an empty list where it used to show businesses.
 * The alternative on the table was falling back to the other kinds when a
 * scope came up empty, and it was rejected -- a list that silently changes
 * subject is the original bug wearing a better excuse. The box searches
 * exactly what the control says, including when the answer is nothing.
 *
 * An absent scope keeps the federated behaviour, and that is not nostalgia:
 * clients running the previous bundle send no scope, and they go on working
 * for as long as they are out there.
 *
 * WHY GROUPS ARE NO LONGER GATED HERE, which is a visible change.
 *
 * This function used to substitute an empty list for groups as well as panas
 * when the viewer was signed out. That was a second copy of an access rule,
 * and it had drifted from the one `visibleScopes` keeps: `SCOPE_REQUIRES_PANA`
 * marks only panas members-only, and `GET /api/social/groups` is deliberately
 * unauthenticated, serving these same identity-only rows -- private groups
 * included -- through this same `searchGroups`, so that a group with an open
 * request policy can be found by the people meant to ask to join it.
 *
 * So the gate was not protecting the data; the same rows were already a public
 * endpoint away. What it did do was leave a signed-out visitor who picked
 * Groups -- a scope the menu offers them, because `visibleScopes` says it is
 * public -- staring at a dropdown that could never fill. Deleting it is what
 * removing the duplicate means, and it settles that disagreement the way the
 * canonical rule already answered it. Panas stay gated, and are the only kind
 * that is.
 */
export async function getSuggestions(
  term: string,
  {
    viewerIsSignedIn,
    scope = null,
  }: { viewerIsSignedIn: boolean; scope?: Scope | null }
): Promise<Suggestion[]> {
  const kinds = scopesToSearch(scope, viewerIsSignedIn);

  // Not short-circuited for the single-kind case, even though the merge of one
  // list is that list. Going through the same path means a scoped answer and a
  // federated one are capped and ordered by the same code, and leaves one
  // place to change if the cap ever stops being per-kind.
  const rows = await Promise.all(kinds.map((kind) => KIND_QUERY[kind](term)));

  const byKind = emptyByKind();
  kinds.forEach((kind, index) => {
    byKind[kind] = rows[index];
  });

  return mergeSuggestions(byKind);
}
