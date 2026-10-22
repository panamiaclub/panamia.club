'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  CalendarDays,
  Check,
  MapPin,
  MessageCircle,
  Share2,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MOCK_EVENTS, MOCK_MY_GROUPS } from '../_data/mock-feed';

export function FeedGroupEvent() {
  const [going, setGoing] = useState(false);
  const event = MOCK_EVENTS[0];
  const group = MOCK_MY_GROUPS[0];

  return (
    <article className="profile-card overflow-hidden">
      <Link
        href="/mock/group"
        className="feed-community-header border-pana-ink/10"
      >
        <span className="relative h-8 w-8 flex-none overflow-hidden rounded-lg">
          <Image
            src={group.avatar}
            alt=""
            fill
            sizes="32px"
            className="object-cover"
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-black">
            {group.name}
          </span>
          <span className="text-pana-ink/50 block text-[11px] font-bold">
            Group event · {group.memberCount} members
          </span>
        </span>
        <span className="bg-pana-butter text-pana-burnt-deep rounded-full px-2.5 py-1 text-[10px] font-black tracking-wider uppercase">
          Event
        </span>
      </Link>

      <div className="media-frame aspect-[16/8] rounded-none">
        <Image
          src={event.image}
          alt={event.imageAlt}
          fill
          sizes="(min-width: 640px) 42rem, 100vw"
          className="object-cover"
        />
      </div>

      <div className="p-4 sm:p-5">
        <p className="text-pana-burnt-deep text-[11px] font-black tracking-widest uppercase">
          {event.when}
        </p>
        <h3 className="mt-1 text-xl leading-tight font-black">{event.title}</h3>
        <p className="text-pana-ink/65 mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] font-bold">
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            {event.where}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            {event.goingCount + (going ? 1 : 0)} going
          </span>
        </p>
        <p className="text-pana-ink/75 mt-3 text-[14px] leading-relaxed font-medium">
          A free bilingual workshop for first-time printers, followed by open
          studio time and a group ink-order pickup.
        </p>

        <div className="mt-4 flex items-center gap-2">
          <Button
            size="sm"
            className="bg-pana-indigo text-pana-cream hover:bg-pana-indigo/90 rounded-full font-extrabold"
            onClick={() => setGoing((value) => !value)}
          >
            {going ? (
              <Check className="h-4 w-4" aria-hidden="true" />
            ) : (
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
            )}
            {going ? 'Going' : 'RSVP'}
          </Button>
          <button type="button" className="post-action ml-2">
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
            16
            <span className="sr-only">comments</span>
          </button>
          <button type="button" className="post-action ml-auto">
            <Share2 className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Share event</span>
          </button>
        </div>
      </div>
    </article>
  );
}
