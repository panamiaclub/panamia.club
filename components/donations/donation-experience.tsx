'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  Globe,
  Heart,
  LockKeyhole,
  Palette,
  Repeat2,
  Sun,
  UsersRound,
} from 'lucide-react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DONATION_AMOUNT_ERROR,
  DONATION_PURPOSES,
  MONTHLY_LEVELS,
  ONE_TIME_AMOUNTS,
  formatGift,
  getMonthlyDonationTier,
  parseCustomAmount,
  type DonationFrequency,
  type DonationGift,
} from '@/lib/donations';
import { useIsNativeApp } from '@/lib/mobile/use-native-app';
import styles from './donation-experience.module.css';

type GiftSelection = { preset: number | null; customAmount: string };
type GiftPreview = {
  frequency: DonationFrequency;
  cents: number;
  purpose: string;
  note: string;
};

interface DonationExperienceProps {
  previewOnly?: boolean;
  initialGift?: DonationGift | null;
  checkoutCanceled?: boolean;
}

const SUPPORT_AREAS = [
  {
    icon: Palette,
    title: 'Culture worth showing up for',
    description:
      'Local art, creative projects, and the gatherings that bring us together.',
  },
  {
    icon: Globe,
    title: 'Tools that put people first',
    description:
      'Community technology to discover local businesses, events, and each other.',
  },
  {
    icon: UsersRound,
    title: 'A more connected South Florida',
    description:
      'More ways for our neighbors, creatives, and small businesses to connect.',
  },
];

