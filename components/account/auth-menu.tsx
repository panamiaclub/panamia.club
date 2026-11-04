'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { LogIn, UserPlus, UserRound } from 'lucide-react';

import { MenuSurface } from './menu-surface';
import { AccountSupportLinks } from './account-support-links';
import { cn } from '@/lib/utils';
import styles from './identity.module.css';

/**
 * Where each row lands.
 *
 * The same route today, and deliberately two constants rather than one: this
 * site is passwordless, so signing in and signing up are the same magic-link
 * or OAuth exchange and the account is created on first use. The difference
 * that will eventually matter is where a member is put down afterwards, which
 * is a change to the value below rather than to the markup.
 */
const SIGN_IN_HREF = '/signin';
const SIGN_UP_HREF = '/signin';

/**
 * The signed-out masthead menu.
 *
 * Replaces the "Sign Up" pill and "Sign In" link that used to sit side by
 * side. Two controls in the masthead asked a visitor to classify themselves
 * before they had any reason to care about the difference, and cost the right
 * column width the grid needs to keep the logo on the page axis — the sign-in
 * link was hidden below 560px for exactly that reason, which left the narrow
 * viewport with a lone "Sign Up".
 *
 * One button now, opening the same frame the identity switcher uses once you
 * have an account. Same position, same panel, same gestures — signing in
 * changes what is inside it, not where it is.
 */
export function AuthMenu({
  triggerClassName,
  compact = false,
  includeReportActions = false,
}: {
  triggerClassName?: string;
  compact?: boolean;
  includeReportActions?: boolean;
}) {
  const { t } = useTranslation('common');

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
            href={SIGN_IN_HREF}
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
            href={SIGN_UP_HREF}
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
