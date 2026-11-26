'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { ShieldCheck } from 'lucide-react';
import { signOut } from '@/lib/auth-client';
import { normalizeUsZip } from '@/lib/online-zip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';

export function ZipCodeForm({ destination }: { destination: string }) {
  const { t } = useTranslation('common');
  const [zipCode, setZipCode] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (!normalizeUsZip(zipCode)) {
      setError(t('onboarding.zipInvalid'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/user/zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zipCode }),
      });
      if (!response.ok) {
        setError(t('onboarding.zipSaveFailed'));
        setSaving(false);
        return;
      }
      window.location.assign(destination);
    } catch {
      setError(t('onboarding.zipSaveFailed'));
      setSaving(false);
    }
  }

  return (
    <div className="auth-surface flex flex-col items-center px-4 py-12 sm:py-16">
      <div className="w-full max-w-[30rem] space-y-6">
        <div className="space-y-3 text-center">
          <h1 className="text-pana-ink dark:text-pana-cream text-3xl leading-tight font-extrabold tracking-tight">
            {t('onboarding.zipTitle')}
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {t('onboarding.zipBody')}
          </p>
        </div>
        <Card className="border-pana-ink/10 rounded-3xl shadow-xl dark:border-white/10">
          <CardContent className="p-6 sm:p-8">
            <form onSubmit={submit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="account-zip">{t('onboarding.zipLabel')}</Label>
                <Input
                  id="account-zip"
                  name="zipCode"
                  autoComplete="postal-code"
                  inputMode="numeric"
                  pattern="[0-9]{5}(-[0-9]{4})?"
                  maxLength={10}
                  required
                  value={zipCode}
                  disabled={saving}
                  aria-describedby="account-zip-hint account-zip-privacy account-zip-error"
                  aria-invalid={!!error}
                  onChange={(event) => {
                    setZipCode(event.target.value);
                    setError('');
                  }}
                />
                <p
                  id="account-zip-hint"
                  className="text-muted-foreground text-sm leading-relaxed"
                >
                  {t('onboarding.zipHint')}
                </p>
              </div>
              <div className="bg-pana-butter/60 dark:bg-pana-indigo flex items-start gap-3 rounded-xl p-4">
                <ShieldCheck
                  className="text-pana-indigo dark:text-pana-cream mt-0.5 h-5 w-5 shrink-0"
                  aria-hidden="true"
                />
                <p
                  id="account-zip-privacy"
                  className="text-pana-ink dark:text-pana-cream text-sm leading-relaxed"
                >
                  {t('onboarding.zipPrivacyNote')}
                </p>
              </div>
              <p
                id="account-zip-error"
                role="alert"
                className="text-destructive text-sm"
              >
                {error}
              </p>
              <Button
                type="submit"
                className="bg-pana-flame text-pana-ink hover:bg-pana-burnt w-full font-extrabold"
                disabled={saving}
              >
                {t(saving ? 'onboarding.saving' : 'onboarding.continue')}
              </Button>
            </form>
          </CardContent>
        </Card>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
          <Link
            href="/legal/privacy"
            className="text-pana-indigo dark:text-pana-flame underline-offset-4 hover:underline"
          >
            {t('onboarding.zipPrivacy')}
          </Link>
          <Link
            href="/account/user/edit"
            className="text-pana-indigo dark:text-pana-flame underline-offset-4 hover:underline"
          >
            {t('onboarding.zipAccount')}
          </Link>
          <Button
            variant="link"
            className="text-muted-foreground h-auto p-0"
            disabled={saving}
            onClick={async () => {
              try {
                await signOut({ callbackUrl: '/signin' });
              } catch {
                setError(t('onboarding.zipSignOutFailed'));
              }
            }}
          >
            {t('onboarding.zipSignOut')}
          </Button>
        </div>
      </div>
    </div>
  );
}
