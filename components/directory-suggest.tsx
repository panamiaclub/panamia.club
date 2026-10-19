'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Search, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { KIND_ICON } from '@/components/kind-icon';
import { cn } from '@/lib/utils';
import {
  DEFAULT_SCOPE,
  scopePath,
  searchForScopeKey,
  type Scope,
} from '@/lib/directory-scopes';
import {
  MIN_TERM_LENGTH,
  kindLabelKey,
  type Suggestion,
  type SuggestionKind,
} from '@/lib/suggest';

export type { Suggestion as DirectorySuggestion };

interface DirectorySuggestBaseProps {
  /** Visible-to-screen-readers-only label for the input. */
  label: string;
  placeholder: string;
  /**
   * Cycles these phrases in place of `placeholder`, one at a time.
   *
   * The caller decides whether a rotation is wanted at all — this component
   * does not look at the viewport or at `prefers-reduced-motion`, it just
   * rotates what it is handed. Pass nothing to keep the static placeholder.
   */
  placeholderRotation?: string[];
  ariaLabel: string;
  /** Applied to the <form>, so callers keep control of width and placement. */
  className?: string;
  inputClassName?: string;
  /**
   * Which kind this box searches — both what the suggestions are drawn from
   * and where pressing Enter lands.
   *
   * It governs the list as well as the submit as of this change. It used to
   * govern only the submit, which meant picking Events and typing "music"
   * suggested businesses: the control named one kind and the dropdown
   * federated all four. The scope goes to the suggest endpoint now, so the
   * two agree.
   *
   * Defaults to the directory, which is what a caller that predates scopes
   * meant and is the safe assumption for a field that has not thought about
   * it. Every caller in the tree passes its own; the default exists so a new
   * one has to decide rather than inherit a federated search silently.
   *
   * The scope pages pass their own, so a search run from inside Events stays
   * in Events rather than silently changing the subject. The home hero and the
   * Pana Social masthead hold it in state beside a `ScopeMenu`, so it follows
   * whatever the visitor picked.
   */
  scope?: Scope;
  /**
   * What the field starts with.
   *
   * The results pages pass the term they are showing, so landing on a result
   * set and wanting to narrow it means editing the words rather than typing
   * them again. Uncontrolled after mount — this seeds the field, it does not
   * own it, so typing is never fighting a prop.
   */
  initialTerm?: string;
  /**
   * Rendered inside the pill, ahead of the magnifier, with a divider after it.
   *
   * The scope pages put their scope selector here rather than beside the bar.
   * Scope is part of the question — "panas named Maria" is one query, not a
   * query plus a page setting — and two adjacent capsules say the opposite of
   * that. `pill` and `masthead` only: `stacked` has no surface to sit in.
   *
   * The masthead took this late. It was excluded on the grounds that a 2.125rem
   * bar had no room for a second control, which was true of the trigger as it
   * stood rather than of the bar; `ScopeMenu`'s `compact` variant fits, so the
   * field offers the choice its placeholder was already narrowing for.
   */
  leading?: ReactNode;
  /**
   * Runs instead of navigating, when the caller is already the results page.
   *
   * The business directory keeps its filters, sort and map view in the query
   * string and updates them in place. Routing it to `scopePath` would land on
   * the same route it is already on and drop every one of those — searching
   * again would silently clear your filters. So it hands us the shallow
   * update it already uses and we call that instead of `router.push`.
   *
   * Only the submit path is overridden. Picking a suggestion still navigates
   * to that business, pana, group or event, which is the whole point of it.
   */
  onSearch?: (term: string) => void;
}

