'use client';

import { ChevronDown, Lock, Map as MapIcon, List, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { KIND_ICON } from '@/components/kind-icon';
import type { SuggestionKind } from '@/lib/suggest';
import { UNIFIED_COUNTS } from '../_data';

export type MockScope = 'all' | SuggestionKind;

const SCOPE_ORDER: MockScope[] = ['all', 'directory', 'pana', 'group', 'event'];

const SCOPE_LABEL: Record<MockScope, string> = {
  all: 'Everything',
  directory: 'Directory',
  pana: 'Panas',
  group: 'Groups',
  event: 'Events',
};

/** Panas and groups are signed-in only, same as the live scope bar. */
const REQUIRES_PANA: Record<MockScope, boolean> = {
  all: false,
  directory: false,
  pana: true,
  group: true,
  event: false,
};

/**
 * Facets are per kind, not per template.
 *
 * The live Directory view shows CATEGORY, WHERE, SORT and a List/Map toggle.
 * The live scope views show none of them — a pana search cannot be narrowed at
 * all once you have typed it. Both are wrong in the same way: they treat the
 * facet rail as a property of which page rendered rather than of what is being
 * filtered. A county filter means something for a listing, a pana and a group
 * that meets somewhere, and nothing for an online group. A map needs
 * coordinates, which listings and events have and panas mostly do not. "This
 * weekend" only exists for events.
 *
 * So each scope takes the rows it can actually answer. Everything takes the
 * intersection rather than offering a Category chip that would silently drop
 * every pana from the results.
 */
const FACETS: Record<MockScope, string[]> = {
  all: ['Where', 'Sort'],
  directory: ['Category', 'Where', 'Sort'],
  pana: ['Interests', 'Where', 'Sort'],
  group: ['Tags', 'Where', 'Sort'],
  event: ['Tags', 'When', 'Where', 'Sort'],
};

/* Sentence case, not caps: `.dirsearch-filterlabel` already applies
   text-transform, and the live bars write "Scope" and "Category". */
const CHIPS: Record<string, string[]> = {
  Category: ['Food', 'Products', 'Services', 'Venues', 'Art'],
  Interests: ['Ceramics', 'Music', 'Film', 'Teaching'],
  Tags: ['Zines', 'Print', 'Free', 'Open to all'],
  When: ['Today', 'This weekend', 'This month'],
  Where: ['Near me', 'Miami-Dade', 'Broward', 'Palm Beach'],
  Sort: ['Best match', 'Closest', 'Newest'],
};

/** Map only makes sense where the things have addresses. */
const HAS_MAP: Record<MockScope, boolean> = {
  all: false,
  directory: true,
  pana: false,
  group: false,
  event: true,
};

/**
 * The summary is a sentence, so it has to count like one. The live Directory
 * page hardcodes " businesses" and reads "1 businesses" at one result; a
 * merged view rendering all four kinds would be wrong four ways.
 */
const NOUN: Record<MockScope, [singular: string, plural: string]> = {
  all: ['result', 'results'],
  directory: ['listing', 'listings'],
  pana: ['pana', 'panas'],
  group: ['group', 'groups'],
  event: ['event', 'events'],
};

const TERM = 'art';

/**
 * The band, kept exactly as it ships today.
 *
 * This is a static reproduction of `scope-page.tsx`'s `SearchBand` and the
 * `ScopeChips` bar, down to the class names — `.dirsearch-band`, the eyebrow,
 * `.dirsearch-title`, `.dirsearch-count`, and the `.directory-suggest-pill`
 * carrying `ScopeMenu` as its leading element with `.dirsearch-chipdivide`
 * after it.
 *
 * Reproduced rather than imported because the real `DirectorySuggest`,
 * `ScopeMenu` and `ScopeChips` all navigate: submitting routes to
 * `/directory/[scope]/[q]` and every chip is a `Link`. In a mock whose entire
 * demonstration is switching scope in place, that would walk the reviewer out
 * of the page on the first click. The markup and the stylesheet are the real
 * ones, so it looks identical; only the hrefs became state.
 *
 * The one deliberate addition is the facet rail below the scope chips, which
 * the scope pages do not have today.
 */
export function UnifiedChrome({
  scope,
  onScope,
  resultCount,
}: {
  scope: MockScope;
  onScope: (next: MockScope) => void;
  resultCount: number;
}) {
  const total = Object.values(UNIFIED_COUNTS).reduce((a, b) => a + b, 0);
  const ScopeIcon = scope === 'all' ? null : KIND_ICON[scope];

  return (
    <>
      <section className="dirsearch-band">
        <div className="container mx-auto px-4">
          <span className="section-eyebrow">Directory</span>

          <h1 className="dirsearch-title">
            <em>{TERM}</em>
            {scope === 'all' ? (
              <> in South Florida</>
            ) : (
              <> — {SCOPE_LABEL[scope].toLowerCase()}</>
            )}
          </h1>

          <p className="dirsearch-count">
            {scope === 'all' ? (
              <>
                <strong>{total}</strong> results across the directory, panas,
                groups and events
              </>
            ) : (
              <>
                <strong>{resultCount}</strong>
                {' of '}
                {total} results are {SCOPE_LABEL[scope].toLowerCase()}
              </>
            )}
          </p>

          {/* The scope control sits inside the pill rather than beside it,
              because scope is part of the question being asked — "panas named
              Maria" is one query, not a query plus a page setting. */}
          <div className="dirsearch-searchrow">
            <form
              className="scroll-mt-24"
              onSubmit={(event) => event.preventDefault()}
            >
              <label htmlFor="mock-unified-input" className="sr-only">
                Search the Pana Mia directory
              </label>
              <div className="directory-suggest-pill directory-suggest-pill-lead">
                <div className="relative shrink-0">
                  <button type="button" className="surface-pill">
                    {ScopeIcon ? (
                      <ScopeIcon className="h-3.5 w-3.5 flex-none" />
                    ) : (
                      <span className="surface-dot" aria-hidden="true" />
                    )}
                    <span className="surface-pill-name">
                      {SCOPE_LABEL[scope]}
                    </span>
                    <ChevronDown
                      className="h-3.5 w-3.5 flex-none transition-transform"
                      aria-hidden="true"
                    />
                  </button>
                </div>

                <span className="dirsearch-chipdivide" aria-hidden="true" />

                <Search
                  className="directory-suggest-pill-icon text-pana-ink h-5 w-5 shrink-0 opacity-45"
                  aria-hidden="true"
                />

                <div className="directory-suggest-field relative w-full">
                  <div className="directory-suggest-input-shell">
                    <Input
                      id="mock-unified-input"
                      type="search"
                      defaultValue={TERM}
                      placeholder="Try art, croqueta, zine, Maria…"
                      autoComplete="off"
                      className="text-pana-ink"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  size="lg"
                  aria-label="Search"
                  className="directory-suggest-pill-button"
                >
                  <Search
                    className="directory-suggest-pill-button-icon h-5 w-5"
                    aria-hidden="true"
                  />
                  <span className="directory-suggest-pill-button-label">
                    Search
                  </span>
                </Button>
              </div>
            </form>
          </div>
        </div>
      </section>

      {/* ScopeChips, unchanged apart from being buttons instead of links. */}
      <div className="dirsearch-filters">
        <div className="container mx-auto px-4">
          <div className="dirsearch-filterrow">
            <span className="dirsearch-filterlabel">Scope</span>
            <nav className="dirsearch-chiprow" aria-label="Search scope">
              {SCOPE_ORDER.map((option) => {
                const Icon =
                  option === 'all' ? null : KIND_ICON[option as SuggestionKind];
                const count =
                  option === 'all'
                    ? total
                    : UNIFIED_COUNTS[option as SuggestionKind];
                return (
                  <button
                    key={option}
                    type="button"
                    className="dirsearch-chip inline-flex items-center gap-1.5"
                    data-on={option === scope}
                    onClick={() => onScope(option)}
                  >
                    {REQUIRES_PANA[option] ? (
                      <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      Icon && (
                        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      )
                    )}
                    {SCOPE_LABEL[option]}
                    <span className="opacity-55">{count}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* New: the rail the scope pages have never had. Same row grammar as
              the directory filter bar, so the two rails are one rail. */}
          {FACETS[scope].map((row) => (
            <div key={row} className="dirsearch-filterrow">
              <span className="dirsearch-filterlabel">{row}</span>
              <div className="dirsearch-chiprow">
                {CHIPS[row].map((chip, index) => (
                  <button
                    key={chip}
                    type="button"
                    className="dirsearch-chip inline-flex items-center gap-1.5"
                    data-on={row === 'Sort' && index === 0}
                  >
                    {chip}
                  </button>
                ))}
                {row === 'Where' && HAS_MAP[scope] && (
                  <>
                    <button
                      type="button"
                      className="dirsearch-chip inline-flex items-center gap-1.5"
                      data-on={true}
                    >
                      <List className="h-3.5 w-3.5" aria-hidden="true" />
                      List
                    </button>
                    <button
                      type="button"
                      className="dirsearch-chip inline-flex items-center gap-1.5"
                      data-on={false}
                    >
                      <MapIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      Map
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* The count the directory page carries in `.dirsearch-summary`. The
          band already says how many results there are, so this says what the
          list below is showing after the facets narrowed it. */}
      <div className="container mx-auto px-4 pt-6">
        <p className="dirsearch-summary" role="status" aria-live="polite">
          <strong>{resultCount}</strong>{' '}
          {NOUN[scope][resultCount === 1 ? 0 : 1]} for <em>{TERM}</em>
        </p>
      </div>
    </>
  );
}
