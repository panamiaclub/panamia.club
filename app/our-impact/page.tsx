'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Download, Network, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import styles from '../about-us/AboutUsPage.module.css';

const STORIES = [
  {
    titleKey: 'filmfest.title',
    bodyKey: 'filmfest.body1',
    image: '/img/impact/filmfest-collab-left.webp',
  },
  {
    titleKey: 'heatwave.title',
    bodyKey: 'heatwave.item2',
    image: '/img/impact/heatwave-visions.webp',
  },
  {
    titleKey: 'zine.title',
    bodyKey: 'zine.body3',
    image: '/img/impact/zine-series.webp',
  },
] as const;

export default function OurImpactPage() {
  const { t } = useTranslation('impact');
  const { t: tCommon } = useTranslation('common');
  const { t: tOfferings } = useTranslation('offerings');

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <Image
          src="/img/impact/hero-mixer.webp"
          alt={t('alt.heroMixer')}
          fill
          priority
          className={styles.heroImage}
        />
        <div className={styles.heroWash} />
        <div className={styles.heroContent}>
          <p className={styles.eyebrow}>{t('hero.eyebrow')}</p>
          <h1>{tCommon('nav.siteMenu.ourImpact')}</h1>
          <p className={styles.heroLead}>{t('hero.intro')}</p>
          <div className={styles.heroFacts}>
            <span>17 events sponsored</span>
            <span>5,000+ people reached</span>
            <span>3 South Florida counties</span>
          </div>
        </div>
      </header>

      <nav className={styles.pageNav} aria-label="Our Impact sections">
        <div className={styles.pageNavInner}>
          <Link href="#community-connectors">
            {tCommon('nav.siteMenu.communityConnectorsProgram')}
          </Link>
          <Link href="#stories-of-impact">
            {tCommon('nav.siteMenu.storiesOfImpact')}
          </Link>
          <Link href="#download-impact">
            {tCommon('nav.siteMenu.downloadOurImpact')}
          </Link>
        </div>
      </nav>

      <section className={styles.mission}>
        <div className={styles.sectionInner}>
          <div className={styles.missionStatement}>
            <p className={styles.eyebrow}>{t('believe.title')}</p>
            <h2>{t('localImpact.title')}</h2>
          </div>
          <div className={styles.missionCopy}>
            <p>{t('believe.body1')}</p>
            <p>{t('believe.body2')}</p>
          </div>
        </div>
      </section>

      <section id="community-connectors" className={styles.story}>
        <div className={styles.sectionInner}>
          <div className={styles.sectionHeading}>
            <span>01</span>
            <div>
              <p className={styles.eyebrow}>
                {tOfferings('connectors.eyebrow')}
              </p>
              <h2>
                {tCommon('nav.siteMenu.communityConnectorsProgram')}
              </h2>
            </div>
          </div>
          <div className={styles.storyGrid}>
            <figure className={styles.foundersPhoto}>
              <Image
                src="/img/impact/community-group.webp"
                alt={t('alt.communityGroup')}
                width={1600}
                height={886}
              />
            </figure>
            <div className={styles.storyCopy}>
              <p className={styles.storyOpening}>
                {tOfferings('connectors.lede')}
              </p>
              <p>{t('filmfest.body4')}</p>
              <Link href="/connectors" className={styles.supportCta}>
                {tOfferings('connectors.ctaPrimary')}
                <ArrowRight aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section id="stories-of-impact" className={styles.projects}>
        <div className={styles.sectionInner}>
          <div className={styles.projectsHeading}>
            <p className={styles.eyebrow}>
              {tCommon('nav.siteMenu.storiesOfImpact')}
            </p>
            <h2>{t('culture.title')}</h2>
            <p>{t('culture.body')}</p>
          </div>
          <div className={styles.projectGrid}>
            {STORIES.map((story) => (
              <article key={story.titleKey} className={styles.projectCard}>
                <Image
                  src={story.image}
                  alt=""
                  width={800}
                  height={600}
                  style={{
                    width: '100%',
                    height: '180px',
                    objectFit: 'cover',
                    marginBottom: '1.25rem',
                  }}
                />
                <h3>{t(story.titleKey)}</h3>
                <p>{t(story.bodyKey)}</p>
                <Link href="/impact#stories-of-impact">
                  Read the full story
                  <ArrowRight aria-hidden="true" />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="download-impact" className={styles.support}>
        <div className={styles.supportArt}>
          <Download aria-hidden="true" />
        </div>
        <div>
          <p className={styles.eyebrow}>
            {tCommon('nav.siteMenu.downloadOurImpact')}
          </p>
          <h2>{t('hero.title')}</h2>
          <p>{t('meta.description')}</p>
        </div>
        <Link href="/impact" className={styles.supportCta}>
          View the full report
          <ArrowRight aria-hidden="true" />
        </Link>
      </section>

      <section className={styles.support} aria-label="Impact partnership">
        <div className={styles.supportArt}>
          <Network aria-hidden="true" />
        </div>
        <div>
          <p className={styles.eyebrow}>{t('partners.title')}</p>
          <h2>Impact is collaborative.</h2>
          <p>{t('filmfest.thanks')}</p>
        </div>
        <Link href="/ecosystem" className={styles.supportCta}>
          Meet the ecosystem
          <Sparkles aria-hidden="true" />
        </Link>
      </section>
    </main>
  );
}
