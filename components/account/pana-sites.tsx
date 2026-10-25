'use client';

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CalendarDays,
  Compass,
  MessageCircle,
  PenLine,
  ShieldCheck,
  Star,
  Users,
  Video,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { useSession } from '@/lib/auth-client';
import { visiblePanaSites } from '@/lib/panaverse/sites';
import { usePanaSites } from '@/components/panaverse/PanaSitesProvider';
import SurfaceLink from '@/components/panaverse/SurfaceLink';
import styles from './identity.module.css';
import { cn } from '@/lib/utils';

/**
 * Icons live here rather than in the registry: `lib/panaverse/sites.ts` is
 * free of React dependencies so the Worker and any server caller can read it,
 * and importing lucide there would drag a React package into that path.
 *
 * Tones went the other way — they are on the registry, as `site.tone` — for a
 * reason worth not undoing. A tone is derived from `SCOPE_TONE` or
 * `SURFACE_TONE` rather than chosen, so the valuable thing about it is that a
 * test can assert the derivation held; and a test cannot import this file,
 * because `node --test` cannot load the CSS module above. Icons have no such
 * upstream to drift from, so they stay here where they cost nothing.
 */
const SITE_ICONS: Record<string, LucideIcon> = {
  social: MessageCircle,
  ink: PenLine,
  vizion: Video,
  directory: Compass,
  events: CalendarDays,
  groups: Users,
  /* A lucide star rather than the drawn mark: every tile here is a lucide
     glyph at 18px inside a 38px circle, and dropping one real logo in among
     them would read as a mismatch rather than as branding. The Connectors
     mark is itself a star, so the borrowed glyph says the same thing. */
  connectors: Star,
};

/**
 * The destinations block inside the account menu.
 *
 * Sits below the accounts because it answers a later question: you pick who
 * you are speaking as first, then where you are going. Hidden offerings stay
 * out of the grid, and the staff-only back office has a separate footer row.
 *
 * A grid rather than a list, because these are siblings you pick between
 * rather than a sequence you read down — and because six stacked rows were
 * most of the mobile sheet's height on their own.
 */
export function PanaSites({
  onNavigate,
  leading,
}: {
  onNavigate: () => void;
  /**
   * Tiles to place before the sites — in practice the Account tile.
   *
   * It shares this grid rather than sitting in a row of its own because it is
   * the same kind of choice: somewhere to go. That is also why the grid has no
   * heading; "Pana Sites" would be a label the Account tile makes untrue.
   */
  leading?: ReactNode;
}) {
  const { t } = useTranslation('common');
  /* Resolved on the server against the host being served, so a site on
     another surface links to that surface's origin. See PanaSitesProvider. */
  const resolved = usePanaSites();
  const sites = visiblePanaSites(resolved, false);

  return (
    <>
      <div className={styles.separator} />

      <div className={styles.tileGrid}>
        {leading}

        {sites.map((site) => {
          const Icon = SITE_ICONS[site.id] ?? Compass;
          const label = t(`identity.sites.${site.labelKey}`);

          // Not a link, not focusable, and says why.
          if (!site.href) {
            return (
              <div
                key={site.id}
                className={cn(styles.tile, styles.tileComingSoon)}
                aria-disabled="true"
              >
                <span
                  className={styles.tileIcon}
                  data-tone={site.tone}
                  aria-hidden="true"
                >
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <span className={styles.tileLabel}>{label}</span>
                <span className={styles.tileSoon}>
                  {t('identity.comingSoon')}
                </span>
              </div>
            );
          }

          return (
            <SurfaceLink
              key={site.id}
              href={site.href}
              role="menuitem"
              data-menu-row
              onClick={onNavigate}
              className={styles.tile}
            >
              <span
                className={styles.tileIcon}
                data-tone={site.tone}
                aria-hidden="true"
              >
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <span className={styles.tileLabel}>{label}</span>
            </SurfaceLink>
          );
        })}
      </div>
    </>
  );
}

export function AdminMenuLink({ onNavigate }: { onNavigate: () => void }) {
  const { t } = useTranslation('common');
  const resolved = usePanaSites();
  const { data: session } = useSession();
  const admin = visiblePanaSites(
    resolved,
    session?.user?.isAdmin === true
  ).find((site) => site.id === 'admin');

  if (!admin?.href) return null;

  return (
    <SurfaceLink
      href={admin.href}
      role="menuitem"
      data-menu-row
      data-tone={admin.tone}
      onClick={onNavigate}
      className={cn(styles.row, styles.rowQuiet, styles.rowAdmin)}
    >
      <ShieldCheck className="h-4 w-4" aria-hidden="true" />
      <span className={styles.rowMeta}>
        <span className={styles.rowName}>
          {t(`identity.sites.${admin.labelKey}`)}
        </span>
      </span>
    </SurfaceLink>
  );
}
