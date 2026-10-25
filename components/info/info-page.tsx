'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Image from 'next/image';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  CalendarDays,
  Heart,
  Mail,
  MapPin,
  MessageCircle,
  Search,
  Store,
  Users,
} from 'lucide-react';
import { useTurnstile } from '@/components/Turnstile';
import { INFO_LINKS } from '@/lib/info-site';
import styles from './info-page.module.css';

const LINK_ICONS = {
  directory: Search,
  social: MessageCircle,
  events: CalendarDays,
  connectors: Users,
  listing: Store,
  support: Heart,
};

function NewsletterSignup({ language }: { language: 'en' | 'es' }) {
  const { t } = useTranslation('info', { lng: language });
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{
    kind: 'success' | 'error';
    message: 'verification' | 'duplicate' | 'failed' | 'success';
  } | null>(null);
  // Resolve the runtime key after hydration, not from a build-time env value.
  const { token, error, reset, Widget } = useTurnstile(
    undefined,
    'newsletter_signup'
  );

  async function subscribe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    if (!token || !consent) {
      setFeedback({ kind: 'error', message: 'verification' });
      return;
    }

    setPending(true);
    try {
      const response = await fetch('/api/createSignup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          signup_type: 'info_site',
          turnstileToken: token,
        }),
      });
      const result: unknown = await response.json();
      if (
        !response.ok ||
        typeof result !== 'object' ||
        result === null ||
        !('success' in result) ||
        result.success !== true
      ) {
        const alreadyRegistered =
          typeof result === 'object' &&
          result !== null &&
          'error' in result &&
          result.error === 'You are already registered.';
        setFeedback({
          kind: 'error',
          message: alreadyRegistered ? 'duplicate' : 'failed',
        });
        return;
      }

      setName('');
      setEmail('');
      setConsent(false);
      setFeedback({ kind: 'success', message: 'success' });
    } catch (submissionError) {
      console.error('Info newsletter signup failed:', submissionError);
      setFeedback({
        kind: 'error',
        message: 'failed',
      });
    } finally {
      reset();
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={subscribe}
      className={styles.form}
      aria-label={t('newsletter.formLabel')}
      aria-busy={pending}
    >
      <div className={styles.field}>
        <label htmlFor="info-newsletter-name">{t('newsletter.name')}</label>
        <input
          id="info-newsletter-name"
          name="name"
          autoComplete="name"
          maxLength={75}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="info-newsletter-email">{t('newsletter.email')}</label>
        <input
          id="info-newsletter-email"
          name="email"
          type="email"
          autoComplete="email"
          maxLength={100}
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-describedby="info-newsletter-privacy"
        />
      </div>
      <label className={styles.consent}>
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
          required
        />
        <span>{t('newsletter.consent')}</span>
      </label>
      <p id="info-newsletter-privacy" className={styles.formNote}>
        {t('newsletter.privacyNote')}{' '}
        <a href="/legal/privacy">{t('footer.privacy')}</a>.
      </p>
      {Widget}
      {error ? (
        <p role="alert" className={styles.formNote}>
          {t('newsletter.unavailable')}{' '}
          <a href="/form/contact-us">{t('footer.contact')}</a>
        </p>
      ) : !token ? (
        <p className={styles.formNote}>{t('newsletter.verification')}</p>
      ) : null}
      <button
        type="submit"
        className={styles.primaryButton}
        disabled={pending || !token || !consent}
      >
        {pending ? t('newsletter.submitting') : t('newsletter.submit')}
        <ArrowRight size={18} aria-hidden="true" />
      </button>
      {feedback && (
        <p
          role={feedback.kind === 'error' ? 'alert' : 'status'}
          className={styles.feedback}
          data-kind={feedback.kind}
        >
          {t(`newsletter.${feedback.message}`)}
        </p>
      )}
    </form>
  );
}

