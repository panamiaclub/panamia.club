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
  return (
    <footer className={styles.footer} id="footer">
      {/* The same `container mx-auto px-4` every section on the site uses, so
          the footer's columns line up with the content above them rather than
          running to their own margins. */}
      <div className="container mx-auto px-4">
        <div className={styles.footerInner}>
          <div className={styles.footerLogo}>
            <PanaLogo color="pink" size="medium" />
          </div>
          {/* Ways to support the mission: joining, seeing the impact, giving. */}
          <ul className={styles.footerLinksAlt}>
            <li>
              <strong>{t('footer.support')}</strong>
            </li>
            <li>
              <Link href="/welcome">{t('footer.becomeAPana')}</Link>
            </li>
            <li>
              <Link href="/impact">{t('footer.impactReport')}</Link>
            </li>
            <li>
              <Link href="/donate">{t('footer.donate')}</Link>
            </li>
          </ul>
          {/* Community: how we relate to everyone who shows up — our commitments
            and privacy promise are to all visitors, not a corporate footnote.
            Contact Us closes the column as the open-door invitation. */}
          <ul className={styles.footerLinksAlt}>
            <li>
              <strong>{t('footer.community')}</strong>
            </li>
            <li>
              <Link href="/form/join-the-team/">{t('footer.joinTheTeam')}</Link>
            </li>
            <li>
              {/* Links to the terms preamble enumerating what Panamia commits to
                its members; the terms are the mechanism to uphold them. */}
              <Link href="/legal/terms">{t('footer.ourCommitments')}</Link>
            </li>
            <li>
              <Link href="/legal/privacy">{t('footer.privacyPolicy')}</Link>
            </li>
          </ul>
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
                <a href="https://github.com/unitedcolorsofg/panamia-next">
                  <IconCode size={22} stroke={1.8} />
                  <span className="sr-only">{t('footer.sourceCode')}</span>
                </a>
              </li>
            </ul>
          </div>
        </div>
        {/* Closing thought: an open-door invitation, centered under everything. */}
        <div className={styles.footerContact}>
          <Link href="/form/contact-us">{t('footer.contactUs')}</Link>
        </div>
        <p className={styles.legalDisclosure}>
          {t('footer.nonprofitDisclosure')}
        </p>
      </div>
    </footer>
  );
}
