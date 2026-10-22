import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Lock, Users } from 'lucide-react';
import { MOCK_MY_GROUPS } from '../_data/mock-feed';

export function FeedGroupsShelf() {
  return (
    <section className="feed-groups-shelf mt-5" aria-labelledby="your-groups">
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <p className="section-eyebrow text-[11px]">Your communities</p>
          <h2 id="your-groups" className="mt-1 text-lg font-black">
            Pick up where your groups left off
          </h2>
        </div>
        <Link
          href="/mock/groups"
          className="link-arrow text-pana-indigo flex-none text-[12px]"
        >
          Discover groups
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      <div className="feed-groups-row">
        {MOCK_MY_GROUPS.slice(0, 4).map((group, index) => (
          <Link
            key={group.id}
            href={index === 0 ? '/mock/group' : '#'}
            className="feed-group-chip"
          >
            <span className="border-pana-ink/10 relative h-11 w-11 flex-none overflow-hidden rounded-xl border-2">
              <Image
                src={group.avatar}
                alt=""
                fill
                sizes="44px"
                className="object-cover"
              />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1">
                <span className="truncate text-[13.5px] font-extrabold">
                  {group.name}
                </span>
                {group.visibility === 'private' ? (
                  <Lock
                    className="text-pana-ink/40 h-3 w-3 flex-none"
                    aria-label="Private group"
                  />
                ) : null}
              </span>
              <span className="text-pana-ink/55 mt-0.5 flex items-center gap-1 text-[11.5px] font-bold">
                <Users className="h-3 w-3" aria-hidden="true" />
                {group.activity}
              </span>
            </span>
            {group.unreadCount > 0 ? (
              <span className="bg-pana-indigo text-pana-cream grid h-6 min-w-6 flex-none place-items-center rounded-full px-1.5 text-[11px] font-black">
                {group.unreadCount}
              </span>
            ) : null}
          </Link>
        ))}
      </div>
    </section>
  );
}
