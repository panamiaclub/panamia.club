'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useTranslation, Trans } from 'react-i18next';
import { DirectorySuggest } from '@/components/directory-suggest';
import { ScopeMenu } from '@/components/directory-scope-bar';
import { useSession } from '@/lib/auth-client';
import {
  DEFAULT_SCOPE,
  scopePlaceholderKey,
  scopePlaceholderShortKey,
  type Scope,
} from '@/lib/directory-scopes';
import { StoryBeats } from './story-beats';
import { SkyClouds, StreetScene } from './scene-art';
import { PillarPanels } from './pillar-panels';
import { useIsRail } from './rail';
import { useStoryBeats, usePillars } from './content';

/**
 * The homepage, told as one continuous scene.
 *
 * The page it replaced ran eleven sections. This one runs four, because the
 * panas who came over with the Community Connectors deck were describing a
 * front page that answers three questions in order and then asks for
 * something:
 *
 *   1. Search        — what are you looking for? (unchanged, it already works)
 *   2. The street    — what is this place, and why does it exist?
 *   3. The pillars   — what is actually being built?
 *   4. Get involved  — choose a path, or let the quiz recommend one.
 *
 * The scene is the newer idea and the load-bearing one. Pana MIA's whole
 * argument is about a physical place — these counties, these blocks, the
 * people on them — and the page was making that argument entirely in prose on
 * a flat background. So the page now starts in the sky, comes down past a row
 * of houses, shops and a park, and walks you along it. The sections did not
 * move; the ground under them arrived.
 *
 * What the four-card cut costs, and where it goes:
 *
 * - The category index, Featured Panas and the events band all restate the
 *   directory, which the search at the top already opens. They belong on
 *   /directory/search, which is where someone who used the search lands
 *   anyway.
 * - The FAQ's first three rows are now the three stops; the rest are
 *   onboarding questions (cost, eligibility, terms) that belong next to the
 *   join form, not on a front page.
 * - The impact band's figures are still unset, and a row of em dashes is not
 *   worth a fold. It comes back when there is a counts endpoint.
 * - "Community is a form of power" (Gather / Connect / Celebrate) is replaced
 *   outright. It was three verbs written for the site; the pillars are the
 *   organisation's own three-part account of its work, and having both would
 *   be the homepage disagreeing with the deck.
 *
 * These are exported as parts rather than as one `<HomePage>` because
 * `/mock/home` renders exactly the same sections inside a density-toggle
 * harness. Sharing the parts is what makes the mock a preview of this page
 * rather than a second copy of it that drifts.
 */

/* -------------------------------------------------------------------------
   1. Search, and the street it stands on
   ------------------------------------------------------------------------- */

/**
 * The first screen: the search card, the town, and the line telling you to
 * keep going.
 *
 * The card and the town are one composition, so they are measured as one:
 * together they are exactly the height of the screen, which puts the street —
 * the ground line, the market, the people — on the bottom edge of the first
 * view at any resolution. Separately they were 79-211px too tall for a laptop
 * and the town's feet were the part that fell off.
 */
export function HomeFirstScreen() {
  const { t } = useTranslation('home');

  return (
    <div className="home-first">
      <HeroCard />
      <StreetBand />
      {/* Last line on the first screen, under the town rather than over it:
          the town is the thing you are being told to scroll past, so the
          instruction reads after it.

          It is a button because it was already an instruction — telling
          someone to scroll and then making them do it by hand is a worse
          version of the same thing. It lands on the next section's top edge
          rather than jumping a viewport, so the answer card arrives framed
          rather than halfway up the screen. */}
      <button
        type="button"
        className="story-street-note"
        onClick={() => {
          const next = document.getElementById('what-is-this');
          if (!next) return;
          const reduced = window.matchMedia(
            '(prefers-reduced-motion: reduce)'
          ).matches;
          next.scrollIntoView({
            behavior: reduced ? 'auto' : 'smooth',
            block: 'start',
          });
        }}
      >
        {t('hero.scrollNote')}
      </button>
    </div>
  );
}

