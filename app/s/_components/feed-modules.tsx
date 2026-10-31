'use client';

import { useState } from 'react';
import Link from 'next/link';
import SurfaceLink from '@/components/panaverse/SurfaceLink';
import {
  ArrowRight,
  CalendarDays,
  Check,
  MapPin,
  Store,
  UserPlus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useFeaturedProfiles } from '@/lib/query/directory';
import { useUpcomingEvents, type UpcomingEvent } from '@/lib/query/events';
import { useFollowActor, useSuggestedPanas } from '@/lib/query/social';
import { listingPublicPath } from '@/lib/listing-url';

/* Modules injected between posts.
 *
 * The feed without these is a single column of statuses and nothing else,
 * which is why it collapses to a grey box the moment the people you follow go
 * quiet. These carry the surface on a slow day and give a new account
 * something to act on before it has followed anybody.
 *
 * All three of the mock's modules are here now. "Panas you might know" was
 * held back originally because a suggestion list needs a reason beside each
 * name and nothing produced one; listSuggestedActors does, by walking mutual
 * follows, so the module has the thing it was missing.
 *
 * Both modules render nothing at all when they have no rows. A module that
 * degrades to a heading above an empty strip is worse than an absent one,
 * because it reads as breakage rather than as quiet.
 *
 * Images are plain <img> rather than next/image on purpose: these are remote
 * CDN URLs and next.config.js declares no remotePatterns, so the optimizer
 * rejects them at runtime. This matches the homepage and the directory card.
 */

/* Formats an event's start in its own timezone, not the reader's.
 *
 * Near events get a weekday — "Thu, 7:00 PM" is how you'd say it out loud, and
 * the date would be noise. Anything beyond a week gets the month and day,
 * because a weekday alone is actively misleading at that distance: an event
 * eight months out would otherwise read as this coming Saturday. The mock's
 * fixtures were all within the week, so its format had no reason to handle
 * this; the real table is seeded months ahead. */
function formatEventWhen(startsAt: string, timezone: string): string | null {
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return null;

  const daysOut = (date.getTime() - Date.now()) / 86_400_000;
  const nearby = daysOut < 6;

  const options: Intl.DateTimeFormatOptions = nearby
    ? { weekday: 'short', hour: 'numeric', minute: '2-digit' }
    : { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };

  try {
    return new Intl.DateTimeFormat('en-US', {
      ...options,
      timeZone: timezone,
    }).format(date);
  } catch {
    /* An invalid IANA zone should not take the card down with it. */
    return new Intl.DateTimeFormat('en-US', options).format(date);
  }
}

