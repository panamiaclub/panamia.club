'use client';

import Link from 'next/link';
import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { ArrowRight, ChevronDown, Lock } from 'lucide-react';
import { KIND_ICON } from '@/components/kind-icon';
import { NATIVE_BACK_BUTTON_EVENT } from '@/lib/mobile/native';
import {
  countFor,
  SCOPE_BLURB,
  SCOPE_DESTINATION,
  SCOPE_LABEL,
  SCOPE_REQUIRES_PANA,
  SCOPE_TONE,
  SCOPES,
  scopePath,
  visibleScopes,
  type Scope,
  type ScopeCounts,
} from '@/lib/directory-scopes';

interface ScopeMenuProps {
  /** The term the counts were computed for; scope links carry it across. */
  term: string;
  scope: Scope;
  /**
   * Null while unknown. The directory fetches these after mount and the home
   * hero never has them at all -- nothing has been searched yet, so there is
   * no number to show. The menu is navigation first and renders without them.
   */
  counts: ScopeCounts | null;
  signedIn: boolean;
  /**
   * Turns the menu from navigation into a control.
   *
   * Omitted on results pages, where each scope is a real, shareable route and
   * the rows must be `<Link>`s -- middle-clickable and crawlable, which is the
   * whole reason dedicated routes were chosen over a `?kind=` param.
   *
   * Passed by the home hero, where there is nothing to navigate to yet: the
   * visitor is choosing what to search before typing the thing to search for.
   * Rows become buttons that set state, and submit carries the chosen scope.
   */
  onSelect?: (scope: Scope) => void;
  /**
   * Shrinks the trigger to fit a masthead pill.
   *
   * The surface masthead's field is 2.125rem tall against the hero's much
   * larger one, and the default trigger's 2px border and 0.3125rem padding do
   * not fit inside it. Only the trigger changes: the panel is the same panel,
   * because a dropdown has the whole viewport to open into regardless of how
   * small the thing that opened it was.
   *
   * A prop rather than a second component, for the reason in this file's
   * header -- a copy would be a second place for the members-only rule to
   * drift.
   */
  compact?: boolean;
  /** Embedded search surfaces can offer only the kinds they support. */
  scopes?: readonly Scope[];
  showDestinations?: boolean;
  panelStyle?: CSSProperties;
}

/**
 * The scope selector that sits inside the search pill.
 *
 * One control in two modes, rather than two components. The hero needs it to
 * set state and the results pages need it to navigate, but everything else --
 * the roving focus, the gated rows, the tones, the blurbs, the destinations --
 * is identical, and a second copy would be a second place for the members-only
 * rule to drift.
 *
 * Why not a native `<select>`: a select renders in OS chrome, so the design
 * system stops at its edge, and it cannot carry an icon, a count, a reason or
 * a destination. Every scope here needs all five.
 *
 * Built on `.surface-panel` / `.surface-option`, the primitives the panaverse
 * switcher already uses, so this is the same dropdown the masthead has rather
 * than a second one that looks nearly like it.
 */