/**
 * `stacked` (default) puts the button beside the input as its own control.
 * `pill` merges the two into a single rounded bar, as the homepage hero does —
 * the button sits inside the input's surface rather than next to it.
 * `masthead` is the surface header's field: a magnifier and an input in one
 * short bar, with no button at all, because chrome that repeats on every page
 * cannot afford a second control's width.
 *
 * Spelled as a union so the button's label is required exactly when there is a
 * button to put it on — a `masthead` caller has nothing to pass it for, and the
 * other two would otherwise be free to render an unlabelled control.
 *
 * `leading` is deliberately not part of this union. It lives on the base props
 * because `pill` and `masthead` both take one, and the union exists to track
 * the button rather than the leading slot: a masthead carries a scope control
 * without ever gaining a `buttonLabel`.
 */
type DirectorySuggestProps = DirectorySuggestBaseProps &
  (
    | { layout?: 'stacked' | 'pill'; buttonLabel: string }
    | { layout: 'masthead'; buttonLabel?: never }
  );

// Long enough that a fast typist finishes a word first, short enough that the
// list still feels attached to the keystroke.
//
// Measured at 200 and lowered: the server answers a warm suggest in ~90-100ms,
// so a 200ms timer was more than half the time between the keystroke and the
// list — the part of the wait the product chose rather than paid for. At 120
// the total lands near 210ms, which is inside the window where the list still
// reads as a response to typing rather than an arrival. Going lower stops
// helping and starts costing: the requests a fast typist skips past are the
// whole reason to debounce, and below ~100ms too few get skipped.
const DEBOUNCE_MS = 120;

const FALLBACK_IMAGE = '/img/bg_coconut_blue.jpg';

/**
 * An in-memory cache of answered terms, so backspacing is free.
 *
 * A signed-in visitor gets `private, no-store` from the suggest route, on
 * purpose: the response carries the members-only half — panas and groups — and
 * the browser's disk cache is the wrong place for that on a shared device. The
 * cost of that stance is that the people it protects are the only ones with no
 * caching at all, and deleting a character to widen a search is the single most
 * common thing anyone does in a typeahead. Every one of those was a round trip
 * that re-asked a question answered a second earlier.
 *
 * This buys the reuse back without touching disk. It lives in memory, in one
 * tab, and is gone when the document is.
 *
 * Module-level rather than a ref because the field unmounts on every
 * navigation — it sits in the masthead and in both results pages — and a
 * per-instance cache would be empty exactly when someone searches, lands, and
 * searches again from the page they landed on.
 *
 * The TTL is the honest part. Signing out usually reloads the document, which
 * takes this with it, but `DeleteAccountForm` calls `signOut({ redirect:
 * false })` and leaves the tab standing — so entries expire on their own
 * rather than relying on a navigation that one path does not do. Sixty seconds
 * is also well inside the five minutes the same route already lets a shared
 * cache keep the anonymous answer, so nothing here is held longer than
 * something already on the wire.
 */
const SUGGEST_CACHE_TTL_MS = 60_000;

/** Bounded so a long session of typing cannot grow this without limit. */
const SUGGEST_CACHE_MAX = 50;

const suggestCache = new Map<string, { at: number; rows: Suggestion[] }>();

/**
 * The cache key, which is the scope and the term rather than the term.
 *
 * The term alone was right while the endpoint answered the same thing for
 * every scope. It stopped being right the moment the scope reached the query:
 * switching Directory to Events and retyping a term asked in the first scope
 * would hand back the first scope's rows under the second scope's chip --
 * which is the bug the scope parameter exists to fix, reintroduced one layer
 * closer to the user and harder to see, because no request goes out to
 * disagree with.
 *
 * A NUL separator rather than a colon, so no scope and term can collide with
 * a different scope and term: the scope is one of four known words and the
 * term is arbitrary typed text, and `"directory:x"` is reachable two ways if
 * the separator is a character someone can type.
 */
const suggestCacheKey = (scope: Scope, term: string) => `${scope}\u0000${term}`;

/** Returns null for a miss or an expired entry, which read the same here. */
function readSuggestCache(scope: Scope, term: string): Suggestion[] | null {
  const key = suggestCacheKey(scope, term);
  const hit = suggestCache.get(key);
  if (!hit) return null;

  if (Date.now() - hit.at > SUGGEST_CACHE_TTL_MS) {
    suggestCache.delete(key);
    return null;
  }

  // Re-insert to move this key to the end: `Map` iterates in insertion order,
  // which is what makes the eviction below drop the least recently used term
  // rather than the one that happens to have been asked first.
  suggestCache.delete(key);
  suggestCache.set(key, hit);
  return hit.rows;
}

