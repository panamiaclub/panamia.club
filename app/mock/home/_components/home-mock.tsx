'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ScrollReveal from '@/components/scroll-reveal';
import {
  HomeFirstScreen,
  HomeBasics,
  HomePillars,
} from '@/components/home/sections';
import {
  HomeArticleRail,
  MOCK_HOME_ARTICLES,
} from '@/components/home/article-rail';
import { GetInvolvedQuiz } from '@/components/home/get-involved-quiz';
import { useStoryBeats, type StoryBeat } from '@/components/home/content';
import {
  MockControls,
  type Density,
  type WelcomeCardsMode,
} from './mock-controls';
import styles from './welcome-cards.module.css';

/**
 * The shared homepage inside a review harness. The Welcome Pana proposal is
 * passed as an override; `/` keeps its current four cards. Proposed copy lives
 * under `mock.welcomeCards` in the home namespace, and the three-card layout
 * is scoped to this route rather than changing the shared stylesheet.
 * Closed cards show verbatim previews; their disclosures contain the full
 * proposed copy and the existing supporting notes.
 *
 * On density: the old site's vertical rhythm was a full-viewport hero plus
 * `py-16 md:py-24` on every band, which is where most of its empty space came
 * from. Rather than bury a new number, the bar carries a switch: `compact` is
 * what `/` ships, `roomy` is what the site used to do, and the two are a
 * click apart so the difference can be judged rather than argued about. Only
 * the rhythm changes — no copy, no colour, nothing reflows to a different
 * layout.
 */
export function HomeMock() {
  const [density, setDensity] = useState<Density>('compact');
  const [cards, setCards] = useState<WelcomeCardsMode>('proposed');
  const { t } = useTranslation('home');
  const defaultBeats = useStoryBeats();
  const getBeat = (id: string) => {
    const beat = defaultBeats.find((item) => item.id === id);
    if (!beat) throw new Error(`Missing homepage story beat: ${id}`);
    return beat;
  };
  const pana = getBeat('pana');
  const local = getBeat('local');
  const welcomeBeats: StoryBeat[] = [
    {
      ...pana,
      question: t('mock.welcomeCards.pana.question'),
      aside: t('mock.welcomeCards.pana.pronunciation'),
      body: [
        {
          kind: 'paragraph',
          text: t('mock.welcomeCards.pana.definitions.friend'),
          emphasis: 'strong',
        },
      ],
      more: t('beats.pana.more'),
      detail: [
        {
          kind: 'definition',
          term: t('mock.welcomeCards.pana.term'),
          pronunciation: t('mock.welcomeCards.pana.pronunciation'),
          items: [
            t('mock.welcomeCards.pana.definitions.friend'),
            t('mock.welcomeCards.pana.definitions.community'),
            t('mock.welcomeCards.pana.definitions.club'),
            t('mock.welcomeCards.pana.definitions.lifestyle'),
          ],
        },
        { kind: 'example', text: t('mock.welcomeCards.pana.example') },
        ...pana.detail.filter((block) => block.kind === 'list'),
      ],
    },
    {
      ...local,
      id: 'future-local',
      question: t('mock.welcomeCards.futureLocal.question'),
      body: [
        {
          kind: 'paragraph',
          text: t('mock.welcomeCards.futureLocal.belief'),
          emphasis: 'strong',
        },
      ],
      more: t('mock.welcomeCards.futureLocal.more'),
      detail: [
        {
          kind: 'paragraph',
          text: t('mock.welcomeCards.futureLocal.belief'),
          emphasis: 'strong',
        },
        {
          kind: 'heading',
          text: t('mock.welcomeCards.futureLocal.connectionQuestion'),
        },
        {
          kind: 'paragraph',
          text: t('mock.welcomeCards.futureLocal.change'),
          emphasis: 'strong',
        },
        {
          kind: 'paragraph',
          text: t('mock.welcomeCards.futureLocal.home'),
          emphasis: 'strong',
        },
        ...local.detail,
      ],
    },
    getBeat('why'),
  ];
  useMockChromeHeight();

  return (
    <>
      <MockControls
        density={density}
        onDensityChange={setDensity}
        cards={cards}
        onCardsChange={setCards}
      />
      <ScrollReveal />

      <div className="flex min-h-screen flex-col" data-density={density}>
        <HomeFirstScreen />
        <div
          className={cards === 'proposed' ? styles.welcomeCards : undefined}
          data-welcome-cards={cards}
        >
          <HomeBasics
            key={cards}
            beats={cards === 'proposed' ? welcomeBeats : undefined}
          />
        </div>
        <HomePillars />
        <HomeArticleRail initialArticles={MOCK_HOME_ARTICLES} />
        <GetInvolvedQuiz />

        {/* Every mock says where it came from, so a screenshot taken out of
            context still names its own route. */}
        <p className="story-colophon py-6 text-center text-xs font-bold tracking-wider uppercase opacity-55">
          Design mock · /mock/home ·{' '}
          {cards === 'proposed'
            ? 'three-card Welcome Pana proposal'
            : 'current homepage cards'}
        </p>
      </div>
    </>
  );
}

/**
 * Publishes the mock control bar's height as `--mock-chrome-h`.
 *
 * The bar floats over the foot of the window on this route, so it covers the
 * bottom of whatever the first screen ends with — which, since the first
 * screen ends with the scroll hint, would be the one line on the page whose
 * entire job is to be read. Measuring it means the first screen ends where
 * the *usable* window ends rather than where the window ends.
 *
 * It has to be measured rather than written down: the bar is a wrapping flex
 * row, so it is one line on a laptop and three on a phone, and its height
 * moves with its content rather than with a breakpoint.
 *
 * Mock-only. `/` has no bar, never sets the variable, and the `0px` fallback
 * in the stylesheet puts the town back on the fold.
 */
function useMockChromeHeight() {
  useEffect(() => {
    const bar = document.querySelector('.bizprofile-mockbar');
    if (!bar) return;

    const root = document.documentElement;
    const publish = () => {
      // The bar is inset from the bottom of the window as well as being tall,
      // and both halves of that hide things.
      const gap = window.innerHeight - bar.getBoundingClientRect().bottom;
      root.style.setProperty(
        '--mock-chrome-h',
        `${Math.round(bar.getBoundingClientRect().height + Math.max(gap, 0))}px`
      );
    };

    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(bar);
    window.addEventListener('resize', publish);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', publish);
      root.style.removeProperty('--mock-chrome-h');
    };
  }, []);
}
