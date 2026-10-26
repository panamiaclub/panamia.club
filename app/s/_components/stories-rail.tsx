'use client';

/* The stories strip above the composer.
 *
 * Deliberately not an Instagram tray. Stories here are watched by tapping a
 * pana's face, and this is the one place on the product where the faces worth
 * tapping can be gathered in advance -- everywhere else a ring is incidental
 * to a row that exists for another reason. It shows the viewer's own circle
 * first, then only the panas they follow who actually have something to watch.
 *
 * Which panas those are is decided here rather than by the rings. StoryRing
 * renders a plain avatar when there is nothing to watch, so handing it every
 * followed account would draw a strip of faces that are mostly not stories --
 * the opposite of what the strip is for. The batched summary answers that in
 * one request (lib/social/story-summary-client.ts), and because the answer is
 * cached for a minute the rings then mount against a warm cache instead of
 * asking again.
 */

import { useEffect, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { StoryRing } from '@/components/social/StoryRing';
import { useFollows } from '@/lib/query/social';
import { getStorySummary } from '@/lib/social/story-summary-client';
import type { SocialActor } from '@/lib/schema';

/* How many followed accounts to ask about. One batched request caps at 100
   usernames, so this stays comfortably inside a single round trip. Panas past
   this point lose their ring in the strip, not their story -- it is still on
   their profile and in the feed. */
const FOLLOW_SCAN_LIMIT = 50;

function initials(actor: Pick<SocialActor, 'name' | 'username'>): string {
  const source = actor.name || actor.username || '';
  return source.slice(0, 2).toUpperCase();
}

export function StoriesRail({ actor }: { actor: SocialActor | null }) {
  /* Followed accounts, not mutuals. A story is published to followers, so the
     set that can produce one here is exactly who the viewer follows. */
  const { data: following } = useFollows(
    'following',
    undefined,
    FOLLOW_SCAN_LIMIT,
    !!actor
  );

  const [live, setLive] = useState<SocialActor[]>([]);

  useEffect(() => {
    const candidates = following?.actors ?? [];
    if (candidates.length === 0) {
      setLive([]);
      return;
    }

    /* Guards against a late response from a previous follow list overwriting
       the current one -- the lists arrive out of order after a follow. */
    let cancelled = false;

    void (async () => {
      const summaries = await Promise.all(
        candidates.map(async (candidate) => ({
          candidate,
          summary: await getStorySummary(candidate.username),
        }))
      );
      if (cancelled) return;

      setLive(
        summaries
          .filter((entry) => entry.summary?.hasStories)
          /* Unwatched first, which is the whole point of the ordering: the
             strip is scanned left to right and the things not yet seen are
             what the viewer came for. Sorted once, on arrival -- re-sorting
             after each story is watched would move the next circle out from
             under a thumb mid-tap. */
          .sort(
            (a, b) =>
              Number(b.summary?.hasUnseen ?? false) -
              Number(a.summary?.hasUnseen ?? false)
          )
          .map((entry) => entry.candidate)
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [following]);

  if (!actor) return null;

  const empty = live.length === 0;

  return (
    <section className="stories-rail" data-empty={empty} aria-label="Stories">
      <ul className="stories-rail-track">
        {/* The viewer's own circle. StoryRing already answers both states from
            the summary it fetches -- the add button when there is nothing up,
            the ring when there is -- so this does not duplicate that logic. */}
        <li className="stories-rail-item">
          <span className="stories-rail-slot">
            <StoryRing username={actor.username} size="sm">
              <Avatar className="stories-rail-avatar">
                <AvatarImage src={actor.iconUrl || undefined} alt="" />
                <AvatarFallback>{initials(actor)}</AvatarFallback>
              </Avatar>
            </StoryRing>
          </span>
          <div className={empty ? 'min-w-0 space-y-1' : 'contents'}>
            <span className="stories-rail-label">Your story</span>
            {empty && (
              <p className="stories-rail-note">
                A little moment from your day.
              </p>
            )}
          </div>
        </li>

        {live.map((pana) => (
          <li key={pana.id} className="stories-rail-item">
            <span className="stories-rail-slot">
              <StoryRing
                username={pana.username}
                href={`/p/${pana.username}`}
                size="sm"
              >
                <Avatar className="stories-rail-avatar">
                  <AvatarImage src={pana.iconUrl || undefined} alt="" />
                  <AvatarFallback>{initials(pana)}</AvatarFallback>
                </Avatar>
              </StoryRing>
            </span>
            <span className="stories-rail-label">
              {pana.name || pana.username}
            </span>
          </li>
        ))}
      </ul>

      {empty && (
        <span className="text-pana-ink/60 hidden flex-none text-[10px] font-semibold sm:block">
          Here for 24 hours
        </span>
      )}
    </section>
  );
}