export function ScopeMenu({
  term,
  scope,
  counts,
  signedIn,
  onSelect,
  compact = false,
  scopes = SCOPES,
  showDestinations = true,
  panelStyle,
}: ScopeMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  const initialFocus = useRef(0);
  const menuId = useId();

  // Gated scopes are skipped by the arrow keys rather than merely dimmed; a
  // keyboard user should not have to arrow through a door that is locked.
  //
  // Through `visibleScopes` rather than filtering here, because that helper is
  // documented as the single place the members-only rule is applied to a list
  // of scopes — and this was the list that had quietly grown its own copy of
  // it. The two agreed, which is the only reason the drift was invisible.
  const allowedScopes = visibleScopes(signedIn);
  const reachable = scopes.filter((option) => allowedScopes.includes(option));
  if (reachable.length === 0) {
    throw new Error('The scope menu needs at least one reachable category');
  }

  const CurrentIcon = KIND_ICON[scope];

  useLayoutEffect(() => {
    if (!open) return;
    itemRefs.current[initialFocus.current]?.focus();
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    const onNativeBack = (event: Event) => {
      if (event.defaultPrevented) return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    window.addEventListener(NATIVE_BACK_BUTTON_EVENT, onNativeBack, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener(NATIVE_BACK_BUTTON_EVENT, onNativeBack, true);
    };
  }, [open]);

  const focusItem = (index: number) => {
    const bounded = (index + reachable.length) % reachable.length;
    itemRefs.current[bounded]?.focus();
  };

  const openWith = (index: number) => {
    initialFocus.current = index;
    setOpen(true);
  };

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  const onTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (
      event.key === 'ArrowDown' ||
      event.key === 'Enter' ||
      event.key === ' '
    ) {
      event.preventDefault();
      // Open onto the current scope, so the menu starts where you left it.
      openWith(Math.max(0, reachable.indexOf(scope)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      openWith(reachable.length - 1);
    }
  };

  const onItemKeyDown = (
    event: ReactKeyboardEvent<HTMLElement>,
    index: number
  ) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focusItem(index + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusItem(index - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusItem(0);
        break;
      case 'End':
        event.preventDefault();
        focusItem(reachable.length - 1);
        break;
      case 'Escape':
        event.preventDefault();
        close(true);
        break;
      case 'Tab':
        // Let focus leave naturally, but do not leave a panel hanging open
        // over the results behind it.
        setOpen(false);
        break;
      default:
        break;
    }
  };

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={
          compact ? 'surface-pill surface-pill-compact' : 'surface-pill'
        }
        data-tone={SCOPE_TONE[scope]}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Search scope, currently ${SCOPE_LABEL[scope]}`}
        onClick={() =>
          open ? close(false) : openWith(Math.max(0, reachable.indexOf(scope)))
        }
        onKeyDown={onTriggerKeyDown}
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

      {open && (
        <div
          id={menuId}
          role="menu"
          data-state="open"
          aria-label="Search scope"
          /* `directory-suggest-scopemenu` carries no styling of its own. It is
             a hook for the hero's `:has()` un-clip rule in globals.css, and it
             is load-bearing: `.home-hero-banner` and `.home-hero-field` are
             both `overflow: hidden` and the hero is `min-height: 100svh`, so
             the pill sits near its bottom edge and without the hook this panel
             renders a few pixels tall with the rest sheared off. */
          className="surface-panel directory-suggest-scopemenu"
          /* `.surface-panel` is written for the masthead: it hangs off the
             right edge, sizes against its positioned ancestor — which here is
             a button about eleven characters wide — and claims `z-index: 30`,
             enough to beat page content but not a sticky filter strip, which
             also claims 30 and wins the tie by being later in the DOM. 45
             clears both, so an open menu is never sliced in half. Inline so
             all of it beats the class regardless of utility layer order. */
          style={{
            top: 'calc(100% + 0.6rem)',
            left: 0,
            right: 'auto',
            zIndex: 45,
            width: '23rem',
            maxWidth: 'calc(100vw - 2rem)',
            textAlign: 'left',
            ...panelStyle,
          }}
        >
          <p className="surface-panel-label">Search for</p>

          <div className="flex flex-col gap-1">
            {scopes.map((option) => {
              const gated = SCOPE_REQUIRES_PANA[option] && !signedIn;
              const Icon = KIND_ICON[option];
              const isCurrent = option === scope;
              const count = counts ? countFor(counts, option) : null;
              const index = reachable.indexOf(option);

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
                      {/* The count comes from the same query that renders the
                          list, so the menu cannot promise a number the page
                          will not produce. A scope at zero stays pickable —
                          "no groups match art" is an answer. */}
                      {!gated && count !== null && (
                        <span
                          className="ml-auto flex-none text-xs font-black"
                          style={{
                            color:
                              count === 0
                                ? 'rgb(17 13 13 / 0.35)'
                                : 'var(--surface-tone)',
                          }}
                        >
                          {count}
                        </span>
                      )}
                    </span>

                    <span className="surface-option-blurb">
                      {gated
                        ? 'Sign in as a pana to search members'
                        : SCOPE_BLURB[option]}
                    </span>

                    {/* Where this row goes. The four scopes used to be four
                        views of one results page, so the destination needed no
                        saying; they are four different products now — one with
                        a map, one with a calendar, one with a join button — and
                        a control that changes which one you land in should say
                        so before Enter. Shown on the gated row too: knowing the
                        page exists is most of why anyone would sign in for it. */}
                    {showDestinations && (
                      <span className="mt-1 flex items-center gap-1 font-mono text-[0.68rem] font-bold tracking-tight opacity-55">
                        <ArrowRight
                          className="h-3 w-3 flex-none"
                          aria-hidden="true"
                        />
                        {SCOPE_DESTINATION[option]}
                      </span>
                    )}
                  </span>
                </>
              );

              // A gated scope is a span, not a disabled control: there is no
              // destination to offer, and an <a href> that refuses to navigate
              // is worse than one that was never a link.
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

              const shared = {
                role: 'menuitem' as const,
                className: 'surface-option items-start',
                'data-tone': SCOPE_TONE[option],
                'data-current': isCurrent,
                'aria-current': isCurrent ? ('true' as const) : undefined,
                onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) =>
                  onItemKeyDown(event, index),
              };

              // Control mode: the hero, where nothing has been searched yet.
              if (onSelect) {
                return (
                  <button
                    key={option}
                    type="button"
                    ref={(node) => {
                      if (index >= 0) itemRefs.current[index] = node;
                    }}
                    {...shared}
                    className={`${shared.className} w-full text-left`}
                    onClick={() => {
                      onSelect(option);
                      close(true);
                    }}
                  >
                    {body}
                  </button>
                );
              }

              return (
                <Link
                  key={option}
                  ref={(node) => {
                    if (index >= 0) itemRefs.current[index] = node;
                  }}
                  href={scopePath(option, term)}
                  {...shared}
                  onClick={() => close(false)}
                >
                  {body}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
