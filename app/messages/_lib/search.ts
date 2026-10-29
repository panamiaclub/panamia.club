/**
 * Searching existing conversations and the New message person picker.
 *
 * "Which of my conversations is this?" is answered locally and instantly --
 * the threads are already in memory, so going to the network to re-filter an
 * array the client is holding would add latency to the only part of this that
 * could be immediate.
 *
 * "Who else could I write to?" cannot be answered locally at all, because a
 * pana the viewer has never messaged appears in no list this page has loaded.
 * That half goes to /api/social/actors/search.
 *
 * The sidebar filters existing threads. The explicit New message dialog
 * offers existing matches alongside people from the same actor-search API.
 *
 * @see docs/CHAT-ROADMAP.md
 */

/** The slice of an actor these helpers compare against. */
export interface SearchableActor {
  id: string;
  username: string;
  name?: string | null;
}

/**
 * Fold a raw box value into something comparable.
 *
 * The leading '@' is stripped because a handle is displayed with one and
 * typed with one but stored without: a member who types "@maria" is searching
 * for "maria", and a miss on the sigil would be the most confusing possible
 * miss -- the term looks more precise, not less.
 */
export function normalizeSearchTerm(raw: string): string {
  return raw.trim().replace(/^@+/, '').toLowerCase();
}

/**
 * Does this actor answer to this term?
 *
 * Display name and handle both count. Matching the handle alone is the
 * tempting simplification -- it is what the actor-search endpoint did before
 * this change -- and it fails the most ordinary search there is, because
 * members think of each other by name while handles frequently contain no
 * part of one.
 */
export function actorMatchesTerm(
  actor: SearchableActor,
  term: string
): boolean {
  if (!term) return true;
  return (
    actor.username.toLowerCase().includes(term) ||
    (actor.name ?? '').toLowerCase().includes(term)
  );
}

/** Existing threads whose counterparty answers to the term. */
export function filterConversations<T extends { actor: SearchableActor }>(
  entries: T[],
  term: string
): T[] {
  if (!term) return entries;
  return entries.filter((entry) => actorMatchesTerm(entry.actor, term));
}

/**
 * People worth offering as a NEW conversation.
 *
 * Two exclusions, and both exist to avoid drawing a row that cannot do what
 * it appears to offer.
 *
 * Anyone already listed above is dropped, or the same person appears twice in
 * one panel -- once as a thread with history, once as a stranger to start
 * fresh with -- and picking the second opens the first.
 *
 * The viewer is dropped because the conversation endpoint answers 404 for a
 * thread with yourself (it compares viewerActorId to the counterparty before
 * it looks anything up), so the row would be a dead end that fails silently.
 * The actor-search endpoint returns you on purpose -- it was built for
 * voice-memo recipients, where messaging yourself is a legitimate thing to
 * want -- so this is the caller's exclusion to make rather than a bug there.
 */
export function newConversationCandidates<T extends SearchableActor>(
  results: T[],
  {
    existing,
    viewerActorId,
  }: {
    existing: readonly { actor: SearchableActor }[];
    viewerActorId: string | null;
  }
): T[] {
  const already = new Set(existing.map((entry) => entry.actor.id));
  return results.filter(
    (actor) => actor.id !== viewerActorId && !already.has(actor.id)
  );
}
