import type { ReactNode } from 'react';

import { ADMIN_CHROME } from '@/lib/admin/theme';

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-5 pb-7">
      <div>
        <p
          className={`text-xs font-black tracking-[0.17em] uppercase ${ADMIN_CHROME.ACCENT}`}
        >
          {eyebrow}
        </p>
        <h1 className="mt-1 text-4xl leading-[0.95] font-black tracking-tight sm:text-5xl">
          {title}
        </h1>
        {description ? (
          <div className="text-pana-ink/65 mt-3 max-w-2xl text-sm leading-relaxed sm:text-base">
            {description}
          </div>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

/**
 * Shared furniture for the admin views.
 *
 * These are the same shapes as the connectors dashboard parts, drawn in the
 * admin chrome instead. They are not imported from there because those read
 * `CONNECTORS_CHROME` directly and bake `text-pana-cream/60` into the stat
 * band — correct on indigo, invisible on a light blue fill. Parameterising
 * components that already shipped, to serve a mock, is the more expensive
 * mistake of the two.
 *
 * All server components. Nothing here needs a client bundle — which is why
 * `StatusPill` sits in its own file: the sidebar is a client component and
 * imports it, and pulling these two in alongside it would be a cost paid by
 * every admin page for furniture the sidebar never renders.
 */

/** A white operational panel with a compact section header. */
export function Panel({
  title,
  action,
  children,
  className = '',
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`border-pana-ink/10 overflow-hidden rounded-2xl border ${ADMIN_CHROME.SURFACE} shadow-[0_8px_24px_rgb(17_13_13_/_0.06)] ${className}`}
    >
      <header className="border-pana-ink/10 flex items-center justify-between gap-4 border-b px-5 py-4">
        <h2 className="text-sm font-black tracking-[0.08em] uppercase">
          {title}
        </h2>
        {action}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

export interface BandStat {
  label: string;
  value: string;
  note: string;
}

/** Shop-style pastel metric cards shared by every operational dashboard. */
export function StatBand({ stats }: { stats: readonly BandStat[] }) {
  const fills = [
    'bg-pana-butter-2',
    'bg-[#e0f4fd]',
    'bg-[#ffdfcf]',
    'bg-[#eeeafa]',
    'bg-[#e5f3e8]',
  ] as const;

  return (
    <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {stats.map((stat, index) => (
        <div
          key={stat.label}
          className={`border-pana-ink/10 rounded-2xl border p-5 shadow-[0_8px_24px_rgb(17_13_13_/_0.05)] ${fills[index % fills.length]}`}
        >
          <dt className="text-pana-ink/60 text-[0.68rem] font-black tracking-[0.12em] uppercase">
            {stat.label}
          </dt>
          <dd className="mt-3 text-4xl leading-none font-black tracking-tight">
            {stat.value}
          </dd>
          <p className="text-pana-ink/65 mt-2 text-xs leading-relaxed">
            {stat.note}
          </p>
        </div>
      ))}
    </dl>
  );
}
