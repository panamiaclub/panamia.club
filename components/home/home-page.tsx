'use client';

import ScrollReveal from '@/components/scroll-reveal';
import {
  HomeFirstScreen,
  HomeBasics,
  HomePillars,
} from '@/components/home/sections';
import { GetInvolvedQuiz } from '@/components/home/get-involved-quiz';
import {
  HomeArticleRail,
  MOCK_HOME_ARTICLES,
} from '@/components/home/article-rail';
import { WelcomeFooter } from '@/components/home/welcome-footer';

/**
 * The Pana Mia homepage.
 *
 * The homepage follows the order the panas who brought the Community
 * Connectors deck over described: search, the questions everyone asks, the
 * pillars the organisation is building, stories from the collective, then an
 * involvement chooser for the ask. The reasoning for the original cut is on
 * the sections themselves in `components/home/sections.tsx`.
 *
 * The composition lives there rather than here because `/mock/home` renders
 * the same sections inside a density-toggle harness. There is one
 * implementation of this page, and the mock is a lens on it.
 *
 * Extracted out of `app/page.tsx` when that route became host-aware: `/` now
 * serves this on the main site and the Pana Social feed on a surface
 * hostname, so the route file decides and the pages themselves stay dumb.
 *
 * `data-density` is the knob the mock's toggle drives, and it is what scopes
 * the whole design: the palette, the section rhythm and every `.story-*` rule
 * hang off it. `compact` is the rhythm this page was designed and reviewed
 * at — the alternative, `roomy`, is the old site's full-viewport-hero,
 * `py-24`-everywhere spacing, which is where most of the old page's empty
 * space came from.
 */
export function HomePage({
  welcomeFooterPreview = false,
}: {
  welcomeFooterPreview?: boolean;
} = {}) {
  return (
    <>
      <ScrollReveal />

      <div className="flex min-h-screen flex-col" data-density="compact">
        <HomeFirstScreen />
        <HomeBasics />
        <HomePillars />
        <HomeArticleRail initialArticles={MOCK_HOME_ARTICLES} />
        <GetInvolvedQuiz />
      </div>
      <WelcomeFooter preview={welcomeFooterPreview} />
    </>
  );
}
