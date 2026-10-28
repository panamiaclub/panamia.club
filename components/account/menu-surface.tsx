'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import styles from './identity.module.css';
import { cn } from '@/lib/utils';
import { NATIVE_BACK_BUTTON_EVENT } from '@/lib/mobile/native';

/**
 * The masthead popup frame.
 *
 * Extracted from the identity switcher so the signed-out menu is the same
 * frame rather than a lookalike. Two implementations would drift — one would
 * get the scroll lock, the other would keep the dropdown on phones — and the
 * whole point of the signed-out menu is that a visitor meets the control they
 * will keep using once they have an account.
 *
 * Renders a dropdown on desktop and a bottom sheet on phones: a top-right
 * popover is not reachable one-handed, and these controls are used mid-task.
 *
 * Both panels stay mounted and are hidden with `inert` rather than unmounted,
 * because the open/close animation lives in CSS and has nothing to animate if
 * the element appears at the moment it should already be moving.
 */

/**
 * Rows opt into arrow-key navigation by carrying this attribute. Anything
 * without it — a disabled "coming soon" entry, a heading — is skipped, which
 * is what keeps the roving focus landing only on things that do something.
 */
export const MENU_ROW = 'data-menu-row';

export function MenuSurface({
  label,
  trigger,
  triggerClassName,
  children,
  footer,
  onOpenChange,
}: {
  /** Accessible name for both the trigger and the mobile sheet. */
  label: string;
  trigger: ReactNode;
  triggerClassName?: string;
  /**
   * Told whenever the panel opens or closes.
   *
   * Both panels stay mounted (see above), so anything inside `children` is
   * rendered — and any query it runs is fired — on page load rather than on
   * open. A menu whose contents are cheap does not care; the notifications
   * menu fetches a list, and without this it would fetch that list for every
   * signed-in visitor on every page whether or not they ever opened it.
   */
  onOpenChange?: (open: boolean) => void;
  /** Receives `close` so a row can dismiss the menu as it navigates. */
  children: (close: (returnFocus?: boolean) => void) => ReactNode;
  /**
   * Rows that must stay reachable without scrolling.
   *
   * On phones the sheet is capped at 84vh, and the list above it grows with
   * every business a member helps run — so Sign Out, which is last, is the
   * first thing to fall off the bottom. Anything passed here is pinned below
   * the scrolling region instead. On desktop there is nothing to pin and it
   * simply renders after `children`, which is where it already was.
   */
  footer?: (close: (returnFocus?: boolean) => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 767px)');
    setIsMobile(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  /* Held in a ref so an inline arrow from the caller does not re-fire this on
     every render — the effect depends on `open` alone, and so reports only
     actual transitions. */
  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  });
  useEffect(() => {
    onOpenChangeRef.current?.(open);
  }, [open]);

  // Escape closes from anywhere; click-outside only applies to the desktop
  // dropdown, since the sheet has its own scrim.
  useLayoutEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const onClick = (e: MouseEvent) => {
      if (!anchorRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onNativeBack = (event: Event) => {
      if (event.defaultPrevented) return;
      event.preventDefault();
      close();
    };

    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    window.addEventListener(NATIVE_BACK_BUTTON_EVENT, onNativeBack, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
      window.removeEventListener(NATIVE_BACK_BUTTON_EVENT, onNativeBack, true);
    };
  }, [open, close]);

  // Lock the page behind the sheet, which would otherwise scroll under it.
  useEffect(() => {
    if (!open || !isMobile) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open, isMobile]);

  useLayoutEffect(() => {
    if (!open) return;
    const first = listRef.current?.querySelector<HTMLElement>(`[${MENU_ROW}]`);
    first?.focus();
  }, [open]);

  /* Roving arrow-key focus across the rows.
     Left/Right are aliases for Up/Down rather than true grid movement: part
     of this menu is a list and part is a three-column grid, so a real
     two-axis walk would need to know which is which. Document order is
     already correct in both, and a horizontal press in a grid mostly means
     "the neighbouring tile" — which is the adjacent row here. */
  const onListKeyDown = (e: React.KeyboardEvent) => {
    const forward = e.key === 'ArrowDown' || e.key === 'ArrowRight';
    const back = e.key === 'ArrowUp' || e.key === 'ArrowLeft';
    if (!forward && !back) return;
    const rows = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>(`[${MENU_ROW}]`) ?? []
    );
    if (rows.length === 0) return;
    e.preventDefault();
    const at = rows.indexOf(document.activeElement as HTMLElement);
    const next = forward
      ? rows[(at + 1) % rows.length]
      : rows[(at - 1 + rows.length) % rows.length];
    next?.focus();
  };

  /* Both halves stay inside the one role="menu" element, so the roving
     arrow-key walk below still crosses from the list into the pinned rows in
     document order. */
  const rows = (
    <div
      ref={listRef}
      onKeyDown={onListKeyDown}
      role="menu"
      data-state={open ? 'open' : 'closed'}
      className={isMobile ? styles.sheetRows : undefined}
    >
      {isMobile ? (
        <>
          <div className={styles.sheetScroll}>{children(close)}</div>
          {footer && <div className={styles.sheetFooter}>{footer(close)}</div>}
        </>
      ) : (
        <>
          {children(close)}
          {footer?.(close)}
        </>
      )}
    </div>
  );

  return (
    <div className={styles.anchor} ref={anchorRef}>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
      >
        {trigger}
      </button>

      {isMobile ? (
        <>
          <div
            className={cn(styles.scrim, open && styles.scrimOpen)}
            onClick={() => close()}
            aria-hidden="true"
          />
          <div
            className={cn(styles.sheet, open && styles.sheetOpen)}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            inert={!open}
          >
            <div className={styles.grabber} aria-hidden="true" />
            {rows}
          </div>
        </>
      ) : (
        <div className={cn(styles.menu, open && styles.menuOpen)} inert={!open}>
          {rows}
        </div>
      )}
    </div>
  );
}
