'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useScreennameAvailability } from '@/hooks/use-screenname-availability';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Check, X, Loader2 } from 'lucide-react';

interface ScreennamePromptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (screenname: string) => void;
  title?: string;
  description?: string;
}

export default function ScreennamePrompt({
  open,
  onOpenChange,
  onSuccess,
  title = 'Choose Your Screenname',
  description = 'Enter your name and choose a unique screenname. Both will be displayed publicly on your contributions.',
}: ScreennamePromptProps) {
  const { t } = useTranslation('common');
  const [displayName, setDisplayName] = useState('');
  const [screenname, setScreenname] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    status,
    error: availabilityError,
    reject,
  } = useScreennameAvailability(screenname, { enabled: open });
  const screennameError = error || availabilityError;

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setDisplayName('');
      setScreenname('');
      setError('');
      setIsSubmitting(false);
    }
  }, [open]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (status !== 'available' || isSubmitting) {
      return;
    }
    if (!displayName.trim() || !screenname.trim()) {
      setError(t('onboarding.requiredFields'));
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/user/screenname/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          screenname: screenname.trim(),
          name: displayName.trim(),
        }),
      });

      const data = await response.json();

      if (data.success) {
        onSuccess(data.data.screenname);
        onOpenChange(false);
      } else {
        reject(data.error || 'Failed to set screenname');
      }
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="prompt-name">{t('onboarding.nameLabel')}</Label>
              <Input
                id="prompt-name"
                type="text"
                value={displayName}
                maxLength={80}
                autoComplete="name"
                required
                placeholder={t('onboarding.namePlaceholder')}
                disabled={isSubmitting}
                onChange={(e) => {
                  setDisplayName(e.target.value);
                  setError('');
                }}
              />
              <p className="text-muted-foreground text-sm">
                {t('onboarding.nameHint')}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="prompt-screenname">
                {t('onboarding.screennameLabel')}
              </Label>
              <div className="relative">
                <Input
                  id="prompt-screenname"
                  type="text"
                  value={screenname}
                  maxLength={24}
                  autoComplete="username"
                  required
                  onChange={(e) => {
                    setScreenname(e.target.value);
                    setError('');
                  }}
                  className={
                    status === 'available'
                      ? 'border-green-500 pr-10'
                      : status === 'taken' || status === 'invalid'
                        ? 'border-red-500 pr-10'
                        : 'pr-10'
                  }
                  placeholder={t('onboarding.screennamePlaceholder')}
                  disabled={isSubmitting}
                />
                <div className="absolute top-1/2 right-3 -translate-y-1/2">
                  {status === 'checking' && (
                    <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
                  )}
                  {status === 'available' && (
                    <Check className="h-4 w-4 text-green-500" />
                  )}
                  {(status === 'taken' || status === 'invalid') && (
                    <X className="h-4 w-4 text-red-500" />
                  )}
                </div>
              </div>
              {screennameError && (
                <p role="alert" className="text-destructive text-sm">
                  {screennameError}
                </p>
              )}
              <p className="text-muted-foreground text-sm">
                {t('onboarding.screennameHint')}
              </p>
            </div>

            <div className="bg-pana-butter/60 dark:bg-pana-indigo rounded-lg p-3">
              <p className="text-pana-ink dark:text-pana-cream text-sm">
                {t('onboarding.privacyNote')}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-pana-flame text-pana-ink hover:bg-pana-burnt font-extrabold"
              disabled={
                !displayName.trim() ||
                !screenname.trim() ||
                status !== 'available' ||
                isSubmitting
              }
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('onboarding.saving')}
                </>
              ) : (
                t('onboarding.continue')
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
