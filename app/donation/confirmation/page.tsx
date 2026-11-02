'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Heart, Repeat2, Sun } from 'lucide-react';
import styles from '@/components/donations/donation-experience.module.css';

function DonationConfirmationContent() {
  const searchParams = useSearchParams();
  const rawTier = searchParams?.get('tier');
  const tier = rawTier ? Number.parseInt(rawTier, 10) : 0;
  const frequency = searchParams?.get('frequency');
  const isRecurring = frequency === 'monthly' || (!frequency && tier > 0);

  return (
    <main
      className={`${styles.page} ${styles.confirmationPage}`}
      data-donation-thanks
    >
      <div className={styles.confirmationInner}>
        <header className={styles.confirmationHero}>
          <div>
            <span className={styles.confirmationMark} aria-hidden="true">
              <Heart size={30} />
            </span>
            <p className={styles.eyebrow}>For the love of local</p>
            <h1 className={styles.confirmationTitle}>
              Muchísimas <span>Gracias!</span>
            </h1>
            <h2 className={styles.confirmationSubtitle}>
              {isRecurring
                ? tier > 0
                  ? 'Thank you so much for becoming a Gente dePana!'
                  : 'Thank you so much for your monthly support!'
                : 'Thank you so much for your contribution!'}
            </h2>
          </div>

          <figure className={styles.heroPhoto}>
            <Image
              src="/img/impact/community-group.webp"
              alt="Panas gathered together at a local community event."
              width={1600}
              height={886}
              sizes="(max-width: 767px) 100vw, 50vw"
              priority
            />
            <div className={styles.photoStamp} aria-hidden="true">
              <Sun size={28} />
              <span>Growing together</span>
            </div>
            <figcaption>Real people. Shared roots. South Florida.</figcaption>
          </figure>
        </header>

        <section
          className={styles.confirmationCard}
          aria-labelledby="gift-impact-title"
        >
          <div className={styles.confirmationHeading}>
            <span className={styles.cardHeart}>
              <Heart size={23} aria-hidden="true" />
            </span>
            <h3 id="gift-impact-title">Your support makes a difference.</h3>
          </div>
          <p className={styles.confirmationLead}>
            Your generosity helps local culture, community technology, and the
            connections that make South Florida feel like home keep growing.
            We&apos;re glad you&apos;re part of it, pana.
          </p>
          {isRecurring && (
            <div className={styles.confirmationMonthly} data-monthly-thanks>
              <Repeat2 size={22} aria-hidden="true" />
              <p>
                Your monthly support gives us room to plan, build, and keep
                showing up. For help managing your gift, reach out to the team
                below.
              </p>
            </div>
          )}
          <p className={styles.confirmationContact}>
            Questions about your gift? We&apos;re here for you at{' '}
            <Link href="mailto:gentede@panamia.club">gentede@panamia.club</Link>
            .
          </p>
        </section>

        <nav className={styles.confirmationActions} aria-label="After giving">
          <Link href="/" className={styles.primaryButton}>
            Return to Home <ArrowRight size={18} aria-hidden="true" />
          </Link>
          <Link
            href="/directory/search"
            className={`${styles.primaryButton} ${styles.secondaryButton}`}
          >
            Explore Directory <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </nav>
        <p className={styles.confirmationSignoff}>
          The future is local. Thanks for being part of it.
        </p>
      </div>
    </main>
  );
}

export default function DonationConfirmationPage() {
  return (
    <Suspense
      fallback={
        <main
          className={`${styles.page} ${styles.confirmationPage} ${styles.confirmationLoading}`}
        >
          <Heart size={30} aria-hidden="true" />
          <p role="status">Loading your thank-you page...</p>
        </main>
      }
    >
      <DonationConfirmationContent />
    </Suspense>
  );
}