/* The full placeholder is ~270px of text; the input it sits in is 138px wide
   on a 390px phone, so it was being cut mid-word. Below this width each scope
   uses its short placeholder instead. */
const HERO_SEARCH_SHORT_QUERY = '(max-width: 39.99rem)';

function HeroCard() {
  const { t } = useTranslation('home');
  /* The scope placeholders live in `common` beside `search.kind.*`, which the
     same field already reads, rather than in `home` — the directory and the
     explore pages need the same four strings. */
  const { t: tCommon } = useTranslation('common');
  const useShortSearchLabel = useIsRail(HERO_SEARCH_SHORT_QUERY);

  /* MainHeader already reads the session on this page, so this shares the
     auth client's cache rather than costing the homepage a second request. */
  const { data: session, status } = useSession();
  const signedIn = status !== 'loading' && !!session;

  /* The scope the box will search, held here rather than in the URL. Nothing
     has been searched yet, so there is no route to put it in — picking a scope
     on the homepage is choosing a question, and submitting is asking it. */
  const [scope, setScope] = useState<Scope>(DEFAULT_SCOPE);

  /* The rotating placeholder went with the Everything scope. It cycled
     "Businesses, Panas, Groups, Events" because the field had no other way to
     say it covered all four; now a chip inside the same pill says which one,
     and a placeholder cycling the other three would be the field arguing with
     its own control. */
  const placeholder = tCommon(
    useShortSearchLabel
      ? scopePlaceholderShortKey(scope)
      : scopePlaceholderKey(scope)
  );

  /* The visible label and the field's accessible name, both scope-aware and
     both the same string. They used to be two fixed `home` keys that said
     "Search directory" and "Search the directory" — which was merely wordy
     while the box only searched one thing, and became wrong the moment the
     menu above could change what it searched: picking Events left a field
     labelled "Search directory" sitting under a control that said Events.

     The short placeholder is reused rather than a third set of strings being
     added, because it is already the shortest true sentence about what this
     box searches, which is exactly what a label is. Matching the two also
     satisfies label-in-name: a voice-control user saying "search events" hits
     the thing the screen says "Search events". */
  const scopeLabel = tCommon(scopePlaceholderShortKey(scope));

  return (
    /* No scalloped trim across the top. The scallop is a good edge when two
       different colours meet and the seam is worth decorating — it is how
       `.point` announces itself against the section above. Here the masthead
       and the top of this card are the same colour, so there is no seam to
       dress: the trim was drawing an edge rather than finishing one, which
       made the card read as a shape pasted onto the page instead of the top
       of it.

       There is no field behind the search either — no photograph, no wash, no
       sky. The card is the same paper as the masthead above it and the street
       below it, and the only thing drawn on it is a soft pool of orange light
       sitting under the search box. Everything this card has to say is now
       said by four things in a column: the wordmark, the headline, the
       mission and the one box you can type in. */
    <section className="home-hero-banner home-hero-field">
      <SkyClouds />
      <div className="home-hero-grain" aria-hidden="true" />

      <div className="relative z-10 container mx-auto px-4">
        {/* The wordmark ships as white and as four brand colours. On the old
            dark field the white file was the only one that held; on cream the
            orange can be used as it is, which is also the file the site
            header uses — so the two agree now instead of one being a black
            silhouette of the other. */}
        <Image
          src="/logos/pana_logo_long_orange.png"
          alt="Pana Mia"
          width={600}
          height={150}
          className="flower-power-logo mx-auto mb-8 h-auto w-full max-w-[min(26rem,70vw)] md:mb-10"
          priority
        />

        <h1 className="hero-headline">
          <Trans
            i18nKey="hero.headline"
            t={t}
            components={{ br: <br />, em: <em className="accent-word" /> }}
          />
        </h1>

        <div className="mx-auto mt-4 max-w-[760px]">
          {/* The mission, cut to one line. The full sentence names the three
              groups and the role the club plays between them, which is the
              right level of detail for an about page and one clause too many
              for the first thing anyone reads. What is left is the claim and
              the reason for it; the three stops further down are where the
              groups get named. */}
          <p className="hero-subheadline">{t('hero.mission')}</p>

          {/* The scope control, and the whole point of this section.
              
              It sits inside the pill rather than beside it because scope is
              part of the question being asked — "events this weekend" is one
              query, not a query plus a page setting — and two adjacent
              capsules say the opposite of that.

              `onSelect` rather than links, unlike every other place this menu
              appears. On a results page each scope is a real route and the
              rows must be navigable. Here there is nothing to navigate to yet:
              the visitor is choosing what to search before typing the thing to
              search for, so the menu sets state and submit carries it. */}
          <DirectorySuggest
            layout="pill"
            scope={scope}
            className="mt-[18px]"
            label={scopeLabel}
            placeholder={placeholder}
            ariaLabel={scopeLabel}
            buttonLabel={t('hero.searchButton')}
            leading={
              <ScopeMenu
                scope={scope}
                term=""
                counts={null}
                signedIn={signedIn}
                onSelect={setScope}
              />
            }
            inputClassName="text-pana-ink h-auto border-0 bg-transparent px-4 py-[18px] text-[16.5px] font-semibold shadow-none placeholder:font-medium placeholder:text-[rgb(17_13_13_/_0.45)] focus-visible:ring-0 md:text-[16.5px]"
          />
        </div>
      </div>
    </section>
  );
}

