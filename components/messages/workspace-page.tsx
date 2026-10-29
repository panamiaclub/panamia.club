'use client';

import { useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import styles from './workspace.module.css';

export function WorkspacePage({ children }: { children: ReactNode }) {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const property = '--messages-viewport-height';
    const previous = document.body.style.getPropertyValue(property);
    const resize = () => {
      if (viewport.scale !== 1) return;
      document.body.style.setProperty(
        property,
        `${viewport.height + viewport.offsetTop}px`
      );
    };
    resize();
    viewport.addEventListener('resize', resize);
    viewport.addEventListener('scroll', resize);
    return () => {
      viewport.removeEventListener('resize', resize);
      viewport.removeEventListener('scroll', resize);
      if (previous) document.body.style.setProperty(property, previous);
      else document.body.style.removeProperty(property);
    };
  }, []);

  return (
    <div className={styles.page} data-messages-workspace>
      <main className={styles.body}>{children}</main>
      <nav className={styles.legal} aria-label="Messaging legal links">
        <Link href="/legal/terms">Terms</Link>
        <Link href="/legal/privacy">Privacy</Link>
      </nav>
    </div>
  );
}
