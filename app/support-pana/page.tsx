'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, HandCoins, HeartHandshake, Megaphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import styles from '../about-us/AboutUsPage.module.css';

const TIERS = [
  ['dePana', '$10+', 'Support the shared tools and community archive.'],
  ['Pana Confiado', '$15+', 'Add discounts and access across Pana programs.'],
  ['Pana Real', '$25+', 'Help fund experiments, events, and what comes next.'],
] as const;

export default function SupportPanaPage() {
  const { t } = useTranslation('about');
  const { t: tCommon } = useTranslation('common');

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <Image
          src="/img/about/floridamap_panamia.jpg"
          alt="Florida map with Pana MIA"
          fill
          priority
          className={styles.heroImage}
        />
        <div className={styles.heroWash} />
        <div className={styles.heroContent}>
          <p className={styles.eyebrow}>{t('support.eyebrow')}</p>
          <h1>{tCommon('nav.siteMenu.supportPana')}</h1>
          <p className={styles.heroLead}>{t('support.p1')}</p>
        </div>
      </header>

      <nav className={styles.pageNav} aria-label="Support Pana sections">
        <div className={styles.pageNavInner}>
          <Link href="#giving-circle">
            {tCommon('nav.siteMenu.givingCircle')}
          </Link>
          <Link href="#sponsorship">
            {tCommon('nav.siteMenu.sponsorship')}
          </Link>
        </div>
      </nav>

      <section id="giving-circle" className={styles.story}>
        <div className={styles.sectionInner}>
          <div className={styles.sectionHeading}>
            <span>01</span>
            <div>
              <p className={styles.eyebrow}>Monthly community support</p>
              <h2>{tCommon('nav.siteMenu.givingCircle')}</h2>
            </div>
          </div>
          <p className={styles.sectionIntro}>{t('support.p2')}</p>
          <div className={styles.pillarGrid}>
            {TIERS.map(([name, amount, body], index) => (
              <article
                key={name}
                className={styles.pillarCard}
                data-accent={['blue', 'orange', 'coral'][index]}
              >
                <span className={styles.pillarNumber}>{amount} monthly</span>
                <h3>{name}</h3>
                <p>{body}</p>
                <ul>
                  <li>Member benefits</li>
                  <li>Local discounts</li>
                  <li>Program updates</li>
                </ul>
              </article>
            ))}
          </div>
          <div style={{ marginTop: '2rem' }}>
            <Link href="/donate" className={styles.supportCta}>
              Join the giving circle
              <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <section id="sponsorship" className={styles.projects}>
        <div className={styles.sectionInner}>
          <div className={styles.projectsHeading}>
            <p className={styles.eyebrow}>
              {tCommon('nav.siteMenu.sponsorship')}
            </p>
            <h2>Put your resources behind local connection.</h2>
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
    </main>
  );
}
