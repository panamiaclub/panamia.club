'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { LogIn, UserPlus, UserRound } from 'lucide-react';

import { MenuSurface } from './menu-surface';
import { AccountSupportLinks } from './account-support-links';
import { cn } from '@/lib/utils';
import styles from './identity.module.css';

/** Both entry points use the same passwordless flow. Native menus stay compact. */
export function AuthMenu({
  triggerClassName,
  compact = false,
  includeReportActions = false,
  href = '/signin',
}: {
  triggerClassName?: string;
  compact?: boolean;
  includeReportActions?: boolean;
  href?: string;
}) {
  const { t } = useTranslation('common');

  if (!compact && !includeReportActions) {
    return (
      <nav className={styles.authEntries} aria-label={t('authMenu.open')}>
        <Link href={href} className={styles.authSignIn}>
          {t('nav.signIn')}
        </Link>
        <Link href={href} className={cn(styles.authCreate, triggerClassName)}>
          {t('nav.signUp')}
        </Link>
      </nav>
    );
  }

  return (
    <MenuSurface
      label={t('authMenu.open')}
      triggerClassName={cn(
        compact && styles.trigger,
        compact && styles.triggerCompact,
        triggerClassName
      )}
      trigger={
        compact ? <UserRound size={20} aria-hidden="true" /> : t('nav.signIn')
      }
      footer={
        includeReportActions
          ? (close) => (
              <>
                <div className={styles.separator} />
                <AccountSupportLinks onClose={close} includeReportActions />
              </>
            )
          : undefined
      }
    >
      {(close) => (
        <>
          <div className={styles.menuHeading}>{t('authMenu.heading')}</div>

          <Link
            href={href}
            role="menuitem"
            data-menu-row
            onClick={() => close(false)}
            className={styles.row}
          >
            <span className={styles.siteIcon} aria-hidden="true">
              <LogIn className="h-4 w-4" />
            </span>
            <span className={styles.rowMeta}>
              <span className={styles.rowName}>{t('nav.signIn')}</span>
              <span className={styles.rowHandle}>
                {t('authMenu.signInHint')}
              </span>
            </span>
          </Link>

          <Link
            href={href}
            role="menuitem"
            data-menu-row
            onClick={() => close(false)}
            className={styles.row}
          >
            <span className={styles.siteIcon} aria-hidden="true">
              <UserPlus className="h-4 w-4" />
            </span>
            <span className={styles.rowMeta}>
              <span className={styles.rowName}>{t('nav.signUp')}</span>
              <span className={styles.rowHandle}>
                {t('authMenu.signUpHint')}
              </span>
            </span>
          </Link>
        </>
      )}
    </MenuSurface>
  );
}
