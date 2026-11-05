'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { useIsHydrated, useSession } from '@/lib/auth-client';
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
import type { SurfaceMark } from '@/lib/panaverse/branding';

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
      { labelKey: 'nav.siteMenu.ourStory', href: '/about-us/our-story' },
      {
        labelKey: 'nav.siteMenu.meetTheTeam',
        href: '/about-us/meet-the-team',
      },
      { labelKey: 'nav.siteMenu.whyLocal', href: '/about-us/why-local' },
      { labelKey: 'nav.siteMenu.pillars', href: '/about-us/pillars' },
    ],
  },
  {
    labelKey: 'nav.siteMenu.ourImpact',
    href: '/our-impact',
    children: [
      {
        labelKey: 'nav.siteMenu.communityConnectorsProgram',
        href: '/our-impact#community-connectors',
      },
      {
        labelKey: 'nav.siteMenu.storiesOfImpact',
        href: '/our-impact#stories-of-impact',
      },
      {
        labelKey: 'nav.siteMenu.downloadOurImpact',
        href: '/impact',
      },
    ],
  },
  {
    labelKey: 'nav.siteMenu.ourEcosystem',
    href: '/ecosystem',
    children: [
      {
        labelKey: 'nav.siteMenu.collaborativePartners',
        href: '/ecosystem#collaborative-partners',
      },
      {
        labelKey: 'nav.siteMenu.collaborativeProjects',
        href: '/ecosystem#collaborative-projects',
      },
      {
        labelKey: 'nav.siteMenu.panaCertified',
        href: '/ecosystem#pana-certified',
      },
      {
        labelKey: 'nav.siteMenu.sponsorsFunders',
        href: '/ecosystem#sponsors-funders',
      },
    ],
  },
  {
    labelKey: 'nav.siteMenu.supportPana',
    href: '/support-pana',
    children: [
      {
        labelKey: 'nav.siteMenu.givingCircle',
        href: '/support-pana#giving-circle',
      },
      {
        labelKey: 'nav.siteMenu.sponsorship',
        href: '/support-pana#sponsorship',
      },
    ],
  },
  {
    labelKey: 'nav.siteMenu.programs',
    href: '/programs',
    children: [
      {
        labelKey: 'nav.siteMenu.pillarBreakdownByProgram',
        href: '/programs#pillar-breakdown',
      },
      {
        labelKey: 'nav.siteMenu.collectiveTech',
        href: '/programs#collective-tech',
        children: [
          { labelKey: 'nav.siteMenu.directory', href: '/directory' },
          { labelKey: 'nav.siteMenu.panaSocial', href: '/social' },
        ],
      },
      {
        labelKey: 'nav.siteMenu.communityBuilding',
        href: '/programs#community-building',
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
        href: '/programs#culture-work',
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
            href: '/ecosystem#collaborative-projects',
          },
        ],
      },
    ],
  },
  { labelKey: 'nav.siteMenu.shop', href: '/shop' },
];

function scrollToCurrentAboutSection(event: MouseEvent<HTMLAnchorElement>) {
  const { pathname } = event.currentTarget;
  if (
    pathname !== window.location.pathname ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }

  event.preventDefault();
  document
    .getElementById(pathname.slice('/about-us/'.length))
    ?.scrollIntoView({ behavior: 'instant', block: 'start' });
}