function writeSuggestCache(
  scope: Scope,
  term: string,
  rows: Suggestion[]
): void {
  const key = suggestCacheKey(scope, term);
  suggestCache.delete(key);
  suggestCache.set(key, { at: Date.now(), rows });

  while (suggestCache.size > SUGGEST_CACHE_MAX) {
    const oldest = suggestCache.keys().next().value;
    if (oldest === undefined) break;
    suggestCache.delete(oldest);
  }
}

/** One frozen empty list, so a scope with no rows is a stable reference. */
const NO_SUGGESTIONS: Suggestion[] = [];

// Listings and panas are faces and storefronts, and read as circles
// everywhere else in the product. Groups and events are things rather than
// someone, and a cover image cropped to a circle loses most of itself.
const KIND_IMAGE_SHAPE: Record<SuggestionKind, string> = {
  directory: 'rounded-full',
  pana: 'rounded-full',
  group: 'rounded-lg',
  event: 'rounded-lg',
};

// One phrase is readable in well under a second; the rest of the dwell is so
// the box is not visibly churning in the corner of someone's eye while they
// read the headline above it.
const ROTATION_MS = 2600;

/**
 * A placeholder that rolls through several phrases instead of stating one.
 *
 * On a phone the field is about 140px wide, which is too narrow to list what
 * the directory holds in a single line — so the line takes turns instead.
 *
 * It is a real element rather than a swapped `placeholder` attribute because
 * the attribute can only be cut between values, and a hard cut inside a form
 * field reads as a glitch. It is `aria-hidden` and the input keeps its own
 * `aria-label`, so nothing here reaches assistive tech as moving text.
 */
function RotatingPlaceholder({
  phrases,
  paused,
}: {
  phrases: string[];
  paused: boolean;
}) {
  // `previous` is the phrase on its way out and `tick` restarts the
  // animations, so all three move together in one update rather than as
  // separate states that can land a frame apart.
  const [state, setState] = useState({ index: 0, previous: -1, tick: 0 });

  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => {
      setState((current) => ({
        index: (current.index + 1) % phrases.length,
        previous: current.index,
        tick: current.tick + 1,
      }));
    }, ROTATION_MS);
    return () => window.clearInterval(id);
  }, [paused, phrases.length]);

  // A language switch can hand over a shorter list than the index was built
  // against, so the first phrase stands in rather than rendering nothing.
  const phraseAt = (index: number) => phrases[index] ?? phrases[0];

  return (
    <span className="directory-suggest-rotator" aria-hidden="true">
      <span className="directory-suggest-rotator-window">
        <span
          key={`in-${state.tick}`}
          className={
            state.tick === 0
              ? 'directory-suggest-rotator-line'
              : 'directory-suggest-rotator-line is-entering'
          }
        >
          {phraseAt(state.index)}
        </span>

        {state.previous >= 0 && (
          <span
            key={`out-${state.tick}`}
            className="directory-suggest-rotator-line is-leaving"
          >
            {phraseAt(state.previous)}
          </span>
        )}
      </span>
    </span>
  );
}

/**
 * Search box with a typeahead dropdown over the whole club.
 *
 * Suggests businesses, panas, groups and events in one list. Panas and groups
 * only come back for a signed-in visitor — the API decides that, not this
 * component, so there is nothing here to keep in step with a session.
 *
 * Follows the ARIA combobox-with-listbox pattern: focus never leaves the
 * input, arrow keys move `aria-activedescendant`, and a polite live region
 * announces the result count. The suggestions are a shortcut, not a
 * replacement — the last row and a bare Enter both fall through to the full
 * /directory/search results page.
 *
 * WORKS WITHOUT JAVASCRIPT. The form is a real GET to /directory/search with a
 * real `name="q"`, so a submit before the bundle lands — or on a page with
 * scripting off — is an ordinary document navigation to the query-string form
 * of the results page. Once hydrated, `handleSubmit` preventDefaults and routes
 * to the canonical path form instead, so `action` only ever fires as the
 * fallback. This is what lets the masthead field, which used to be a plain GET
 * form for exactly that reason, become a typeahead without losing anything.
 */
