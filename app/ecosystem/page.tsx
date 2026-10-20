'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, BadgeCheck, Handshake, Landmark } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import styles from '../about-us/AboutUsPage.module.css';

const PARTNERS = [
  'partner-miami-workers-center',
  'partner-dale',
  'partner-our-florida',
  'partner-10-days-of-connection',
  'partner-radical-partners',
  'partner-miami-artist-census',
  'partner-allpeep',
  'partner-we-met-community',
  'partner-subtropic-film-festival',
  'partner-pana-mia-club',
] as const;

export default function EcosystemPage() {
  const { t } = useTranslation('impact');
  const { t: tCommon } = useTranslation('common');
  const { t: tAbout } = useTranslation('about');

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <Image
          src="/img/impact/community-group.webp"
          alt={t('alt.communityGroup')}
          fill
          priority
          className={styles.heroImage}
        />
        <div className={styles.heroWash} />
        <div className={styles.heroContent}>
          <p className={styles.eyebrow}>People · Projects · Resources</p>
          <h1>{tCommon('nav.siteMenu.ourEcosystem')}</h1>
          <p className={styles.heroLead}>
            The relationships that make local work possible—from the people
            building alongside us to the organizations funding the next step.
          </p>
        </div>
      </header>

      <nav className={styles.pageNav} aria-label="Our Ecosystem sections">
        <div className={styles.pageNavInner}>
          <Link href="#collaborative-partners">
            {tCommon('nav.siteMenu.collaborativePartners')}
          </Link>
          <Link href="#collaborative-projects">
            {tCommon('nav.siteMenu.collaborativeProjects')}
          </Link>
          <Link href="#pana-certified">
            {tCommon('nav.siteMenu.panaCertified')}
          </Link>
          <Link href="#sponsors-funders">
            {tCommon('nav.siteMenu.sponsorsFunders')}
          </Link>
        </div>
      </nav>

      <section id="collaborative-partners" className={styles.story}>
        <div className={styles.sectionInner}>
          <div className={styles.sectionHeading}>
            <span>01</span>
            <div>
              <p className={styles.eyebrow}>Shared work</p>
              <h2>{tCommon('nav.siteMenu.collaborativePartners')}</h2>
            </div>
          </div>
          <p className={styles.sectionIntro}>{t('believe.body1')}</p>
          <div className={styles.projectGrid}>
            {PARTNERS.map((partner) => (
              <article key={partner} className={styles.projectCard}>
                <Image
                  src={`/img/impact/${partner}.webp`}
                  alt=""
                  width={300}
                  height={200}
                  style={{
                    width: '100%',
                    height: '130px',
                    objectFit: 'contain',
                    margin: 'auto 0',
                  }}
                />
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="collaborative-projects" className={styles.projects}>
        <div className={styles.sectionInner}>
          <div className={styles.projectsHeading}>
            <p className={styles.eyebrow}>
              {tCommon('nav.siteMenu.collaborativeProjects')}
            </p>
            <h2>{tAbout('projects.title')}</h2>
            <p>{tAbout('projects.intro')}</p>
          </div>
          <div className={styles.projectGrid}>
            {[
              ['projects.tab1', 'projects.directorio', '/directory'],
              ['projects.tab2', 'projects.leolero', '/a'],
              ['projects.tab3', 'projects.panavizion', '/vizion'],
            ].map(([title, body, href]) => (
              <article key={title} className={styles.projectCard}>
                <h3>{tAbout(title)}</h3>
                <p>{tAbout(body)}</p>
                <Link href={href}>
                  {tAbout('projects.explore')}
                  <ArrowRight aria-hidden="true" />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="pana-certified" className={styles.whyLocal}>
        <div className={styles.sectionInner}>
          <div className={styles.sectionHeading}>
            <span>03</span>
            <div>
              <p className={styles.eyebrow}>Trust travels locally</p>
              <h2>{tCommon('nav.siteMenu.panaCertified')}</h2>
            </div>
          </div>
          <div className={styles.whyGrid}>
            <div className={styles.mapFrame}>
              <BadgeCheck
                aria-hidden="true"
                style={{ width: 180, height: 180, color: 'white' }}
              />
            </div>
            <div className={styles.whyCopy}>
              <p className={styles.whyAnswer}>
                Reviewed and vouched for by Pana MIA.
              </p>
              <p>
                Certification is a visible signal that a listing is locally
                rooted, community-minded, and known through real relationships.
              </p>
              <Link href="/directory/search" className={styles.supportCta}>
                Explore certified Panas
                <ArrowRight aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section id="sponsors-funders" className={styles.support}>
        <div className={styles.supportArt}>
          <Landmark aria-hidden="true" />
        </div>
        <div>
          <p className={styles.eyebrow}>
            {tCommon('nav.siteMenu.sponsorsFunders')}
          </p>
          <h2>Resource the work, not just the moment.</h2>
          <p>{t('filmfest.body4')}</p>
        </div>
        <Link href="/support-pana#sponsorship" className={styles.supportCta}>
          Sponsor Pana
          <Handshake aria-hidden="true" />
        </Link>
      </section>
    </main>
  );
}
