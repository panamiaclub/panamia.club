'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Two sections on this page collapse into a horizontal rail on narrow
 * screens: the three questions under the search, and the three pillars. Both
 * need the same three things, so they share them rather than each growing
 * their own copy.
 */

interface RailState {
  prev: boolean;
  next: boolean;
}

/**
 * Tracks how far a horizontal rail is scrolled, so its paging controls can
 * disable themselves at each end.
 *
 * `itemSelector` is the card inside the rail; the step is one card plus the
 * gap, so a press lands on the next card rather than on an arbitrary
 * fraction of the viewport.
 */
export function useRail<T extends HTMLElement>(
  itemSelector: string,
  behavior: ScrollBehavior = 'smooth'
) {
  const railRef = useRef<T>(null);
  const [rail, setRail] = useState<RailState>({ prev: false, next: false });

  const syncRail = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    // Tolerance either end rather than an exact comparison. `scrollLeft` is
    // fractional under zoom and on high-DPI displays, and the last card's
    // snap position can sit short of the maximum scroll by the rail's
    // trailing gutter — so a pixel-exact test leaves the forward button live
    // with nothing useful left to reach. The tolerance is wider than any
    // gutter and far narrower than a card, so it can never swallow a real
    // step.
    const slack = 20;
    setRail({ prev: el.scrollLeft > 1, next: el.scrollLeft < max - slack });
  }, []);

  useEffect(() => {
    syncRail();
    window.addEventListener('resize', syncRail);
    return () => window.removeEventListener('resize', syncRail);
  }, [syncRail]);

  const nudge = useCallback(
    (direction: 1 | -1) => {
      const el = railRef.current;
      if (!el) return;
      const card = el.querySelector<HTMLElement>(itemSelector);
      const step = card ? card.offsetWidth + 16 : el.clientWidth * 0.85;
      el.scrollBy({ left: direction * step, behavior });
    },
    [itemSelector, behavior]
  );

  return { railRef, rail, syncRail, nudge };
}

interface RailNavProps {
  rail: RailState;
  nudge: (direction: 1 | -1) => void;
  className: string;
  prevLabel: string;
  nextLabel: string;
}

/**
 * The rail hides its scrollbar, which is right on a phone and wrong
 * everywhere else: in a narrow desktop window there is no swipe, and a
 * trackpad's horizontal gesture is not something most people know they have.
 * For those visitors these two buttons are the only way to reach the second
 * and third card at all.
 *
 * Spent rather than removed at the ends of the rail. Dropping a button would
 * let the row re-centre and slide the other one under a cursor that was
 * already moving toward it.
 */
export function RailNav({
  rail,
  nudge,
  className,
  prevLabel,
  nextLabel,
}: RailNavProps) {
  return (
    <div className={`rail-nav ${className}`}>
      <button
        type="button"
        className="rail-nav-btn"
        onClick={() => nudge(-1)}
        disabled={!rail.prev}
        aria-label={prevLabel}
      >
        <ChevronLeft aria-hidden="true" />
      </button>
      <button
        type="button"
        className="rail-nav-btn"
        onClick={() => nudge(1)}
        disabled={!rail.next}
        aria-label={nextLabel}
      >
        <ChevronRight aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * Whether a media query matches right now.
 *
 * `useSyncExternalStore` rather than a mount effect because the server has to
 * render *something*, and the honest something is the wide, motion-free
 * default: it is what the markup means when no viewport and no preference are
 * known. The client corrects on its first commit.
 */
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false
  );
}

/**
 * Whether the viewport is narrow enough that a section has become a rail.
 *
 * This exists for accessibility, not layout — layout is CSS. The pillars are
 * a disclosure on a wide screen and plain cards on a rail, so the trigger has
 * to stop claiming `aria-expanded` when there is nothing left to expand.
 */
export function useIsRail(query: string) {
  return useMediaQuery(query);
}
