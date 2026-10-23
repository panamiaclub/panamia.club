'use client';

import { useState } from 'react';
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
import { usePanaGate } from '../../business-profile/_components/pana-gate';
import {
  CATEGORY_LABEL,
  formatDistance,
  formatInDays,
  formatLastActive,
  type ScoredResult,
} from '../_data';

interface ResultCardProps {
  entry: ScoredResult;
  index: number;
  /** True once the viewer has shared a location, so "near me" has an answer. */
  locationShared: boolean;
}

/**
 * One business in the results list.
 *
 * The card answers, in the order someone actually asks them: what is this,
 * where is it and how far, do other panas vouch for it, and is anything
 * happening soon. Today's card answers only the first — the rest is why the
 * current directory is hard to choose from rather than merely hard to look at.
 *
 * Save is the only write action here. Recommending is a public act that puts
 * your name behind a business, and asking for that from a search result — of
 * a place you may never have been — cheapens the signal the profile page
 * depends on. The count is shown; the button lives one click deeper.
 */
export function ResultCard({ entry, index, locationShared }: ResultCardProps) {
  const { result, distance } = entry;
  const { showsPanaActions, requirePana } = usePanaGate();
  const [saved, setSaved] = useState(false);

  const href = `/p/${result.slug}`;
  const lastActive = formatLastActive(result.lastUpdateDays);

  const handleSave = () => {
    if (!requirePana('save', { name: result.name, logo: result.logo })) {
      return;
    }
    setSaved((current) => !current);
  };

  return (
    <article className="dirsearch-card">
      <Link
        href={href}
        className="dirsearch-card-media"
        aria-label={`${result.name} — view profile`}
      >
        <span className="dirmock-cardnumber" aria-hidden="true">
          {index}
        </span>
        <Image
          src={result.coverImage}
          alt={result.coverAlt}
          fill
          sizes="(max-width: 900px) 100vw, 260px"
          className="object-cover"
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
          <span className="dirsearch-card-logo">
            <Image
              src={result.logo}
              alt=""
              width={52}
              height={52}
              aria-hidden="true"
            />
          </span>

          <div className="min-w-0 flex-1">
            <h3 className="dirsearch-card-name">
              <Link href={href}>{result.name}</Link>
            </h3>
            <p className="dirsearch-card-tagline">{result.tagline}</p>
          </div>
        </div>

        {/* Place and proximity, together and high up. "Little Haiti" alone
            does not tell a pana in Hollywood whether this is worth the drive,
            and that judgement is the whole reason they came to the directory. */}
        <p className="dirsearch-card-where">
          {result.onlineOnly ? (
            <>
              <Globe className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Online only — serves all of South Florida</span>
            </>
          ) : (
            <>
              <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{result.city}</span>
              {distance !== null ? (
                <span className="dirsearch-card-distance">
                  {formatDistance(distance)}
                </span>
              ) : (
                locationShared || (
                  <span className="dirsearch-card-distance-off">
                    distance hidden
                  </span>
                )
              )}
            </>
          )}
        </p>

        <p className="dirsearch-card-blurb">{result.blurb}</p>

        <ul className="dirsearch-card-cats">
          {result.categories.map((category) => (
            <li key={category}>{CATEGORY_LABEL[category] ?? category}</li>
          ))}
        </ul>

        {/* A reason to act this week rather than bookmark and forget. */}
        {result.nextEvent && (
          <p className="dirsearch-card-event">
            <CalendarDays className="h-4 w-4 shrink-0" aria-hidden="true" />
            <strong>{result.nextEvent.title}</strong>
            <span>{formatInDays(result.nextEvent.inDays)}</span>
          </p>
        )}

        <div className="dirsearch-card-foot">
          <div className="dirsearch-card-signals">
            {result.recommenderAvatars.length > 0 && (
              <span className="dirsearch-card-avatars" aria-hidden="true">
                {result.recommenderAvatars.slice(0, 4).map((avatar) => (
                  <Image
                    key={avatar}
                    src={avatar}
                    alt=""
                    width={26}
                    height={26}
                  />
                ))}
              </span>
            )}
            {(result.recommendedCount > 0 || result.savedCount > 0) && (
              <span className="dirsearch-card-counts">
                {result.recommendedCount > 0 && (
                  <>
                    <strong>{result.recommendedCount}</strong> recommend
                  </>
                )}
                {result.recommendedCount > 0 && result.savedCount > 0 && (
                  <i aria-hidden="true">·</i>
                )}
                {result.savedCount > 0 && (
                  <>
                    <strong>{result.savedCount}</strong> saved
                  </>
                )}
              </span>
            )}
            {lastActive && (
              <span className="dirsearch-card-active">{lastActive}</span>
            )}
          </div>

          <div className="dirsearch-card-actions">
            {/* An unclaimed listing has no owner to follow and no updates to
                read. Surfacing the claim route here is worth more than a Save
                button, and it is the only place a visitor who recognises the
                business can act on that. */}
            {result.claimed ? (
              <>
                {showsPanaActions && (
                  <button
                    type="button"
                    className="dirsearch-save"
                    data-on={saved}
                    aria-pressed={saved}
                    onClick={handleSave}
                  >
                    <Bookmark
                      className="h-4 w-4"
                      fill={saved ? 'currentColor' : 'none'}
                      aria-hidden="true"
                    />
                    {saved ? 'Saved' : 'Save'}
                  </button>
                )}
                <Link href={href} className="dirsearch-view">
                  View profile
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </>
            ) : (
              <Link
                href={`/listings/claim/start?id=${result.id}`}
                className="dirsearch-claim"
              >
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
