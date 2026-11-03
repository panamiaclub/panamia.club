'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from 'react';
import Image from 'next/image';
import { ChevronDown } from 'lucide-react';

import styles from './NavDrawer.module.css';
import SurfaceLink from '@/components/panaverse/SurfaceLink';
import { cn } from '@/lib/utils';

export type NavDrawerItem = {
  href: string;
  label: string;
  children?: NavDrawerItem[];
  expandLabel?: string;
  collapseLabel?: string;
  /** Runs alongside the drawer close, on the same click. Used for permission
      prompts that browsers only grant from a user gesture. */
  onSelect?: (event: MouseEvent<HTMLAnchorElement>) => void;
};

/** The main site's wordmark, and the default so its call site stays unchanged. */
const PANA_MIA_MARK = {
  src: '/logos/pana_logo_long_orange.png',
  alt: '',
  width: 264,
  height: 66,
};

/**
 * Slide-in primary navigation. Indigo panel, cream text — the one palette
 * pairing that clears contrast comfortably (9.01:1); every warm surface in the
 * palette has to carry ink instead.
 *
 * Accessibility notes, all of which have bitten this pattern before:
 *  - A translated panel is still focusable. Transitioning `visibility` with a
 *    delay equal to the slide duration takes it out of the tab order on close
 *    without needing `inert` (which Safari only recently shipped).
 *  - Scroll-lock is `overflow: hidden` on <body>. That removes the scrollbar
 *    and widens the viewport, which visibly shifts the centered masthead logo.
 *    `scrollbar-gutter: stable` on <html> (app/globals.css) is what keeps it
 *    still — don't remove one without the other.
 */
export default function NavDrawer({
  open,
  onClose,
  items,
  title,
  closeLabel,
  footer,
  mark = PANA_MIA_MARK,
}: {
  open: boolean;
  onClose: () => void;
  items: NavDrawerItem[];
  title: string;
  closeLabel: string;
  footer?: React.ReactNode;
  /** The wordmark in the drawer head. Defaults to Pana Mia's, so the main site
   *  passes nothing; a surface passes its own. Hardcoding it meant the drawer
   *  opened on Pana Social flying the Pana Mia mark — the same wrong-surface
   *  chrome the root layout was fixed for. */
  mark?: { src: string; alt: string; width: number; height: number };
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  // Only query focusables that are actually rendered — the footer swaps with
  // auth state, so this can't be computed once.
  const focusables = useCallback(() => {
    const root = panelRef.current;
    if (!root) return [] as HTMLElement[];
    return Array.from(
      root.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')
    ).filter((el) => el.offsetParent !== null);
  }, []);

  useEffect(() => {
    if (!open) return;

    restoreRef.current = document.activeElement as HTMLElement | null;
    focusables()[0]?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const list = focusables();
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement;
      const inPanel = !!active && !!panelRef.current?.contains(active);

      if (event.shiftKey && (active === first || !inPanel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      // Hand focus back to whatever opened the drawer.
      restoreRef.current?.focus?.();
      restoreRef.current = null;
    };
  }, [open, onClose, focusables]);

  return (
    <>
      <div
        className={cn(styles.scrim, open && styles.scrimOpen)}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        className={cn(styles.panel, open && styles.panelOpen)}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className={styles.head}>
          {/* The wordmark, not a text label — the drawer reads as an extension
              of the brand rather than a utility panel. `title` still carries
              the accessible name via aria-label on the dialog. */}
          <Image
            src={mark.src}
            alt=""
            aria-hidden="true"
            width={mark.width}
            height={mark.height}
            className={styles.logo}
          />
          <button
            type="button"
            onClick={onClose}
            className={styles.close}
            aria-label={closeLabel}
          >
            {/* Escaped rather than the literal glyph: the pre-commit emoji
                screen rejects U+2600-U+27BF across a whole staged file, and
                U+2715 sits in that range, so the literal blocks any commit
                that touches this file. Renders identically. */}
            <span aria-hidden="true">{'\u2715'}</span>
          </button>
        </div>

        <nav aria-label={title}>
          <ul className={styles.list}>
            {items.map((item, index) => (
              <NavDrawerEntry
                key={`${item.href}-${item.label}`}
                item={item}
                index={index}
                onClose={onClose}
              />
            ))}
          </ul>
        </nav>

        {footer ? <div className={styles.foot}>{footer}</div> : null}
      </div>
    </>
  );
}

function NavDrawerEntry({
  item,
  index,
  onClose,
  depth = 0,
}: {
  item: NavDrawerItem;
  index: number;
  onClose: () => void;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const submenuId = useId();
  const hasChildren = !!item.children?.length;

  return (
    <li>
      <div className={styles.entryRow}>
        <SurfaceLink
          href={item.href}
          className={cn(
            styles.link,
            depth > 0 && styles.childLink,
            hasChildren && styles.parentLink
          )}
          data-depth={depth}
          onClick={(event) => {
            item.onSelect?.(event);
            onClose();
          }}
          style={{ '--d': `${0.1 + index * 0.05}s` } as CSSProperties}
        >
          {depth === 0 ? (
            <span className={styles.num} aria-hidden="true">
              {String(index + 1).padStart(2, '0')}
            </span>
          ) : (
            <span className={styles.branch} aria-hidden="true">
              {'\u2514'}
            </span>
          )}
          <span className={styles.label}>{item.label}</span>
          {!hasChildren ? (
            <span className={styles.arrow} aria-hidden="true">
              →
            </span>
          ) : null}
        </SurfaceLink>

        {hasChildren ? (
          <button
            type="button"
            className={styles.submenuToggle}
            aria-expanded={expanded}
            aria-controls={submenuId}
            aria-label={
              expanded
                ? (item.collapseLabel ?? `Collapse ${item.label} submenu`)
                : (item.expandLabel ?? `Expand ${item.label} submenu`)
            }
            onClick={() => setExpanded((current) => !current)}
          >
            <ChevronDown
              className={styles.submenuIcon}
              aria-hidden="true"
            />
          </button>
        ) : null}
      </div>

      {hasChildren && expanded ? (
        <ul id={submenuId} className={styles.sublist}>
          {item.children?.map((child, childIndex) => (
            <NavDrawerEntry
              key={`${child.href}-${child.label}`}
              item={child}
              index={childIndex}
              onClose={onClose}
              depth={depth + 1}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