/** "Little Haiti, FL" from whichever venue parts actually came back. */
function formatEventWhere(event: UpcomingEvent): string | null {
  const venue = event.venue;
  if (!venue) return null;
  const parts = [venue.name, venue.city].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** What is happening next, with a real RSVP count on each card. */
export function EventsModule() {
  const { data } = useUpcomingEvents(4);
  const events = data?.data?.events ?? [];

  if (events.length === 0) return null;

  return (
    <section className="feed-module" aria-labelledby="feed-module-events">
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <h2 id="feed-module-events" className="feed-module-title">
            Happening soon
          </h2>
          <p className="text-pana-ink/60 mt-0.5 text-[13px] font-medium">
            Markets, workshops, and dinners hosted by Panas.
          </p>
        </div>
        <SurfaceLink
          href="/e"
          className="text-pana-indigo hidden flex-none text-[12px] font-extrabold tracking-wider uppercase sm:block"
        >
          See all
        </SurfaceLink>
      </div>

      <div className="feed-strip">
        {events.map((event) => {
          const when = formatEventWhen(event.startsAt, event.timezone);
          const where = formatEventWhere(event);

          return (
            <Link
              key={event.id}
              href={`/e/${event.slug}`}
              className="profile-card block overflow-hidden"
            >
              <div className="media-frame aspect-[16/9] rounded-none">
                <img
                  src={event.coverImage || '/img/bg_coconut_blue.jpg'}
                  alt={event.coverImageAlt || ''}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </div>

              <div className="p-3.5">
                {when && (
                  <p className="text-pana-burnt-deep text-[11px] font-extrabold tracking-widest uppercase">
                    {when}
                  </p>
                )}
                <h3 className="mt-1 text-[15px] leading-tight font-extrabold">
                  {event.title}
                </h3>
                {where && (
                  <p className="text-pana-ink/60 mt-1 inline-flex items-center gap-1 text-[12px] font-bold">
                    <MapPin className="h-3 w-3 flex-none" aria-hidden="true" />
                    {where}
                  </p>
                )}
                {/* Only shown once somebody is actually going. "0 Panas going"
                    on a new event reads as a failure rather than as a start. */}
                {event.attendeeCount > 0 && (
                  <p className="text-pana-ink/45 mt-2 inline-flex items-center gap-1.5 text-[12px] font-bold">
                    <CalendarDays
                      className="h-3.5 w-3.5 flex-none"
                      aria-hidden="true"
                    />
                    {event.attendeeCount}{' '}
                    {event.attendeeCount === 1 ? 'Pana' : 'Panas'} going
                  </p>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

/* The one module that reaches across to the other half of the product. Pana
   Mia is a directory and a social network; a feed that never mentions a
   business is leaving the connection between them on the table. */
export function DirectoryModule() {
  /* One card, because this sits inline in a timeline rather than in a grid.
     The endpoint rotates its sample every five minutes, so this is a different
     business through the day rather than the same one pinned to the feed. */
  const { data } = useFeaturedProfiles(1);
  const spotlight = data?.data?.[0];

  /* The mock shows category tags here. /api/directory/featured does not select
     them, and inventing them is exactly the kind of decoration that makes a
     feed untrustworthy, so the row is absent rather than filled. */
  if (!spotlight) return null;

  return (
    <section className="feed-module" aria-labelledby="feed-module-directory">
      <span id="feed-module-directory" className="section-eyebrow text-[11px]">
        From the directory
      </span>

      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="media-frame aspect-[4/3] w-full flex-none sm:w-44">
          <img
            src={spotlight.primaryImageCdn || '/img/bg_coconut_blue.jpg'}
            alt={spotlight.name}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="feed-module-title">{spotlight.name}</h2>
          {spotlight.fiveWords && (
            <p className="text-pana-indigo mt-1 text-[12px] font-extrabold tracking-wide uppercase">
              {spotlight.fiveWords}
            </p>
          )}
          {spotlight.addressLocality && (
            <p className="text-pana-ink/60 mt-1.5 inline-flex items-center gap-1 text-[13px] font-bold">
              <Store className="h-3.5 w-3.5 flex-none" aria-hidden="true" />
              {spotlight.addressLocality}
            </p>
          )}

          {/* Relative on purpose, and the premise is worth stating because it
              has already moved once. `/p` belongs to social for CHROME
              (lib/panaverse/surfaces.ts), while an individual listing declares
              its own canonical pointing at www (app/p/[user]/page.tsx). So a
              member who taps this stays on social with the switcher intact,
              and only a crawler is sent to www. The "From the directory"
              eyebrow above is what tells the member this is directory content
              -- the chrome deliberately does not say it by ejecting them.
              If /p ever stops being a social path, revisit this link. */}
          <Link
            href={listingPublicPath(spotlight)}
            className="link-arrow text-pana-indigo mt-3.5 inline-flex text-[13px]"
          >
            View listing
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}

/* Same derivation as the rail's, so one person's initials do not differ
   between the card and the sidebar on the same screen. */
function actorInitials(name: string | null, username: string): string {
  if (!name) return username.slice(0, 2).toUpperCase();
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/** People to follow, each with the reason it is being suggested. */
export function SuggestionsModule() {
  const { data } = useSuggestedPanas();
  const followActor = useFollowActor();

  /* Followed handles are held locally instead of invalidating the suggestions
     query, because the server excludes anyone you follow -- refetching would
     delete the card the moment it was tapped and slide the rest of the strip
     under the user's finger. The row stays, the button changes, and the list
     rebuilds on the next natural fetch. */
  const [followed, setFollowed] = useState<string[]>([]);

  const suggestions = data?.actors ?? [];
  if (suggestions.length === 0) return null;

  return (
    <section className="feed-module" aria-labelledby="feed-module-panas">
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <h2 id="feed-module-panas" className="feed-module-title">
            Panas you might know
          </h2>
          <p className="text-pana-ink/60 mt-0.5 text-[13px] font-medium">
            A Pana is a mutual follow. Follow back and you both show up in each
            other&apos;s feed.
          </p>
        </div>
        {/* The mock's "See all" is omitted: there is no page listing every
            suggestion, and a link to nowhere is worse than no link. */}
      </div>

      <div className="feed-strip">
        {suggestions.map((suggestion) => {
          const isFollowed = followed.includes(suggestion.username);
          const displayName = suggestion.name || suggestion.username;

          return (
            <article
              key={suggestion.id}
              className="profile-card flex flex-col p-4"
            >
              <Link href={`/p/${suggestion.username}`} className="flex-none">
                <Avatar className="border-pana-ink/10 h-12 w-12 border-2">
                  <AvatarImage src={suggestion.iconUrl || undefined} alt="" />
                  <AvatarFallback>
                    {actorInitials(suggestion.name, suggestion.username)}
                  </AvatarFallback>
                </Avatar>
              </Link>

              <h3 className="mt-2.5 text-[15px] leading-tight font-extrabold">
                <Link href={`/p/${suggestion.username}`}>{displayName}</Link>
              </h3>
              <p className="text-pana-ink/45 text-[13px] font-bold">
                @{suggestion.username}
              </p>

              {/* No placeholder blurb. An invented one-liner under a real name
                  is the kind of filler that makes the whole strip suspect. */}
              {suggestion.summary && (
                <p className="text-pana-ink/70 mt-1.5 line-clamp-2 text-[13px] leading-snug font-medium">
                  {suggestion.summary}
                </p>
              )}

              {/* "Follows you" outranks the overlap count. One is a fact about
                  other people, the other is an invitation addressed to the
                  viewer -- and following back completes a Pana outright. */}
              {suggestion.followsYou ? (
                <p className="card-flag mt-2.5 self-start" data-tone="prompt">
                  Follows you
                </p>
              ) : (
                <p className="card-flag mt-2.5 self-start">
                  {suggestion.mutualCount > 0
                    ? `${suggestion.mutualCount} ${
                        suggestion.mutualCount === 1 ? 'Pana' : 'Panas'
                      } in common`
                    : 'New to Pana Social'}
                </p>
              )}

              <Button
                size="sm"
                variant="outline"
                disabled={isFollowed || followActor.isPending}
                onClick={() => {
                  setFollowed((prev) => [...prev, suggestion.username]);
                  followActor.mutate(suggestion.username, {
                    onError: () =>
                      setFollowed((prev) =>
                        prev.filter((u) => u !== suggestion.username)
                      ),
                  });
                }}
                className="border-pana-indigo text-pana-indigo hover:bg-pana-indigo hover:text-pana-cream mt-3 rounded-full font-extrabold"
              >
                {isFollowed ? (
                  <>
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    {/* Following someone who already follows you makes the pair
                        Panas on the spot, so the button says what just happened
                        rather than making the viewer infer it. */}
                    {suggestion.followsYou ? 'Panas' : 'Following'}
                  </>
                ) : (
                  <>
                    <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                    {suggestion.followsYou ? 'Follow back' : 'Follow'}
                  </>
                )}
                <span className="sr-only"> {displayName}</span>
              </Button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
