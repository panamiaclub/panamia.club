'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, Compass, Newspaper, Store } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Door {
  id: string;
  href: string;
  icon: LucideIcon;
  titleKey: string;
  bodyKey: string;
}

/* `/d` and `/s` are the canonical paths, not `/directory` and not a
   social.<root> hostname: the former redirects, and the latter needs DNS that
   does not exist yet (see lib/panaverse/surfaces.ts). Relative keeps the
   member on the hostname they already chose. */
const BROWSE_DOORS: readonly Door[] = [
  {
    id: 'directory',
    href: '/d',
    icon: Compass,
    titleKey: 'onboarding.startDirectoryTitle',
    bodyKey: 'onboarding.startDirectoryBody',
  },
  {
    id: 'social',
    href: '/s',
    icon: Newspaper,
    titleKey: 'onboarding.startSocialTitle',
    bodyKey: 'onboarding.startSocialBody',
  },
];

const DIRECTORY_DOOR: Door = {
  id: 'directory',
  href: '/form/get-listed',
  icon: Store,
  titleKey: 'onboarding.getListedTitle',
  bodyKey: 'onboarding.getListedBody',
};

function DoorCard({ door }: { door: Door }) {
  const { t } = useTranslation('common');
  const Icon = door.icon;

  return (
    <Link href={door.href} className="group block" data-door={door.id}>
      <Card className="border-pana-ink/10 hover:border-pana-flame focus-within:border-pana-flame h-full rounded-2xl transition-colors dark:border-white/10">
        <CardContent className="flex items-start gap-4 p-5 sm:p-6">
          <span className="bg-pana-butter/60 dark:bg-pana-indigo text-pana-burnt dark:text-pana-flame rounded-xl p-3">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="text-pana-ink dark:text-pana-cream block font-extrabold">
              {t(door.titleKey)}
            </span>
            <span className="text-muted-foreground mt-1 block text-sm">
              {t(door.bodyKey)}
            </span>
          </span>
          <ArrowRight
            className="text-muted-foreground group-hover:text-pana-burnt dark:group-hover:text-pana-flame mt-1 h-4 w-4 shrink-0 transition-colors"
            aria-hidden="true"
          />
        </CardContent>
      </Card>
    </Link>
  );
}

export function StartView({
  rootPath,
  screenname,
  showBusinessDoor,
}: {
  rootPath: string;
  screenname: string;
  showBusinessDoor: boolean;
}) {
  const { t } = useTranslation('common');

  return (
    <div className="auth-surface flex flex-col items-center px-4 py-12 sm:py-16">
      <div className="w-full max-w-lg space-y-6">
        <div className="space-y-2 text-center">
          <p className="text-pana-flame-deep dark:text-pana-flame text-sm font-extrabold tracking-wide uppercase">
            {t('onboarding.startEyebrow')}
          </p>
          <h1 className="text-pana-ink dark:text-pana-cream text-3xl font-extrabold">
            {t('onboarding.startTitle')}
          </h1>
          {/* Showing the handle back is the receipt for the thing they just
              did — the claim is permanent for 90 days, so it is worth seeing
              once, spelled exactly as it was saved. */}
          <p className="text-muted-foreground text-base">
            {t('onboarding.startBody', { screenname })}
          </p>
        </div>

        <div className="space-y-3">
          {BROWSE_DOORS.map((door) => (
            <DoorCard key={door.id} door={door} />
          ))}
        </div>

        {showBusinessDoor && (
          <div className="space-y-3">
            {/* Separated because it is a different kind of answer: the two
                above are places to go, this one opens a form and puts a
                listing in the directory. */}
            <p className="text-muted-foreground text-center text-xs tracking-wide uppercase">
              {t('onboarding.getListedDivider')}
            </p>
            <DoorCard door={DIRECTORY_DOOR} />
          </div>
        )}

        <div className="text-center">
          <Button asChild variant="ghost" className="text-muted-foreground">
            <Link href={rootPath}>{t('onboarding.startSkip')}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