/**
 * The block the rest of the page stands on.
 *
 * It is its own band rather than decoration bolted to the bottom of the hero
 * or the top of the next section, because it belongs to neither: it is the
 * horizon the search sits above and the ground the three stops sit on, and
 * making it a section of its own is what lets both of those be true without
 * either one owning it.
 *
 * It has no fixed height. It takes whatever the card leaves of the first
 * screen, and the drawing crops rather than scales to fill it, so the street
 * lands on the bottom edge of the screen at any resolution.
 */
function StreetBand() {
  const { t } = useTranslation('home');

  return (
    <section className="story-street" aria-label={t('street.label')}>
      <StreetScene />
    </section>
  );
}

/* -------------------------------------------------------------------------
   2. The three stops
   ------------------------------------------------------------------------- */

export function HomeBasics() {
  const { t } = useTranslation('home');
  const beats = useStoryBeats();

  return (
    <section id="what-is-this" className="home-section story-basics">
      <div className="container mx-auto px-4">
        {/* Just the question. This section used to open with an eyebrow, a
            two-line display heading and a lede explaining that three
            questions follow — three lines of preamble in front of three
            cards that ask and answer their own questions perfectly well.
            The preamble was the least useful thing on the screen and it was
            the thing costing the most height. */}
        <div className="home-sectionhead" data-rv>
          <h2 className="section-display">
            <Trans
              i18nKey="basics.title"
              t={t}
              components={{ em: <em className="display-accent" /> }}
            />
          </h2>
        </div>
      </div>

      {/* Out of the container on purpose. These run the full width so the
          artwork on each one has room to be artwork rather than a thumbnail
          in a column. */}
      <StoryBeats beats={beats} />
    </section>
  );
}

/* -------------------------------------------------------------------------
   3. The three pillars
   ------------------------------------------------------------------------- */

export function HomePillars() {
  const { t } = useTranslation('home');
  const pillars = usePillars();

  return (
    <section id="pillars" className="home-section story-pillars">
      <div className="container mx-auto px-4">
        <div className="home-sectionhead" data-rv>
          <h2 className="section-display">
            <Trans
              i18nKey="pillarsBand.title"
              t={t}
              components={{ br: <br />, em: <em className="display-accent" /> }}
            />
          </h2>
          <p className="section-lede max-w-2xl">{t('pillarsBand.lede')}</p>
        </div>
      </div>

      {/* Out of the container for the same reason the questions above are:
          both rows measure their width against the viewport, so they only
          share a left and right edge if they share a parent. Left inside, the
          pillars measured against the container instead and ran up to 80px
          wider than the questions at the top breakpoint. It also gives the
          rail below 64rem the screen gutter to scroll into, which is what the
          questions already had. */}
      <div data-rv>
        <PillarPanels pillars={pillars} />
      </div>
    </section>
  );
}
