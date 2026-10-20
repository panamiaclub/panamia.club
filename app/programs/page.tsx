'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { usePillars } from '@/components/home/content';
import styles from '../about-us/AboutUsPage.module.css';

const PROGRAM_LINKS: Record<string, string> = {
  Directory: '/directory',
  'Pana Social': '/social',
  'Connectors Program': '/connectors',
  'Collaborative Events': '/events',
  'Pana Ink Press': '/ink',
  'Collaborative Projects': '/ecosystem#collaborative-projects',
};

export default function ProgramsPage() {
  const pillars = usePillars();
  const { t } = useTranslation('about');
  const { t: tCommon } = useTranslation('common');

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <Image
          src="/img/impact/pana-social-dinner.webp"
          alt=""
          fill
          priority
          className={styles.heroImage}
        />
        <div className={styles.heroWash} />
        <div className={styles.heroContent}>
          <p className={styles.eyebrow}>{t('pillars.eyebrow')}</p>
          <h1>{tCommon('nav.siteMenu.programs')}</h1>
          <p className={styles.heroLead}>{t('pillars.intro')}</p>
        </div>
      </header>

      <nav className={styles.pageNav} aria-label="Programs sections">
        <div className={styles.pageNavInner}>
          <Link href="#pillar-breakdown">
            {tCommon('nav.siteMenu.pillarBreakdownByProgram')}
          </Link>
          <Link href="#collective-tech">
            {tCommon('nav.siteMenu.collectiveTech')}
          </Link>
          <Link href="#community-building">
            {tCommon('nav.siteMenu.communityBuilding')}
          </Link>
          <Link href="#culture-work">
            {tCommon('nav.siteMenu.cultureWork')}
          </Link>
        </div>
      </nav>

      <section id="pillar-breakdown" className={styles.mission}>
        <div className={styles.sectionInner}>
          <div className={styles.missionStatement}>
            <p className={styles.eyebrow}>
              {tCommon('nav.siteMenu.pillarBreakdownByProgram')}
            </p>
            <h2>{t('pillars.title')}</h2>
          </div>
          <div className={styles.missionCopy}>
            <p>{t('pillars.intro')}</p>
          </div>
        </div>
      </section>

      {pillars.map((pillar, index) => {
        const id =
          pillar.id === 'tech'
            ? 'collective-tech'
            : pillar.id === 'community'
              ? 'community-building'
              : 'culture-work';
        return (
          <section
            key={pillar.id}
            id={id}
            className={index % 2 === 0 ? styles.story : styles.whyLocal}
          >
            <div className={styles.sectionInner}>
              <div className={styles.sectionHeading}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <p className={styles.eyebrow}>{pillar.problem}</p>
                  <h2>{pillar.name}</h2>
                </div>
              </div>
              <p className={styles.sectionIntro}>{pillar.answer}</p>
              <div className={styles.projectGrid}>
                {pillar.programs.map((program) => {
                  const href =
                    PROGRAM_LINKS[program.name] ?? program.href ?? undefined;
                  return (
                    <article key={program.name} className={styles.projectCard}>
                      <h3>{program.name}</h3>
                      <p>{program.note}</p>
                      {href ? (
                        <Link href={href}>
                          Explore the program
                          <ArrowRight aria-hidden="true" />
                        </Link>
                      ) : (
                        <span>{program.statusLabel}</span>
                      )}
                    </article>
                  );
                })}
              </div>
            </div>
          </section>
        );
      })}
    </main>
  );
}
