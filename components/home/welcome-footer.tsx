'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  IconArrowUpRight,
  IconBookmark,
  IconChevronDown,
  IconChevronUp,
  IconFlower,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/lib/auth-client';
import { useIsNativeApp } from '@/lib/mobile/use-native-app';
import styles from './welcome-footer.module.css';

const SEEN_KEY = 'pana:welcome-footer:v1';
const PREVIEW_SEEN_KEY = 'pana:welcome-footer:mock:v1';
const SEARCH_GAP = 16;

export function WelcomeFooter({ preview = false }: { preview?: boolean }) {
  const { t } = useTranslation('home');
  const native = useIsNativeApp();
  const { status } = useSession();
  const [showWelcome, setShowWelcome] = useState<boolean | null>(null);
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const storageKey = preview ? PREVIEW_SEEN_KEY : SEEN_KEY;
  const initializedKey = useRef<string | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const bookmarkRef = useRef<HTMLButtonElement>(null);
  const signupRef = useRef<HTMLAnchorElement>(null);
  const focusAfterToggle = useRef(false);
  const eligible =
    !native && status === 'unauthenticated' && showWelcome !== null;
  const visible = eligible && showWelcome === true;

  useEffect(() => {
    if (
      native ||
      status !== 'unauthenticated' ||
      initializedKey.current === storageKey
    ) {
      return;
    }
    initializedKey.current = storageKey;

    let seen = false;
    try {
      seen = localStorage.getItem(storageKey) === 'seen';
    } catch (error) {
      console.error('Could not read the welcome footer preference:', error);
      setStorageUnavailable(true);
    }
    setShowWelcome(!seen);

    try {
      localStorage.setItem(storageKey, 'seen');
    } catch (error) {
      console.error('Could not save the welcome footer preference:', error);
      setStorageUnavailable(true);
    }
  }, [native, status, storageKey]);

  useEffect(() => {
    if (eligible && !showWelcome && focusAfterToggle.current) {
      focusAfterToggle.current = false;
      bookmarkRef.current?.focus({ preventScroll: true });
    }
  }, [eligible, showWelcome]);

  useEffect(() => {
    if (!visible) return;
    const panel = panelRef.current;
    const handle = handleRef.current;
    const bookmark = bookmarkRef.current;
    const hero = document.querySelector('.home-hero-field');
    const search = hero?.querySelector('form[role="search"]');
    if (!panel || !handle || !bookmark || !hero || !search) {
      throw new Error('The welcome footer requires the homepage search bar.');
    }

    const root = document.documentElement;
    const masthead = document.querySelector('header');
    let frame = 0;

    const publish = () => {
      frame = 0;
      const viewport = window.visualViewport;
      const viewportBottom =
        (viewport?.height ?? window.innerHeight) + (viewport?.offsetTop ?? 0);
      const mastheadBottom =
        parseFloat(
          getComputedStyle(root).getPropertyValue('--main-masthead-offset')
        ) || 0;
      const bounds = panel.getBoundingClientRect();
      root.style.setProperty('--welcome-footer-height', `${bounds.height}px`);
      const bookmarkBounds = bookmark.getBoundingClientRect();
      const top = Math.min(bounds.top, bookmarkBounds.top);
      root.style.setProperty(
        '--welcome-footer-clearance',
        `${bounds.bottom - top}px`
      );

      const panelStyle = getComputedStyle(panel);
      const minimumHeight =
        handle.getBoundingClientRect().height +
        parseFloat(panelStyle.borderTopWidth) +
        parseFloat(panelStyle.paddingBottom);
      const searchBottom = search.getBoundingClientRect().bottom;
      const ceiling = Math.max(searchBottom, mastheadBottom) + SEARCH_GAP;
      const hasSpace =
        bounds.height >= minimumHeight - 0.5 &&
        top >= ceiling &&
        bounds.bottom <= viewportBottom + 0.5;

      panel.dataset.spaceAvailable = String(hasSpace);
      bookmark.dataset.spaceAvailable = String(hasSpace);
      if (focusAfterToggle.current) {
        if (hasSpace) {
          focusAfterToggle.current = false;
          signupRef.current?.focus({ preventScroll: true });
        } else if (
          top >= mastheadBottom + SEARCH_GAP &&
          top < searchBottom + SEARCH_GAP
        ) {
          // A manual reopen on a short screen must clear the search, not stay hidden.
          window.scrollBy({
            top: Math.ceil(searchBottom + SEARCH_GAP - top),
            behavior: 'instant',
          });
        }
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(publish);
    };

    publish();
    const observer = new ResizeObserver(schedule);
    observer.observe(hero);
    observer.observe(search);
    observer.observe(panel);
    observer.observe(handle);
    observer.observe(bookmark);
    if (masthead) observer.observe(masthead);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('scroll', schedule);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('scroll', schedule);
      root.style.removeProperty('--welcome-footer-clearance');
      root.style.removeProperty('--welcome-footer-height');
    };
  }, [visible]);

  function dismiss() {
    focusAfterToggle.current = true;
    setShowWelcome(false);
  }

  function reopen() {
    focusAfterToggle.current = true;
    setShowWelcome(true);
  }

  return (
    <div
      data-welcome-footer-ready={
        native || status === 'authenticated' || showWelcome !== null
      }
    >
      {eligible && (
        <div id="welcome-footer-panel">
          {visible && (
            <aside
              ref={panelRef}
              className={styles.panel}
              aria-label={t('welcomeFooter.region')}
              data-welcome-footer
              onKeyDown={(event) => {
                if (event.key === 'Escape' && !event.defaultPrevented) {
                  event.preventDefault();
                  dismiss();
                }
              }}
            >
              <div ref={handleRef} className={styles.bar}>
                <div className={styles.identity}>
                  <span className={styles.flower} aria-hidden="true">
                    <IconFlower size={28} stroke={1.7} />
                  </span>
                  <div>
                    <h2 className={styles.title}>{t('welcomeFooter.title')}</h2>
                    <p
                      id="welcome-footer-description"
                      className={styles.description}
                    >
                      {t('welcomeFooter.description')}
                    </p>
                  </div>
                </div>
                <div className={styles.actions}>
                  <Link
                    ref={signupRef}
                    id="welcome-footer-signup"
                    href="/signin"
                    prefetch={false}
                    className={styles.cta}
                  >
                    {t('welcomeFooter.cta')}
                    <IconArrowUpRight size={18} aria-hidden="true" />
                  </Link>
                </div>
              </div>
              {storageUnavailable && (
                <p role="status" className={styles.storageNote}>
                  {t('welcomeFooter.storageUnavailable')}
                </p>
              )}
            </aside>
          )}
        </div>
      )}

      {eligible && (
        <button
          ref={bookmarkRef}
          type="button"
          className={styles.bookmark}
          data-welcome-bookmark
          data-open={visible}
          aria-expanded={visible}
          aria-controls="welcome-footer-panel"
          onClick={visible ? dismiss : reopen}
        >
          <IconBookmark size={17} stroke={1.7} aria-hidden="true" />
          {t(visible ? 'welcomeFooter.hide' : 'welcomeFooter.reopen')}
          {visible ? (
            <IconChevronDown size={16} aria-hidden="true" />
          ) : (
            <IconChevronUp size={16} aria-hidden="true" />
          )}
        </button>
      )}
    </div>
  );
}
