'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import styles from './CallToActionBar.module.css';
import { Button } from '@/components/ui/button';

interface CallToActionBarProps {
  variant: 'test-site' | 'complete-profile';
}

export default function CallToActionBar({ variant }: CallToActionBarProps) {
  const { t } = useTranslation('common');

  // Authenticated user without profile - prompt to complete profile
  if (variant === 'complete-profile') {
    return (
      <div className={styles.callToAction}>
        <div className="flex flex-col items-center gap-2 sm:flex-row">
          <span className="hidden-sm">{t('cta.tellUsMore')} &nbsp;</span>
          <Button
            variant="default"
            size="default"
            className="bg-gradient-to-r from-pink-500 to-purple-600 font-semibold text-white shadow-lg hover:from-pink-600 hover:to-purple-700"
            asChild
          >
            {/* This bar appears because the member has no profile, and the
                thing that creates a profile is a screenname. It used to point
                at the business listing form, which answered a different
                question entirely — that is the personal/business conflation
                docs/ACCOUNTS-ROADMAP.md exists to undo. */}
            <Link href="/welcome">{t('cta.completeYourProfile')}</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.callToAction}>
      <div className="-ml-40 flex flex-col items-start gap-2 sm:ml-0 sm:flex-row sm:items-center">
        <span className="text-lg font-bold">{t('cta.visitingTestSite')}</span>
        <Button
          variant="default"
          size="default"
          className="bg-gradient-to-r from-pink-500 to-purple-600 font-semibold text-white shadow-lg hover:from-pink-600 hover:to-purple-700"
          asChild
        >
          <a href="https://www.panamia.club">{t('cta.visitPanamiaClub')}</a>
        </Button>
      </div>
    </div>
  );
}
