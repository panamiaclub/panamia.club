'use client';

import { ArrowRight, ChevronDown, Lock, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { KIND_ICON } from '@/components/kind-icon';
import {
  EXPLORE_SCOPES,
  SCOPE_BLURB,
  SCOPE_COUNTS,
  SCOPE_DESTINATION,
  SCOPE_LABEL,
  SCOPE_REQUIRES_PANA,
  SCOPE_TONE,
  type ExploreScope,
} from '../_data';

/**
 * The search field, with the scope toggle inside it.
 *
 * This is the whole proposal in one component. Today this control lives on
 * `/directory/search` and on the four `/directory/[scope]` pages, which means
 * the only way to discover that the club has events, groups and members is to
 * first search for a business and then notice a chip row above the results.
 * The club's biggest, most-used input — the one in the middle of the
 * homepage — offers no choice at all.
 *
 * So the toggle moves to the front door, and the pages it opens move apart.
 *
 * Three things changed from the live `ScopeMenu`, and each is a consequence of
 * that move rather than a redesign for its own sake:
 *
 * 1. **No "Everything".** Argued at length on `EXPLORE_SCOPES` in `_data.ts`.
 *    Short version: the menu promised four kinds and Enter delivered one, and
 *    this is the half of that contradiction worth keeping.
 *
 * 2. **Each row names its destination.** The live menu's scopes are four
 *    spellings of one results page, so where you land needs no explanation.
 *    These four are different products — one has a map, one has a calendar,
 *    one has a join button — and a control that changes which product you are
 *    in should say so before Enter rather than after.
 *
 * 3. **It is a button, not a `<Link>`.** The live menu's items are links
 *    precisely because each scope is a real, shareable route, and that stays
 *    true in the real build. Here they are buttons because the mock's entire
 *    demonstration is moving between these views, and a link would walk the
 *    reviewer out of the page on the first click.
 *
 * Built from `.directory-suggest-pill-lead`, `.surface-pill`, `.surface-panel`
 * and `.surface-option` — the shipping primitives, down to the class names, so
 * what you are looking at is the real thing with its hrefs turned into state.
 */
export function ScopeField({
  scope,
  onScope,
  term,
  onTerm,
  open,
  onOpen,
  signedIn,
  placeholder,
  idPrefix,
}: {
  scope: ExploreScope;
  onScope: (next: ExploreScope) => void;
  term: string;
  onTerm: (next: string) => void;
  open: boolean;
  onOpen: (next: boolean) => void;
  signedIn: boolean;
  placeholder: string;
  /** Keeps label/input ids unique when two fields are on screen at once. */
  idPrefix: string;
}) {
  const CurrentIcon = KIND_ICON[scope];
  const inputId = `${idPrefix}-input`;
  const menuId = `${idPrefix}-menu`;

  return (
    <form
      className="relative scroll-mt-24"
      onSubmit={(event) => event.preventDefault()}
    >
      <label htmlFor={inputId} className="sr-only">
        Search Pana MIA
      </label>

      <div className="directory-suggest-pill directory-suggest-pill-lead">
        <div className="relative shrink-0">
          <button
            type="button"
            className="surface-pill"
            data-tone={SCOPE_TONE[scope]}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-controls={open ? menuId : undefined}
            aria-label={`Search scope, currently ${SCOPE_LABEL[scope]}`}
            onClick={() => onOpen(!open)}
          >
            <CurrentIcon
              className="h-3.5 w-3.5 flex-none"
              style={{ color: 'var(--surface-tone)' }}
              aria-hidden="true"
            />
            <span className="surface-pill-name">{SCOPE_LABEL[scope]}</span>
            <ChevronDown
              className="h-3.5 w-3.5 flex-none transition-transform"
              style={{ transform: open ? 'rotate(180deg)' : undefined }}
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
              id={inputId}
              type="search"
              value={term}
              onChange={(event) => onTerm(event.target.value)}
              placeholder={placeholder}
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
          <span className="directory-suggest-pill-button-label">Search</span>
        </Button>
      </div>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Search scope"
          /* `directory-suggest-scopemenu` carries no styling of its own. It is
             a hook for the hero's `:has()` un-clip rule in globals.css, and it
             is load-bearing: `.home-hero-banner` and `.home-hero-field` are
             both `overflow: hidden`, the hero is `min-height: 100svh` so the
             pill always sits near its bottom edge, and without the hook this
             panel renders 33px tall with the rest sheared off.
             
             That rule already existed for the typeahead (`.directory-suggest-
             list`) for exactly this reason — moving the scope toggle into the
             hero gives the hero a second panel to let out, so the real build
             has to widen that selector too. Found by building this mock. */
          className="surface-panel directory-suggest-scopemenu"
          /* Same override the live ScopeMenu carries, and for the same reason:
             `.surface-panel` is written for the masthead, where it hangs off
             the right edge and claims z-index 30 — enough to beat page content
             but not the sticky filter strip, which also claims 30 and wins the
             tie by coming later in the DOM. 45 clears both. */
          style={{
            top: 'calc(100% + 0.6rem)',
            left: 0,
            right: 'auto',
            zIndex: 45,
            width: '23rem',
            maxWidth: 'calc(100vw - 2rem)',
            textAlign: 'left',
          }}
        >
          <p className="surface-panel-label">Search for</p>

          <div className="flex flex-col gap-1">
            {EXPLORE_SCOPES.map((option) => {
              const gated = SCOPE_REQUIRES_PANA[option] && !signedIn;
              const Icon = KIND_ICON[option];
              const isCurrent = option === scope;

              const body = (
                <>
                  {gated ? (
                    <Lock
                      className="text-pana-ink/40 h-4 w-4 flex-none"
                      aria-hidden="true"
                    />
                  ) : (
                    <Icon
                      className="h-4 w-4 flex-none"
                      style={{ color: 'var(--surface-tone)' }}
                      aria-hidden="true"
                    />
                  )}

                  <span className="min-w-0 flex-1">
                    <span className="surface-option-head">
                      <span className="surface-option-name">
                        {SCOPE_LABEL[option]}
                      </span>
                      {!gated && (
                        <span
                          className="ml-auto flex-none text-xs font-black"
                          style={{ color: 'var(--surface-tone)' }}
                        >
                          {SCOPE_COUNTS[option]}
                        </span>
                      )}
                    </span>

                    <span className="surface-option-blurb">
                      {gated
                        ? 'Sign in as a pana to search members'
                        : SCOPE_BLURB[option]}
                    </span>

                    {/* The new line. Four scopes that used to be one page are
                        now four, so the menu stops being a filter label and
                        becomes a signpost. Shown even on the gated row —
                        knowing the page exists is most of why anyone would
                        sign in for it. */}
                    <span className="mt-1 flex items-center gap-1 font-mono text-[0.68rem] font-bold tracking-tight opacity-55">
                      <ArrowRight
                        className="h-3 w-3 flex-none"
                        aria-hidden="true"
                      />
                      {SCOPE_DESTINATION[option]}
                    </span>
                  </span>
                </>
              );

              // A gated scope is a span rather than a disabled button: there
              // is no destination to offer, and a control that refuses to act
              // is worse than one that was never a control.
              if (gated) {
                return (
                  <span
                    key={option}
                    role="menuitem"
                    aria-disabled="true"
                    className="surface-option cursor-not-allowed items-start opacity-45"
                    data-tone={SCOPE_TONE[option]}
                  >
                    {body}
                  </span>
                );
              }

              return (
                <button
                  key={option}
                  type="button"
                  role="menuitem"
                  className="surface-option w-full items-start text-left"
                  data-tone={SCOPE_TONE[option]}
                  data-current={isCurrent}
                  aria-current={isCurrent ? 'true' : undefined}
                  onClick={() => {
                    onScope(option);
                    onOpen(false);
                  }}
                >
                  {body}
                </button>
              );
            })}
          </div>

          {/* Where Everything went. Dropping it removes the one row that
              answered "I do not know which of these I want", so the menu says
              out loud what the fallback is instead of leaving a hole. */}
          <p className="surface-panel-note">
            No “Everything” any more — the box searches exactly what the chip
            says. Not sure? Businesses is the broadest, and every listing links
            out to its events and groups.
          </p>
        </div>
      )}
    </form>
  );
}
