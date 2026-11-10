'use client';

import { Bug, Flag, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/hooks/use-toast';
import { useIsHydrated } from '@/lib/auth-client';
import { isNativeApp, OPEN_BUG_REPORT_EVENT } from '@/lib/mobile/native';
import { openSafetyReport } from '@/lib/safety-report';
import { cn } from '@/lib/utils';
import styles from './identity.module.css';

const ABOUT_PANA_URL = 'https://panamia.club/';

export function AccountSupportLinks({
  onClose,
  includeReportActions = false,
}: {
  onClose: (returnFocus?: boolean) => void;
  includeReportActions?: boolean;
}) {
  const { t } = useTranslation(['common', 'toast']);
  const hydrated = useIsHydrated();

  return (
    <>
      {includeReportActions && (
        <>
          <button
            type="button"
            role="menuitem"
            data-menu-row
            disabled={!hydrated}
            className={cn(styles.row, styles.rowQuiet, styles.supportRow)}
            onClick={() => {
              onClose();
              window.dispatchEvent(new Event(OPEN_BUG_REPORT_EVENT));
            }}
          >
            <Bug className="h-4 w-4 opacity-70" aria-hidden="true" />
            <span className={styles.rowMeta}>
              <span className={cn(styles.rowName, styles.supportLabel)}>
                {t('reporting.bug')}
              </span>
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            data-menu-row
            disabled={!hydrated}
            className={cn(styles.row, styles.rowQuiet, styles.supportRow)}
            onClick={() => {
              onClose();
              openSafetyReport({
                type: 'other',
                url: window.location.origin + window.location.pathname,
              });
            }}
          >
            <Flag className="h-4 w-4 opacity-70" aria-hidden="true" />
            <span className={styles.rowMeta}>
              <span className={cn(styles.rowName, styles.supportLabel)}>
                {t('reporting.safety')}
              </span>
            </span>
          </button>
        </>
      )}
      <a
        href={ABOUT_PANA_URL}
        target="_blank"
        rel="noopener noreferrer"
        role="menuitem"
        data-menu-row
        onClick={async (event) => {
          onClose(false);
          if (!isNativeApp()) return;
          event.preventDefault();
          try {
            const { Browser } = await import('@capacitor/browser');
            await Browser.open({ url: ABOUT_PANA_URL });
          } catch {
            toast({
              title: t('toast:error'),
              description: t('identity.aboutPanaOpenFailed'),
              variant: 'destructive',
            });
          }
        }}
        className={cn(
          styles.row,
          styles.rowQuiet,
          includeReportActions && styles.supportRow
        )}
      >
        <Info className="h-4 w-4 opacity-70" aria-hidden="true" />
        <span className={styles.rowMeta}>
          <span className={styles.rowName}>{t('nav.siteMenu.aboutPana')}</span>
        </span>
      </a>
    </>
  );
}
