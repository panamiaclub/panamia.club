'use client';

import { ChevronDown, Check } from 'lucide-react';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { NATIVE_BACK_BUTTON_EVENT } from '@/lib/mobile/native';

export interface FilterMenuOption {
  value: string;
  label: string;
  /** A shorter selected label for compact triggers. */
  triggerLabel?: string;
  /** Second line under the label, for options whose name is not self-evident. */
  hint?: string;
  /** Disables the row and explains why on hover. */
  disabledReason?: string;
}

interface FilterMenuProps {
  /** The word on the closed trigger — "Category", "Where", "Sort". */
  label: string;
  options: FilterMenuOption[];
  /** Selected values. Single-select menus pass an array of one. */
  selected: string[];
  onChange: (next: string[]) => void;
  /** Radio behaviour, for menus like Sort where exactly one answer is true. */
  single?: boolean;
  /**
   * Rows that perform an action instead of holding a filter state — picking
   * one navigates somewhere. Drops the tick column, since a checkbox that can
   * never be checked promises a toggle the row does not do, and uses plain
   * `menuitem`, which is what ARIA means by "activating this does something".
   * Implies `single`: there is nothing to accumulate.
   */
  action?: boolean;
  /**
   * The value a single-select menu holds when nobody has touched it. Sort
   * always has an answer, so without this it would render permanently filled
   * and "active" would stop meaning anything across the row.
   */
  defaultValue?: string;
  /** Shown above the options when the menu is open. */
  caption?: ReactNode;
  /** Opt in to the masthead's cream surface primitives. */
  appearance?: 'default' | 'surface';
  /** A small pill face with a count for multi-select choices. */
  compact?: boolean;
  /** Adds Clear all / Done; choices stay open until explicitly dismissed. */
  onClearAll?: () => void;
  /** Usable overlay area, excluding native headers and the floating dock. */
  boundaryRef?: RefObject<HTMLElement | null>;
}

/**
 * One filter, folded up until asked for.
 *
 * Shared by the directory search bar and the groups surface. It lives here
 * rather than in either feature because the keyboard contract below is the
 * expensive part, and a second copy of it is a second chance to drop a
 * keystroke. The `dirsearch-` class names are a leftover from the directory,
 * where it started; the styles are global and the rename is tracked
 * separately, so renaming them is not this component's job to do piecemeal.
 *
 * The bar this started in used to lay every choice out as chips, and the
 * comment on FilterBar still argues for that: a "Filters" button costs two
 * clicks before you learn the directory has categories at all, and hides
 * which ones are on once it closes.
 *
 * That argument was right about the failure mode and wrong about the cause.
 * The problem with a filter dialog is not that it folds — it is that it folds
 * *everything*, including the answer. Three chip rows plus a sort row plus a
 * view toggle came to 220px of controls above the first result on a phone,
 * which on an 844px screen left room for roughly one card. The filters were
 * visible and the businesses were not, which inverts what the page is for.
 *
 * So this keeps the two things the chips were good at and drops the third.
 * The trigger names its own state — "Category · 2", "Where · Broward" — so a
 * closed menu still says what it is doing, and callers pair it with a
 * removable chip for any active choice, so clearing one never requires
 * opening anything. What is folded away is only the list of options you are
 * not currently using.
 *
 * Deliberately not <select>: these are multi-select on mobile, where a native
 * multiple select renders as a scrolling list box that is worse than either
 * option. The keyboard contract below is the same one ScopeMenu implements,
 * for the same reason — it is the other menu on the directory page.
 */
