'use client';

import { useEffect, useState } from 'react';
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
import { MockControls, type Density } from './mock-controls';

/**
 * The shared homepage inside a density review harness. The approved welcome
 * cards use the same content, disclosure renderer and stylesheet as `/`.
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
  useMockChromeHeight();

  return (
    <>
      <MockControls density={density} onDensityChange={setDensity} />
      <ScrollReveal />

      <div className="flex min-h-screen flex-col" data-density={density}>
        <HomeFirstScreen />
        <HomeBasics />
        <HomePillars />
        <HomeArticleRail initialArticles={MOCK_HOME_ARTICLES} />
        <GetInvolvedQuiz />

        {/* Every mock says where it came from, so a screenshot taken out of
            context still names its own route. */}
        <p className="story-colophon py-6 text-center text-xs font-bold tracking-wider uppercase opacity-55">
          Design mock · /mock/home · the live homepage in a density harness
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
