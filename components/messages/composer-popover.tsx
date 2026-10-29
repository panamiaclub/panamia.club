'use client';

import {
  useLayoutEffect,
  useRef,
  type KeyboardEventHandler,
  type ReactNode,
} from 'react';
import styles from './workspace.module.css';

export function ComposerPopover({
  children,
  label,
  live = false,
  onKeyDown,
}: {
  children: ReactNode;
  label: string;
  live?: boolean;
  onKeyDown: KeyboardEventHandler<HTMLDivElement>;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const picker = ref.current;
    const composer = picker?.parentElement;
    const conversation = composer?.closest('section');
    if (!picker || !composer || !conversation) return;
    const viewport = window.visualViewport;

    const position = () => {
      const footer = composer.getBoundingClientRect();
      const pane = conversation.getBoundingClientRect();
      const viewportTop = viewport?.offsetTop ?? 0;
      const top = Math.max(pane.top, viewportTop) + 8;
      const bottom =
        Math.min(
          pane.bottom,
          viewportTop + (viewport?.height ?? window.innerHeight)
        ) - 8;
      const available = Math.max(0, bottom - top);
      const above = Math.max(0, footer.top - top);
      // Keep space for the controls and a usable row of results; otherwise
      // open inside the conversation rather than clipping behind its header.
      const anchoredAbove = above >= Math.min(180, available);
      picker.style.setProperty(
        '--messages-picker-space',
        `${Math.min(available, anchoredAbove ? above : available)}px`
      );
      picker.style.top = anchoredAbove ? 'auto' : `${top - footer.top}px`;
      picker.style.bottom = anchoredAbove ? 'calc(100% - 1px)' : 'auto';
    };

    position();
    const observer = new ResizeObserver(position);
    observer.observe(composer);
    observer.observe(conversation);
    window.addEventListener('resize', position);
    viewport?.addEventListener('resize', position);
    viewport?.addEventListener('scroll', position);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', position);
      viewport?.removeEventListener('resize', position);
      viewport?.removeEventListener('scroll', position);
    };
  }, []);

  return (
    <div
      ref={ref}
      className={styles.gifPicker}
      data-live={live || undefined}
      role="group"
      aria-label={label}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  );
}
