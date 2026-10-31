'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import {
  BadgeCheck,
  Bookmark,
  BookmarkCheck,
  Globe,
  MapPin,
  Share2,
  ThumbsUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StoryRing } from '@/components/social/StoryRing';
import { isUnoptimizableImageSrc } from '@/lib/image-src';
import { LINK_ICON, LINK_TITLE } from './link-icons';
import { useProfileViewer } from './profile-viewer';
import { distanceInMiles, type ProfileView } from '../_lib/profile-view';
import { useViewerLocation } from '../_lib/use-viewer-location';

/**
 * Cover, logo, identity, the two social-proof counts, and the outbound links.
 *
 * The counts are the reason this section is laid out the way it is. "412 panas
 * saved this" is the strongest signal the directory has, and on the page this
 * replaces it did not appear at all — so it sits directly under the name,
 * above the fold, rather than in a stats strip further down.
 *
 * Save and Recommend are two different promises and are kept as two separate
 * controls: saving is private and for later, recommending is public and
 * vouches for the business to other panas. Collapsing them into one heart
 * would lose that distinction.
 */
export function ProfileHero({
  profile,
  recommenderAvatars,
}: {
  profile: ProfileView;
  recommenderAvatars: string[];
}) {
  const { t } = useTranslation('profile');
  const { showsPanaActions, signals, toggleSignal, isOwner } =
    useProfileViewer();
  const location = useViewerLocation();
  const [shared, setShared] = useState(false);

  const handleShare = async () => {
    const url = window.location.href;
    // The native sheet is the better experience where it exists — it offers
    // the messaging apps people actually send listings through — and a
    // clipboard copy is the honest fallback everywhere else.
    if (navigator.share) {
      try {
        await navigator.share({ title: profile.name, url });
        return;
      } catch {
        // Cancelled, or the sheet refused. Fall through to the clipboard.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShared(true);
      window.setTimeout(() => setShared(false), 2000);
    } catch {
      // No clipboard permission. The address bar still holds the URL.
    }
  };

  const place = [profile.city, profile.region].filter(Boolean).join(', ');
  // Skipped entirely for an online-only business rather than computed and
  // hidden, so the page never asks for the viewer's location to answer a
  // question it will not show.
  const distance =
    !profile.onlineOnly && location.coords && profile.coords
      ? distanceInMiles(location.coords, profile.coords)
      : null;

  return (
    <section className="surface-cream">
      <div className="bizprofile-cover">
        {profile.coverImage && (
          <Image
            src={profile.coverImage}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
            unoptimized={isUnoptimizableImageSrc(profile.coverImage)}
          />
        )}
      </div>

      {/* `relative` is load-bearing: the cover's image and scrim are absolutely
          positioned, and positioned elements paint above later static content
          no matter the DOM order. Without a positioned context here the
          business name — which sits in the overlap by design — renders
          underneath the photo. */}
      <div className="relative container mx-auto px-4 pb-14 md:pb-20">
        <div className="-mt-16 flex flex-col gap-6 md:-mt-24 md:flex-row md:items-end md:gap-8">
          {profile.logo && (
            <div className="bizprofile-logo">
              {profile.handle ? (
                <StoryRing username={profile.handle} size="lg">
                  <Image
                    src={profile.logo}
                    alt={`${profile.name} logo`}
                    width={220}
                    height={220}
                    unoptimized={isUnoptimizableImageSrc(profile.logo)}
                  />
                </StoryRing>
              ) : (
                <Image
                  src={profile.logo}
                  alt={`${profile.name} logo`}
                  width={220}
                  height={220}
                  unoptimized={isUnoptimizableImageSrc(profile.logo)}
                />
              )}
            </div>
          )}

          <div className="flex-1 pb-1">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {profile.certified && (
                <span
                  className="bizprofile-certified"
                  title={t('hero.certifiedTitle')}
                >
                  <BadgeCheck className="h-4 w-4" aria-hidden="true" />
                  {t('hero.certified')}
                </span>
              )}
              {profile.categories.map((category) => (
                <span key={category} className="tagpill">
                  {category}
                </span>
              ))}
            </div>

            <h1 className="bizprofile-name">{profile.name}</h1>

            {profile.tagline && (
              <p className="mt-3 text-lg font-bold md:text-xl">
                {profile.tagline}
              </p>
            )}

            {/* Distance sits with the location because it answers the same
                question, but it is not dimmed with it: "how far" is the
                sharper signal of the two in a directory people open to find
                something nearby. */}
            {(place || profile.onlineOnly) && (
              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold">
                {place && (
                  <span className="flex items-center gap-1.5 opacity-75">
                    <MapPin className="h-4 w-4" aria-hidden="true" />
                    {place}
                  </span>
                )}

                {/* An online-only business says so in the slot where a
                    distance would go, because that is the question it is
                    answering. The city still shows when there is one — "based
                    in Miami, operates online" is a different and useful fact
                    from "operates online", and the directory is for finding
                    local businesses. */}
                {profile.onlineOnly ? (
                  <>
                    {place && (
                      <span className="opacity-40" aria-hidden="true">
                        &middot;
                      </span>
                    )}

                    <span className="bizprofile-distance inline-flex items-center gap-1.5">
                      <Globe className="h-4 w-4" aria-hidden="true" />
                      {t('hero.onlineOnly')}
                    </span>
                    {profile.baseZip && (
                      <span className="opacity-75">
                        {t('hero.baseZip', { zip: profile.baseZip })}
                      </span>
                    )}
                  </>
                ) : (
                  profile.coords && (
                    <>
                      <span className="opacity-40" aria-hidden="true">
                        &middot;
                      </span>

                      {distance !== null ? (
                        <span className="bizprofile-distance">
                          {distance < 0.1
                            ? t('hero.distanceNear')
                            : t('hero.distance', {
                                count:
                                  distance < 10
                                    ? Number(distance.toFixed(1))
                                    : Math.round(distance),
                              })}
                        </span>
                      ) : location.status === 'denied' ? (
                        <span className="bizprofile-distance opacity-60">
                          {t('hero.distanceDenied')}
                        </span>
                      ) : (
                        // Most first-time visitors are in this state, so it
                        // has to be an offer rather than a blank.
                        <button
                          type="button"
                          className="bizprofile-distance-ask"
                          onClick={location.request}
                          disabled={location.status === 'asking'}
                        >
                          {t('hero.distanceAsk')}
                        </button>
                      )}
                    </>
                  )
                )}
              </p>
            )}
          </div>
        </div>

        {/* Social proof. Saves and recommends are separate figures because they
            answer different questions — "would I go back" versus "would I send
            a friend" — and averaging them into one score loses both. */}
        <div className="mt-10 flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-x-12 gap-y-6">
            <div className="bizprofile-stat">
              <span className="bizprofile-stat-figure">
                {signals.saves.toLocaleString()}
              </span>
              <span className="bizprofile-stat-label">
                {t('hero.savedCount', { count: signals.saves })}
              </span>
            </div>

            <div className="flex items-center gap-4">
              <div className="bizprofile-stat">
                <span className="bizprofile-stat-figure">
                  {signals.recommends.toLocaleString()}
                </span>
                <span className="bizprofile-stat-label">
                  {t('hero.recommendedCount', { count: signals.recommends })}
                </span>
              </div>

              {/* A row of faces is read before a number is, so the stack sits
                  beside the figure rather than under a heading of its own. */}
              {recommenderAvatars.length > 0 && (
                <div className="bizprofile-avatarstack">
                  {recommenderAvatars.map((src) => (
                    <Image
                      key={src}
                      src={src}
                      alt=""
                      width={40}
                      height={40}
                      aria-hidden="true"
                      unoptimized={isUnoptimizableImageSrc(src)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="flex flex-wrap gap-3">
              {/* Save and Recommend are absent, not disabled, for a
                  business-only account. See `showsPanaActions`. Share stays:
                  it costs nothing and sends people to the business.

                  They are absent for the listing's own owners too. These two
                  numbers are the only evidence a visitor has that other
                  people rate this business, so the one person with an
                  interest in inflating them is the one person who should not
                  be able to. */}
              {showsPanaActions && !isOwner && (
                <>
                  <Button
                    size="lg"
                    onClick={() => toggleSignal('save')}
                    aria-pressed={signals.saved}
                    className={
                      signals.saved
                        ? 'bg-pana-indigo text-pana-cream hover:bg-pana-indigo/90 rounded-full font-extrabold'
                        : 'bg-pana-flame text-pana-ink hover:bg-pana-burnt rounded-full font-extrabold'
                    }
                  >
                    {signals.saved ? (
                      <BookmarkCheck className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Bookmark className="h-4 w-4" aria-hidden="true" />
                    )}
                    {signals.saved ? t('hero.saved') : t('hero.save')}
                  </Button>

                  <Button
                    size="lg"
                    variant="outline"
                    onClick={() => toggleSignal('recommend')}
                    aria-pressed={signals.recommended}
                    className={
                      signals.recommended
                        ? 'border-pana-indigo bg-pana-indigo text-pana-cream hover:bg-pana-indigo/90 rounded-full border-2 font-extrabold'
                        : 'border-pana-ink/25 text-pana-ink hover:bg-pana-butter-2 rounded-full border-2 bg-white font-extrabold'
                    }
                  >
                    <ThumbsUp className="h-4 w-4" aria-hidden="true" />
                    {signals.recommended
                      ? t('hero.recommended')
                      : t('hero.recommend')}
                  </Button>
                </>
              )}

              <Button
                size="lg"
                variant="outline"
                onClick={handleShare}
                className="border-pana-ink/25 text-pana-ink hover:bg-pana-butter-2 rounded-full border-2 bg-white font-extrabold"
              >
                <Share2 className="h-4 w-4" aria-hidden="true" />
                {shared ? t('hero.shareCopied') : t('hero.share')}
              </Button>
            </div>

            {/* Hiding the controls with no explanation is how "unavailable"
                gets mistaken for "broken". One quiet line is enough to say
                which account type is missing and where to get one. */}
            {!showsPanaActions && (
              <p className="bizprofile-hero-note">
                {t('hero.directoryNote')}{' '}
                <Link href="/welcome">{t('hero.directoryNoteLink')}</Link>
              </p>
            )}

            {/* Same reasoning for owners, who would otherwise be left
                wondering where the buttons went on their own page. */}
            {showsPanaActions && isOwner && (
              <p className="bizprofile-hero-note">{t('hero.ownerNote')}</p>
            )}
          </div>
        </div>

        {/* Outbound links. On the page this replaces these were buried under a
            "Socials and Links" card below the fold; the whole point of a
            directory listing is to send people onward, so they belong here. */}
        {profile.links.length > 0 && (
          <div className="mt-10 border-t-2 border-[rgb(17_13_13_/_0.1)] pt-8 dark:border-[hsl(var(--border))]">
            <span className="section-eyebrow mb-4">{t('hero.findThemAt')}</span>
            <div className="flex flex-wrap gap-3">
              {profile.links.map((link) => {
                const Icon = LINK_ICON[link.kind];
                return (
                  <a
                    key={`${link.kind}-${link.label}`}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bizprofile-linkchip"
                    title={LINK_TITLE[link.kind]}
                  >
                    <Icon className="h-4 w-4 opacity-70" aria-hidden="true" />
                    <span className="sr-only">{LINK_TITLE[link.kind]}: </span>
                    {link.label}
                  </a>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