export function FilterMenu({
  label,
  options,
  selected,
  onChange,
  single = false,
  action = false,
  defaultValue,
  caption,
  appearance = 'default',
  compact = false,
  onClearAll,
  boundaryRef,
}: FilterMenuProps) {
  const surface = appearance === 'surface';
  const closesOnPick = (single || action) && !onClearAll;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const initialFocus = useRef(0);
  const menuId = useId();

  const reachable = options.filter((option) => !option.disabledReason);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !rootRef.current?.contains(event.target)
      )
        setOpen(false);
    }
    // Capture before a containing dialog handles Escape at the document.
    function onEscape(event: KeyboardEvent) {
      if (
        event.key !== 'Escape' ||
        !(event.target instanceof Node) ||
        !rootRef.current?.contains(event.target)
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    }
    function onNativeBack(event: Event) {
      if (event.defaultPrevented) return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onEscape, true);
    window.addEventListener(NATIVE_BACK_BUTTON_EVENT, onNativeBack, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onEscape, true);
      window.removeEventListener(NATIVE_BACK_BUTTON_EVENT, onNativeBack, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    itemRefs.current[initialFocus.current]?.focus({
      preventScroll: Boolean(onClearAll),
    });
    if (!surface) return;
    const root = rootRef.current;
    const panel = panelRef.current;
    // Dialogs lay these panels out in flow, inside their own scroll area.
    if (!root || !panel || getComputedStyle(panel).position !== 'absolute')
      return;

    const place = () => {
      const box = root.getBoundingClientRect();
      const boundary = boundaryRef?.current?.getBoundingClientRect();
      const gutter = boundary ? 0 : 16;
      const gap = 8;
      const bounds = boundary ?? {
        left: 0,
        top: 0,
        right: window.innerWidth,
        bottom: window.innerHeight,
      };
      const left = Math.max(
        bounds.left + gutter,
        Math.min(box.left, bounds.right - gutter - panel.offsetWidth)
      );
      const below = bounds.bottom - box.bottom - gap - gutter;
      const above = box.top - gap - bounds.top - gutter;
      const panelHeight =
        panel.scrollHeight + panel.offsetHeight - panel.clientHeight;
      const opensAbove = below < panelHeight && above > below;
      // Short landscape views need to cover the search controls rather than
      // leave no room for options between the trigger and the dock.
      const overlay = boundary && Math.max(below, above) < 160;
      const available = overlay
        ? bounds.bottom - bounds.top
        : opensAbove
          ? above
          : below;
      const top = overlay
        ? `${
            Math.max(
              bounds.top,
              Math.min(
                box.bottom + gap,
                bounds.bottom - Math.min(panelHeight, available)
              )
            ) - box.top
          }px`
        : opensAbove
          ? 'auto'
          : 'calc(100% + 0.5rem)';
      Object.assign(panel.style, {
        left: `${left - box.left}px`,
        top,
        bottom: !overlay && opensAbove ? 'calc(100% + 0.5rem)' : 'auto',
        maxHeight: `min(24rem, ${Math.max(0, available)}px)`,
      });
    };
    place();
    if (onClearAll)
      itemRefs.current[initialFocus.current]?.scrollIntoView({
        block: 'nearest',
      });
    const observer = new ResizeObserver(place);
    observer.observe(root);
    if (boundaryRef?.current) observer.observe(boundaryRef.current);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    window.visualViewport?.addEventListener('resize', place);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      window.visualViewport?.removeEventListener('resize', place);
    };
  }, [open, surface, boundaryRef, onClearAll]);

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

  const toggle = (value: string) => {
    if (single || action) {
      onChange([value]);
      // A single-answer menu has nothing left to ask once answered, and an
      // action menu is already on its way somewhere else.
      if (closesOnPick) close(true);
      return;
    }
    onChange(
      selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value]
    );
  };

  const onTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (
      event.key === 'ArrowDown' ||
      event.key === 'Enter' ||
      event.key === ' '
    ) {
      event.preventDefault();
      const first = reachable.findIndex((option) =>
        selected.includes(option.value)
      );
      openWith(Math.max(0, first));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      openWith(reachable.length - 1);
    }
  };

  const onItemKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
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
      default:
        break;
    }
  };

  // What the closed trigger says it is doing. One selection is worth naming;
  // past that the name is longer than the button, so it becomes a count.
  const chosen = options.filter((option) => selected.includes(option.value));
  const summary =
    chosen.length === 0
      ? null
      : chosen.length === 1
        ? chosen[0].label
        : String(chosen.length);

  // Filled means "I am changing the results", which a menu sitting on its
  // default is not doing — even though it does have a value to show.
  const active =
    chosen.length > 0 &&
    !(single && defaultValue !== undefined && selected[0] === defaultValue);

  return (
    <div
      className="dirsearch-menu"
      ref={rootRef}
      onKeyDown={(event) => {
        if (open && !onClearAll && event.key === 'Tab') setOpen(false);
      }}
      onBlur={(event) => {
        if (
          open &&
          onClearAll &&
          event.relatedTarget instanceof Node &&
          !event.currentTarget.contains(event.relatedTarget)
        )
          close(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className={
          surface ? 'surface-pill dirsearch-filtertrigger' : 'dirsearch-menubtn'
        }
        data-compact={compact || undefined}
        data-on={active}
        aria-haspopup={onClearAll ? 'dialog' : 'menu'}
        aria-label={
          compact
            ? `${label}${active && summary ? `: ${summary}` : ''}`
            : undefined
        }
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close(false) : openWith(0))}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="dirsearch-menuname">
          {compact && single && active
            ? (chosen[0].triggerLabel ?? chosen[0].label)
            : label}
        </span>
        {compact
          ? !single &&
            chosen.length > 0 && (
              <span className="dirsearch-menucount" aria-hidden="true">
                {chosen.length}
              </span>
            )
          : summary && <span className="dirsearch-menuvalue">{summary}</span>}
        <ChevronDown
          className="h-3.5 w-3.5 flex-none transition-transform"
          style={{ transform: open ? 'rotate(180deg)' : undefined }}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          ref={panelRef}
          id={menuId}
          role={onClearAll ? 'dialog' : 'menu'}
          aria-modal={onClearAll ? false : undefined}
          aria-label={label}
          className={
            surface
              ? 'surface-panel dirsearch-filterpanel'
              : 'dirsearch-menupanel'
          }
        >
          <div className="dirsearch-menucontent">
            {caption && <p className="dirsearch-menucaption">{caption}</p>}

            <div
              className="dirsearch-menulist"
              role={onClearAll ? 'menu' : undefined}
              aria-label={onClearAll ? label : undefined}
            >
              {options.map((option) => {
                const on = selected.includes(option.value);
                const index = reachable.indexOf(option);
                const hint =
                  option.hint ?? (surface ? option.disabledReason : undefined);

                return (
                  <button
                    key={option.value}
                    ref={(node) => {
                      if (index >= 0) itemRefs.current[index] = node;
                    }}
                    type="button"
                    role={
                      action
                        ? 'menuitem'
                        : single
                          ? 'menuitemradio'
                          : 'menuitemcheckbox'
                    }
                    aria-checked={action ? undefined : on}
                    disabled={Boolean(option.disabledReason)}
                    title={option.disabledReason}
                    className={
                      surface
                        ? 'surface-option dirsearch-filteroption'
                        : 'dirsearch-menuitem'
                    }
                    data-on={on}
                    data-current={surface && on ? true : undefined}
                    onClick={() => toggle(option.value)}
                    onKeyDown={(event) => onItemKeyDown(event, index)}
                  >
                    {!action && (
                      <span className="dirsearch-menutick" aria-hidden="true">
                        {on && <Check className="h-3 w-3" />}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span
                        className={
                          surface
                            ? 'surface-option-name block'
                            : 'dirsearch-menulabel'
                        }
                      >
                        {option.label}
                      </span>
                      {hint && (
                        <span
                          className={
                            surface
                              ? 'surface-option-blurb'
                              : 'dirsearch-menuhint'
                          }
                        >
                          {hint}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {onClearAll ? (
            <div className="dirsearch-menufooter">
              <button type="button" onClick={onClearAll}>
                Clear all
              </button>
              <button type="button" onClick={() => close(true)}>
                Done
              </button>
            </div>
          ) : !single && !action && chosen.length > 0 ? (
            <button
              type="button"
              className="dirsearch-menuclear"
              onClick={() => onChange([])}
            >
              Clear {label.toLowerCase()}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
