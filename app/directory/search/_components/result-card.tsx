'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  Bookmark,
  CalendarDays,
  Globe,
  MapPin,
  Store,
} from 'lucide-react';
import type { SearchResultsInterface } from '@/lib/query/directory';
import { normalizeUsZip, onlineBusinessLocation } from '@/lib/online-zip';
import { isUnoptimizableImageSrc } from '@/lib/image-src';
import { distanceInMiles, type Coords } from '@/app/p/[user]/_lib/profile-view';
import { useDirectoryViewer } from './directory-viewer';
import { DirectoryFollowButton } from './directory-follow-button';
import {
  CATEGORY_LABEL,
  formatDistance,
  formatWhen,
  resultCoords,
} from '../_lib/format';

const FALLBACK_COVER = '/img/bg_coconut_blue.jpg';

interface ResultCardProps {
  result: SearchResultsInterface;
  index: number;
  /** The viewer's coordinates, or null until they share a location. */
  viewerCoords: Coords | null;
}

/**
 * One business in the results list.
 *
 * The card answers, in the order someone actually asks them: what is this,
 * where is it and how far, do other panas vouch for it, and is anything
 * happening soon. The card it replaces answered only the first — which is why
 * the old directory was hard to choose from rather than merely hard to look
 * at.
 *
 * Save is the only write action here. Recommending is a public act that puts
 * your name behind a business, and asking for that from a search result — of
 * a place you may never have been — cheapens the signal the profile page
 * depends on. The count is shown; the button lives one click deeper.
 */
export function ResultCard({ result, index, viewerCoords }: ResultCardProps) {
  const { showsPanaActions, isSaved, toggleSave, saveCount } =
    useDirectoryViewer();

  const claimed = Boolean(result.screenname);
  const href = claimed
    ? `/p/${result.screenname}`
    : `/listings/claim/start?id=${result._id}`;

  const logo = result.images?.primaryCDN || null;
  const cover = result.coverImage || logo || FALLBACK_COVER;
  const subject = { name: result.name, logo };

  const saved = isSaved(result._id);
  const saves = saveCount(result._id, result.saves ?? 0);

  // Computed here rather than sent by the server so the viewer's precise
  // coordinates never leave the browser, and so this rounds identically to the
  // same business's profile page.
  const coords = resultCoords(result);
  const distance =
    viewerCoords && coords && !result.online_only
      ? distanceInMiles(viewerCoords, coords)
      : null;

  const categories = result.categories ?? [];

  return (
    <article className="dirsearch-card">
      <Link
        href={href}
        className="dirsearch-card-media"
        aria-label={`${result.name} — view profile`}
        tabIndex={-1}
      >
        <span className="dirsearch-card-number" aria-hidden="true">
          {index}
        </span>
        <Image
          src={cover}
          alt=""
          fill
          sizes="(max-width: 48rem) 100vw, (max-width: 72rem) 50vw, 28rem"
          className="object-cover"
          unoptimized={isUnoptimizableImageSrc(cover)}
        />
        {result.certified && (
          <span className="dirsearch-card-cert">
            <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Pana Certified
          </span>
        )}
      </Link>

      <div className="dirsearch-card-body">
        <div className="dirsearch-card-head">
          {logo && (
            <span className="dirsearch-card-logo">
              <Image
                src={logo}
                alt=""
                width={52}
                height={52}
                aria-hidden="true"
                unoptimized={isUnoptimizableImageSrc(logo)}
              />
            </span>
          )}

          <div className="min-w-0 flex-1">
            <h3 className="dirsearch-card-name">
              <Link href={href}>{result.name}</Link>
            </h3>
            {result.five_words && (
              <p className="dirsearch-card-tagline">{result.five_words}</p>
            )}
          </div>
        </div>

        {/* Place and proximity, together and high up. "Little Haiti" alone
            does not tell a pana in Hollywood whether this is worth the drive,
            and that judgement is the whole reason they came to the directory. */}
        {(result.online_only || result.primary_address?.city) && (
          <p className="dirsearch-card-where">
            {result.online_only ? (
              <>
                <Globe className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  {onlineBusinessLocation(result.primary_address?.zipcode)}
                </span>
                {normalizeUsZip(result.primary_address?.zipcode) &&
                  !result.online_zip && (
                    <span className="dirsearch-card-distance-off">
                      Map position unavailable
                    </span>
                  )}
              </>
            ) : (
              <>
                <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{result.primary_address?.city}</span>
                {distance !== null && (
                  <span className="dirsearch-card-distance">
                    {formatDistance(distance)}
                  </span>
                )}
              </>
            )}
          </p>
        )}

        {result.details && (
          <p className="dirsearch-card-blurb">{result.details}</p>
        )}

        {categories.length > 0 && (
          <ul className="dirsearch-card-cats">
            {categories.map((category) => (
              <li key={category}>{CATEGORY_LABEL[category] ?? category}</li>
            ))}
          </ul>
        )}

        {/* A reason to act this week rather than bookmark and forget. */}
        {result.nextEvent && (
          <Link
            href={`/events/${result.nextEvent.slug}`}
            className="dirsearch-card-event"
          >
            <CalendarDays className="h-4 w-4 shrink-0" aria-hidden="true" />
            <strong>{result.nextEvent.title}</strong>
            <span>{formatWhen(result.nextEvent.startsAt)}</span>
          </Link>
        )}

        <div className="dirsearch-card-foot">
          <div className="dirsearch-card-signals">
            {(result.recommenderAvatars?.length ?? 0) > 0 && (
              <span className="dirsearch-card-avatars" aria-hidden="true">
                {result.recommenderAvatars?.slice(0, 4).map((avatar) => (
                  <Image
                    key={avatar}
                    src={avatar}
                    alt=""
                    width={26}
                    height={26}
                    unoptimized={isUnoptimizableImageSrc(avatar)}
                  />
                ))}
              </span>
            )}
            <span className="dirsearch-card-counts">
              <strong>{result.recommends ?? 0}</strong> recommend
              <i aria-hidden="true">·</i>
              <strong>{saves}</strong> saved
            </span>
          </div>

          <div className="dirsearch-card-actions">
            {/* An unclaimed listing has no owner to follow and no updates to
                read. Surfacing the claim route here is worth more than a Save
                button, and it is the only place a visitor who recognises the
                business can act on that. */}
            {claimed ? (
              <>
                {showsPanaActions && (
                  <button
                    type="button"
                    className="dirsearch-save"
                    data-on={saved}
                    aria-pressed={saved}
                    aria-label={
                      saved ? `Unsave ${result.name}` : `Save ${result.name}`
                    }
                    onClick={() => toggleSave(result._id, subject)}
                  >
                    <Bookmark
                      className="h-4 w-4"
                      fill={saved ? 'currentColor' : 'none'}
                      aria-hidden="true"
                    />
                    {saved ? 'Saved' : 'Save'}
                  </button>
                )}
                <DirectoryFollowButton screenname={result.screenname!} />
                <Link href={href} className="dirsearch-view">
                  View profile
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </>
            ) : (
              <Link href={href} className="dirsearch-claim">
                <Store className="h-4 w-4" aria-hidden="true" />
                Is this your business?
              </Link>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
