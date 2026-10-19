'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Calendar, ImagePlus, Lock, MapPin, Mic, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  MOCK_MY_GROUPS,
  MOCK_VIEWER,
  type FeedState,
} from '../_data/mock-feed';
import {
  DEFAULT_DESTINATION,
  DestinationPicker,
  findGroup,
  reachLine,
  type Destination,
} from '@/components/social/destination-picker';

/* The composer at the top of the feed.
 *
 * The production feed puts a bare `+` button in the bottom-right corner, which
 * is a mobile pattern borrowed onto a desktop page: it hides the single most
 * important action behind an unlabelled icon that says nothing about what you
 * can post. This is the opposite — an open box, addressed to the reader by
 * name, with every post type named next to it.
 *
 * The chips are not decoration either. Voice memos and group posts already
 * exist in the schema and nobody finds them, because there is currently no
 * surface that mentions them.
 *
 * It renders in the empty state too. A new account is told to post — removing
 * the box it would post in is how an onboarding step becomes a dead end.
 *
 * The picker is the real `components/social/destination-picker`, not a copy.
 * This mock previously had its own, and two files rendering the same control
 * is how the mock and the product quietly stop agreeing about what shipped.
 *
 * The mock's existing new-account county line stays intact for the default
 * destination. Production cannot derive that line yet because social accounts
 * do not expose county, but removing it here would regress the empty-state
 * design while resolving an unrelated merge conflict. */
export function FeedComposer({ state = 'populated' }: { state?: FeedState }) {
  const [destination, setDestination] =
    useState<Destination>(DEFAULT_DESTINATION);
  const [menuOpen, setMenuOpen] = useState(false);
  const isNew = state === 'empty';

  const group =
    destination.kind === 'group'
      ? findGroup(MOCK_MY_GROUPS, destination.id)
      : undefined;
  const isDefaultAudience =
    destination.kind === 'audience' && destination.id === 'unlisted';
  const reachText = isDefaultAudience
    ? isNew
      ? `Posting to the ${MOCK_VIEWER.county} timeline — anyone nearby can see this`
      : `Posting to ${MOCK_VIEWER.panas.toLocaleString('en-US')} Panas and ${MOCK_VIEWER.groups} groups`
    : reachLine(destination, MOCK_MY_GROUPS);

  return (
    <div className="feed-composer">
      <div className="flex items-start gap-3">
        <div className="border-pana-ink/10 relative h-10 w-10 flex-none overflow-hidden rounded-full border-2">
          <Image
            src={MOCK_VIEWER.avatar}
            alt=""
            fill
            sizes="40px"
            className="object-cover"
          />
        </div>

        <div className="min-w-0 flex-1">
          <label htmlFor="feed-composer-input" className="sr-only">
            Write a post
          </label>
          <textarea
            id="feed-composer-input"
            rows={2}
            className="feed-composer-prompt"
            placeholder={
              group
                ? `Share something with ${group.name}`
                : `¿Qué tal, ${MOCK_VIEWER.name.split(' ')[0]}? Ask the Panas something, or show what you're working on.`
            }
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 sm:pl-13">
        <button type="button" className="composer-chip">
          <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />
          Photo
        </button>
        <button type="button" className="composer-chip">
          <Mic className="h-3.5 w-3.5" aria-hidden="true" />
          Voice memo
        </button>
        <button type="button" className="composer-chip">
          <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
          Event
        </button>
        <button type="button" className="composer-chip">
          <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
          Place
        </button>

        <div className="ml-auto flex items-center gap-2">
          {/* Destination is a first-class control rather than a setting buried
              in a menu: on a local network people are posting to a county they
              live in, or to one group out of six, and they should always be
              able to see which without opening anything. */}
          <DestinationPicker
            destination={destination}
            onChange={setDestination}
            groups={MOCK_MY_GROUPS}
            open={menuOpen}
            onOpenChange={setMenuOpen}
          />
          <Button
            size="sm"
            className="bg-pana-indigo text-pana-cream hover:bg-pana-indigo/90 rounded-full px-5 font-extrabold"
          >
            Post
          </Button>
        </div>
      </div>

      <p className="text-pana-ink/50 mt-2.5 text-[12px] font-bold sm:pl-13">
        {group?.visibility === 'private' ? (
          <Lock
            className="mr-1 inline h-3 w-3 align-[-1px]"
            aria-hidden="true"
          />
        ) : (
          <Users
            className="mr-1 inline h-3 w-3 align-[-1px]"
            aria-hidden="true"
          />
        )}
        {reachText}
      </p>
    </div>
  );
}
