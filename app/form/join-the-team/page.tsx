'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import PublicPageShell from '@/components/PublicPageShell';
import publicStyles from '@/components/PublicPageShell.module.css';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

export default function JoinTheTeamPage() {
  const { t } = useTranslation('jointeam');

  return (
    <PublicPageShell
      eyebrow={t('eyebrow')}
      title={t('title')}
      intro={t('subtitle')}
      narrow
    >
      <div className={publicStyles.stack}>
        <div className={`${publicStyles.panel} p-6 md:p-8`}>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="item-1">
              <AccordionTrigger className="text-left text-xl font-semibold">
                {t('role1.title')}
              </AccordionTrigger>
              <AccordionContent className="space-y-4 text-base">
                <p>{t('role1.p1')}</p>
                <p>
                  <strong>{t('role1.p2')}</strong>
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-2">
              <AccordionTrigger className="text-left text-xl font-semibold">
                {t('role2.title')}
              </AccordionTrigger>
              <AccordionContent className="space-y-4 text-base">
                <p>{t('role2.p1')}</p>
                <p>{t('role2.p2')}</p>
                <p>
                  <strong>{t('role2.p3')}</strong>
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-3">
              <AccordionTrigger className="text-left text-xl font-semibold">
                {t('role3.title')}
              </AccordionTrigger>
              <AccordionContent className="space-y-4 text-base">
                <p>{t('role3.p1')}</p>
                <p>
                  <strong>{t('role3.p2')}</strong>
                </p>
                <p>
                  <strong>{t('role3.p3')}</strong>
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-4">
              <AccordionTrigger className="text-left text-xl font-semibold">
                {t('role4.title')}
              </AccordionTrigger>
              <AccordionContent className="space-y-4 text-base">
                <p>{t('role4.p1')}</p>
                <p>
                  <strong>{t('role4.p2')}</strong>
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-5">
              <AccordionTrigger className="text-left text-xl font-semibold">
                {t('role5.title')}
              </AccordionTrigger>
              <AccordionContent className="space-y-4 text-base">
                <p>{t('role5.p1')}</p>
                <p>{t('role5.p2')}</p>
                <p>
                  <strong>{t('role5.p3')}</strong>
                </p>
                <p>
                  <strong>{t('role5.p4')}</strong>
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-6">
              <AccordionTrigger className="text-left text-xl font-semibold">
                {t('role6.title')}
              </AccordionTrigger>
              <AccordionContent className="space-y-4 text-base">
                <p>{t('role6.p1')}</p>
                <p>
                  <strong>{t('role6.p2')}</strong>
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-7">
              <AccordionTrigger className="text-left text-xl font-semibold">
                {t('role7.title')}
              </AccordionTrigger>
              <AccordionContent className="space-y-4 text-base">
                <p>{t('role7.p1')}</p>
                <p>{t('role7.p2')}</p>
                <p>
                  <strong>{t('role7.p3')}</strong>
                </p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        <div className={publicStyles.callout}>
          <h2>{t('volunteer.title')}</h2>
          <p>{t('volunteer.p1')}</p>
          <p>{t('volunteer.p2')}</p>
        </div>

        <div className={`${publicStyles.panel} p-6 text-center md:p-8`}>
          <h2 className="mb-3 text-2xl font-bold">{t('cta.question')}</h2>
          <p className="text-muted-foreground mx-auto mb-6 max-w-2xl">
            {t('cta.desc')}
          </p>
          <Link
            href="/form/contact-us"
            className="bg-pana-blue inline-block rounded-full px-6 py-3 font-bold text-white transition-colors hover:bg-black"
          >
            {t('cta.button')}
          </Link>
        </div>
      </div>
    </PublicPageShell>
  );
}
