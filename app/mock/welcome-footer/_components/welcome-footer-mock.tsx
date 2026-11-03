'use client';

import { useTranslation } from 'react-i18next';
import { HomePage } from '@/components/home/home-page';

export function WelcomeFooterMock() {
  const { t } = useTranslation('home');

  return (
    <>
      <HomePage welcomeFooterPreview />
      <p className="bg-pana-cream text-pana-ink p-4 text-center text-xs">
        {t('welcomeFooter.mockNote')} /mock/welcome-footer
      </p>
    </>
  );
}
