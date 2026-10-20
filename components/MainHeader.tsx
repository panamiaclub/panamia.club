'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { useSession } from '@/lib/auth-client';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import axios from 'axios';

import styles from './MainHeader.module.css';
import { isOnboardingRoute } from '@/lib/onboarding';
import NotificationAlerts from './NotificationAlerts';
import CallToActionBar from './CallToActionBar';
import NavDrawer, { type NavDrawerItem } from './NavDrawer';
import { IdentityMenu } from './account/identity-menu';
import { NotificationsMenu } from './account/notifications-menu';
import { MessagesLink } from './account/messages-link';
import { IdentityProvider } from './account/identity-provider';
import { AuthMenu } from './account/auth-menu';
import { ActingAsBar } from './account/acting-as-bar';

// https://www.a11ymatters.com/pattern/mobile-nav/

type NavItemDefinition = {
  labelKey: string;
  href: string;
  children?: NavItemDefinition[];
};

const NAV_ITEMS: NavItemDefinition[] = [
  {
    labelKey: 'nav.siteMenu.aboutPana',
    href: '/about-us',
    children: [
      { labelKey: 'nav.siteMenu.ourStory', href: '/about-us#our-story' },
      {
        labelKey: 'nav.siteMenu.meetTheTeam',
        href: '/about-us#meet-the-team',
      },
      { labelKey: 'nav.siteMenu.whyLocal', href: '/#why-local' },
      { labelKey: 'nav.siteMenu.pillars', href: '/#pillars' },
    ],
  },
  {
    labelKey: 'nav.siteMenu.ourImpact',
    href: '/impact',
    children: [
      {
        labelKey: 'nav.siteMenu.communityConnectorsProgram',
        href: '/connectors',
      },
      {
        labelKey: 'nav.siteMenu.storiesOfImpact',
        href: '/impact#stories-of-impact',
      },
      {
        labelKey: 'nav.siteMenu.downloadOurImpact',
        href: '/impact',
      },
    ],
  },
  {
    labelKey: 'nav.siteMenu.ourEcosystem',
    href: '/impact#partners',
    children: [
      {
        labelKey: 'nav.siteMenu.collaborativePartners',
        href: '/impact#partners',
      },
      {
        labelKey: 'nav.siteMenu.collaborativeProjects',
        href: '/about-us#collaborative-projects',
      },
      {
        labelKey: 'nav.siteMenu.panaCertified',
        href: '/directory/search',
      },
      {
        labelKey: 'nav.siteMenu.sponsorsFunders',
        href: '/impact#partners',
      },
    ],
  },
  {
    labelKey: 'nav.siteMenu.supportPana',
    href: '/donate',
    children: [
      { labelKey: 'nav.siteMenu.givingCircle', href: '/donate' },
      {
        labelKey: 'nav.siteMenu.sponsorship',
        href: '/form/contact-us',
      },
    ],
  },
  {
    labelKey: 'nav.siteMenu.programs',
    href: '/#pillars',
    children: [
      {
        labelKey: 'nav.siteMenu.pillarBreakdownByProgram',
        href: '/#pillars',
      },
      {
        labelKey: 'nav.siteMenu.collectiveTech',
        href: '/#pillar-tech',
        children: [
          { labelKey: 'nav.siteMenu.directory', href: '/directory' },
          { labelKey: 'nav.siteMenu.panaSocial', href: '/social' },
        ],
      },
      {
        labelKey: 'nav.siteMenu.communityBuilding',
        href: '/#pillar-community',
        children: [
          {
            labelKey: 'nav.siteMenu.connectorsProgram',
            href: '/connectors',
          },
          {
            labelKey: 'nav.siteMenu.collaborativeEvents',
            href: '/events',
          },
        ],
      },
      {
        labelKey: 'nav.siteMenu.cultureWork',
        href: '/#pillar-culture',
        children: [
          {
            labelKey: 'nav.siteMenu.panaInkPress',
            href: '/ink',
            children: [
              { labelKey: 'nav.siteMenu.panavizion', href: '/vizion' },
            ],
          },
          {
            labelKey: 'nav.siteMenu.collaborativeProjects',
            href: '/about-us#collaborative-projects',
          },
        ],
      },
    ],
  },
  { labelKey: 'nav.siteMenu.shop', href: 'https://shop.panamia.club/' },
];

