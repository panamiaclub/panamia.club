import { MapPin } from 'lucide-react';
import SurfaceLink from '@/components/panaverse/SurfaceLink';
import { ConnectorHousePills } from '@/components/connectors/dashboard-parts';
import { getPod } from '@/lib/connectors/model';
import type { ProfileConnector } from '@/lib/connectors/membership';

export function HqHero({
  displayName,
  imageUrl,
  membership,
  podSize,
  activeCount,
  completedCount,
}: {
  displayName: string;
  imageUrl: string | null;
  membership: ProfileConnector;
  podSize: number;
  activeCount: number;
  completedCount: number;
}) {
  const initials =
    displayName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || '?';
  return (
    <header className="container mx-auto flex items-end justify-between gap-6 px-4 pt-7 pb-5 sm:pt-9">
      <div className="min-w-0">
        <p className="text-pana-indigo text-[0.65rem] font-extrabold tracking-[0.16em] uppercase">
          Your corner of the work
        </p>
        <div className="mt-2 flex items-center gap-3">
          <span
            aria-hidden="true"
            className="bg-pana-indigo text-pana-cream flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-extrabold"
          >
            {imageUrl ? (
              <img
                src={imageUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              initials
            )}
          </span>
          <h1 className="text-3xl leading-tight font-extrabold tracking-tight [overflow-wrap:anywhere] sm:text-4xl">
            Hey, {displayName.trim().split(/\s+/)[0] || 'pana'}.
          </h1>
        </div>
        <p className="text-pana-ink/65 mt-3 text-sm">
          Keep track of what you&apos;re carrying. Find something you care
          about.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <p className="mr-1 inline-flex items-center gap-1 text-xs font-bold">
            <MapPin className="h-4 w-4" aria-hidden="true" />
            {getPod(membership.pod).name} pod{' '}
            <span className="text-pana-ink/60 font-normal">
              / {podSize} {podSize === 1 ? 'connector' : 'connectors'}
            </span>
          </p>
          <ConnectorHousePills
            houses={membership.houses}
            majorHouse={membership.majorHouse}
            minorHouse={membership.minorHouse}
          />
        </div>
        <SurfaceLink
          href="/connectors/join"
          className="text-pana-indigo mt-2 inline-block min-h-8 py-1 text-xs font-bold underline underline-offset-4"
        >
          Change your major, minor or pod
        </SurfaceLink>
      </div>
      <dl className="border-pana-ink/15 hidden shrink-0 gap-7 border-l pl-7 md:flex">
        <div>
          <dd className="text-3xl font-extrabold tracking-tight">
            {activeCount}
          </dd>
          <dt className="text-pana-ink/65 mt-1 text-xs">on your board</dt>
        </div>
        <div>
          <dd className="text-3xl font-extrabold tracking-tight">
            {completedCount}
          </dd>
          <dt className="text-pana-ink/65 mt-1 text-xs">followed through</dt>
        </div>
      </dl>
    </header>
  );
}
