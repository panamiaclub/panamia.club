'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import EventsAttendanceChart from '@/components/impact/events-attendance-chart';
import EventsPerCountyChart from '@/components/impact/events-per-county-chart';

/**
 * Community partner logos.
 *
 * Rendered on a fixed blue panel rather than the page surface: the set is
 * mixed-polarity — "We Met Community" and the Pana MIA wordmark are white on
 * transparent, the rest are dark line art — so neither the light nor the dark
 * theme surface can show all ten. The source funnel solved this the same way,
 * with a #3164ff section behind the row.
 */
const PARTNERS = [
  { file: 'partner-miami-workers-center', alt: 'partnerMiamiWorkersCenter' },
  { file: 'partner-dale', alt: 'partnerDale' },
  { file: 'partner-our-florida', alt: 'partnerOurFlorida' },
  { file: 'partner-10-days-of-connection', alt: 'partner10DaysOfConnection' },
  { file: 'partner-radical-partners', alt: 'partnerRadicalPartners' },
  { file: 'partner-miami-artist-census', alt: 'partnerMiamiArtistCensus' },
  { file: 'partner-allpeep', alt: 'partnerAllpeep' },
  { file: 'partner-we-met-community', alt: 'partnerWeMetCommunity' },
  {
    file: 'partner-subtropic-film-festival',
    alt: 'partnerSubtropicFilmFestival',
  },
  { file: 'partner-pana-mia-club', alt: 'partnerPanaMiaClub' },
] as const;

const PANA_SOCIAL_FEATURES = ['feature1', 'feature2', 'feature3'] as const;
const HEATWAVE_ITEMS = ['item1', 'item2', 'item3', 'item4'] as const;

