'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import axios from 'axios';
import { useTurnstile } from '@/components/Turnstile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { CheckCircle2, Send, Shield, Store } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { profileCategoryList } from '@/lib/lists';

/**
 * Public directory intake. No auth gate on purpose — see the rationale in
 * app/api/listings/intake/route.ts. A shop, band, co-op or non-profit can get
 * into the directory before it has an account, and claims the listing
 * afterwards.
 *
 * Laid out as seven steps rather than one scroll because the directory is only
 * as good as the answers in it, and a wall of twenty fields gets skimmed. One
 * question at a time, with a progress bar so nobody wonders how much is left.
 */

const TOTAL_STEPS = 7;

const EMAIL_PATTERN = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

function ListYourBusinessForm() {
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState('');
  // Separate from `personalEmail` so the success screen keeps describing what
  // was actually submitted even after resetForm clears the inputs.
  const [submittedPersonalEmail, setSubmittedPersonalEmail] = useState('');

  // Step 2 — what kind of listing, and whether they qualify
  const [accountType, setAccountType] = useState('directory');
  const [locallyBased, setLocallyBased] = useState('');

  // Step 3 — how we reach them
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  // Optional, and deliberately so. Giving a personal address gets you signed
  // in and holding the listing; withholding it costs nothing, which matters
  // because plenty of these are submitted by someone other than the owner.
  const [personalEmail, setPersonalEmail] = useState('');
  // Kept inline rather than in a toast: the only way to resolve it is to edit
  // or empty this one field, so the message belongs next to it.
  const [personalEmailError, setPersonalEmailError] = useState('');

  // Step 4 — pronouns
  const [pronouns, setPronouns] = useState('');
  const [pronounsOther, setPronounsOther] = useState('');

  // Step 5 — what they do
  const [details, setDetails] = useState('');
  const [fiveWords, setFiveWords] = useState('');
  const [tags, setTags] = useState<string[]>([]);

  // Step 6 — where to find them
  const [website, setWebsite] = useState('');
  const [instagram, setInstagram] = useState('');
  const [hasStorefront, setHasStorefront] = useState(false);
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [addressLocality, setAddressLocality] = useState('');
  const [addressRegion, setAddressRegion] = useState('FL');
  const [addressPostalCode, setAddressPostalCode] = useState('');
  const [addressHours, setAddressHours] = useState('');

  // Step 7 — wrap up
  const [hearAboutUs, setHearAboutUs] = useState('');
  const [agreeTos, setAgreeTos] = useState(false);

  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const {
    token: turnstileToken,
    error: turnstileError,
    reset: resetTurnstile,
    Widget: TurnstileWidget,
  } = useTurnstile(turnstileSiteKey, 'business_intake_submit');

  const { toast } = useToast();
  const { t } = useTranslation('getListed');
  const { t: tToast } = useTranslation('toast');

  function refuse(message: string) {
    toast({
      variant: 'destructive',
      title: t('errTitle'),
      description: message,
    });
  }

  function goTo(next: number) {
    setStep(next);
    // Each step replaces the one before it, so without this the member lands
    // mid-card on a long step after a short one.
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function toggleTag(value: string) {
    setTags((prev) =>
      prev.includes(value)
        ? prev.filter((tag) => tag !== value)
        : [...prev, value]
    );
  }

  function submitStep2(e: FormEvent) {
    e.preventDefault();
    if (!locallyBased) {
      refuse(t('errLocallyBased'));
      return;
    }
    goTo(3);
  }

  function submitStep3(e: FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) {
      refuse(t('errName'));
      return;
    }
    if (!EMAIL_PATTERN.test(email.trim())) {
      refuse(t('errEmail'));
      return;
    }
    // An optional field must stay cheap to abandon. Both of these are shown
    // against the field and clear the moment it is emptied, so nobody can get
    // stuck behind something they never had to fill in.
    const personal = personalEmail.trim();
    if (personal && !EMAIL_PATTERN.test(personal)) {
      setPersonalEmailError(t('errPersonalEmail'));
      return;
    }
    if (personal && personal.toLowerCase() === email.trim().toLowerCase()) {
      setPersonalEmailError(t('errPersonalEmailSame'));
      return;
    }
    setPersonalEmailError('');
    goTo(4);
  }

  function submitStep5(e: FormEvent) {
    e.preventDefault();
    if (details.trim().length < 10) {
      refuse(t('errDetails'));
      return;
    }
    if (fiveWords.trim().length < 3) {
      refuse(t('errFiveWords'));
      return;
    }
    goTo(6);
  }

  function submitStep6(e: FormEvent) {
    e.preventDefault();
    // The server enforces this too — it is the only thing a reviewer can use
    // to confirm a submission is a real business rather than noise.
    if (!website.trim() && !instagram.trim()) {
      refuse(t('errLinks'));
      return;
    }
    if (hasStorefront && !addressLine1.trim()) {
      refuse(t('errAddress'));
      return;
    }
    if (hasStorefront && !addressLocality.trim()) {
      refuse(t('errCity'));
      return;
    }
    goTo(7);
  }

  async function submitForm(e: FormEvent) {
    e.preventDefault();

    if (!agreeTos) {
      refuse(t('errTos'));
      return;
    }

    if (!turnstileToken) {
      toast({
        variant: 'destructive',
        title: tToast('securityError'),
        description: tToast('turnstileNotReady'),
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Read the server's message on 4xx rather than letting axios throw it
      // away — the validation and duplicate-listing copy is worth showing.
      const response = await axios.post(
        '/api/listings/intake',
        {
          name,
          email,
          personalEmail,
          fiveWords,
          instagram,
          website,
          details,
          phoneNumber,
          accountType,
          locallyBased,
          pronouns,
          pronounsOther,
          tags,
          hearAboutUs,
          agreeTos,
          hasStorefront,
          addressLine1,
          addressLine2,
          addressLocality,
          addressRegion,
          addressPostalCode,
          addressHours,
          turnstileToken,
        },
        { validateStatus: () => true }
      );

      if (response.data?.success) {
        setSubmittedEmail(email);
        // Mirrors the server's own rule for whether a link went out, so the
        // success screen never promises an email that was dropped.
        const personal = personalEmail.trim();
        const linkWasSent =
          personal !== '' &&
          personal.toLowerCase() !== email.trim().toLowerCase() &&
          EMAIL_PATTERN.test(personal);
        setSubmittedPersonalEmail(linkWasSent ? personal : '');
        if (typeof window !== 'undefined') {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        return;
      }

      resetTurnstile();
      toast({
        variant: 'destructive',
        title: tToast('submissionFailed'),
        description: response.data?.error || tToast('submissionErrorGeneral'),
      });
    } catch {
      resetTurnstile();
      toast({
        variant: 'destructive',
        title: tToast('submissionError'),
        description: tToast('submissionErrorGeneral'),
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  function resetForm() {
    setStep(1);
    setAccountType('directory');
    setLocallyBased('');
    setName('');
    setEmail('');
    setPhoneNumber('');
    setPersonalEmail('');
    setPersonalEmailError('');
    setPronouns('');
    setPronounsOther('');
    setDetails('');
    setFiveWords('');
    setTags([]);
    setWebsite('');
    setInstagram('');
    setHasStorefront(false);
    setAddressLine1('');
    setAddressLine2('');
    setAddressLocality('');
    setAddressRegion('FL');
    setAddressPostalCode('');
    setAddressHours('');
    setHearAboutUs('');
    setAgreeTos(false);
    setSubmittedEmail('');
    setSubmittedPersonalEmail('');
    resetTurnstile();
  }

  if (submittedEmail) {
    return (
      <div className="auth-surface flex flex-col items-center px-4 py-12 sm:py-16">
        <div className="w-full max-w-2xl space-y-6">
          <Card className="border-pana-ink/10 rounded-2xl shadow-xl dark:border-white/10">
            <CardContent className="space-y-6 p-8 text-center">
              <CheckCircle2
                className="text-pana-burnt dark:text-pana-flame mx-auto h-14 w-14"
                aria-hidden="true"
              />
              <div className="space-y-2">
                <h1 className="text-foreground text-3xl font-black tracking-tight">
                  {t('successTitle')}
                </h1>
                <p className="text-pana-ink/75 dark:text-muted-foreground text-lg">
                  {t('successBody', { email: submittedEmail })}
                </p>
                {submittedPersonalEmail && (
                  <p className="text-pana-ink/75 dark:text-muted-foreground text-lg">
                    {t('successPersonalEmail', {
                      email: submittedPersonalEmail,
                    })}
                  </p>
                )}
              </div>

              <div className="bg-pana-butter-2/60 dark:bg-muted rounded-xl p-6 text-left">
                <h2 className="mb-3 font-extrabold">{t('successNextTitle')}</h2>
                <ol className="text-pana-ink/75 dark:text-muted-foreground list-decimal space-y-2 pl-5 text-sm">
                  <li>{t('successNext1')}</li>
                  <li>{t('successNext2')}</li>
                  <li>{t('successNext3')}</li>
                </ol>
              </div>

              <div className="flex flex-col justify-center gap-3 sm:flex-row">
                <Button variant="outline" onClick={resetForm}>
                  {t('successAnother')}
                </Button>
                <Button
                  asChild
                  className="bg-pana-flame text-pana-ink hover:bg-pana-burnt font-extrabold"
                >
                  <Link href="/">{t('successHome')}</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const progress = Math.round((step / TOTAL_STEPS) * 100);

  const backButton = (target: number) => (
    <Button
      type="button"
      variant="outline"
      onClick={() => goTo(target)}
      disabled={isSubmitting}
    >
      {t('previous')}
    </Button>
  );

  const nextButton = (label?: string) => (
    <Button
      type="submit"
      className="bg-pana-flame text-pana-ink hover:bg-pana-burnt font-extrabold"
      disabled={isSubmitting}
    >
      {label || t('next')}
    </Button>
  );

  return (
    <div className="auth-surface flex flex-col items-center px-4 py-12 sm:py-16">
      <div className="w-full max-w-2xl space-y-8">
        {/* Header */}
        <div className="flex flex-col items-center space-y-3 text-center">
          <span className="section-eyebrow">{t('eyebrow')}</span>
          <h1 className="text-foreground flex items-center justify-center gap-3 text-4xl font-black tracking-tight">
            <Store
              className="text-pana-burnt dark:text-pana-flame h-8 w-8"
              aria-hidden="true"
            />
            {t('title')}
          </h1>
          <div className="text-pana-ink/75 dark:text-muted-foreground space-y-2 text-lg">
            <p>{t('intro1')}</p>
            <p>{t('intro2')}</p>
          </div>
        </div>

        <Card className="border-pana-ink/10 rounded-2xl shadow-xl dark:border-white/10">
          <CardHeader className="space-y-4">
            <div className="space-y-2">
              <div className="text-muted-foreground flex items-center justify-between text-sm font-semibold">
                <span>{t('stepCounter', { step, total: TOTAL_STEPS })}</span>
                <span>{progress}%</span>
              </div>
              <Progress
                value={progress}
                className="h-2"
                aria-label={t('progressLabel')}
              />
            </div>
            <CardTitle className="font-black tracking-tight">
              {t(`step${step}Heading`)}
            </CardTitle>
            <CardDescription>{t(`step${step}Desc`)}</CardDescription>
          </CardHeader>

          <CardContent>
            {/* Step 1: Why you're here */}
            {step === 1 && (
              <div className="space-y-6">
                <div className="text-pana-ink/80 dark:text-muted-foreground space-y-4">
                  <p>{t('introBody')}</p>
                  <p className="text-foreground font-bold">
                    {t('introEmphasis')}
                  </p>
                  <p className="italic">
                    {t('introContact')}{' '}
                    <Link
                      href="mailto:hola@pana.social"
                      className="text-pana-indigo dark:text-pana-flame font-semibold underline"
                    >
                      hola@pana.social
                    </Link>
                  </p>
                </div>

                {/* How it works */}
                <div className="bg-pana-butter-2/60 dark:bg-muted rounded-xl p-6">
                  <h2 className="mb-4 text-lg font-black tracking-tight">
                    {t('howItWorks')}
                  </h2>
                  <ol className="space-y-4">
                    {[
                      { title: t('step1Title'), body: t('step1Body') },
                      { title: t('step2Title'), body: t('step2Body') },
                      { title: t('step3Title'), body: t('step3Body') },
                    ].map((item, index) => (
                      <li key={item.title} className="flex gap-4">
                        <span className="bg-pana-flame text-pana-ink flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-extrabold">
                          {index + 1}
                        </span>
                        <div>
                          <p className="font-bold">{item.title}</p>
                          <p className="text-pana-ink/70 dark:text-muted-foreground text-sm">
                            {item.body}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    size="lg"
                    className="bg-pana-flame text-pana-ink hover:bg-pana-burnt font-extrabold"
                    onClick={() => goTo(2)}
                  >
                    {t('start')}
                  </Button>
                </div>
              </div>
            )}

            {/* Step 2: Listing type and eligibility */}
            {step === 2 && (
              <form onSubmit={submitStep2} className="space-y-8">
                <fieldset className="space-y-4">
                  <legend className="text-base font-bold">
                    {t('listingTypeQuestion')}{' '}
                    <span className="text-destructive">*</span>
                  </legend>
                  <p className="text-muted-foreground text-sm">
                    {t('listingTypeNote')}
                  </p>
                  <RadioGroup
                    value={accountType}
                    onValueChange={setAccountType}
                    className="space-y-3"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="directory" id="type-directory" />
                      <Label htmlFor="type-directory">
                        {t('listingTypeDirectory')}
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="hybrid" id="type-hybrid" />
                      <Label htmlFor="type-hybrid">
                        {t('listingTypeHybrid')}
                      </Label>
                    </div>
                  </RadioGroup>
                </fieldset>

                <fieldset className="space-y-4">
                  <legend className="text-base font-bold">
                    {t('locallyBasedQuestion')}{' '}
                    <span className="text-destructive">*</span>
                  </legend>
                  <p className="text-muted-foreground text-sm">
                    {t('locallyBasedNote')}
                  </p>
                  <RadioGroup
                    value={locallyBased}
                    onValueChange={setLocallyBased}
                    className="space-y-3"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="yes" id="local-yes" />
                      <Label htmlFor="local-yes">{t('locallyBasedYes')}</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="no" id="local-no" />
                      <Label htmlFor="local-no">{t('locallyBasedNo')}</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="other" id="local-other" />
                      <Label htmlFor="local-other">
                        {t('locallyBasedOther')}{' '}
                        <Link
                          href="/form/contact-us"
                          className="text-pana-indigo dark:text-pana-flame underline"
                        >
                          {t('locallyBasedOtherLink')}
                        </Link>
                      </Label>
                    </div>
                  </RadioGroup>
                </fieldset>

                <div className="flex justify-between pt-2">
                  {backButton(1)}
                  {nextButton()}
                </div>
              </form>
            )}

            {/* Step 3: Contact basics */}
            {step === 3 && (
              <form onSubmit={submitStep3} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="business-name">
                    {t('nameLabel')} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="business-name"
                    name="name"
                    type="text"
                    maxLength={100}
                    required
                    placeholder={t('namePlaceholder')}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={isSubmitting}
                  />
                  <p className="text-muted-foreground text-sm">
                    {t('nameNote')}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="business-email">
                    {t('emailLabel')}{' '}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="business-email"
                    name="email"
                    type="email"
                    maxLength={100}
                    required
                    placeholder={t('emailPlaceholder')}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isSubmitting}
                  />
                  <p className="text-muted-foreground text-sm">
                    {t('emailNote')}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="personal-email">
                    {t('personalEmailLabel')}
                  </Label>
                  <Input
                    id="personal-email"
                    name="personalEmail"
                    type="email"
                    maxLength={100}
                    placeholder={t('personalEmailPlaceholder')}
                    value={personalEmail}
                    onChange={(e) => {
                      setPersonalEmail(e.target.value);
                      if (personalEmailError) setPersonalEmailError('');
                    }}
                    disabled={isSubmitting}
                    aria-invalid={personalEmailError ? true : undefined}
                    aria-describedby={
                      personalEmailError
                        ? 'personal-email-error'
                        : 'personal-email-note'
                    }
                  />
                  {personalEmailError ? (
                    <p
                      id="personal-email-error"
                      role="alert"
                      className="text-destructive text-sm"
                    >
                      {personalEmailError}
                    </p>
                  ) : (
                    <p
                      id="personal-email-note"
                      className="text-muted-foreground text-sm"
                    >
                      {t('personalEmailNote')}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="business-phone">{t('phoneLabel')}</Label>
                  <Input
                    id="business-phone"
                    name="phoneNumber"
                    type="tel"
                    maxLength={30}
                    placeholder={t('phonePlaceholder')}
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    disabled={isSubmitting}
                  />
                  <p className="text-muted-foreground text-sm">
                    {t('phoneNote')}
                  </p>
                </div>

                <div className="flex justify-between pt-2">
                  {backButton(2)}
                  {nextButton()}
                </div>
              </form>
            )}

            {/* Step 4: Pronouns */}
            {step === 4 && (
              <div className="space-y-6">
                <fieldset className="space-y-4">
                  <legend className="text-base font-bold">
                    {t('pronounsQuestion')}
                  </legend>
                  <p className="text-muted-foreground text-sm">
                    {t('pronounsNote')}
                  </p>
                  <RadioGroup
                    value={pronouns}
                    onValueChange={(value) => {
                      setPronouns(value);
                      if (value !== 'other') setPronounsOther('');
                    }}
                    className="space-y-3"
                    disabled={isSubmitting}
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="sheher" id="pronoun-sheher" />
                      <Label htmlFor="pronoun-sheher">She/Her</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="hehim" id="pronoun-hehim" />
                      <Label htmlFor="pronoun-hehim">He/Him</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="theythem" id="pronoun-theythem" />
                      <Label htmlFor="pronoun-theythem">They/Them</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="none" id="pronoun-none" />
                      <Label htmlFor="pronoun-none">
                        {t('pronounsNoPreference')}
                      </Label>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="other" id="pronoun-other" />
                        <Label htmlFor="pronoun-other">
                          {t('pronounsOther')}
                        </Label>
                      </div>
                      {pronouns === 'other' && (
                        <Input
                          type="text"
                          maxLength={40}
                          aria-label={t('pronounsOtherPlaceholder')}
                          placeholder={t('pronounsOtherPlaceholder')}
                          value={pronounsOther}
                          onChange={(e) => setPronounsOther(e.target.value)}
                          className="ml-6 w-auto"
                          disabled={isSubmitting}
                        />
                      )}
                    </div>
                  </RadioGroup>
                </fieldset>

                <div className="flex justify-between pt-2">
                  {backButton(3)}
                  <Button
                    type="button"
                    className="bg-pana-flame text-pana-ink hover:bg-pana-burnt font-extrabold"
                    onClick={() => goTo(5)}
                    disabled={isSubmitting}
                  >
                    {t('nextSkip')}
                  </Button>
                </div>
              </div>
            )}

            {/* Step 5: What you do */}
            {step === 5 && (
              <form onSubmit={submitStep5} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="business-details">
                    {t('detailsLabel')}{' '}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    id="business-details"
                    name="details"
                    maxLength={1000}
                    rows={5}
                    required
                    placeholder={t('detailsPlaceholder')}
                    value={details}
                    onChange={(e) => setDetails(e.target.value)}
                    disabled={isSubmitting}
                  />
                  <p className="text-muted-foreground text-sm">
                    {t('detailsNote')}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="business-five-words">
                    {t('fiveWordsLabel')}{' '}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="business-five-words"
                    name="fiveWords"
                    type="text"
                    maxLength={120}
                    required
                    placeholder={t('fiveWordsPlaceholder')}
                    value={fiveWords}
                    onChange={(e) => setFiveWords(e.target.value)}
                    disabled={isSubmitting}
                  />
                  <p className="text-muted-foreground text-sm">
                    {t('fiveWordsNote')}
                  </p>
                </div>

                <fieldset className="space-y-3">
                  <legend className="text-sm font-medium">
                    {t('tagsLabel')}
                  </legend>
                  <p className="text-muted-foreground text-sm">
                    {t('tagsNote')}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {profileCategoryList.map((category) => {
                      const selected = tags.includes(category.value);
                      return (
                        <button
                          key={category.value}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => toggleTag(category.value)}
                          disabled={isSubmitting}
                          className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${
                            selected
                              ? 'bg-pana-flame text-pana-ink border-pana-flame'
                              : 'border-pana-ink/20 text-pana-ink/75 hover:border-pana-flame dark:text-muted-foreground dark:border-white/20'
                          }`}
                        >
                          {category.desc}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                <div className="flex justify-between pt-2">
                  {backButton(4)}
                  {nextButton()}
                </div>
              </form>
            )}

            {/* Step 6: Where to find you */}
            {step === 6 && (
              <form onSubmit={submitStep6} className="space-y-6">
                <fieldset className="space-y-4">
                  <legend className="text-sm font-medium">
                    {t('linksTitle')}{' '}
                    <span className="text-destructive">*</span>
                  </legend>
                  <p className="text-muted-foreground -mt-2 text-sm">
                    {t('linksNote')}
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="business-website">
                      {t('websiteLabel')}
                    </Label>
                    <Input
                      id="business-website"
                      name="website"
                      type="text"
                      maxLength={200}
                      placeholder={t('websitePlaceholder')}
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      disabled={isSubmitting}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="business-instagram">
                      {t('instagramLabel')}
                    </Label>
                    <Input
                      id="business-instagram"
                      name="instagram"
                      type="text"
                      maxLength={100}
                      placeholder={t('instagramPlaceholder')}
                      value={instagram}
                      onChange={(e) => setInstagram(e.target.value)}
                      disabled={isSubmitting}
                    />
                  </div>
                </fieldset>

                <div className="border-pana-ink/10 space-y-4 border-t pt-6 dark:border-white/10">
                  <div className="flex items-start space-x-2">
                    <Checkbox
                      id="has-storefront"
                      checked={hasStorefront}
                      onCheckedChange={(checked) =>
                        setHasStorefront(checked === true)
                      }
                      disabled={isSubmitting}
                    />
                    <div className="space-y-1">
                      <Label htmlFor="has-storefront" className="font-bold">
                        {t('storefrontLabel')}
                      </Label>
                      <p className="text-muted-foreground text-sm">
                        {t('storefrontNote')}
                      </p>
                    </div>
                  </div>

                  {hasStorefront && (
                    <div className="space-y-4 pl-6">
                      <div className="space-y-2">
                        <Label htmlFor="address-line1">
                          {t('addressLine1Label')}{' '}
                          <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="address-line1"
                          type="text"
                          maxLength={120}
                          placeholder={t('addressLine1Placeholder')}
                          value={addressLine1}
                          onChange={(e) => setAddressLine1(e.target.value)}
                          disabled={isSubmitting}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="address-line2">
                          {t('addressLine2Label')}
                        </Label>
                        <Input
                          id="address-line2"
                          type="text"
                          maxLength={120}
                          placeholder={t('addressLine2Placeholder')}
                          value={addressLine2}
                          onChange={(e) => setAddressLine2(e.target.value)}
                          disabled={isSubmitting}
                        />
                      </div>

                      <div className="grid gap-4 sm:grid-cols-3">
                        <div className="space-y-2 sm:col-span-2">
                          <Label htmlFor="address-city">
                            {t('addressCityLabel')}{' '}
                            <span className="text-destructive">*</span>
                          </Label>
                          <Input
                            id="address-city"
                            type="text"
                            maxLength={80}
                            placeholder={t('addressCityPlaceholder')}
                            value={addressLocality}
                            onChange={(e) => setAddressLocality(e.target.value)}
                            disabled={isSubmitting}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="address-state">
                            {t('addressStateLabel')}
                          </Label>
                          <Input
                            id="address-state"
                            type="text"
                            maxLength={2}
                            value={addressRegion}
                            onChange={(e) => setAddressRegion(e.target.value)}
                            disabled={isSubmitting}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="address-zip">
                          {t('addressZipLabel')}
                        </Label>
                        <Input
                          id="address-zip"
                          type="text"
                          maxLength={10}
                          placeholder={t('addressZipPlaceholder')}
                          value={addressPostalCode}
                          onChange={(e) => setAddressPostalCode(e.target.value)}
                          disabled={isSubmitting}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="address-hours">{t('hoursLabel')}</Label>
                        <Textarea
                          id="address-hours"
                          maxLength={300}
                          rows={3}
                          placeholder={t('hoursPlaceholder')}
                          value={addressHours}
                          onChange={(e) => setAddressHours(e.target.value)}
                          disabled={isSubmitting}
                        />
                        <p className="text-muted-foreground text-sm">
                          {t('hoursNote')}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex justify-between pt-2">
                  {backButton(5)}
                  {nextButton()}
                </div>
              </form>
            )}

            {/* Step 7: Wrap up */}
            {step === 7 && (
              <form onSubmit={submitForm} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="hear-about-us">{t('hearAboutUsLabel')}</Label>
                  <Textarea
                    id="hear-about-us"
                    maxLength={500}
                    rows={3}
                    placeholder={t('hearAboutUsPlaceholder')}
                    value={hearAboutUs}
                    onChange={(e) => setHearAboutUs(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>

                <div className="space-y-4">
                  <p className="text-pana-ink/80 dark:text-muted-foreground text-sm">
                    {t('tosIntro')}{' '}
                    <Link
                      href="/legal/terms"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-pana-indigo dark:text-pana-flame font-semibold underline"
                    >
                      {t('tosLink')}
                    </Link>{' '}
                    {t('tosIntroTail')}
                  </p>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="agree-tos"
                      checked={agreeTos}
                      onCheckedChange={(checked) =>
                        setAgreeTos(checked === true)
                      }
                      disabled={isSubmitting}
                    />
                    <Label htmlFor="agree-tos">
                      {t('tosCheckbox')}{' '}
                      <span className="text-destructive">*</span>
                    </Label>
                  </div>
                </div>

                {/* Required for everyone — this endpoint has no session to lean
                    on, so the server verifies the token unconditionally. */}
                <div className="space-y-3">
                  {TurnstileWidget}
                  {turnstileError && (
                    <p className="text-sm text-red-600">
                      {t('turnstileBlocked')}
                    </p>
                  )}
                  <div className="bg-pana-butter-2/60 text-pana-ink/75 dark:bg-muted dark:text-muted-foreground flex items-center gap-2 rounded-md p-3 text-sm">
                    <Shield className="h-4 w-4" aria-hidden="true" />
                    <span>{t('turnstileNote')}</span>
                  </div>
                </div>

                <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-between">
                  {backButton(6)}
                  <Button
                    type="submit"
                    size="lg"
                    className="bg-pana-flame text-pana-ink hover:bg-pana-burnt font-extrabold"
                    disabled={isSubmitting || !turnstileToken}
                  >
                    {isSubmitting ? (
                      t('sending')
                    ) : (
                      <>
                        <Send className="mr-2 h-5 w-5" aria-hidden="true" />
                        {t('submitButton')}
                      </>
                    )}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        <p className="text-pana-ink/75 dark:text-muted-foreground text-center text-sm">
          {t('alreadyListed')}{' '}
          <Link
            href="/signin"
            className="text-pana-indigo dark:text-pana-flame font-semibold underline"
          >
            {t('signInLink')}
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function ListYourBusinessPage() {
  return <ListYourBusinessForm />;
}