export function DirectorySuggest({
  label,
  placeholder,
  placeholderRotation,
  ariaLabel,
  buttonLabel,
  className,
  inputClassName,
  layout = 'stacked',
  scope = DEFAULT_SCOPE,
  initialTerm = '',
  leading,
  onSearch,
}: DirectorySuggestProps) {
  const router = useRouter();
  const { t } = useTranslation('common');

  // Ids have to be per-instance: the masthead carries this component on every
  // page of a surface, so a page that also has one in its body would otherwise
  // hold two inputs with one id, and `htmlFor`, `aria-controls` and
  // `aria-activedescendant` would all resolve to whichever came first.
  const baseId = useId();
  const inputId = `${baseId}-input`;
  const listboxId = `${baseId}-listbox`;
  const optionId = useCallback(
    (index: number) => `${baseId}-option-${index}`,
    [baseId]
  );

  const [term, setTerm] = useState(initialTerm);
  /**
   * The rows, tagged with the scope they were fetched for.
   *
   * Tagged rather than bare because the scope is a live control: someone can
   * have "music" typed with directory rows on screen and then pick Events,
   * and those rows are wrong the instant they do. Untagged they would sit
   * under the new chip until the debounce and the round trip replaced them --
   * briefly showing exactly the mismatch this change exists to remove, in the
   * one moment someone is looking straight at the control.
   *
   * Derived rather than cleared in an effect so there is no frame where the
   * two disagree: a scope that does not match reads as no rows immediately, on
   * the same render that moved the chip.
   */
  const [fetched, setFetched] = useState<{ scope: Scope; rows: Suggestion[] }>({
    scope,
    rows: [],
  });
  const suggestions = fetched.scope === scope ? fetched.rows : NO_SUGGESTIONS;
  const [open, setOpen] = useState(false);
  // -1 means "nothing highlighted": Enter then submits the typed term rather
  // than picking a row the visitor never moved to.
  const [activeIndex, setActiveIndex] = useState(-1);
  // Only used to freeze the rotating placeholder. Once someone is in the box,
  // a hint that keeps moving is competing with what they came to type.
  const [focused, setFocused] = useState(false);

  const rotationPhrases = placeholderRotation ?? [];
  // The rotation stands in for the placeholder, so it lives by the same rule:
  // gone the moment there is a term to read underneath it.
  const rotating = rotationPhrases.length > 1 && term.length === 0;

  const rootRef = useRef<HTMLFormElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  /**
   * Every destination this box offers is a server-rendered route, and the
   * scope pages await a session, four counts and four searches before they
   * emit any markup. Outside a transition `router.push` blocks on that whole
   * payload: the URL does not change, the button does not move, and nothing
   * on screen says the click registered — which reads as a dead control, so
   * people click it again.
   *
   * The transition hands us `navigating` for the span the router is actually
   * working, which the button below spends on saying so. It does not make the
   * navigation quicker; it makes the wait legible, and it keeps this page
   * interactive while the next one is fetched instead of freezing it.
   */
  const [navigating, startNavigation] = useTransition();

  const trimmed = term.trim();
  // The trailing "search for this term" row is an option too, so it can be
  // arrowed to and is counted in the keyboard bounds below.
  const optionCount = suggestions.length + 1;
  const searchRowIndex = suggestions.length;

  const close = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  // A seeded field holds a term nobody typed, and the effect below cannot tell
  // the difference. Without this, every results page would fire a suggest
  // request on load for the term it is already showing results for — and the
  // list would sit ready to open under a field the visitor has not touched.
  const typedRef = useRef(false);
  const seeded = !typedRef.current && term === initialTerm;

  // Fetch suggestions, debounced. Every run aborts the previous request, so a
  // slow response for "da" can't land after a fast one for "dana" and repaint
  // the list with stale rows.
  useEffect(() => {
    if (seeded || trimmed.length < MIN_TERM_LENGTH) {
      abortRef.current?.abort();
      setFetched({ scope, rows: NO_SUGGESTIONS });
      return;
    }

    // A term already answered is painted now rather than after the debounce.
    // The timer exists to skip requests a fast typist types past; there is no
    // request to skip here, and waiting 120ms to render rows already in memory
    // would be the delay this cache exists to remove.
    const cached = readSuggestCache(scope, trimmed);
    if (cached) {
      abortRef.current?.abort();
      setFetched({ scope, rows: cached });
      setActiveIndex(-1);
      return;
    }

    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        // The scope goes with the term, so the list under the control agrees
        // with the control. Without it the server federates all four kinds and
        // the chip is decoration.
        const response = await fetch(
          `/api/directory/suggest?q=${encodeURIComponent(trimmed)}&scope=${encodeURIComponent(scope)}`,
          { signal: controller.signal }
        );
        const body = await response.json();
        const rows: Suggestion[] = body.success ? (body.data ?? []) : [];
        // Only a real answer is kept. Caching the empty list a failed lookup
        // falls back to would turn one bad response into a minute of them.
        if (body.success) writeSuggestCache(scope, trimmed, rows);
        setFetched({ scope, rows });
        setActiveIndex(-1);
      } catch (error) {
        if ((error as Error)?.name === 'AbortError') return;
        // The box still submits without suggestions, so a failed lookup just
        // empties the list instead of surfacing an error.
        setFetched({ scope, rows: NO_SUGGESTIONS });
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [trimmed, seeded, scope]);

  // Close on an outside click. Blur alone isn't enough — clicking an option is
  // itself a blur, and the option's own handler needs to win.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (!rootRef.current?.contains(event.target as Node)) close();
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [open, close]);

  // Keep the highlighted row visible. Focus never moves off the input, so the
  // browser does no scrolling of its own — without this, arrowing past the
  // capped height would move an activedescendant nobody can see.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    document
      .getElementById(optionId(activeIndex))
      ?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex, optionId]);

  useEffect(() => () => abortRef.current?.abort(), []);

  /**
   * On a phone, pull the search box up to the top of the viewport on focus.
   *
   * The home hero is tall enough that the input lands near the bottom of the
   * fold, leaving no room below it for a dropdown. Browsers do scroll a focused
   * input into view when the on-screen keyboard opens, but how much varies by
   * browser, so this makes the room deterministically rather than hoping.
   *
   * Not in the masthead, which is sticky at the top of the viewport already:
   * there the field cannot be any higher than it is, and scrolling to it would
   * throw the page back to the top for nothing.
   */
  function revealOnSmallScreens() {
    if (layout === 'masthead') return;
    if (!window.matchMedia('(max-width: 767px)').matches) return;
    rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function goToSearch() {
    if (!trimmed) return;
    close();
    if (onSearch) {
      onSearch(trimmed);
      return;
    }
    startNavigation(() => {
      router.push(scopePath(scope, trimmed));
    });
  }

  function goToSuggestion(suggestion: Suggestion) {
    close();
    setTerm(suggestion.name);
    startNavigation(() => {
      router.push(suggestion.href);
    });
  }

  function selectIndex(index: number) {
    if (index === searchRowIndex) {
      goToSearch();
      return;
    }
    const suggestion = suggestions[index];
    if (suggestion) goToSuggestion(suggestion);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (open && activeIndex >= 0) {
      selectIndex(activeIndex);
      return;
    }
    goToSearch();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!open && trimmed.length >= MIN_TERM_LENGTH) {
          setOpen(true);
          setActiveIndex(0);
          return;
        }
        setActiveIndex((index) => (index + 1) % optionCount);
        return;
      case 'ArrowUp':
        event.preventDefault();
        if (!open) return;
        setActiveIndex((index) =>
          index <= 0 ? optionCount - 1 : (index - 1) % optionCount
        );
        return;
      case 'Escape':
        // Only swallow the key when there is a popup to dismiss, so Escape
        // keeps its native "clear the search input" behavior otherwise.
        if (open) {
          event.preventDefault();
          close();
        }
        return;
      case 'Tab':
        close();
        return;
      default:
    }
  }

  const showList = open && trimmed.length >= MIN_TERM_LENGTH;

  /**
   * The wiring every layout's input needs.
   *
   * Kept in one object because two layouts render the styled `Input` and the
   * masthead renders a bare `<input>` — the shadcn defaults are a bordered
   * 40px box, which is the opposite of a field that has to disappear into a
   * 34px pill. The ARIA that makes this a combobox is exactly the part that
   * must not drift between the two, so it is written once.
   */
  const inputProps: React.ComponentProps<'input'> = {
    id: inputId,
    type: 'text',
    // A real field name, for the no-JS GET on the form above. Matches the ?q=
    // spelling the results page already accepts.
    name: 'q',
    role: 'combobox',
    autoComplete: 'off',
    // Mobile keyboard hints. type="search" would add a native clear button
    // that sits on top of the dropdown, so the search affordance comes from
    // enterKeyHint instead. Autocorrect on a directory of proper nouns does
    // more harm than good.
    enterKeyHint: 'search',
    autoCorrect: 'off',
    autoCapitalize: 'off',
    spellCheck: false,
    'aria-expanded': showList,
    'aria-controls': listboxId,
    'aria-autocomplete': 'list',
    'aria-activedescendant':
      showList && activeIndex >= 0 ? optionId(activeIndex) : undefined,
    value: term,
    onChange: (event) => {
      typedRef.current = true;
      setTerm(event.target.value);
      setOpen(true);
      setActiveIndex(-1);
    },
    onKeyDown: handleKeyDown,
    onFocus: () => {
      setFocused(true);
      if (!seeded && trimmed.length >= MIN_TERM_LENGTH) setOpen(true);
      revealOnSmallScreens();
    },
    onBlur: () => setFocused(false),
    // Blanked while the rotation is up so the two are never drawn on top of
    // each other. The accessible name comes from `aria-label` either way, so
    // screen readers get one stable string rather than a placeholder that
    // changes under them.
    placeholder: rotating ? '' : placeholder,
    'aria-label': ariaLabel,
  };

  return (
    <form
      ref={rootRef}
      role="search"
      // The fallback path, not the normal one: `handleSubmit` preventDefaults
      // once hydrated. Until then this is a plain GET to the query-string form
      // of the results page, which is what the field does with scripting off.
      // scopePath with an empty term gives the scope's bare route, which is
      // exactly the page that reads ?q=.
      action={scopePath(scope, '')}
      method="get"
      onSubmit={handleSubmit}
      // The masthead has no submit button to carry a spinner, so the form
      // itself is what announces an in-flight navigation there.
      aria-busy={navigating}
      // scroll-mt clears the sticky site header when revealOnSmallScreens runs.
      className={cn('scroll-mt-24', className)}
    >
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <div
        className={
          layout === 'pill'
            ? cn(
                'directory-suggest-pill',
                leading && 'directory-suggest-pill-lead'
              )
            : layout === 'masthead'
              ? // `contents` rather than a box: the masthead pill is itself the
                // flex row, sized and padded by `.panaverse-search`, and this
                // wrapper exists only because the other two layouts need one.
                // Dissolving it leaves the icon and the field as that row's own
                // children, which is the markup the stylesheet was written for.
                'contents'
              : 'flex flex-col items-center justify-center gap-4 md:flex-row'
        }
      >
        {/* Inside the pill rather than beside it, so scope and term read as
            one question. The divider does the work the gap between two
            separate capsules used to do.

            The masthead gets the same pair. Because that branch is `contents`,
            these land as direct flex children of `.panaverse-search` — the
            scope control, the divider, the magnifier and the input are one
            row, which is the markup the masthead stylesheet is written for. */}
        {(layout === 'pill' || layout === 'masthead') && leading && (
          <>
            {leading}
            <span
              className={cn(
                'dirsearch-chipdivide',
                layout === 'masthead' && 'dirsearch-chipdivide-compact'
              )}
              aria-hidden="true"
            />
          </>
        )}

        {/* A magnifier at the head of the pill. The button already says
            "Search", but it sits at the far right of a 720px bar, so on a
            wide screen the left end of the field has nothing on it saying
            what it is. Pill layout only: the stacked layout puts the icon on
            the button instead, where that field is narrow enough not to need
            one. */}
        {layout === 'pill' && (
          <Search
            className={cn(
              'directory-suggest-pill-icon text-pana-ink h-5 w-5 shrink-0 opacity-45',
              // The inset is the pill's own padding when something leads it.
              !leading && 'ml-6'
            )}
            aria-hidden="true"
          />
        )}

        {/* The masthead has no button at all, so its magnifier is the only
            thing saying what the bar is. */}
        {layout === 'masthead' && (
          <Search className="panaverse-search-icon" aria-hidden="true" />
        )}

        {/* `directory-suggest-field` rather than a positional selector: the
            icon above is now the pill's first child, so the stylesheet needs
            to name the field to keep the dropdown anchored to the whole pill
            instead of to the magnifier. */}
        <div className="directory-suggest-field relative w-full">
          {/* The shell is the rotating placeholder's positioning context. It
              wraps the input alone, never the listbox below — the listbox
              deliberately resolves against the whole pill so it spans the bar
              rather than stopping at the field. */}
          <div className="directory-suggest-input-shell">
            {layout === 'masthead' ? (
              <input
                {...inputProps}
                className={cn('panaverse-search-input', inputClassName)}
              />
            ) : (
              // `text-pana-ink` because the field paints a white background but
              // would otherwise inherit its colour: dropped into `.surface-indigo`
              // — the hero — it inherits cream and types invisibly on white.
              // Only shows once the field holds a value, which is why it
              // survived until the scope pages started seeding one, back when
              // those bands still carried `.surface-indigo` too.
              <Input
                {...inputProps}
                className={cn('text-pana-ink', inputClassName)}
              />
            )}

            {rotating && (
              <RotatingPlaceholder phrases={rotationPhrases} paused={focused} />
            )}
          </div>

          {showList && (
            <ul
              id={listboxId}
              role="listbox"
              aria-label={label}
              // Height is capped rather than left to the row count: a full ten
              // rows is taller than a phone viewport once the keyboard is up,
              // which buried the "search for this term" row below the fold.
              // Scrolls internally instead, and overscroll-contain stops that
              // scroll from chaining to the page behind it.
              // The class carries no styles of its own; it is the hook the
              // home hero uses to drop its own clip while this panel is open.
              // See `.home-hero-banner:has(.directory-suggest-list)`.
              className="directory-suggest-list bg-popover text-popover-foreground absolute top-full right-0 left-0 z-50 mt-2 max-h-[min(60vh,22rem)] overflow-y-auto overscroll-contain rounded-xl border shadow-lg"
            >
              {suggestions.map((suggestion, index) => {
                const KindIcon = KIND_ICON[suggestion.kind];
                const kindLabel = t(kindLabelKey(suggestion.kind));
                return (
                  <li
                    // Ids are only unique within their own table, so the kind
                    // has to be part of the key — an event and a profile can
                    // hold the same cuid.
                    key={`${suggestion.kind}:${suggestion.id}`}
                    id={optionId(index)}
                    role="option"
                    aria-selected={index === activeIndex}
                    // Pointer-down rather than click: click fires after blur,
                    // and the outside-click handler would have closed the list
                    // first.
                    onMouseDown={(event) => {
                      event.preventDefault();
                      goToSuggestion(suggestion);
                    }}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 px-3 py-2 text-left',
                      index === activeIndex && 'bg-accent'
                    )}
                  >
                    <span className="relative shrink-0">
                      <img
                        src={suggestion.imageUrl || FALLBACK_IMAGE}
                        alt=""
                        aria-hidden="true"
                        className={cn(
                          'h-10 w-10 object-cover',
                          KIND_IMAGE_SHAPE[suggestion.kind]
                        )}
                      />
                      {/* The badge sits in the same corner on every row, so
                          the kind can be read down the list in one pass rather
                          than found separately on each. Its own background and
                          ring keep it legible over a photo of anything. */}
                      <span
                        className="bg-background ring-background absolute -right-1 -bottom-1 flex h-5 w-5 items-center justify-center rounded-full shadow-sm ring-2"
                        aria-hidden="true"
                      >
                        <KindIcon className="h-3 w-3" />
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {suggestion.name}
                      </span>
                      {suggestion.subtitle && (
                        <span className="text-muted-foreground block truncate text-sm">
                          {suggestion.subtitle}
                        </span>
                      )}
                    </span>
                    {/* The word behind the icon. Sighted users have the badge;
                        without this a screen reader hears four identically
                        shaped rows and no way to tell a pana from an event. */}
                    <span className="sr-only">{kindLabel}</span>
                  </li>
                );
              })}

              <li
                id={optionId(searchRowIndex)}
                role="option"
                aria-selected={activeIndex === searchRowIndex}
                onMouseDown={(event) => {
                  event.preventDefault();
                  goToSearch();
                }}
                onMouseEnter={() => setActiveIndex(searchRowIndex)}
                // Pinned to the bottom of the scroll area so the escape hatch
                // to the full results page is reachable without scrolling past
                // ten suggestions. py-3 keeps it at a 44px touch target.
                className={cn(
                  'bg-popover sticky bottom-0 flex cursor-pointer items-center gap-2 px-3 py-3 text-left text-sm',
                  suggestions.length > 0 && 'border-t',
                  activeIndex === searchRowIndex && 'bg-accent'
                )}
              >
                <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">
                  {t(searchForScopeKey(scope), { term: trimmed })}
                </span>
              </li>
            </ul>
          )}

          {/* Screen readers get the count; sighted users get the list itself. */}
          <div role="status" aria-live="polite" className="sr-only">
            {showList
              ? t('search.resultsAvailable', { count: suggestions.length })
              : ''}
          </div>
        </div>

        {/* No button in the masthead: chrome that repeats on every page of a
            surface cannot spend the width, and the magnifier plus Enter are
            what a header search is expected to answer to anyway. */}
        {layout !== 'masthead' && (
          <Button
            type="submit"
            size="lg"
            // Guards against the double-click a slow route invites, and pairs
            // the spinner with the state a screen reader can act on.
            disabled={navigating}
            aria-busy={navigating}
            aria-label={layout === 'pill' ? buttonLabel : undefined}
            className={
              layout === 'pill' ? 'directory-suggest-pill-button' : 'px-8'
            }
          >
            {navigating ? (
              <Loader2
                className={cn(
                  'h-5 w-5 animate-spin',
                  layout === 'stacked' && 'mr-2'
                )}
                aria-hidden="true"
              />
            ) : layout === 'stacked' ? (
              <Search className="mr-2 h-5 w-5" aria-hidden="true" />
            ) : (
              layout === 'pill' && (
                <Search
                  className="directory-suggest-pill-button-icon h-5 w-5"
                  aria-hidden="true"
                />
              )
            )}
            <span
              className={
                layout === 'pill'
                  ? 'directory-suggest-pill-button-label'
                  : undefined
              }
            >
              {buttonLabel}
            </span>
          </Button>
        )}
      </div>
    </form>
  );
}
