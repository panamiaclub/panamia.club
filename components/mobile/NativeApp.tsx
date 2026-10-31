'use client';

import {
  Component,
  Activity,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import Image from 'next/image';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Bug,
  MessageCircle,
  Store,
  UserRound,
  Users,
} from 'lucide-react';
import { useSession } from '@/lib/auth-client';
import { useQueryClient } from '@tanstack/react-query';
import {
  IdentityProvider,
  useIdentity,
} from '@/components/account/identity-provider';
import { IdentityMenu } from '@/components/account/identity-menu';
import { NotificationsMenu } from '@/components/account/notifications-menu';
import { ActingAsBar } from '@/components/account/acting-as-bar';
import { OPEN_BUG_REPORT_EVENT } from '@/lib/mobile/native';
import { cn } from '@/lib/utils';
import {
  NATIVE_TABS,
  nativeRootForPath,
  type NativeRootTab,
  type NativeTab,
} from '@/lib/mobile/app-navigation';
import { NativeViewerContext } from './native-app-context';
import { NativeEventSave, NativeNotice } from './NativeResultCard';
import styles from './native-app.module.css';

const NativeDirectory = dynamic(() => import('./NativeDirectory'), {
  loading: () => <NativeNotice title="Loading directory..." busy />,
});
const NativeCommunity = dynamic(() => import('./NativeCommunity'), {
  loading: () => <NativeNotice title="Loading community..." busy />,
});
const FeedPage = dynamic(
  () =>
    import('@/app/s/_components/feed-page').then((module) => module.FeedPage),
  {
    loading: () => <NativeNotice title="Loading Social..." busy />,
  }
);

class PaneBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    console.error('Native app screen failed:', error);
  }
  render() {
    return this.state.failed ? (
      <NativeNotice
        title="This screen could not open"
        onRetry={() => this.setState({ failed: false })}
      >
        Your account and changes are still saved. Try opening the screen again.
      </NativeNotice>
    ) : (
      this.props.children
    );
  }
}

export default function NativeApp({
  children,
  surfaceId,
}: {
  children: ReactNode;
  surfaceId: string;
}) {
  const { data: session, status } = useSession();
  const queries = useQueryClient();
  const userId = session?.user.id || 'guest';
  const [cacheOwner, setCacheOwner] = useState(userId);
  useLayoutEffect(() => {
    if (cacheOwner === userId) return;
    queries.clear();
    setCacheOwner(userId);
  }, [queries, userId, cacheOwner]);
  if (cacheOwner !== userId) {
    return (
      <div className={styles.app}>
        <NativeNotice title="Updating your account..." busy />
      </div>
    );
  }
  const signedIn = status === 'authenticated';
  return (
    <IdentityProvider key={session?.user.id || 'guest'} enabled={signedIn}>
      <AppFrame surfaceId={surfaceId} signedIn={signedIn} userId={userId}>
        {children}
      </AppFrame>
    </IdentityProvider>
  );
}