export default function ImpactContent() {
  const { t } = useTranslation('impact');

  return (
    <article className="flex flex-col">
      {/* Hero */}
      <header className="container mx-auto max-w-3xl px-4 pt-12 pb-8 text-center">
        <Image
          src="/img/impact/wordmark.webp"
          alt={t('alt.wordmark')}
          width={1571}
          height={442}
          priority
          className="mx-auto mb-8 h-auto w-56"
        />
        <p className="text-pana-orange-deep text-sm font-semibold tracking-[0.2em] uppercase">
          {t('hero.eyebrow')}
        </p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">
          {t('hero.title')}
        </h1>
        <p className="text-muted-foreground mt-6 text-lg leading-relaxed">
          {t('hero.intro')}
        </p>
      </header>

      <div className="container mx-auto max-w-3xl px-4">
        <Image
          src="/img/impact/hero-mixer.webp"
          alt={t('alt.heroMixer')}
          width={550}
          height={326}
          priority
          className="mx-auto h-auto w-full rounded-xl"
        />
      </div>

      {/* We Believe */}
      <section className="bg-pana-navy mt-12 py-16 text-white">
        <div className="container mx-auto max-w-3xl space-y-6 px-4">
          <h2 className="text-3xl font-bold">{t('believe.title')}</h2>
          <p className="text-lg leading-relaxed">{t('believe.body1')}</p>
          <p className="text-lg leading-relaxed">{t('believe.body2')}</p>
        </div>
      </section>

      {/* Attendance + county split */}
      <section className="container mx-auto max-w-3xl px-4 py-16">
        <h3 className="text-2xl font-bold">{t('attendance.title')}</h3>
        <EventsAttendanceChart />
        <p className="text-muted-foreground leading-relaxed">
          {t('attendance.body')}
        </p>

        <h3 className="mt-12 text-2xl font-bold">{t('county.title')}</h3>
        <EventsPerCountyChart />
        <Image
          src="/img/impact/county-map.webp"
          alt={t('alt.countyMap')}
          width={800}
          height={600}
          className="mx-auto h-auto w-full max-w-sm"
        />
      </section>

      {/* Subtropic Film Fest */}
      <section id="stories-of-impact" className="bg-muted/40 py-16">
        <div className="container mx-auto max-w-3xl space-y-6 px-4">
          <p className="text-pana-pink-deep text-sm font-semibold tracking-wider uppercase">
            {t('filmfest.eyebrow')}
          </p>
          <h2 className="text-3xl font-bold">{t('filmfest.title')}</h2>
          <p className="leading-relaxed">{t('filmfest.body1')}</p>
          <p className="leading-relaxed">{t('filmfest.body2')}</p>
          <p className="leading-relaxed">{t('filmfest.body3')}</p>

          {/* Split from one composite so the second photo can drop away on
              phones, where two side-by-side shots are too small to read. */}
          <div className="grid gap-4 sm:grid-cols-2 sm:items-center">
            <Image
              src="/img/impact/filmfest-collab-left.webp"
              alt={t('alt.filmfestCollabLeft')}
              width={551}
              height={501}
              className="h-auto w-full"
            />
            <Image
              src="/img/impact/filmfest-collab-right.webp"
              alt={t('alt.filmfestCollabRight')}
              width={585}
              height={510}
              className="hidden h-auto w-full sm:block"
            />
          </div>

          <p className="leading-relaxed">{t('filmfest.body4')}</p>
          <p className="text-muted-foreground leading-relaxed font-medium">
            {t('filmfest.thanks')}
          </p>

          <figure className="mx-auto max-w-md">
            <Image
              src="/img/impact/filmmaker-participant.webp"
              alt={t('alt.filmmakerParticipant')}
              width={1050}
              height={1000}
              className="h-auto w-full rounded-xl"
            />
            <figcaption className="text-muted-foreground mt-2 text-sm">
              {t('filmfest.caption')}
            </figcaption>
          </figure>
        </div>
      </section>

      {/* Culture work */}
      <section className="container mx-auto max-w-3xl space-y-6 px-4 py-16">
        <h2 className="text-3xl font-bold">{t('culture.title')}</h2>
        <h3 className="text-xl font-semibold">{t('culture.subtitle')}</h3>
        <p className="leading-relaxed">{t('culture.body')}</p>
        {/* See the filmfest pair above — same mobile treatment. */}
        <div className="grid gap-4 sm:grid-cols-2 sm:items-center">
          <Image
            src="/img/impact/culture-zines-left.webp"
            alt={t('alt.cultureZinesLeft')}
            width={471}
            height={506}
            className="h-auto w-full"
          />
          <Image
            src="/img/impact/culture-zines-right.webp"
            alt={t('alt.cultureZinesRight')}
            width={669}
            height={467}
            className="hidden h-auto w-full sm:block"
          />
        </div>
      </section>

      {/* Heatwave Visions */}
      <section className="bg-muted/40 py-16">
        <div className="container mx-auto grid max-w-3xl gap-8 px-4 sm:grid-cols-2 sm:items-center">
          <div className="space-y-4">
            <p className="text-pana-pink-deep text-sm font-semibold tracking-wider uppercase">
              {t('heatwave.eyebrow')}
            </p>
            <h2 className="text-3xl font-bold">{t('heatwave.title')}</h2>
            <ul className="text-muted-foreground list-disc space-y-3 pl-5 leading-relaxed">
              {HEATWAVE_ITEMS.map((item) => (
                <li key={item}>{t(`heatwave.${item}`)}</li>
              ))}
            </ul>
          </div>
          <Image
            src="/img/impact/heatwave-visions.webp"
            alt={t('alt.heatwaveVisions')}
            width={960}
            height={1000}
            className="h-auto w-full rounded-xl"
          />
        </div>
      </section>

      {/* Pana Zine series */}
      <section className="container mx-auto max-w-3xl space-y-6 px-4 py-16">
        <p className="text-pana-pink-deep text-sm font-semibold tracking-wider uppercase">
          {t('zine.eyebrow')}
        </p>
        <h2 className="text-3xl font-bold">{t('zine.title')}</h2>
        <p className="leading-relaxed">{t('zine.body1')}</p>
        <Image
          src="/img/impact/zine-series.webp"
          alt={t('alt.zineSeries')}
          width={1600}
          height={1600}
          className="mx-auto h-auto w-full max-w-md rounded-xl"
        />
        <p className="leading-relaxed">{t('zine.body2')}</p>
        <p className="leading-relaxed">{t('zine.body3')}</p>
        <p className="leading-relaxed">{t('zine.body4')}</p>
      </section>

      {/* Directory -> Pana Social */}
      <section className="bg-pana-navy py-16 text-white">
        <div className="container mx-auto max-w-3xl space-y-6 px-4">
          <p className="text-lg leading-relaxed">{t('directory.body1')}</p>
          <p className="text-lg leading-relaxed">{t('directory.body2')}</p>
          <p className="text-lg leading-relaxed">{t('directory.body3')}</p>

          <div className="grid gap-8 pt-4 sm:grid-cols-2 sm:items-center">
            <Image
              src="/img/impact/pana-social-app.webp"
              alt={t('alt.panaSocialApp')}
              width={512}
              height={512}
              className="mx-auto h-auto w-full max-w-xs rounded-xl"
            />
            <div className="space-y-4">
              <Link
                href="/signin?callbackUrl=/feed"
                className="bg-pana-orange text-pana-ink inline-flex items-center gap-2 rounded-full px-6 py-3 font-semibold transition-opacity hover:opacity-90"
              >
                {t('panaSocial.cta')}
              </Link>
              <ul className="space-y-2">
                {PANA_SOCIAL_FEATURES.map((feature) => (
                  <li key={feature} className="text-lg">
                    {t(`panaSocial.${feature}`)}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <Image
            src="/img/impact/pana-social-dinner.webp"
            alt={t('alt.panaSocialDinner')}
            width={1096}
            height={846}
            className="h-auto w-full rounded-xl"
          />
        </div>
      </section>

      {/* Pull quote */}
      <section className="container mx-auto max-w-3xl px-4 py-16">
        <figure className="border-pana-pink space-y-4 border-l-4 pl-6">
          <blockquote className="text-xl leading-relaxed italic">
            &ldquo;{t('quote.body1')}&rdquo;
          </blockquote>
          <figcaption className="text-muted-foreground font-medium">
            {t('quote.attribution')}
          </figcaption>
          <blockquote className="text-xl leading-relaxed italic">
            &ldquo;{t('quote.body2')}&rdquo;
          </blockquote>
        </figure>
      </section>

      {/* Conclusion */}
      <section className="container mx-auto max-w-3xl space-y-6 px-4 pb-16">
        <h2 className="text-3xl font-bold">{t('conclusion.title')}</h2>
        <p className="text-lg leading-relaxed">{t('conclusion.body')}</p>
        <Image
          src="/img/impact/community-group.webp"
          alt={t('alt.communityGroup')}
          width={1600}
          height={886}
          className="h-auto w-full rounded-xl"
        />
      </section>

      {/* Community partners — fixed blue panel, see PARTNERS note above. */}
      <section
        id="partners"
        className="py-16"
        style={{ backgroundColor: '#3164ff' }}
      >
        <div className="container mx-auto max-w-4xl px-4">
          <h2 className="mb-10 text-center text-3xl font-bold text-white">
            {t('partners.title')}
          </h2>
          <ul className="grid grid-cols-2 items-center gap-8 sm:grid-cols-3 md:grid-cols-5">
            {PARTNERS.map(({ file, alt }) => (
              <li key={file} className="flex items-center justify-center">
                <Image
                  src={`/img/impact/${file}.webp`}
                  alt={t(`alt.${alt}`)}
                  width={300}
                  height={200}
                  className="h-16 w-auto object-contain"
                />
              </li>
            ))}
          </ul>
        </div>
      </section>
    </article>
  );
}
