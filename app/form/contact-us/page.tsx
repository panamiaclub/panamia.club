'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useSession } from '@/lib/auth-client';
import { useTurnstile } from '@/components/Turnstile';
import Link from 'next/link';
import axios from 'axios';
import PublicPageShell from '@/components/PublicPageShell';
import publicStyles from '@/components/PublicPageShell.module.css';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Send, Shield } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import {
  CONTACT_CATEGORIES,
  type ContactCategory,
} from '@/lib/contact-categories';

function ContactForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [category, setCategory] = useState<ContactCategory | ''>('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { data: session } = useSession();
  // What we'd fill in for a signed-in sender. Kept around so a successful
  // submit resets the form back to their details rather than to blank fields.
  const [prefill, setPrefill] = useState({ name: '', email: '' });
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const {
    token: turnstileToken,
    error: turnstileError,
    reset: resetTurnstile,
    Widget: TurnstileWidget,
  } = useTurnstile(turnstileSiteKey, 'contact_form_submit');
  const { toast } = useToast();
  const { t: tToast } = useTranslation('toast');
  const { t } = useTranslation('contact');

  const validateEmail = (email: string): boolean => {
    const regEx = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
    return regEx.test(email);
  };

  // Fill in a signed-in sender's details so they don't retype what we already
  // know — and so the receipt goes to their real address instead of a typo.
  // The session carries the email; the display name lives on the profile, so it
  // needs a fetch. Both fields stay editable.
  const sessionEmail = session?.user?.email;
  useEffect(() => {
    if (!sessionEmail) return;

    let active = true;
    // Only ever fills a field the sender hasn't touched — the session can
    // resolve after they've started typing, and clobbering that would be worse
    // than not prefilling at all.
    const fillIfEmpty = (
      setter: (fn: (current: string) => string) => void,
      value: string
    ) => {
      if (!value) return;
      setter((current) => current || value);
    };

    setPrefill((p) => ({ ...p, email: sessionEmail }));
    fillIfEmpty(setEmail, sessionEmail);

    axios
      .get('/api/user/me', { headers: { Accept: 'application/json' } })
      .then((resp) => {
        if (!active) return;
        const displayName: string =
          resp.data?.data?.name || resp.data?.data?.screenname || '';
        setPrefill((p) => ({ ...p, name: displayName }));
        fillIfEmpty(setName, displayName);
      })
      // A failed lookup just means no name prefill; the field still works.
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [sessionEmail]);

  const createContactUs = async (token: string) => {
    const response = await axios
      .post(
        '/api/createContactUs',
        {
          name,
          email,
          category,
          message,
          turnstileToken: token,
        },
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
        }
      )
      .catch((error) => {
        console.error('Contact form submission error:', error);
        throw error;
      });
    return response;
  };

  function validateContactUs() {
    if (!name || name.trim().length < 2) {
      toast({
        variant: 'destructive',
        title: tToast('invalidName'),
        description: tToast('invalidNameContactDesc'),
      });
      return false;
    }

    if (!validateEmail(email)) {
      toast({
        variant: 'destructive',
        title: tToast('invalidEmail'),
        description: tToast('invalidEmailDesc'),
      });
      return false;
    }

    if (!category) {
      toast({
        variant: 'destructive',
        title: tToast('categoryRequired'),
        description: tToast('categoryRequiredDesc'),
      });
      return false;
    }

    if (!message || message.trim().length < 10) {
      toast({
        variant: 'destructive',
        title: tToast('messageTooShort'),
        description: tToast('messageTooShortDesc'),
      });
      return false;
    }

    return true;
  }

  async function submitContactUs(e: FormEvent) {
    e.preventDefault();

    if (!validateContactUs()) {
      return;
    }

    setIsSubmitting(true);

    try {
      if (!turnstileToken) {
        toast({
          variant: 'destructive',
          title: tToast('securityError'),
          description: tToast('turnstileNotReady'),
        });
        setIsSubmitting(false);
        return;
      }

      const response = await createContactUs(turnstileToken);

      if (response?.data?.error) {
        toast({
          variant: 'destructive',
          title: tToast('submissionFailed'),
          description: response.data.error,
        });
      } else {
        setName(prefill.name);
        setEmail(prefill.email);
        setCategory('');
        setMessage('');
        resetTurnstile();

        toast({
          title: tToast('messageSentTitle'),
          description: tToast('messageSentDesc'),
        });
      }
    } catch {
      toast({
        variant: 'destructive',
        title: tToast('submissionError'),
        description: tToast('submissionErrorContact'),
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <PublicPageShell
      eyebrow={t('eyebrow')}
      title={t('title')}
      intro={t('intro2')}
      narrow
    >
      <div className={publicStyles.stack}>
        <aside className={publicStyles.callout}>
          <h2>{t('formTitle')}</h2>
          <div>
            <p>
              {t('intro1')}{' '}
              <Link
                href="/#home-faq"
                className="text-pana-blue hover:underline"
              >
                {t('faqLink')}
              </Link>{' '}
              {t('intro1b')}{' '}
              <Link href="/about-us" className="text-pana-blue hover:underline">
                {t('aboutLink')}
              </Link>
              {t('intro1c')}
            </p>
          </div>
        </aside>

        <Card className={publicStyles.panel}>
          <CardHeader>
            <CardTitle>{t('formTitle')}</CardTitle>
            <CardDescription>{t('formDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submitContactUs} className="space-y-6">
              {/* Name Field */}
              <div className="space-y-2">
                <Label htmlFor="name">
                  {t('nameLabel')} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="name"
                  type="text"
                  name="name"
                  maxLength={75}
                  placeholder={t('namePlaceholder')}
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>

              {/* Email Field */}
              <div className="space-y-2">
                <Label htmlFor="email">
                  {t('emailLabel')} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  name="email"
                  maxLength={100}
                  placeholder="you@example.com"
                  value={email}
                  required
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isSubmitting}
                />
                <p className="text-muted-foreground text-sm">
                  {t('emailNote')}
                </p>
              </div>

              {/* Category Field */}
              <div className="space-y-2">
                <Label htmlFor="category">
                  {t('categoryLabel')}{' '}
                  <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={category}
                  onValueChange={(value) =>
                    setCategory(value as ContactCategory)
                  }
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="category">
                    <SelectValue placeholder={t('categoryPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTACT_CATEGORIES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {t(`categories.${value}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Message Field */}
              <div className="space-y-2">
                <Label htmlFor="message">
                  {t('messageLabel')}{' '}
                  <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="message"
                  name="message"
                  maxLength={1000}
                  required
                  placeholder={t('messagePlaceholder')}
                  rows={6}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>

              {/* Shown to everyone, signed in or not — a session cookie isn't a
                  bot check, and the server verifies the token unconditionally. */}
              <div className="space-y-3">
                {TurnstileWidget}
                {turnstileError && (
                  <p className="text-sm text-red-600">
                    {t('turnstileBlocked')}
                  </p>
                )}
                <div className="bg-muted text-muted-foreground flex items-center gap-2 rounded-md p-3 text-sm">
                  <Shield className="h-4 w-4" />
                  <span>{t('turnstileNote')}</span>
                </div>
              </div>

              {/* Submit Button */}
              <div className="flex justify-center">
                <Button
                  type="submit"
                  size="lg"
                  className="bg-pana-pink hover:bg-pana-pink/90 w-full md:w-auto"
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
          </CardContent>
        </Card>
      </div>
    </PublicPageShell>
  );
}

export default function ContactUsPage() {
  return <ContactForm />;
}
