'use client';

import Link from 'next/link';
import SurfaceLink from '@/components/panaverse/SurfaceLink';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { usePanas, useMyGroups } from '@/lib/query/social';
import { FeedCalendarRail } from './feed-calendar-rail';
import type { SocialActor } from '@/lib/schema';

const RESERVED_MODULES = ['Saved posts', 'Jams', 'Trending & hashtags'];

/* The rail beside the timeline.
 *
 * Not navigation — SurfaceMemberHeader owns that on this surface. Everything
 * here is context for the column next to it, so it stacks underneath the feed
 * on narrow screens rather than collapsing into a drawer.
 *
 * Every number is fetched rather than asserted. The mock's third stat was
 * "Unread", which has no endpoint behind it; posts do, via the actor's own
 * statusCount, so that is the honest third column. The mock's "Trending in
 * Miami-Dade" module is not rendered as data for the same reason — there is
 * no hashtag or trending API, and a trending list is exactly the kind of
 * thing nobody would notice was invented. It is announced in "Coming to the
 * feed" instead, which promises it without fabricating counts.
 */
export function FeedRail({ actor }: { actor: SocialActor }) {
  /* Panas are mutual follows, which is its own endpoint rather than either
     follower count — following 400 people does not make 400 Panas. */
  const { data: panas } = usePanas(actor.username);
  /* The member's own list, not the public one. useProfileGroups is filtered to
     public groups because it renders on pages strangers read, and using it
     here made this rail undercount anyone in a private group — telling a
     member they are in fewer groups than they are, on their own feed. */
  const { data: groups } = useMyGroups();

  const displayName = actor.name || actor.username;
  const initials = actor.name
    ? actor.name
        .split(' ')
        .map((part) => part[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : actor.username.slice(0, 2).toUpperCase();

  return (
    <aside className="feed-rail space-y-4">
      <section className="border-pana-flame/20 from-pana-flame/9 rounded-3xl border bg-linear-to-br to-white p-4">
        <Link href={`/p/${actor.username}`} className="flex items-center gap-3">
          <Avatar className="border-pana-ink/10 h-11 w-11 flex-none border-2">
            <AvatarImage src={actor.iconUrl || undefined} alt="" />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-[15px] leading-tight font-extrabold">
              {displayName}
            </p>
            <p className="text-pana-ink/45 truncate text-[13px] font-bold">
              @{actor.username}
            </p>
          </div>
        </Link>

        {/* Same stat rail the profile uses, so the two surfaces never disagree
            about how many Panas somebody has. */}
        <div className="stat-rail mt-3.5">
          <div className="stat-rail-item">
            <span className="stat-rail-value">
              {(panas?.count ?? 0).toLocaleString('en-US')}
            </span>
            <span className="stat-rail-label">Panas</span>
          </div>
          {/* The one stat that leads somewhere. Panas and Posts both already
              have a home on the profile this card links to; groups do not,
              and /groups is where a member both finds them and starts one. */}
          <Link href="/groups" className="stat-rail-item">
            <span className="stat-rail-value">
              {groups?.groups.length ?? 0}
            </span>
            <span className="stat-rail-label">Groups</span>
          </Link>
          <div className="stat-rail-item">
            <span className="stat-rail-value">
              {(actor.statusCount ?? 0).toLocaleString('en-US')}
            </span>
            <span className="stat-rail-label">Posts</span>
          </div>
        </div>
      </section>

      <FeedCalendarRail />

      <section
        aria-labelledby="rail-reserved"
        className="border-pana-ink/10 bg-pana-cream/45 rounded-3xl border p-4"
      >
        <p className="text-pana-indigo inline-flex items-center gap-1.5 text-[10px] font-extrabold tracking-wider uppercase">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          Growing with the Panas
        </p>
        <h2 id="rail-reserved" className="mt-2 text-sm font-extrabold">
          Good things ahead.
        </h2>
        <p className="text-pana-ink/65 mt-1.5 text-xs leading-relaxed">
          More ways to save, gather and discover, without crowding your feed.
        </p>
        <div
          className="mt-3 flex flex-wrap gap-1.5"
          aria-label="Coming to the feed"
        >
          {RESERVED_MODULES.map((module) => (
            <span
              key={module}
              className="text-pana-ink/60 rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-bold"
            >
              {module}
            </span>
          ))}
        </div>
        <p className="text-pana-ink/60 mt-3 text-[10px] font-semibold">
          Coming to the feed
        </p>
      </section>

      <p className="text-pana-ink/45 text-[12px] leading-snug font-bold">
        Pana Social is part of the Panaverse, sharing your Pana account with
        Pana Mia.{' '}
        <SurfaceLink
          href="/directory/search"
          className="link-arrow text-pana-indigo"
        >
          Browse the directory
          <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </SurfaceLink>
      </p>
    </aside>
  );
}
