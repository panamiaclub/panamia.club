import type { ReactNode } from 'react';

import styles from './PublicPageShell.module.css';

interface PublicPageShellProps {
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
  narrow?: boolean;
}

export default function PublicPageShell({
  eyebrow,
  title,
  intro,
  children,
  narrow = false,
}: PublicPageShellProps) {
  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroInner}>
          <div>
            <p className={styles.eyebrow}>{eyebrow}</p>
            <h1>{title}</h1>
            <p className={styles.intro}>{intro}</p>
          </div>
          <div className={styles.heroMark} aria-hidden="true">
            <span>305</span>
            <span>Pana</span>
            <span>Local</span>
          </div>
        </div>
      </header>
      <section className={styles.content}>
        <div className={narrow ? styles.contentNarrow : styles.contentInner}>
          {children}
        </div>
      </section>
    </main>
  );
}
