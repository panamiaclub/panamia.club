'use client';

import type { ReactNode } from 'react';
import Image from 'next/image';
import { Trans, useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import SurfaceLink from '@/components/panaverse/SurfaceLink';
import ScrollReveal from '@/components/scroll-reveal';
import { PANA_OFFERINGS, getOffering } from '@/lib/panaverse/offerings';
import { SURFACE_MARK, type SurfaceMark } from '@/lib/panaverse/branding';

/**
 * The drawn wordmark an offering flies above its headline, where it has one.
 *
 * Read straight out of `branding.ts` rather than copied, because that is the
 * file `SurfaceGuestHeader` and `SurfaceMemberHeader` read to dress
 * social.pana.social. A member who meets Pana Social here and then opens it
 * sees the same lettering in the same orange, and the front page cannot drift
 * away from the product's own masthead without the masthead moving too.
 *
 * Only Pana Social is here today — it is the one offering with a surface of
 * its own, so it is the one with a mark that has actually been drawn. The
 * other five fall back to their text eyebrow, which is the honest thing to
 * show rather than setting their names in a typeface pretending to be a logo.
 */
const OFFERING_MARK: Record<string, SurfaceMark | undefined> = {
  social: SURFACE_MARK.social,
};

/**
 * The front page every offering gets, told in the homepage's own language.
 *
 * The homepage answers "what is this place?" in bands — a first screen, the
 * basics, the pillars, then the ask. An offering's front page is the same
 * shape one level down. It reuses the homepage's type (`.hero-headline`,
 * `.section-display`, `.section-lede`), its closing band (`.story-point`) and
 * its palette rather than restating any of them, so the six pages cannot drift
 * away from the page they hang off.
 *
 * What it deliberately does *not* borrow is the first screen. The street scene
 * and the search card are the homepage's own argument — the physical place,
 * and the one box that opens it — and repeating them six times would make each
 * offering look like another copy of the front door rather than a room behind
 * it. These open on the headline instead.
 *
 * ## Why the middle of the page is optional
 *
 * The first version of this rendered one fixed shape six times: headline,
 * three cards titled "What You Get", closing band. Every page therefore made
 * the same argument in the same order, which is a brochure — it lists what a
 * thing has without ever saying what is wrong today or how the thing works.
 *
 * The homepage does not do that. Its pillars run problem → answer → programs
 * and its beats run question → answer → detail. So two optional bands are
 * available here in the same spirit:
 *
 * - `problem`  — the tension. What is broken if this offering does not exist.
 * - `pillars`  — the definition. The two or three things the offering *is*.
 * - `steps`    — the mechanism. How the thing actually works, in order.
 * - `tour`     — the rooms. The screens themselves, one per band, shown.
 *
 * `problem` and `pillars` are alternative openings rather than a pair, and an
 * offering normally defines one of them. Leading with the tension suits a
 * thing whose value only lands once you have felt what is missing; leading
 * with the pillars suits one whose value is the headline itself, where
 * arguing the problem first would delay the answer the reader came for.
 *
 * `steps` and `tour` are likewise alternatives, and for a related reason. A
 * numbered walkthrough is the right shape for an offering you have to be
 * talked through — the order is the explanation. A tour is the right shape
 * for one that is already built and can simply be shown, where the honest
 * answer to "how does it work" is a picture of it working.
 *
 * All three render only when the offering's locale file defines them, which is
 * what lets these pages be written one at a time instead of needing all six
 * rewritten at once. An offering with none falls back to exactly the shape it
 * had before.
 *
 * The shapes are deliberately different from each other — a statement with
 * symptoms, or a statement with named pillars, then a stacked walkthrough,
 * then a row of cards — because three three-across grids in a column is the
 * other way to be monotonous.
 */

export interface OfferingActions {
  /** Where the page's one primary button goes. */
  primary: string;
  /** The secondary button. */
  secondary: string;
}

const HIGHLIGHT_KEYS = ['one', 'two', 'three'] as const;
const SYMPTOM_KEYS = ['one', 'two', 'three'] as const;
const PILLAR_KEYS = ['one', 'two', 'three'] as const;

/* The awning colour each pillar flies, in order. These are the homepage's own
   accent names, read by `.beat[data-accent]`. Warm first, so the row opens in
   the same colour as the page's own accent and the mark above it, then cools
   — three cards in one hue read as a chart rather than as a street. */
const PILLAR_ACCENTS = ['orange', 'paper', 'blue'] as const;
const STEP_KEYS = ['one', 'two', 'three'] as const;

/* The rooms of Pana Social, in the order someone meets them: read the feed,
   find the group, show up to the event, learn who the person is, remember the
   day together. Not a fixed `one/two/three` like the other bands, because
   these are named places in the product rather than positions in an argument,
   and a screenshot of "two" is not a thing anybody can go and look for. */
const TOUR_KEYS = ['feed', 'groups', 'events', 'profiles', 'stories'] as const;

type TourKey = (typeof TOUR_KEYS)[number];

interface TourShot {
  /** Public path to the screenshot, e.g. `/img/social/feed.png`. */
  src: string;
  /** The file's real pixel dimensions. */
  width: number;
  height: number;
}

/**
 * The screenshot each room of a tour shows, once there is one to show.
 *
 * ## Adding a screenshot
 *
 * 1. Drop the file in `public/img/social/` — `feed.webp`, `groups.webp`,
 *    `events.webp`, `profiles.webp`, `stories.webp`.
 * 2. Add its entry below. `width` and `height` are the file's real pixel
 *    dimensions, which `next/image` needs in order to reserve the space
 *    before the file has loaded.
 *
 *    social: { feed: { src: '/img/social/feed.webp', width: 1600, height: 1000 } }
 *
 * Shots are cropped to a 16:10 well from the top, so capture the window at
 * roughly that shape and let the fold do the rest — the top of a screen is
 * the part worth showing anyway.
 *
 * A room with no entry renders an empty frame carrying its own name. That is
 * deliberately a visible gap rather than a drawn mock-up of the product:
 * these pages are read by people deciding whether to trust the thing, and an
 * illustration dressed as a screenshot is a promise about software that may
 * not look like that yet.
 *
 * ## Where the four present shots came from
 *
 * All four are captures of this repo's own design mocks, taken at 1600x1000
 * with the surrounding site header, footer and `.mock-toolbar` removed, so
 * the frame holds the product and nothing else:
 *
 * - `feed` — `/mock/feed`.
 * - `groups` and `events` — `/mock/group`, whose Posts and Events tabs are
 *   two views of one surface. Events is shot there rather than at `/e`
 *   because the point of the room is that an event belongs to the people
 *   already gathered, and the group page is where that is visible.
 * - `profiles` — `/mock/profile-next`, not `/mock/profile`. The `-next` mock
 *   is the identity-rail layout that shipped to `/p/[user]`; the older one is
 *   kept beside it for comparison and no longer matches the product.
 *
 * That last distinction is the trap worth flagging: both mocks render the
 * same fixtures, so a stale capture looks perfectly plausible. Check which
 * layout `app/p/[user]/_components/personal/` actually renders before
 * reshooting.
 *
 * ## Why stories has no shot
 *
 * Not because it is unbuilt — it is. `components/social/StoryRing.tsx` and
 * `app/s/_components/stories-rail.tsx` are live, backed by a batched summary
 * endpoint and a nightly expiry purge, and the ring is already visible on the
 * avatar in `profiles.webp`.
 *
 * It has no shot because it cannot honestly be photographed from a local
 * checkout. `StoriesRail` returns `null` without a signed-in actor, and even
 * with one it draws only the panas that viewer follows who have something
 * live in the last 24 hours — so the strip needs a real session, real
 * follows and unexpired stories all at once. No mock stands in for it.
 * Capture it from a seeded environment and add it.
 */
const TOUR_SHOTS: Record<string, Partial<Record<TourKey, TourShot>>> = {
  social: {
    feed: { src: '/img/social/feed.webp', width: 1600, height: 1000 },
    groups: { src: '/img/social/groups.webp', width: 1600, height: 1000 },
    events: { src: '/img/social/events.webp', width: 1600, height: 1000 },
    profiles: { src: '/img/social/profiles.webp', width: 1600, height: 1000 },
  },
};

export function OfferingFrontPage({
  id,
  actions,
  interlude,
}: {
  /** An id from `PANA_OFFERINGS`; also the key into the `offerings` namespace. */
  id: string;
  /**
   * Where the two buttons go. Hrefs live at the call site rather than in the
   * locale files — a translator should not be able to change where a button
   * goes — and several of them point at routes (`/e/new`, `/support-pana`) that have
   * nothing to do with the offering's own registry entry. Their *labels* come
   * from `ctaPrimary` / `ctaSecondary` in the namespace, which is what keeps
   * the six pages themselves down to a single line each.
   */
  actions: OfferingActions;
  /**
   * One offering-specific band, dropped in after the mechanism and before the
   * highlights.
   *
   * The locale-driven bands all count to three — `one`, `two`, `three` — which
   * is the right shape for an argument and the wrong shape for a set. Pana
   * Connectors has four houses, and they are the thing a reader is actually
   * deciding between, so they cannot be squeezed into three cards or demoted
   * below the closing band where nobody reads them.
   *
   * It is a slot rather than a fifth locale band because that content is a
   * list of real programme objects with their own colours, not prose a
   * translator should be editing in a JSON file. Offerings that do not need
   * one pass nothing and render exactly as before.
   */
  interlude?: ReactNode;
}) {
  const { t, i18n } = useTranslation('offerings');
  const offering = getOffering(id);

  // The opening bands are opt-in per offering. `exists` is checked against one
  // required leaf rather than the parent object, because i18next reports a
  // parent as existing as soon as any descendant does.
  const hasProblem = i18n.exists(`offerings:${id}.problem.statement`);
  const hasPillars = i18n.exists(`offerings:${id}.pillars.statement`);
  const hasSteps = i18n.exists(`offerings:${id}.steps.title`);
  const hasTour = i18n.exists(`offerings:${id}.tour.title`);

  const mark = OFFERING_MARK[id];

  const buttons = [
    { href: actions.primary, label: t(`${id}.ctaPrimary`), solid: true },
    { href: actions.secondary, label: t(`${id}.ctaSecondary`), solid: false },
  ];

  return (
    <>
      <ScrollReveal />

      {/* The id is on the element so a single page can be adjusted without a
          new class or a new component — these are being designed one at a
          time, and most of what separates them is spacing and emphasis. */}
      <div className="offering" data-offering={offering.id}>
        <section className="offering-hero">
          <div className="container mx-auto px-4">
            {/* The mark supersedes the text eyebrow rather than joining it —
                the lettering already says "Pana Social", and setting the same
                two words again underneath would read as a caption on a logo.
                `priority` because this is the first thing in the hero and so
                a live LCP candidate; the masthead's own copy of this mark is
                deliberately *not* preloaded, being 22px tall and below it. */}
            {mark ? (
              <Image
                src={mark.src}
                alt={mark.alt}
                width={mark.width}
                height={mark.height}
                priority
                sizes="(min-width: 48rem) 272px, 208px"
                className="offering-mark"
              />
            ) : (
              <span className="section-eyebrow">{t(`${id}.eyebrow`)}</span>
            )}

            <h1 className="hero-headline offering-headline">
              <Trans
                i18nKey={`${id}.headline`}
                t={t}
                components={{ br: <br />, em: <em className="accent-word" /> }}
              />
            </h1>

            <p className="hero-subheadline offering-lede">{t(`${id}.lede`)}</p>

            <div className="offering-actions">
              {buttons.map((button) => (
                <Button
                  key={button.href}
                  size="lg"
                  asChild
                  className={
                    button.solid
                      ? 'offering-btn offering-btn-solid'
                      : 'offering-btn offering-btn-ghost'
                  }
                >
                  <SurfaceLink href={button.href}>{button.label}</SurfaceLink>
                </Button>
              ))}
            </div>
          </div>
        </section>

        {hasProblem && <OfferingProblem id={id} />}
        {hasPillars && <OfferingPillars id={id} />}
        {hasSteps && <OfferingSteps id={id} />}
        {hasTour && <OfferingTour id={id} />}

        {interlude}

        <section className="home-section offering-highlights">
          <div className="container mx-auto px-4">
            <div className="home-sectionhead" data-rv>
              <h2 className="section-display">
                <Trans
                  i18nKey={`${id}.highlights.title`}
                  t={t}
                  components={{ em: <em className="display-accent" /> }}
                />
              </h2>
            </div>

            <ul className="offering-cards" data-rv>
              {HIGHLIGHT_KEYS.map((key) => (
                <li key={key} className="offering-card">
                  <h3 className="offering-card-title">
                    {t(`${id}.highlights.${key}.title`)}
                  </h3>
                  <p className="offering-card-body">
                    {t(`${id}.highlights.${key}.body`)}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="home-section story-point">
          <div className="container mx-auto px-4" data-rv>
            <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
              <div>
                <span className="section-eyebrow">
                  {t(`${id}.closing.eyebrow`)}
                </span>
                <h2 className="section-statement mt-6">
                  <Trans
                    i18nKey={`${id}.closing.statement`}
                    t={t}
                    components={{ em: <em /> }}
                  />
                </h2>
              </div>
              <div>
                <p className="section-lede story-point-body">
                  {t(`${id}.closing.lede`)}
                </p>
                <div className="mt-8 flex flex-wrap gap-4">
                  {buttons.map((button) => (
                    <Button
                      key={button.href}
                      size="lg"
                      asChild
                      className={
                        button.solid
                          ? 'story-btn story-btn-solid rounded-full border-2 border-transparent font-extrabold'
                          : 'story-btn story-btn-ghost rounded-full border-2 font-extrabold'
                      }
                    >
                      <SurfaceLink href={button.href}>
                        {button.label}
                      </SurfaceLink>
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <OfferingSwitch currentId={id} />
      </div>
    </>
  );
}

/**
 * The tension, before any of the good news.
 *
 * Nothing on these pages used to say what is wrong today, so every offering
 * arrived as a list of features answering a question the reader had not been
 * asked yet. This band asks it.
 *
 * It is a statement plus three symptoms rather than a paragraph, because the
 * complaint is usually three separate complaints and running them together is
 * what turns them into throat-clearing. Each symptom is marked rather than
 * bulleted — the mark is coral, the one warm colour in the palette that reads
 * as a fault without being an error state.
 */
function OfferingProblem({ id }: { id: string }) {
  const { t } = useTranslation('offerings');

  return (
    <section className="home-section offering-problem">
      <div className="container mx-auto px-4">
        <div className="offering-problem-head" data-rv>
          <span className="section-eyebrow">{t(`${id}.problem.eyebrow`)}</span>
          <h2 className="section-display offering-problem-statement">
            <Trans
              i18nKey={`${id}.problem.statement`}
              t={t}
              components={{ br: <br />, em: <em className="display-accent" /> }}
            />
          </h2>
        </div>

        <ul className="offering-symptoms" data-rv>
          {SYMPTOM_KEYS.map((key) => (
            <li key={key} className="offering-symptom">
              <span className="offering-symptom-mark" aria-hidden="true" />
              <h3 className="offering-symptom-title">
                {t(`${id}.problem.${key}.title`)}
              </h3>
              <p className="offering-symptom-body">
                {t(`${id}.problem.${key}.body`)}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/**
 * What the thing is, in three words, before any mechanism.
 *
 * The alternative opening to `OfferingProblem`. A page whose headline already
 * states the value has no tension left to build — the reader has been told the
 * answer and arguing the problem first would make them wait for it. So this
 * band skips the complaint and names the pillars instead, each one carrying
 * its own contrast in a clause rather than in a band of its own.
 *
 * The card is the homepage's own shopfront, borrowed whole rather than
 * imitated: `.beat` for the black border and the coloured awning, `.beat-sign`
 * for the name hung under it, `.beat-answer` for the copy. An offering page is
 * entered from the homepage, and this is the band making the same kind of
 * claim the homepage makes in exactly that card, so it should be the same
 * object rather than a lookalike that drifts the first time one of them is
 * touched.
 *
 * Two pieces of the homepage row are deliberately left behind. `.beat-art` is
 * the shop window, and there is no artwork here to put in it. `.beat-copy`
 * and `.beat-art` both carry `animation-timeline: view()` keyframes written
 * for the homepage's four-across rail, which would arrive here as motion
 * nobody asked for.
 *
 * The accents cycle rather than taking the offering's own tint. The homepage
 * row is multicoloured on purpose — four shopfronts on a street, not four
 * copies of one — and three cards in a single hue would read as a chart.
 */
function OfferingPillars({ id }: { id: string }) {
  const { t, i18n } = useTranslation('offerings');

  /* The eyebrow is optional here, unlike the other bands. A statement that
     already names the offering does not need a label above it telling you
     which offering you are reading about. */
  const hasEyebrow = i18n.exists(`offerings:${id}.pillars.eyebrow`);

  return (
    <section className="home-section offering-pillars">
      <div className="container mx-auto px-4">
        <div className="offering-pillars-head" data-rv>
          {hasEyebrow && (
            <span className="section-eyebrow">
              {t(`${id}.pillars.eyebrow`)}
            </span>
          )}
          <h2 className="section-display offering-pillars-statement">
            <Trans
              i18nKey={`${id}.pillars.statement`}
              t={t}
              components={{ br: <br />, em: <em className="display-accent" /> }}
            />
          </h2>
        </div>

        <ul className="offering-pillarlist" data-rv>
          {PILLAR_KEYS.map((key, index) => (
            <li
              key={key}
              className="beat offering-pillar"
              data-accent={PILLAR_ACCENTS[index]}
            >
              <h3 className="beat-sign">{t(`${id}.pillars.${key}.name`)}</h3>
              <p className="beat-answer offering-pillar-body">
                {t(`${id}.pillars.${key}.body`)}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/**
 * How the thing actually works, in the order it happens to you.
 *
 * Stacked rows rather than a third grid of three. The two bands around it are
 * already three-across, and a page whose every section is the same row of
 * three reads as a template no matter how good the words in it are. A
 * walkthrough is also genuinely sequential in a way a feature list is not —
 * step two only makes sense after step one — so the numerals are load-bearing
 * rather than decoration, and a rule runs between them to say so.
 */
function OfferingSteps({ id }: { id: string }) {
  const { t } = useTranslation('offerings');

  return (
    <section className="home-section offering-steps">
      <div className="container mx-auto px-4">
        <div className="home-sectionhead" data-rv>
          <h2 className="section-display">
            <Trans
              i18nKey={`${id}.steps.title`}
              t={t}
              components={{ br: <br />, em: <em className="display-accent" /> }}
            />
          </h2>
          <p className="section-lede max-w-2xl">{t(`${id}.steps.lede`)}</p>
        </div>

        <ol className="offering-steplist" data-rv>
          {STEP_KEYS.map((key, index) => (
            <li key={key} className="offering-step">
              <span className="offering-step-num" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div className="offering-step-copy">
                <h3 className="offering-step-title">
                  {t(`${id}.steps.${key}.title`)}
                </h3>
                <p className="offering-step-body">
                  {t(`${id}.steps.${key}.body`)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/**
 * The rooms of the product, shown instead of described.
 *
 * The band this replaces on Pana Social was a numbered walkthrough — claim a
 * handle, follow some panas, reach the fediverse. All true, and all invisible:
 * three paragraphs asking somebody to imagine software they have never seen.
 * Pana Social is built, so the honest answer to "how does it work" is a
 * picture of it working.
 *
 * Each room therefore gets a screenshot and a claim, and the claim is always
 * the same kind of claim: not what the screen contains, but which people it
 * puts back in front of you. A feed is a feed anywhere — the argument here is
 * that this one is full of panas within driving distance. That theme is why
 * the rooms are worth five bands rather than five bullet points, and it is
 * what each `title` in the locale file is written to carry.
 *
 * ## Why the rows alternate
 *
 * Five identical rows is a spreadsheet. Flipping the image side on every
 * other row gives the band a rhythm to read down and keeps the eye moving
 * between picture and words, which is also roughly how long a reader spends
 * on each. The flip is a CSS `:nth-child` concern rather than anything the
 * markup knows about, so the DOM order stays image-then-copy for everybody
 * reading it linearly, including screen readers.
 *
 * The frame is the mock browser window from `/mock/panaverse`, reused down to
 * the class names. A screenshot needs a window around it or it reads as a
 * rectangle someone pasted onto the page, and drawing a second window that
 * merely resembles the first is how two windows end up disagreeing.
 */
function OfferingTour({ id }: { id: string }) {
  const { t } = useTranslation('offerings');
  const shots = TOUR_SHOTS[id] ?? {};

  return (
    <section className="home-section offering-tour">
      <div className="container mx-auto px-4">
        <div className="home-sectionhead" data-rv>
          <h2 className="section-display">
            <Trans
              i18nKey={`${id}.tour.title`}
              t={t}
              components={{ br: <br />, em: <em className="display-accent" /> }}
            />
          </h2>
          <p className="section-lede max-w-2xl">{t(`${id}.tour.lede`)}</p>
        </div>

        <div className="offering-tourlist">
          {TOUR_KEYS.map((key) => {
            const shot = shots[key];
            const name = t(`${id}.tour.${key}.name`);

            return (
              <article key={key} className="offering-room" data-rv>
                <figure className="browser-frame offering-shot">
                  <div className="browser-bar">
                    <span className="browser-dots" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                  </div>
                  <div className="offering-shot-well">
                    {shot ? (
                      <Image
                        src={shot.src}
                        alt={name}
                        width={shot.width}
                        height={shot.height}
                        sizes="(min-width: 64rem) 36rem, 92vw"
                        className="offering-shot-img"
                      />
                    ) : (
                      /* aria-hidden: the room's name is already the heading
                         a few nodes away, and hearing it twice tells a screen
                         reader user nothing about what is in the frame. */
                      <span className="offering-shot-wait" aria-hidden="true">
                        {name}
                      </span>
                    )}
                  </div>
                </figure>

                <div className="offering-room-copy">
                  <span className="offering-room-name">{name}</span>
                  <h3 className="offering-room-title">
                    {t(`${id}.tour.${key}.title`)}
                  </h3>
                  <p className="offering-room-body">
                    {t(`${id}.tour.${key}.body`)}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/**
 * The other five, at the foot of each one.
 *
 * The nav drawer already lists them, but a drawer has to be opened first.
 * Someone who has read a whole front page has just been told what one offering
 * is and is exactly the person about to wonder what the others are — so the
 * row of siblings sits in the slot the homepage gives its county shortcuts,
 * and for the same reason.
 */
function OfferingSwitch({ currentId }: { currentId: string }) {
  const { t } = useTranslation('offerings');
  const others = PANA_OFFERINGS.filter((offering) => offering.id !== currentId);

  return (
    <section className="home-section offering-switch">
      <div className="container mx-auto px-4" data-rv>
        {/* One flat row. The homepage markup this was copied from wrapped an
            inner space-between flex around a group, because it had a second
            group (a donate button) to push to the far end. There is only ever
            one group here, so the wrapper had nothing to distribute and is
            gone along with it. */}
        <div className="offering-switch-inner">
          <span className="offering-switch-label">{t('switchLabel')}</span>
          <div className="offering-switch-links">
            {others.map((other) => (
              <SurfaceLink
                key={other.id}
                href={other.href}
                className="offering-switch-chip"
              >
                {t(`${other.id}.name`)}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </SurfaceLink>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