export function DonationExperience({
  previewOnly = false,
  initialGift,
  checkoutCanceled = false,
}: DonationExperienceProps) {
  const isNativeApp = useIsNativeApp();
  const isNativeDonation = !previewOnly && isNativeApp;
  const [ready, setReady] = useState(false);
  const [chosenFrequency, setFrequency] = useState<DonationFrequency>(
    initialGift?.frequency ?? 'monthly'
  );
  const frequency = isNativeDonation ? 'one-time' : chosenFrequency;
  const [selections, setSelections] = useState<
    Record<DonationFrequency, GiftSelection>
  >(() => {
    const initial: Record<DonationFrequency, GiftSelection> = {
      'one-time': { preset: 25, customAmount: '' },
      monthly: { preset: 15, customAmount: '' },
    };
    if (initialGift) {
      const amount = initialGift.cents / 100;
      const presets =
        initialGift.frequency === 'monthly'
          ? MONTHLY_LEVELS.map((level) => level.amount)
          : ONE_TIME_AMOUNTS;
      initial[initialGift.frequency] = {
        preset: presets.some((preset) => preset === amount) ? amount : null,
        customAmount: amount.toFixed(2),
      };
    }
    return initial;
  });
  const [purpose, setPurpose] = useState('');
  const [note, setNote] = useState('');
  const [amountError, setAmountError] = useState<string | null>(null);
  const [preview, setPreview] = useState<GiftPreview | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const checkoutPendingRef = useRef(false);
  const customAmountRef = useRef<HTMLInputElement>(null);
  const previewButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setReady(true);
  }, []);

  const selection = selections[frequency];
  const cents =
    selection.preset === null
      ? parseCustomAmount(selection.customAmount)
      : selection.preset * 100;
  const presets =
    frequency === 'monthly'
      ? MONTHLY_LEVELS.map((level) => level.amount)
      : ONE_TIME_AMOUNTS;
  const monthlyTier =
    cents === null ? 0 : getMonthlyDonationTier(cents, frequency === 'monthly');
  const monthlyLevel =
    monthlyTier > 0 ? MONTHLY_LEVELS[monthlyTier - 1] : undefined;

  function chooseAmount(preset: number | null) {
    setSelections((current) => ({
      ...current,
      [frequency]: { ...current[frequency], preset },
    }));
    setAmountError(null);
  }

  function chooseMonthlyLevel(amount: number) {
    setFrequency('monthly');
    setSelections((current) => ({
      ...current,
      monthly: { ...current.monthly, preset: amount },
    }));
    setAmountError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (checkoutPendingRef.current) return;
    if (cents === null) {
      setAmountError(DONATION_AMOUNT_ERROR);
      customAmountRef.current?.focus();
      return;
    }
    const selectedPurpose = DONATION_PURPOSES.find(
      (option) => option.value === purpose
    );
    if (!selectedPurpose) {
      setCheckoutError('Please choose a valid purpose for your gift.');
      return;
    }
    if (previewOnly) {
      setPreview({
        frequency,
        cents,
        purpose: selectedPurpose.label,
        note: note.trim(),
      });
      return;
    }

    checkoutPendingRef.current = true;
    setIsSubmitting(true);
    setCheckoutError(null);
    let redirecting = false;
    let errorMessage = 'Could not open secure checkout. Please try again.';
    try {
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: cents,
          isRecurring: frequency === 'monthly',
          dedicate: purpose,
          comment: note.trim(),
        }),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        if (
          result &&
          typeof result === 'object' &&
          'message' in result &&
          typeof result.message === 'string' &&
          result.message.trim()
        ) {
          errorMessage = result.message.trim();
        }
        throw new Error(errorMessage);
      }
      if (
        !result ||
        typeof result !== 'object' ||
        !('url' in result) ||
        typeof result.url !== 'string'
      ) {
        throw new Error('Checkout did not return a payment URL');
      }
      const checkoutUrl = new URL(result.url);
      if (checkoutUrl.protocol !== 'https:') {
        throw new Error('Checkout did not return a secure payment URL');
      }
      window.location.assign(checkoutUrl.href);
      redirecting = true;
    } catch (error) {
      console.error('Could not open donation checkout', error);
      setCheckoutError(errorMessage);
    } finally {
      if (!redirecting) {
        checkoutPendingRef.current = false;
        setIsSubmitting(false);
      }
    }
  }

  return (
    <main
      className={styles.page}
      data-donation-page
      data-donation-ready={ready}
      data-native-donation={isNativeDonation}
      data-donation-mock={previewOnly || undefined}
      data-donation-mock-ready={previewOnly ? ready : undefined}
    >
      {previewOnly && (
        <div className={styles.previewBar}>
          <p>
            <strong>Design preview</strong> &middot; No payments are taken here
          </p>
          <Link href="/donate" prefetch={false}>
            Live donation page <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        </div>
      )}

      <header className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>
              {isNativeDonation ? 'Support Pana MIA' : 'Gente dePana'} &middot;
              Community giving
            </p>
            <h1>
              The future is local.
              <span>Let&apos;s keep it that way.</span>
            </h1>
            <p className={styles.lede}>
              A thriving South Florida starts with people who care. Help Pana
              MIA keep our culture, our connections, and our community growing.
            </p>
            <div className={styles.heroActions}>
              <a className={styles.primaryButton} href="#giving-form">
                Make a gift <Heart size={18} aria-hidden="true" />
              </a>
              <a className={styles.textLink} href="#our-impact">
                What your gift supports{' '}
                <ArrowRight size={17} aria-hidden="true" />
              </a>
            </div>
          </div>
          <figure className={styles.heroPhoto}>
            <Image
              src="/img/impact/community-group.webp"
              alt="Panas gathering for a community photo at a local event."
              width={1600}
              height={886}
              sizes="(max-width: 767px) 100vw, 50vw"
              priority
            />
            <div className={styles.photoStamp} aria-hidden="true">
              <Sun size={28} />
              <span>For the love of local</span>
            </div>
            <figcaption>Real people. Shared roots. South Florida.</figcaption>
          </figure>
        </div>
      </header>

      <section className={styles.givingSection} aria-label="Support Pana MIA">
        <div className={styles.givingInner}>
          <div className={styles.story} id="our-impact">
            <p className={styles.eyebrow}>Rooted here. Growing together.</p>
            <h2>Good things grow with steady support.</h2>
            <p className={styles.storyIntro}>
              We&apos;re building a more connected local community, not doing it
              alone. Your gift helps us show up for the people and places that
              make South Florida feel like home.
            </p>
            <div className={styles.supportAreas}>
              {SUPPORT_AREAS.map(({ icon: Icon, title, description }) => (
                <article className={styles.supportArea} key={title}>
                  <span className={styles.supportIcon}>
                    <Icon size={23} aria-hidden="true" />
                  </span>
                  <div>
                    <h3>{title}</h3>
                    <p>{description}</p>
                  </div>
                </article>
              ))}
            </div>
            <aside className={styles.panaNote}>
              <Heart size={26} aria-hidden="true" />
              <p>
                <strong>Pana</strong> <span>(noun)</span>
                <br />A close friend, someone you trust.
              </p>
            </aside>
            <p className={styles.nonprofitNote}>
              Pana MIA Club is a 501(c)(3) nonprofit building community in South
              Florida.
            </p>
            {isNativeDonation && (
              <p className={styles.nonprofitNote}>
                Donations support our nonprofit mission. They do not unlock app
                features or digital content.
              </p>
            )}
          </div>

          <form
            id="giving-form"
            className={styles.givingCard}
            onSubmit={handleSubmit}
            aria-labelledby="giving-title"
            aria-busy={isSubmitting}
            tabIndex={-1}
            noValidate
          >
            <div className={styles.cardHeading}>
              <span className={styles.cardHeart}>
                <Heart size={24} aria-hidden="true" />
              </span>
              <div>
                <p className={styles.eyebrow}>
                  A little from you. A lot for local.
                </p>
                <h2 id="giving-title">Choose your gift</h2>
              </div>
            </div>

            {!previewOnly && checkoutCanceled && (
              <p className={styles.checkoutNotice} role="status">
                {isNativeDonation && initialGift?.frequency === 'monthly'
                  ? 'Checkout was canceled. Choose a one-time gift in the app.'
                  : initialGift
                    ? 'Checkout was canceled. Your gift selection has been restored.'
                    : 'Checkout was canceled. Please choose your gift again.'}
              </p>
            )}

            <fieldset
              className={styles.formFields}
              disabled={!ready || isSubmitting}
            >
              <legend className="sr-only">Donation options</legend>
              {!isNativeDonation && (
                <fieldset className={styles.frequency}>
                  <legend className="sr-only">Giving frequency</legend>
                  {(['one-time', 'monthly'] as const).map((option) => (
                    <label
                      className={styles.frequencyOption}
                      data-selected={frequency === option}
                      key={option}
                    >
                      <input
                        className={styles.choiceInput}
                        type="radio"
                        name="frequency"
                        value={option}
                        checked={frequency === option}
                        onChange={() => {
                          setFrequency(option);
                          setAmountError(null);
                        }}
                      />
                      {option === 'monthly' ? (
                        <Repeat2 size={18} aria-hidden="true" />
                      ) : (
                        <Heart size={18} aria-hidden="true" />
                      )}
                      <span>
                        {option === 'monthly' ? 'Monthly' : 'One time'}
                      </span>
                    </label>
                  ))}
                </fieldset>
              )}
              <p className={styles.frequencyNote}>
                {frequency === 'monthly'
                  ? 'Be someone our community can count on, month after month.'
                  : 'A gift today, for the place we call home.'}
              </p>

              <fieldset className={styles.amounts}>
                <legend>Gift amount</legend>
                <div className={styles.amountGrid}>
                  {presets.map((amount) => (
                    <label
                      className={styles.amountOption}
                      data-selected={selection.preset === amount}
                      key={amount}
                    >
                      <input
                        className={styles.choiceInput}
                        type="radio"
                        name="amount"
                        aria-label={`${formatGift(amount * 100)} ${frequency === 'monthly' ? 'per month' : 'one time'}`}
                        checked={selection.preset === amount}
                        onChange={() => chooseAmount(amount)}
                      />
                      <strong>{formatGift(amount * 100)}</strong>
                      {frequency === 'monthly' && <span>/ month</span>}
                    </label>
                  ))}
                  <label
                    className={styles.amountOption}
                    data-selected={selection.preset === null}
                  >
                    <input
                      className={styles.choiceInput}
                      type="radio"
                      name="amount"
                      aria-label="Other amount"
                      checked={selection.preset === null}
                      onChange={() => {
                        chooseAmount(null);
                        customAmountRef.current?.focus();
                      }}
                    />
                    <strong>Other</strong>
                    <span>Your own amount</span>
                  </label>
                </div>
              </fieldset>

              <div className={styles.customAmount}>
                <label htmlFor="custom-gift">Your own amount (USD)</label>
                <div
                  className={styles.amountInput}
                  data-selected={selection.preset === null}
                >
                  <span aria-hidden="true">$</span>
                  <input
                    id="custom-gift"
                    ref={customAmountRef}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="Other amount"
                    value={
                      selection.preset === null ? selection.customAmount : ''
                    }
                    aria-invalid={amountError ? true : undefined}
                    aria-describedby={
                      amountError ? 'gift-amount-error' : 'gift-amount-hint'
                    }
                    onFocus={() => {
                      if (selection.preset !== null) chooseAmount(null);
                    }}
                    onChange={(event) => {
                      const customAmount = event.target.value;
                      setSelections((current) => ({
                        ...current,
                        [frequency]: { preset: null, customAmount },
                      }));
                      setAmountError(null);
                    }}
                  />
                  <span className={styles.amountSuffix}>
                    {frequency === 'monthly' ? '/ month' : 'one time'}
                  </span>
                </div>
                {amountError ? (
                  <p
                    id="gift-amount-error"
                    className={styles.error}
                    role="alert"
                  >
                    {amountError}
                  </p>
                ) : (
                  <p id="gift-amount-hint" className={styles.fieldHint}>
                    USD &middot; $0.50 minimum
                  </p>
                )}
              </div>

              <details className={styles.optionalNote}>
                <summary>
                  Add a dedication or note{' '}
                  <span className={styles.optionalLabel}>(optional)</span>
                  <ChevronDown size={17} aria-hidden="true" />
                </summary>
                <div className={styles.noteFields}>
                  <label htmlFor="gift-purpose">Put my gift toward</label>
                  <select
                    id="gift-purpose"
                    value={purpose}
                    onChange={(event) => setPurpose(event.target.value)}
                  >
                    {DONATION_PURPOSES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <label htmlFor="gift-note">Your note</label>
                  <textarea
                    id="gift-note"
                    value={note}
                    maxLength={500}
                    rows={2}
                    placeholder="A little encouragement, or what you want to support."
                    onChange={(event) => setNote(event.target.value)}
                    aria-describedby="gift-note-hint"
                  />
                  <p id="gift-note-hint" className={styles.fieldHint}>
                    {previewOnly
                      ? 'Sample text only; nothing is sent or saved.'
                      : 'Your note is shared with Pana MIA with your gift. Please do not include sensitive information.'}
                  </p>
                </div>
              </details>

              <div
                className={styles.giftSummary}
                role="status"
                aria-label="Gift summary"
                aria-live="polite"
                aria-atomic="true"
              >
                <div>
                  <span>
                    {frequency === 'monthly'
                      ? 'Your monthly gift'
                      : 'Your gift today'}
                  </span>
                  <strong>
                    {cents === null ? 'Choose an amount' : formatGift(cents)}
                    {frequency === 'monthly' && cents !== null && (
                      <small> / month</small>
                    )}
                  </strong>
                </div>
                <p>
                  {frequency === 'monthly' && cents !== null
                    ? `${formatGift(cents * 12)} over a year${monthlyLevel ? ` - ${monthlyLevel.name}` : ''}`
                    : 'Every gift makes a difference.'}
                </p>
              </div>

              {checkoutError && (
                <p
                  id="donation-checkout-error"
                  className={styles.error}
                  role="alert"
                >
                  {checkoutError}
                </p>
              )}
              <button
                ref={previewButtonRef}
                className={styles.primaryButton}
                type="submit"
                aria-describedby={
                  checkoutError ? 'donation-checkout-error' : undefined
                }
              >
                {isSubmitting
                  ? 'Opening secure checkout...'
                  : previewOnly
                    ? 'Continue to preview'
                    : 'Continue to checkout'}{' '}
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            </fieldset>
            <p className={styles.paymentNote}>
              <LockKeyhole size={14} aria-hidden="true" />
              {ready
                ? previewOnly
                  ? 'Preview only. No card details or charges.'
                  : frequency === 'monthly'
                    ? 'Secure Stripe checkout. Renews monthly until canceled.'
                    : 'Secure one-time checkout with Stripe.'
                : 'Loading preview - JavaScript is required.'}
            </p>
          </form>
        </div>
      </section>

      {!isNativeDonation && (
        <section
          className={styles.monthlySection}
          aria-labelledby="monthly-title"
        >
          <div className={styles.sectionInner}>
            <div className={styles.monthlyHeading}>
              <p className={styles.eyebrow}>Meet Gente dePana</p>
              <h2 id="monthly-title">Small gifts. Strong roots.</h2>
              <p>
                Monthly giving makes room to plan, build, and keep showing up.
                Choose a rhythm that feels right for you.
              </p>
            </div>
            <div className={styles.levelGrid}>
              {MONTHLY_LEVELS.map((level, index) => (
                <article
                  className={styles.levelCard}
                  data-level={index}
                  key={level.name}
                >
                  <Heart size={26} aria-hidden="true" />
                  <h3>{level.name}</h3>
                  <p className={styles.levelAmount}>
                    {formatGift(level.amount * 100)} <span>/ month</span>
                  </p>
                  <p className={styles.levelDescription}>{level.description}</p>
                  <a
                    href={ready ? '#giving-form' : undefined}
                    aria-disabled={!ready}
                    aria-label={`Choose ${formatGift(level.amount * 100)} monthly`}
                    onClick={
                      ready ? () => chooseMonthlyLevel(level.amount) : undefined
                    }
                  >
                    {ready ? 'Choose this gift' : 'Loading preview...'}{' '}
                    <ArrowUpRight size={18} aria-hidden="true" />
                  </a>
                </article>
              ))}
            </div>
            <p className={styles.monthlyFootnote}>
              Prefer another amount? Every level of support is welcome.
            </p>
          </div>
        </section>
      )}

      <section className={styles.faqSection} aria-labelledby="giving-questions">
        <div className={styles.faqInner}>
          <div>
            <p className={styles.eyebrow}>A few good questions</p>
            <h2 id="giving-questions">Giving, made simple.</h2>
            <p>Good neighbors. Clear answers.</p>
          </div>
          <div className={styles.questions}>
            <details>
              <summary>
                Can I give just once?{' '}
                <ChevronDown size={18} aria-hidden="true" />
              </summary>
              <p>
                {isNativeDonation
                  ? 'Yes. Gifts made in the app are one-time donations supporting our nonprofit mission.'
                  : 'Absolutely. Choose One time in the giving form, then pick an amount or enter your own. Monthly giving is always a choice.'}
              </p>
            </details>
            <details>
              <summary>
                What does my gift support?{' '}
                <ChevronDown size={18} aria-hidden="true" />
              </summary>
              <p>
                Pana MIA&apos;s nonprofit mission: community technology, local
                culture, and connections between South Florida&apos;s people,
                creatives, and small businesses.
              </p>
            </details>
            <details>
              <summary>
                {previewOnly
                  ? 'Would this work with Stripe?'
                  : 'How are payments handled?'}{' '}
                <ChevronDown size={18} aria-hidden="true" />
              </summary>
              <p>
                {previewOnly
                  ? 'Yes. The live donation page already uses Stripe Checkout for one-time payments and monthly subscriptions. This design can lead into that secure checkout; payment details stay with Stripe.'
                  : 'Payments are handled securely by Stripe Checkout. You enter your email and payment details there, not in this form.'}
              </p>
            </details>
            <details>
              <summary>
                {previewOnly
                  ? 'Will this preview charge me?'
                  : 'When will I be charged?'}{' '}
                <ChevronDown size={18} aria-hidden="true" />
              </summary>
              <p>
                {previewOnly
                  ? 'No. Your choices stay in this page and reset on reload. Continue opens a preview, not a payment page. No donation, account, or personal details are sent or saved.'
                  : 'Choosing an amount here does not charge you. Continue takes you to Stripe to review and complete your gift.'}
                {!previewOnly && !isNativeDonation && (
                  <>
                    {' '}
                    Monthly gifts repeat every month until canceled. For help
                    managing your gift, contact Pana MIA.
                  </>
                )}
              </p>
            </details>
          </div>
        </div>
      </section>

      <section className={styles.closing} aria-labelledby="closing-title">
        <Heart size={35} aria-hidden="true" />
        <h2 id="closing-title">A little love for local goes a long way.</h2>
        <a className={styles.primaryButton} href="#giving-form">
          Choose my gift <ArrowRight size={18} aria-hidden="true" />
        </a>
      </section>
      {previewOnly && (
        <p className={styles.colophon}>
          Design mock &middot; /mock/donate &middot; No payments or personal
          data
        </p>
      )}

      <Dialog
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
      >
        <DialogContent
          className={styles.dialog}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            previewButtonRef.current?.focus();
          }}
        >
          <p className={styles.eyebrow}>Checkout preview</p>
          <DialogTitle className={styles.dialogTitle}>
            Your gift, at a glance.
          </DialogTitle>
          <DialogDescription className={styles.dialogDescription}>
            This is a checkout preview, not a completed donation.
          </DialogDescription>
          {preview && (
            <>
              <div className={styles.previewAmount}>
                <Heart size={28} aria-hidden="true" />
                <strong>{formatGift(preview.cents)}</strong>
                <span>
                  {preview.frequency === 'monthly' ? 'every month' : 'one time'}
                </span>
              </div>
              <p className={styles.recurringDisclosure}>
                {preview.frequency === 'monthly'
                  ? `In the live flow, Stripe would charge ${formatGift(preview.cents)} USD every month until canceled.`
                  : `In the live flow, Stripe would charge ${formatGift(preview.cents)} USD once, with no recurring payment.`}
              </p>
              <dl className={styles.previewDetails}>
                <dt>For</dt>
                <dd>{preview.purpose}</dd>
                {preview.note && (
                  <>
                    <dt>Your note</dt>
                    <dd>{preview.note}</dd>
                  </>
                )}
              </dl>
              <div className={styles.stripePlaceholder}>
                <LockKeyhole size={21} aria-hidden="true" />
                <div>
                  <strong>Stripe Checkout</strong>
                  <p>
                    The live flow would collect your email and payment details
                    securely with Stripe. No payment fields are active here.
                  </p>
                </div>
              </div>
            </>
          )}
          <DialogClose asChild>
            <button className={styles.primaryButton} type="button">
              Back to my gift
            </button>
          </DialogClose>
        </DialogContent>
      </Dialog>
    </main>
  );
}
