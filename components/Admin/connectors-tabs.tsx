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
    label: 'Scheduling',
    icon: CalendarClock,
  },
] as const;

export function ConnectorAdminTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Pana Connectors admin views"
      className="border-pana-ink/10 mb-6 flex gap-2 overflow-x-auto border-b pb-2"
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
              'inline-flex min-w-max items-center gap-2 rounded-lg px-4 py-2 text-sm font-black',
              active
                ? 'bg-pana-blue text-pana-ink'
                : 'text-pana-ink/65 hover:bg-pana-ink/5',
            ].join(' ')}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
