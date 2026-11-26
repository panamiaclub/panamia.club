'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
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
      <div className="w-full max-w-lg space-y-6">
        <h1 className="text-center text-3xl font-extrabold">
          {t('onboarding.zipTitle')}
        </h1>
        <p className="text-muted-foreground text-center">
          {t('onboarding.zipBody')}
        </p>
        <Card>
          <CardContent className="p-6">
            <form onSubmit={submit} className="space-y-4">
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
                aria-describedby="account-zip-hint account-zip-error"
                aria-invalid={!!error}
                onChange={(event) => {
                  setZipCode(event.target.value);
                  setError('');
                }}
              />
              <p
                id="account-zip-hint"
                className="text-muted-foreground text-sm"
              >
                {t('onboarding.zipHint')}
              </p>
              <p
                id="account-zip-error"
                role="alert"
                className="text-destructive text-sm"
              >
                {error}
              </p>
              <Button type="submit" className="w-full" disabled={saving}>
                {t(saving ? 'onboarding.saving' : 'onboarding.continue')}
              </Button>
            </form>
          </CardContent>
        </Card>
        <div className="flex flex-wrap items-center justify-center gap-4 text-sm">
          <Link href="/legal/privacy">{t('onboarding.zipPrivacy')}</Link>
          <Link href="/account/user/edit">{t('onboarding.zipAccount')}</Link>
          <Button
            variant="link"
            className="h-auto p-0"
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
