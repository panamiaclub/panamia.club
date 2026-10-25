'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarClock, ClipboardCheck, LayoutDashboard } from 'lucide-react';

const TABS = [
  {
    href: '/admin/connectors',
    label: 'Dashboard',
    icon: LayoutDashboard,
  },
  {
    href: '/admin/connectors/applications',
    label: 'Applications',
    icon: ClipboardCheck,
  },
  {
    href: '/admin/connectors/scheduling',
    label: 'Coordination',
    icon: CalendarClock,
  },
] as const;

export function ConnectorAdminTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Pana Connectors admin views"
      className="border-pana-ink/10 mb-6 flex min-w-0 gap-1 border-b pb-2 sm:gap-2"
    >
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={[
              'inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg px-2 py-2.5 text-[0.6875rem] font-black sm:flex-initial sm:px-4 sm:py-2 sm:text-sm',
              active
                ? 'bg-pana-blue text-pana-ink'
                : 'text-pana-ink/65 hover:bg-pana-ink/5',
            ].join(' ')}
          >
            <Icon className="hidden h-4 w-4 sm:block" aria-hidden="true" />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
