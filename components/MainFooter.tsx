'use client';

import {
  IconBrandInstagram,
  IconBrandYoutube,
  IconBrandLinkedin,
  IconCode,
} from '@tabler/icons-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

import PanaLogo from './PanaLogo';
import styles from './MainFooter.module.css';

export default function GlobalFooter() {
  const { t } = useTranslation('common');
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer} id="footer">
      <div className="container mx-auto px-4">
        <div className={styles.footerInner}>
          <div className={styles.footerBrand}>
            <div className={styles.footerLogo}>
              <PanaLogo color="pink" size="medium" />
            </div>
            <p>{t('footer.mission')}</p>
            <div className={styles.socials}>
              <ul>
                <li>
                  <a href="https://instagram.com/goto.panamia.club">
                    <IconBrandInstagram size={22} stroke={1.8} />
                    <span className="sr-only">{t('footer.instagram')}</span>
                  </a>
                </li>
                <li>
                  <a href="https://www.youtube.com/@panavizion305">
                    <IconBrandYoutube size={22} stroke={1.8} />
                    <span className="sr-only">{t('footer.youtube')}</span>
                  </a>
                </li>
                <li>
                  <a href="https://www.linkedin.com/company/pana-mia/">
                    <IconBrandLinkedin size={22} stroke={1.8} />
                    <span className="sr-only">{t('footer.linkedIn')}</span>
                  </a>
                </li>
                <li>
                  <a href="https://github.com/panamiaclub/panamia.club">
                    <IconCode size={22} stroke={1.8} />
                    <span className="sr-only">{t('footer.sourceCode')}</span>
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <nav className={styles.footerNav} aria-label={t('footer.navigation')}>
            <ul className={styles.footerLinks}>
              <li>
                <strong>{t('footer.explore')}</strong>
              </li>
              <li>
                <Link href="/about-us">{t('footer.aboutPana')}</Link>
              </li>
              <li>
                <Link href="/our-impact">{t('footer.ourImpact')}</Link>
              </li>
              <li>
                <Link href="/ecosystem">{t('footer.ourEcosystem')}</Link>
              </li>
              <li>
                <Link href="/programs">{t('footer.programs')}</Link>
              </li>
            </ul>

            <ul className={styles.footerLinks}>
              <li>
                <strong>{t('footer.getInvolved')}</strong>
              </li>
              <li>
                <Link href="/form/get-listed">{t('footer.joinDirectory')}</Link>
              </li>
              <li>
                <Link href="/support-pana">{t('footer.supportPana')}</Link>
              </li>
              <li>
                <Link href="/donate">{t('footer.donate')}</Link>
              </li>
              <li>
                <Link href="/form/join-the-team">
                  {t('footer.joinTheTeam')}
                </Link>
              </li>
              <li>
                <Link href="/form/contact-us">{t('footer.contactUs')}</Link>
              </li>
            </ul>

            <ul className={styles.footerLinks}>
              <li>
                <strong>{t('footer.information')}</strong>
              </li>
              <li>
                <Link href="/impact">{t('footer.impactReport')}</Link>
              </li>
              <li>
                <Link href="/legal">{t('footer.legalPolicies')}</Link>
              </li>
              <li>
                <Link href="/legal/privacy">{t('footer.privacyPolicy')}</Link>
              </li>
              <li>
                <Link href="/legal/accessibility">
                  {t('footer.accessibility')}
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        <div className={styles.footerBottom}>
          <p>{t('footer.copyright', { year })}</p>
          <p className={styles.legalDisclosure}>
            {t('footer.nonprofitDisclosure')}
          </p>
        </div>
      </div>
    </footer>
  );
}