function AppFrame({
  children,
  surfaceId,
  signedIn,
  userId,
}: {
  children: ReactNode;
  surfaceId: string;
  signedIn: boolean;
  userId: string;
}) {
  const pathname = usePathname() || '/';
  const search = useSearchParams();
  const router = useRouter();
  const identity = useIdentity();
  const profileHref = signedIn
    ? identity?.personal?.screenname
      ? `/p/${encodeURIComponent(identity.personal.screenname)}`
      : '/account'
    : '/signin?callbackUrl=%2Faccount';
  const root = nativeRootForPath(pathname, surfaceId);
  const rootTab = root?.tab ?? null;
  const location = `${pathname}${search?.size ? `?${search}` : ''}`;
  const [lastTab, setLastTab] = useState<NativeRootTab>(rootTab ?? 'directory');
  const [visited, setVisited] = useState<NativeRootTab[]>(
    rootTab ? [rootTab] : []
  );
  const lastDirectoryHref = useRef('/d');
  const rootFocus = useRef<HTMLElement | null>(null);
  const previousRoot = useRef(rootTab);
  const detail = useRef<HTMLDivElement>(null);
  const activeTab: NativeTab =
    pathname === profileHref ||
    pathname.startsWith('/account') ||
    pathname === '/form/delete-account'
      ? 'profile'
      : (rootTab ?? lastTab);
  const eventSlug = /^\/e\/([^/]+)$/.exec(pathname)?.[1];
  const viewerKey = `${userId}:${identity?.activeId || 'self'}`;

  useEffect(() => {
    if (!rootTab) return;
    setLastTab(rootTab);
    setVisited((current) =>
      current.includes(rootTab) ? current : [...current, rootTab]
    );
    if (rootTab === 'directory') lastDirectoryHref.current = location;
  }, [rootTab, location]);

  useLayoutEffect(() => {
    if (!rootTab) {
      detail.current?.scrollTo({ top: 0 });
    } else if (previousRoot.current === null) {
      rootFocus.current?.focus({ preventScroll: true });
    }
    previousRoot.current = rootTab;
  }, [rootTab, location]);

  const shown = (tab: NativeRootTab) =>
    visited.includes(tab) || rootTab === tab;

  return (
    <NativeViewerContext.Provider value={{ signedIn, viewerKey }}>
      <div
        className={cn(styles.app, rootTab === 'directory' && 'dirscope')}
        data-native-app
      >
        <header className={styles.header}>
          {!root && (
            <button
              type="button"
              className={styles.iconButton}
              aria-label="Back"
              onClick={() => {
                if (window.history.length > 1) router.back();
                else
                  router.push(
                    lastTab === 'directory'
                      ? '/d'
                      : lastTab === 'social'
                        ? '/s'
                        : '/groups'
                  );
              }}
            >
              <ArrowLeft size={22} aria-hidden="true" />
            </button>
          )}
          <Link
            href="/d"
            className={styles.brand}
            aria-label="Pana Mia directory"
          >
            <Image
              src="/logos/pana_logo_long_orange.png"
              width={128}
              height={32}
              alt="Pana Mia"
              priority
            />
          </Link>
          <div className={styles.headerActions}>
            {eventSlug && eventSlug !== 'new' && (
              <NativeEventSave slug={decodeURIComponent(eventSlug)} />
            )}
            <button
              type="button"
              className={styles.iconButton}
              aria-label="Report a bug"
              onClick={() =>
                window.dispatchEvent(new Event(OPEN_BUG_REPORT_EVENT))
              }
            >
              <Bug size={19} aria-hidden="true" />
            </button>
            <NotificationsMenu />
            {signedIn ? (
              <IdentityMenu compact />
            ) : (
              <Link
                href="/signin?callbackUrl=%2Fd"
                className={styles.iconButton}
                aria-label="Sign in"
              >
                <UserRound size={20} aria-hidden="true" />
              </Link>
            )}
          </div>
        </header>
        <ActingAsBar />

        <div className={styles.body}>
          <div
            id={root ? 'layout-main' : undefined}
            className={styles.hub}
            hidden={!root}
            onFocusCapture={(event) => {
              if (root && event.target instanceof HTMLElement) {
                rootFocus.current = event.target;
              }
            }}
          >
            {shown('directory') && (
              <section
                className={styles.pane}
                hidden={rootTab !== 'directory'}
                aria-label="Directory"
              >
                <PaneBoundary>
                  <NativeDirectory
                    active={rootTab === 'directory'}
                    request={rootTab === 'directory' ? location : null}
                  />
                </PaneBoundary>
              </section>
            )}
            {shown('social') && (
              <section
                className={`${styles.pane} ${styles.scrollPane}`}
                hidden={rootTab !== 'social'}
                aria-label="Social"
              >
                <PaneBoundary>
                  <NativeSocial key={viewerKey} active={rootTab === 'social'} />
                </PaneBoundary>
              </section>
            )}
            {shown('community') && (
              <section
                className={`${styles.pane} ${styles.scrollPane}`}
                hidden={rootTab !== 'community'}
                aria-label="Community"
              >
                <PaneBoundary>
                  <NativeCommunity
                    active={rootTab === 'community'}
                    request={rootTab === 'community' ? location : null}
                    requestedView={root?.view}
                    requestedSection={root?.section}
                  />
                </PaneBoundary>
              </section>
            )}
          </div>
          {!root && (
            <div id="layout-main" className={styles.detail} ref={detail}>
              {children}
            </div>
          )}
        </div>

        <nav className={styles.bottomNav} aria-label="App navigation">
          {NATIVE_TABS.map((tab) => {
            const Icon =
              tab.id === 'directory'
                ? Store
                : tab.id === 'social'
                  ? MessageCircle
                  : tab.id === 'community'
                    ? Users
                    : UserRound;
            const href =
              tab.id === 'profile'
                ? profileHref
                : tab.id === 'directory'
                  ? lastDirectoryHref.current
                  : tab.href;
            return (
              <Link
                key={tab.id}
                href={href}
                aria-current={activeTab === tab.id ? 'page' : undefined}
                className={styles.navItem}
              >
                {tab.id === 'profile' && identity?.personal?.primaryImageCdn ? (
                  <img
                    src={identity.personal.primaryImageCdn}
                    alt=""
                    width={24}
                    height={24}
                    className={styles.navAvatar}
                  />
                ) : (
                  <Icon size={23} aria-hidden="true" />
                )}
                <span>{tab.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </NativeViewerContext.Provider>
  );
}

function NativeSocial({ active }: { active: boolean }) {
  const [captureSession, setCaptureSession] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (active) return;
    panel.current
      ?.querySelectorAll<HTMLMediaElement>('audio, video')
      .forEach((media) => media.pause());
    setCaptureSession((session) => session + 1);
  }, [active]);
  return (
    <div ref={panel}>
      <Activity mode={active ? 'visible' : 'hidden'}>
        <FeedPage active={active} captureSession={captureSession} />
      </Activity>
    </div>
  );
}