export function InfoPage() {
  const { i18n } = useTranslation('info');
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  // Language detection reads browser storage; hydrate in the server fallback.
  const language = hydrated && i18n.resolvedLanguage === 'es' ? 'es' : 'en';
  const t = i18n.getFixedT(language, 'info');
  const isSpanish = language === 'es';

  return (
    <div className={styles.page} id="info-top" lang={isSpanish ? 'es' : 'en'}>
      <a href="#info-main" className={styles.skipLink}>
        {t('skipLink')}
      </a>
      <header className={styles.header}>
        <a href="#info-top" aria-label={t('homeLabel')}>
          <Image
            src="/logos/pana_logo_long_orange.png"
            alt="Pana MIA Club"
            width={800}
            height={135}
            className={styles.logo}
            priority
          />
        </a>
        <nav aria-label={t('nav.label')}>
          <a href="/about-us">{t('nav.about')}</a>
          <button
            type="button"
            onClick={() => void i18n.changeLanguage(isSpanish ? 'en' : 'es')}
            aria-label={t('nav.changeLanguage')}
            lang={isSpanish ? 'en' : 'es'}
          >
            {isSpanish ? 'English' : 'Español'}
          </button>
        </nav>
      </header>

      <main id="info-main">
        <section className={styles.hero} aria-labelledby="info-title">
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>{t('hero.eyebrow')}</p>
            <h1 id="info-title">
              {t('hero.title')} <span>{t('hero.titleAccent')}</span>
            </h1>
            <p className={styles.lead}>{t('hero.description')}</p>
            <div className={styles.actions}>
              <a href="/d" className={styles.primaryButton}>
                {t('hero.explore')}
                <ArrowRight size={18} aria-hidden="true" />
              </a>
              <a href="#newsletter-signup" className={styles.secondaryButton}>
                <Mail size={18} aria-hidden="true" />
                {t('hero.newsletter')}
              </a>
            </div>
            <p className={styles.region}>
              <MapPin size={18} aria-hidden="true" />
              {t('hero.region')}
            </p>
          </div>
          <figure className={styles.heroImage}>
            <Image
              src="/img/impact/pana-social-dinner.webp"
              alt={t('hero.imageAlt')}
              width={1000}
              height={900}
              sizes="(max-width: 760px) 100vw, 45vw"
              priority
            />
            <figcaption>{t('hero.caption')}</figcaption>
          </figure>
        </section>

        <section className={styles.connections} aria-labelledby="info-paths">
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>{t('paths.eyebrow')}</p>
            <h2 id="info-paths">{t('paths.title')}</h2>
            <p>{t('paths.description')}</p>
          </div>
          <div className={styles.linkGrid}>
            {INFO_LINKS.map(({ id, href }) => {
              const Icon = LINK_ICONS[id];
              return (
                <a
                  key={id}
                  href={href}
                  className={styles.linkCard}
                  data-featured={id === 'directory'}
                >
                  <Icon size={26} aria-hidden="true" />
                  <div>
                    <h3>{t(`paths.${id}.title`)}</h3>
                    <p>{t(`paths.${id}.description`)}</p>
                  </div>
                  <ArrowRight size={20} aria-hidden="true" />
                </a>
              );
            })}
          </div>
        </section>

        <section
          id="newsletter-signup"
          className={styles.newsletter}
          aria-labelledby="info-newsletter-title"
        >
          <div>
            <p className={styles.eyebrow}>{t('newsletter.eyebrow')}</p>
            <h2 id="info-newsletter-title">{t('newsletter.title')}</h2>
            <p className={styles.lead}>{t('newsletter.description')}</p>
            <p className={styles.newsletterAside}>{t('newsletter.aside')}</p>
          </div>
          <NewsletterSignup language={language} />
        </section>
      </main>

      <footer className={styles.footer}>
        <p>{t('footer.mission')}</p>
        <nav aria-label={t('footer.socialLabel')}>
          <a href="https://instagram.com/goto.panamia.club/">Instagram</a>
          <a href="https://instagram.com/panamia.events/">Pana Events</a>
          <a href="https://www.linkedin.com/company/pana-mia/">LinkedIn</a>
        </nav>
        <nav aria-label={t('footer.legalLabel')}>
          <a href="/form/contact-us">{t('footer.contact')}</a>
          <a href="/legal/privacy">{t('footer.privacy')}</a>
          <a href="/legal/terms">{t('footer.terms')}</a>
        </nav>
        <p className={styles.copyright}>
          {t('footer.copyright', { year: new Date().getFullYear() })}
        </p>
      </footer>
    </div>
  );
}