export default function MainHeader({
  isProductionSite,
}: {
  isProductionSite: boolean;
}) {
  const { t, i18n } = useTranslation('common');
  const isEs = i18n.language === 'es';
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const showDirectoryJoin = pathname === '/' || pathname === '/mock/home';
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  // The public site menu is identical for every visitor. Account destinations
  // remain in the identity menu rather than changing this list after sign-in.
  const drawerItems = useMemo<NavDrawerItem[]>(
    () => {
      const translateItem = (item: NavItemDefinition): NavDrawerItem => ({
        href: item.href,
        label: t(item.labelKey),
        expandLabel: t('nav.expandSubmenu', {
          label: t(item.labelKey),
        }),
        collapseLabel: t('nav.collapseSubmenu', {
          label: t(item.labelKey),
        }),
        children: item.children?.map(translateItem),
      });

      return NAV_ITEMS.map(translateItem);
    },
    [t]
  );

  // Check if authenticated user has a profile
  useEffect(() => {
    if (session?.user) {
      axios
        .get('/api/getProfile')
        .then((res) => {
          // Profile exists if we get data back with an id
          // API returns { success: true, data: { id: ... } }
          setHasProfile(!!res.data?.data?.id);
        })
        .catch(() => {
          setHasProfile(false);
        });
    }
    // When session is null, hasProfile remains null (initial state)
    // The CTA bar only shows for authenticated users anyway
  }, [session]);

  return (
    <IdentityProvider enabled={status !== 'loading' && !!session}>
      <header className={styles.header}>
        {/* Ambient unread cues: browser-tab count + desktop notifications */}
        <NotificationAlerts />
        {/* CTA bar: newsletter for unauthenticated, profile completion for authenticated without profile */}
        {status !== 'loading' && !session && (
          <div id="call-to-action-bar">
            <CallToActionBar isProductionSite={isProductionSite} />
          </div>
        )}
        {status !== 'loading' &&
          session &&
          hasProfile === false &&
          !isOnboardingRoute(pathname) && (
            <div id="call-to-action-bar">
              <CallToActionBar
                variant="complete-profile"
                isProductionSite={isProductionSite}
              />
            </div>
          )}
        {/* Centered masthead: menu (left) · logo (center) · actions (right) */}
        <div className={styles.masthead}>
          <div className={styles.mastheadInner}>
            <div className={styles.mastheadLeft}>
              <button
                type="button"
                className={styles.menuButton}
                onClick={() => setDrawerOpen(true)}
                aria-expanded={drawerOpen}
                aria-haspopup="dialog"
              >
                <span className={styles.bars} aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span className={styles.menuLabel}>{t('nav.menu')}</span>
              </button>
            </div>

            <Link
              href="/"
              className={styles.mastheadLogo}
              aria-label="Pana Mia"
            >
              <Image
                src="/logos/pana_logo_long_orange.png"
                alt="Pana Mia"
                width={600}
                height={150}
                priority
              />
            </Link>

            <div className={styles.mastheadRight}>
              {/* Unauthenticated users: one control, one panel. It used to be
                  a "Sign Up" pill beside a "Sign In" link, which asked a
                  visitor to classify themselves before anything had explained
                  the difference — and this site is passwordless, so there is
                  no real difference to explain: the account is created the
                  first time you use a magic link. The pair also cost the right
                  column the width the `1fr auto 1fr` grid needs to keep the
                  logo on the page axis, which is why the sign-in link was
                  hidden below 560px and narrow phones were left with a lone
                  "Sign Up". */}
              {status !== 'loading' && !session && (
                <>
                  {showDirectoryJoin && (
                    <Link
                      href="/form/get-listed"
                      className={styles.directoryJoin}
                    >
                      Join the directory
                    </Link>
                  )}
                  <AuthMenu triggerClassName={styles.cta} />
                </>
              )}

              {status !== 'loading' && session && (
                <>
                  <MessagesLink />
                  <NotificationsMenu />
                  <IdentityMenu />
                </>
              )}
            </div>
          </div>

          {/* Sits inside the sticky masthead so the reminder travels with it. */}
          <ActingAsBar />
        </div>

        <NavDrawer
          open={drawerOpen}
          onClose={closeDrawer}
          items={drawerItems}
          title={t('nav.menu')}
          closeLabel={t('nav.closeMenu')}
          footer={
            <>
              {status !== 'loading' && !session && (
                <>
                  <Link
                    href="/welcome"
                    className={styles.drawerCta}
                    onClick={closeDrawer}
                  >
                    {t('nav.becomeAPana')}
                  </Link>
                  {/* Mirrors the masthead sign-in button, which stays visible at
                  every width -- this is the in-drawer path to the same page. */}
                  <p className={styles.drawerLogin}>
                    <Trans
                      i18nKey="nav.alreadyAPana"
                      t={t}
                      components={{
                        a: <Link href="/signin" onClick={closeDrawer} />,
                      }}
                    />
                  </p>
                </>
              )}

              {/* The language switch lives here because it used to sit in the
                  theme menu, which is gone. Settings and Sign Out are not
                  duplicated here — the masthead identity menu owns those. */}
              <div className={styles.drawerAccount}>
                <button
                  type="button"
                  className={styles.drawerAccountLink}
                  onClick={() => {
                    void i18n.changeLanguage(isEs ? 'en' : 'es');
                    closeDrawer();
                  }}
                >
                  {isEs ? 'in English' : 'en Español'}
                </button>
              </div>

              <p className={styles.drawerMeta}>{t('nav.regions')}</p>
            </>
          }
        />
      </header>
    </IdentityProvider>
  );
}
