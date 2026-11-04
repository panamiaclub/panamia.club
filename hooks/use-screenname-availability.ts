'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

type CheckStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

interface CheckResult {
  name: string;
  status: CheckStatus;
  error: string;
}

export function useScreennameAvailability(
  name: string,
  {
    currentScreenname,
    enabled = true,
  }: { currentScreenname?: string | null; enabled?: boolean } = {}
) {
  const { t } = useTranslation('common');
  const [result, setResult] = useState<CheckResult>({
    name: '',
    status: 'idle',
    error: '',
  });
  const trimmedName = name.trim();
  const shouldCheck =
    enabled && trimmedName.length >= 3 && name !== currentScreenname;

  useEffect(() => {
    if (!shouldCheck) {
      setResult({ name, status: 'idle', error: '' });
      return;
    }

    const controller = new AbortController();
    setResult({ name, status: 'checking', error: '' });

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/user/screenname/check?name=${encodeURIComponent(trimmedName)}`,
          { signal: controller.signal }
        );
        if (!response.ok) {
          throw new Error(`Screenname check failed: ${response.status}`);
        }
        const data: { available?: unknown; error?: unknown } =
          await response.json();
        if (typeof data.available !== 'boolean') {
          throw new Error('Invalid screenname availability response');
        }
        if (controller.signal.aborted) return;

        const error =
          typeof data.error === 'string'
            ? data.error
            : t('onboarding.checkFailed');
        setResult({
          name,
          status: data.available
            ? 'available'
            : error.includes('taken')
              ? 'taken'
              : 'invalid',
          error: data.available ? '' : error,
        });
      } catch {
        if (controller.signal.aborted) return;
        setResult({
          name,
          status: 'idle',
          error: t('onboarding.checkFailed'),
        });
      }
    }, 500);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [name, trimmedName, shouldCheck, t]);

  const reject = (error: string) =>
    setResult({ name, status: 'invalid', error });

  if (!shouldCheck) return { status: 'idle' as const, error: '', reject };
  // Invalidate the previous result during render, before the next effect or
  // debounce runs, so a newly edited handle cannot use the old approval.
  if (result.name !== name) {
    return { status: 'checking' as const, error: '', reject };
  }
  return { status: result.status, error: result.error, reject };
}