export default function MainHeader({
  isProductionSite,
  authPage,
}: {
  isProductionSite: boolean;
  authPage?: { mark: SurfaceMark; rootPath: string };
}) {
  const { t, i18n } = useTranslation('common');
  const isEs = i18n.language === 'es';
  const { data: session, status } = useSession();
  const isHydrated = useIsHydrated();
  const pathname = usePathname();
  const isAuthPage = authPage !== undefined;
  // The regular masthead can survive client navigation into sign-in. Both
  // mastheads must keep the existing callback instead of reopening bare /signin.
  const isSignInEntry = isAuthPage || pathname === '/signin';
  const signInHref = isSignInEntry ? '#signin-card' : '/signin';
  const headerMark = authPage?.mark ?? {
    src: '/logos/pana_logo_long_orange.png',
    alt: 'Pana Mia',
    width: 600,
    height: 150,
  };
  const isShopRoute = pathname === '/shop' || pathname.startsWith('/shop/');
  const showDirectoryJoin =
    pathname === '/' ||
    pathname === '/mock/home' ||
    pathname === '/mock/welcome-footer';
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);
  const mastheadRef = useRef<HTMLDivElement>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  useEffect(() => {
    const masthead = mastheadRef.current;
    if (!masthead) return;

    const root = document.documentElement;
    const publishOffset = () => {
      const top = parseFloat(getComputedStyle(masthead).top);
      root.style.setProperty(
        '--main-masthead-offset',
        `${masthead.getBoundingClientRect().height + top}px`
      );
    };

    publishOffset();
    const observer = new ResizeObserver(publishOffset);
    observer.observe(masthead, { box: 'border-box' });
    window.addEventListener('resize', publishOffset);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', publishOffset);
      root.style.removeProperty('--main-masthead-offset');
    };
  }, []);

  // The public site menu is identical for every visitor. Account destinations
  // remain in the identity menu rather than changing this list after sign-in.
  const drawerItems = useMemo<NavDrawerItem[]>(() => {
    const translateItem = (item: NavItemDefinition): NavDrawerItem => ({
      href: item.href,
      label: t(item.labelKey),
      expandLabel: t('nav.expandSubmenu', {
        label: t(item.labelKey),
      }),
      collapseLabel: t('nav.collapseSubmenu', {
        label: t(item.labelKey),
      }),
      onSelect: item.href.startsWith('/about-us/')
        ? scrollToCurrentAboutSection
        : undefined,
      children: item.children?.map(translateItem),
    });

    return NAV_ITEMS.map(translateItem);
  }, [t]);

  // Check if authenticated user has a profile
  useEffect(() => {
    if (!isAuthPage && session?.user) {
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
  }, [session, isAuthPage]);

  return (
    <IdentityProvider
      enabled={!isAuthPage && status !== 'loading' && !!session}
    >
      <header className={styles.header}>
        {/* Ambient unread cues: browser-tab count + desktop notifications */}
        {!isAuthPage && <NotificationAlerts />}
        {/* The shop carries its own purpose-built announcement. The generic
            profile/test-site CTA changes the first band of the approved shop
            design and makes the masthead feel like a borrowed component. */}
        {!isAuthPage && status !== 'loading' && isShopRoute && (
          <div className={styles.shopAnnouncement}>
            {t('nav.shopAnnouncement')}
          </div>
        )}
        {!isAuthPage &&
          status !== 'loading' &&
          !isProductionSite &&
          !isShopRoute &&
          !session && (
            <div id="call-to-action-bar">
              <CallToActionBar variant="test-site" />
            </div>
          )}
        {!isAuthPage &&
          status !== 'loading' &&
          session &&
          hasProfile === false &&
          !isShopRoute &&
          !isOnboardingRoute(pathname) && (
            <div id="call-to-action-bar">
              <CallToActionBar variant="complete-profile" />
            </div>
          )}
        {/* Centered masthead: menu (left) · logo (center) · actions (right) */}
        <div ref={mastheadRef} className={styles.masthead}>
          <div
            className={styles.mastheadInner}
            data-auth-entry={
              isAuthPage || (status !== 'loading' && !session)
                ? 'true'
                : undefined
            }
          >
            <div className={styles.mastheadLeft}>
              <button
                type="button"
                className={styles.menuButton}
                onClick={() => setDrawerOpen(true)}
                disabled={!isHydrated}
                aria-label={t('nav.menu')}
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
              href={authPage?.rootPath ?? '/'}
              className={styles.mastheadLogo}
              aria-label={headerMark.alt}
            >
              <Image
                src={headerMark.src}
                alt={headerMark.alt}
                width={headerMark.width}
                height={headerMark.height}
                priority
              />
            </Link>

            <div className={styles.mastheadRight}>
              {((status !== 'loading' && !session) || isAuthPage) && (
                <>
                  {showDirectoryJoin && (
                    <Link
                      href="/form/get-listed"
                      className={styles.directoryJoin}
                    >
                      Join the directory
                    </Link>
                  )}
                  <AuthMenu triggerClassName={styles.cta} href={signInHref} />
                </>
              )}

              {!isAuthPage && status !== 'loading' && session && (
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
          mark={authPage?.mark}
          footer={
            <>
              {((status !== 'loading' && !session) || isAuthPage) && (
                <>
                  <Link
                    href={isSignInEntry ? '#signin-card' : '/welcome'}
                    className={styles.drawerCta}
                    onClick={closeDrawer}
                  >
                    {t(isSignInEntry ? 'nav.signUp' : 'nav.becomeAPana')}
                  </Link>
                  {/* Mirrors the masthead sign-in button, which stays visible at
                  every width -- this is the in-drawer path to the same page. */}
                  <p className={styles.drawerLogin}>
                    <Trans
                      i18nKey="nav.alreadyAPana"
                      t={t}
                      components={{
                        a: <Link href={signInHref} onClick={closeDrawer} />,
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
