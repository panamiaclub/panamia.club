'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import * as Dialog from '@radix-ui/react-dialog';
import { Lock, Search, Sparkles, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DirectorySuggest } from '@/components/directory-suggest';
import { KIND_ICON } from '@/components/kind-icon';
import { useSession } from '@/lib/auth-client';
import {
  SCOPE_REQUIRES_PANA,
  SCOPE_TONE,
  scopePath,
  type Scope,
} from '@/lib/directory-scopes';

const SOCIAL_SCOPES = ['pana', 'group', 'event', 'directory'] as const;

export function SocialSearch() {
  // Match the server's fallback language during the hydration render.
  const [hydrated, setHydrated] = useState(false);
  const { t } = useTranslation('common', {
    lng: hydrated ? undefined : 'en',
  });
  const { data: session, status } = useSession();
  const signedIn = status === 'authenticated' && !!session?.user.id;
  const [chosenScope, setChosenScope] = useState<Scope | null>(null);
  const [term, setTerm] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const scope =
    chosenScope && (!SCOPE_REQUIRES_PANA[chosenScope] || signedIn)
      ? chosenScope
      : signedIn
        ? 'pana'
        : 'group';

  useEffect(() => {
    setHydrated(true);
    const media = window.matchMedia('(max-width: 767px)');
    const update = () => {
      setIsMobile(media.matches);
      setMobileOpen(false);
    };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const controls = (
    <>
      <p className="social-search-kicker">
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        {t('search.social.kicker')}
      </p>
      <div
        role="group"
        aria-label={t('search.social.categories')}
        className="social-search-categories"
      >
        {SOCIAL_SCOPES.map((option) => {
          const Icon = KIND_ICON[option];
          const label = t(`search.social.category.${option}`);
          const locked = SCOPE_REQUIRES_PANA[option] && !signedIn;
          return (
            <button
              key={option}
              type="button"
              data-tone={SCOPE_TONE[option]}
              className="social-search-category"
              aria-pressed={scope === option}
              aria-label={
                locked ? t('search.social.locked', { category: label }) : label
              }
              disabled={locked}
              onClick={(event) => {
                setChosenScope(option);
                event.currentTarget
                  .closest('form')
                  ?.querySelector('input')
                  ?.focus();
              }}
            >
              <span className="social-search-category-icon">
                <Icon className="h-5 w-5" aria-hidden="true" />
                {locked && (
                  <Lock className="social-search-lock" aria-hidden="true" />
                )}
              </span>
              {label}
            </button>
          );
        })}
      </div>
      {!signedIn && status !== 'loading' && (
        <Link
          href={`/signin?callbackUrl=${encodeURIComponent(scopePath('pana', term))}`}
          className="social-search-access"
        >
          {t('search.social.signIn')}
        </Link>
      )}
    </>
  );
  const label = t(`search.social.placeholder.${scope}`);
  const searchProps = {
    label,
    ariaLabel: label,
    placeholder: label,
    buttonLabel: t('search.social.submit'),
    scope,
    discovery: {
      label: t('search.social.label'),
      controls,
      hint: t(`search.social.hint.${scope}`),
      value: term,
      onValueChange: setTerm,
    },
  };

  return (
    <div className="social-search">
      {!isMobile && (
        <DirectorySuggest
          {...searchProps}
          layout="discovery"
          className="social-search-desktop"
        />
      )}
      <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <Dialog.Trigger asChild>
          <button
            type="button"
            className="social-search-trigger"
            aria-label={t('search.social.trigger')}
          >
            <Search className="h-5 w-5" aria-hidden="true" />
          </button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="social-search-overlay" />
          <Dialog.Content className="social-search-sheet">
            <Dialog.Title className="social-search-title">
              {t('search.social.title')}
            </Dialog.Title>
            <Dialog.Description className="social-search-description">
              {t('search.social.description')}
            </Dialog.Description>
            {isMobile && (
              <DirectorySuggest {...searchProps} layout="discovery-sheet" />
            )}
            <Dialog.Close
              className="social-search-close"
              aria-label={t('search.social.close')}
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <noscript>
        <form
          role="search"
          aria-label={t('search.social.label')}
          className="social-search-noscript social-search-bar"
          action={scopePath('group', '')}
          method="get"
        >
          <label className="sr-only" htmlFor="social-search-fallback">
            {t('search.social.placeholder.group')}
          </label>
          <input
            id="social-search-fallback"
            type="search"
            name="q"
            required
            pattern=".*\S.*"
            className="social-search-input"
            placeholder={t('search.social.placeholder.group')}
          />
          <button type="submit" className="social-search-submit">
            {t('search.social.submit')}
          </button>
        </form>
      </noscript>
    </div>
  );
}
