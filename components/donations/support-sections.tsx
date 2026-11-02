'use client';

import Link from 'next/link';
import { ArrowRight, HandCoins, HeartHandshake, Megaphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import styles from '@/app/about-us/AboutUsPage.module.css';

export function SupportPanaNavigation() {
  const { t } = useTranslation('common');

  return (
    <nav
      className={`${styles.page} ${styles.pageNav}`}
      aria-label="Support Pana sections"
    >
      <div className={styles.pageNavInner}>
        <a href="#giving-circle">{t('nav.siteMenu.givingCircle')}</a>
        <a href="#sponsorship">{t('nav.siteMenu.sponsorship')}</a>
      </div>
    </nav>
  );
}

export function SupportPanaSponsorship() {
  const { t } = useTranslation('common');

  return (
    <section
      id="sponsorship"
      className={`${styles.page} ${styles.projects}`}
      aria-labelledby="sponsorship-title"
    >
      <div className={styles.sectionInner}>
        <div className={styles.projectsHeading}>
          <p className={styles.eyebrow}>{t('nav.siteMenu.sponsorship')}</p>
          <h2 id="sponsorship-title">
            Put your resources behind local connection.
          </h2>
          <p>
            Sponsorship can fund a community event, printed work, a
            collaborative project, or the infrastructure that keeps Pana
            programs open and accessible.
          </p>
        </div>
        <div className={styles.projectGrid}>
          <article className={styles.projectCard}>
            <HandCoins aria-hidden="true" size={42} />
            <h3>Program sponsor</h3>
            <p>
              Underwrite a full season of community building, collective
              technology, or culture work.
            </p>
          </article>
          <article className={styles.projectCard}>
            <HeartHandshake aria-hidden="true" size={42} />
            <h3>Event partner</h3>
            <p>
              Support a specific gathering through funding, space, food,
              equipment, or in-kind resources.
            </p>
          </article>
          <article className={styles.projectCard}>
            <Megaphone aria-hidden="true" size={42} />
            <h3>Story partner</h3>
            <p>
              Help publish and distribute local stories without putting them
              behind an advertising model.
            </p>
          </article>
        </div>
        <div style={{ marginTop: '2rem' }}>
          <Link href="/form/contact-us" className={styles.supportCta}>
            Start a sponsorship conversation
            <ArrowRight aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
