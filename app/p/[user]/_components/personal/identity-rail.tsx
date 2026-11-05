'use client';

import type { ReactNode } from 'react';
import Image from 'next/image';
import { BadgeCheck, CalendarDays, MapPin } from 'lucide-react';
import type { PersonalProfileView } from '@/lib/server/personal-profile';
import { isUnoptimizableImageSrc } from '@/lib/image-src';
import { StoryRing } from '@/components/social/StoryRing';
import type { StatDef } from './types';

/* The identity column.
 *
 * Everything a visitor needs to answer "who is this" sits here and stops
 * moving. The old hero spent the top third of the screen on that question and
 * pushed the answer to "what have they been up to" below the fold; here the
 * two run side by side, so scrolling the work never costs you the person.
 *
 * The cover survives — people put real care into choosing one — but as a strip
 * inside this card rather than a billboard across the viewport. It is scenery
 * for the identity, not a header for the page.
 *
 * Every field below is nullable. This is a directory that predates Pana
 * Social, so plenty of accounts have a name and nothing else, and each guard
 * here is a row that simply doesn't render rather than a gap where one was.
 */
export function IdentityRail({
  profile,
  stats,
  actions,
  connections,
  badge,
}: {
  profile: PersonalProfileView;
  stats: StatDef[];
  actions: ReactNode;
  /**
   * The Panas module under the stats. Which one it is depends on who is
   * looking: the owner's own wall of Panas, or a visitor's Mutual Panas. Both
   * render nothing when there is nothing to show, so this slot is free to be
   * empty.
   */
  connections: ReactNode;
  /** The viewer's relationship to this person, when there is one to show. */
  badge?: ReactNode;
}) {
  return (
    <aside className="space-y-5 lg:sticky lg:top-[5.25rem]">
      <section className="profile-card overflow-hidden">
        <div className="relative h-24">
          {profile.cover ? (
            <Image
              src={profile.cover}
              alt=""
              fill
              priority
              sizes="20rem"
              className="object-cover"
              unoptimized={isUnoptimizableImageSrc(profile.cover)}
            />
          ) : (
            /* Accounts that never enrolled in social have no header image. A
               flat band keeps the avatar overlap intact rather than collapsing
               the card around a missing asset. */
            <div
              className="from-pana-indigo to-pana-flame absolute inset-0 bg-gradient-to-br"
              aria-hidden="true"
            />
          )}
          <div
            className="absolute inset-0 bg-gradient-to-t from-black/25 to-transparent"
            aria-hidden="true"
          />
        </div>

        <div className="p-4">
          <StoryRing
            username={profile.handle}
            size="lg"
            className="-mt-13 [&_.profile-avatar]:!mt-0"
          >
            <div className="relative h-20 w-20 overflow-hidden rounded-full border-4 border-white">
              {profile.avatar ? (
                <Image
                  src={profile.avatar}
                  alt={`${profile.name}'s profile picture`}
                  fill
                  priority
                  sizes="80px"
                  className="object-cover"
                  unoptimized={isUnoptimizableImageSrc(profile.avatar)}
                />
              ) : (
                <div className="bg-pana-butter text-pana-ink flex h-full w-full items-center justify-center text-2xl font-black">
                  {profile.name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
          </StoryRing>

          <h1 className="mt-3 text-xl leading-tight font-black tracking-tight">
            {profile.name}
          </h1>
          {/* The badge rides on the handle rather than sitting with the county
              and pronoun pills below. Those describe the person; this describes
              the viewer's relationship to them, and it belongs with the name it
              qualifies — next to the Follow back button it is prompting. */}
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <p className="text-pana-burnt-deep text-sm font-extrabold">
              @{profile.handle}
            </p>
            {badge}
          </div>

          {(profile.county || profile.pronouns) && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {/* The check sits on the county because that is the only part
                  that is actually verified — residency is confirmed from
                  billing zip. Neighborhoods below are self-declared and
                  deliberately carry no check. */}
              {profile.county &&
                (profile.verified ? (
                  <span className="identity-pill" data-tone="verified">
                    <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    {profile.county}
                  </span>
                ) : (
                  <span className="identity-pill">{profile.county}</span>
                ))}
              {profile.pronouns && (
                <span className="identity-pill">{profile.pronouns}</span>
              )}
            </div>
          )}

          {profile.fiveWords && (
            <p className="text-pana-indigo mt-3 text-[11px] font-extrabold tracking-widest uppercase">
              {profile.fiveWords}
            </p>
          )}

          {profile.bio && (
            <p className="text-pana-ink/80 mt-2 text-[13px] leading-relaxed font-medium">
              {profile.bio}
            </p>
          )}

          {(profile.neighborhoods.length > 0 || profile.joined) && (
            /* `flex`, not `inline-flex`: an inline-level child makes the
               parent's space-y collapse, and the two lines run together. */
            <div className="text-pana-ink/55 mt-3 space-y-1.5 text-[12px] font-bold">
              {profile.neighborhoods.length > 0 && (
                <p className="flex items-center gap-1.5">
                  <MapPin
                    className="h-3.5 w-3.5 flex-none"
                    aria-hidden="true"
                  />
                  {profile.neighborhoods.join(' · ')}
                </p>
              )}
              {profile.joined && (
                <p className="flex items-center gap-1.5">
                  <CalendarDays
                    className="h-3.5 w-3.5 flex-none"
                    aria-hidden="true"
                  />
                  {profile.joined}
                </p>
              )}
            </div>
          )}

          {profile.tags.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {profile.tags.map((tag) => (
                <li key={tag}>
                  <span className="identity-pill text-pana-ink/65 px-2 py-0.5 text-[11px]">
                    #{tag}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* Signed-out viewers get no actions at all, so the row collapses
              rather than leaving a band of empty space under the tags. */}
          {actions && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {actions}
            </div>
          )}
        </div>

        {/* Figures, not controls. In the old layout the stat rail doubled as
            navigation because the tabs were a long way down the page; here the
            tab bar is a few hundred pixels to the right, and two controls that
            select the same thing side by side is a coin toss, not a choice. */}
        <div className="stat-rail border-b-0">
          {stats.map((stat) => (
            <div key={stat.tab} className="stat-rail-item">
              <span className="stat-rail-value">
                {stat.value === null ? '—' : stat.value.toLocaleString('en-US')}
              </span>
              <span className="stat-rail-label">{stat.label}</span>
            </div>
          ))}
        </div>
      </section>

      {connections}
    </aside>
  );
}
