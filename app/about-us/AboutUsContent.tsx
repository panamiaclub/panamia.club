'use client';

import { useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, HeartHandshake, MapPin, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { usePillars, useLocalMovementBeat } from '@/components/home/content';
import styles from './AboutUsPage.module.css';

const TEAM = [
  {
    name: 'Bee Maria',
    roleKey: 'team.copywriter',
    image: '/img/about/bee_maria.jpg',
  },
  {
    name: 'Jeremy Downs',
    roleKey: 'team.technicalAdvisor',
    image: '/img/about/jdowns.jpg',
  },
  {
    name: 'Genesis Barrios',
    roleKey: 'team.webDeveloper',
    image: '/img/about/gbarrios.jpg',
  },
] as const;

const PROJECTS = [
  {
    key: 'directorio',
    titleKey: 'projects.tab1',
    bodyKey: 'projects.directorio',
    href: '/directory',
    accent: 'blue',
  },
  {
    key: 'leolero',
    titleKey: 'projects.tab2',
    bodyKey: 'projects.leolero',
    href: '/a',
    accent: 'yellow',
  },
  {
    key: 'panavizion',
    titleKey: 'projects.tab3',
    bodyKey: 'projects.panavizion',
    href: '/vizion',
    accent: 'pink',
  },
] as const;

function scrollToSection(section: string) {
  document.getElementById(section)?.scrollIntoView({
    behavior: 'instant',
    block: 'start',
  });
}

export default function AboutUsContent({ section }: { section?: string }) {
  const { t } = useTranslation('about');
  const { t: tHome } = useTranslation('home');
  const whyLocal = useLocalMovementBeat();
  const pillars = usePillars();

  useEffect(() => {
    if (!section || window.location.hash) return;

    const frame = requestAnimationFrame(() => scrollToSection(section));
    return () => cancelAnimationFrame(frame);
  }, [section]);

  function handleSectionNavigation(
    target: string,
    event: { preventDefault(): void }
  ) {
    if (target !== section) return;
    event.preventDefault();
    scrollToSection(target);
  }

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <Image
          src="/img/about/florida.jpg"
          alt=""
          fill
          priority
          className={styles.heroImage}
        />
        <div className={styles.heroWash} />
        <div className={styles.heroContent}>
          <p className={styles.eyebrow}>{t('hero.eyebrow')}</p>
          <h1>{t('hero.title')}</h1>
          <p className={styles.heroLead}>{t('hero.subheadline')}</p>
          <div className={styles.heroFacts}>
            <span>
              <MapPin aria-hidden="true" />
              {t('hero.region')}
            </span>
            <span>
              <HeartHandshake aria-hidden="true" />
              {t('hero.nonprofit')}
            </span>
          </div>
        </div>
      </header>

      <nav className={styles.pageNav} aria-label={t('pageNav.label')}>
        <div className={styles.pageNavInner}>
          <Link
            href="/about-us/our-story"
            scroll={false}
            onNavigate={(event) => handleSectionNavigation('our-story', event)}
          >
            {t('story.title')}
          </Link>
          <Link
            href="/about-us/why-local"
            scroll={false}
            onNavigate={(event) => handleSectionNavigation('why-local', event)}
          >
            {tHome('beats.local.question')}
          </Link>
          <Link
            href="/about-us/pillars"
            scroll={false}
            onNavigate={(event) => handleSectionNavigation('pillars', event)}
          >
            {t('pillars.title')}
          </Link>
          <Link
            href="/about-us/meet-the-team"
            scroll={false}
            onNavigate={(event) =>
              handleSectionNavigation('meet-the-team', event)
            }
          >
            {t('team.title')}
          </Link>
        </div>
      </nav>

      <section className={styles.mission}>
        <div className={styles.sectionInner}>
          <div className={styles.missionStatement}>
            <p className={styles.eyebrow}>{t('mission.title')}</p>
            <h2>{t('vision.subheadline')}</h2>
          </div>
          <div className={styles.missionCopy}>
            <p>{t('mission.body')}</p>
            <p className={styles.nonprofitNote}>{t('vision.body')}</p>
          </div>
        </div>
      </section>

      <section
        id="our-story"
        className={`${styles.story} ${styles.firstSection}`}
      >
        <div className={styles.sectionInner}>
          <div className={styles.sectionHeading}>
            <span>01</span>
            <div>
              <p className={styles.eyebrow}>{t('story.eyebrow')}</p>
              <h2>{t('story.title')}</h2>
            </div>
          </div>

          <div className={styles.storyGrid}>
            <figure className={styles.foundersPhoto}>
              <Image
                src="/img/about/clari_and_anette.webp"
                alt={t('story.photoAlt')}
                width={900}
                height={1100}
              />
              <figcaption>{t('story.caption')}</figcaption>
            </figure>
            <div className={styles.storyCopy}>
              <p className={styles.storyOpening}>{t('story.p1')}</p>
              <p>{t('story.p2')}</p>
              <blockquote>{t('story.pullQuote')}</blockquote>
            </div>
          </div>
        </div>
      </section>

      {whyLocal ? (
        <section id="why-local" className={styles.whyLocal}>
          <div className={styles.sectionInner}>
            <div className={styles.sectionHeading}>
              <span>02</span>
              <div>
                <p className={styles.eyebrow}>{t('whyLocal.eyebrow')}</p>
                <h2>{whyLocal.question}</h2>
              </div>
            </div>

            <div className={styles.whyGrid}>
              <div className={styles.mapFrame}>
                <Image
                  src="/img/impact/county-map.webp"
                  alt={whyLocal.scene.alt}
                  width={800}
                  height={600}
                />
              </div>
              <div className={styles.whyCopy}>
                <p className={styles.whyAnswer}>{whyLocal.answer}</p>
                {whyLocal.detail.map((block) =>
                  block.kind === 'list' ? (
                    <div key={block.label}>
                      <h3>{block.label}</h3>
                      <ul>
                        {block.items.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null
                )}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section id="pillars" className={styles.pillars}>
        <div className={styles.sectionInner}>
          <div className={styles.sectionHeading}>
            <span>03</span>
            <div>
              <p className={styles.eyebrow}>{t('pillars.eyebrow')}</p>
              <h2>{t('pillars.title')}</h2>
            </div>
          </div>
          <p className={styles.sectionIntro}>{t('pillars.intro')}</p>

          <div className={styles.pillarGrid}>
            {pillars.map((pillar, index) => (
              <article
                key={pillar.id}
                className={styles.pillarCard}
                data-accent={pillar.accent}
              >
                <span className={styles.pillarNumber}>
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h3>{pillar.name}</h3>
                <p>{pillar.answer}</p>
                <ul>
                  {pillar.programs.map((program) => (
                    <li key={program.name}>
                      {program.href ? (
                        <Link href={program.href}>{program.name}</Link>
                      ) : (
                        program.name
                      )}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="meet-the-team" className={styles.people}>
        <div className={styles.sectionInner}>
          <div className={styles.sectionHeading}>
            <span>04</span>
            <div>
              <p className={styles.eyebrow}>{t('team.eyebrow')}</p>
              <h2>{t('team.title')}</h2>
            </div>
          </div>

          <div className={styles.founderGrid}>
            <article className={styles.founderCard}>
              <Image
                src="/img/about/anette_mago.jpg"
                alt="Anette Mago"
                width={640}
                height={800}
              />
              <div>
                <h3>{t('board.anette.name')}</h3>
                <p>{t('board.anette.bio')}</p>
              </div>
            </article>
            <article className={styles.founderCard}>
              <Image
                src="/img/about/claribel_avila.jpg"
                alt="Claribel Avila"
                width={640}
                height={800}
              />
              <div>
                <h3>{t('board.claribel.name')}</h3>
                <p>{t('board.claribel.bio')}</p>
              </div>
            </article>
          </div>

          <div className={styles.teamGrid}>
            {TEAM.map((member) => (
              <article key={member.name} className={styles.teamCard}>
                <Image
                  src={member.image}
                  alt={member.name}
                  width={400}
                  height={400}
                />
                <h3>{member.name}</h3>
                <p>{t(member.roleKey)}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="collaborative-projects" className={styles.projects}>
        <div className={styles.sectionInner}>
          <div className={styles.projectsHeading}>
            <p className={styles.eyebrow}>{t('projects.eyebrow')}</p>
            <h2>{t('projects.title')}</h2>
            <p>{t('projects.intro')}</p>
          </div>
          <div className={styles.projectGrid}>
            {PROJECTS.map((project) => (
              <article
                key={project.key}
                className={styles.projectCard}
                data-accent={project.accent}
              >
                <h3>{t(project.titleKey)}</h3>
                <p>{t(project.bodyKey)}</p>
                <Link href={project.href}>
                  {t('projects.explore')}
                  <ArrowRight aria-hidden="true" />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.support}>
        <div className={styles.supportArt}>
          <Users aria-hidden="true" />
        </div>
        <div>
          <p className={styles.eyebrow}>{t('support.eyebrow')}</p>
          <h2>{t('support.title')}</h2>
          <p>{t('support.p1')}</p>
        </div>
        <Link href="/donate" className={styles.supportCta}>
          {t('support.ctaShort')}
          <ArrowRight aria-hidden="true" />
        </Link>
      </section>
    </main>
  );
}
