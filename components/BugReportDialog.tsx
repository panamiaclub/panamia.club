'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { Bug, ImagePlus, Send } from 'lucide-react';
import { useSession } from '@/lib/auth-client';
import { useTurnstile } from '@/components/Turnstile';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
const ALLOWED_SCREENSHOT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export default function BugReportDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: session } = useSession();
  const { toast } = useToast();
  const {
    token: turnstileToken,
    error: turnstileError,
    reset: resetTurnstile,
    Widget: TurnstileWidget,
  } = useTurnstile(
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    'bug_report_submit'
  );

  const sessionEmail = session?.user?.email;
  useEffect(() => {
    if (!open || !sessionEmail) return;
    setEmail((current) => current || sessionEmail);

    const controller = new AbortController();
    fetch('/api/user/me', {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return;
        const body = await response.json();
        const displayName = body?.data?.name || body?.data?.screenname || '';
        if (displayName) setName((current) => current || displayName);
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          console.error('Bug report profile prefill failed:', error);
        }
      });

    return () => controller.abort();
  }, [open, sessionEmail]);

  function chooseScreenshot(file: File | null) {
    if (!file) {
      setScreenshot(null);
      return;
    }
    if (
      file.size > MAX_SCREENSHOT_BYTES ||
      !ALLOWED_SCREENSHOT_TYPES.has(file.type)
    ) {
      if (fileRef.current) fileRef.current.value = '';
      toast({
        variant: 'destructive',
        title: 'Screenshot not attached',
        description: 'Choose a PNG, JPEG, or WebP image no larger than 5 MB.',
      });
      return;
    }
    setScreenshot(file);
  }

  function resetForm() {
    setName('');
    setEmail(sessionEmail || '');
    setMessage('');
    setScreenshot(null);
    if (fileRef.current) fileRef.current.value = '';
    resetTurnstile();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim().length < 2 || message.trim().length < 10) {
      toast({
        variant: 'destructive',
        title: 'Add a little more detail',
        description:
          'Enter your name and describe the problem in at least 10 characters.',
      });
      return;
    }
    if (!turnstileToken) {
      toast({
        variant: 'destructive',
        title: 'Verification required',
        description: 'Complete the verification before sending the report.',
      });
      return;
    }

    setSubmitting(true);
    try {
      const form = new FormData();
      form.set('name', name.trim());
      form.set('email', email.trim());
      form.set('message', message.trim());
      form.set('pageUrl', window.location.href);
      form.set(
        'viewport',
        `${window.innerWidth}x${window.innerHeight} @ ${window.devicePixelRatio}x`
      );
      form.set('locale', navigator.language);
      form.set('turnstileToken', turnstileToken);
      if (screenshot) form.set('screenshot', screenshot);

      const response = await fetch('/api/bug-reports', {
        method: 'POST',
        body: form,
      });
      const body = (await response.json()) as {
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        throw new Error(body.error || 'The report could not be sent.');
      }

      toast({
        title: 'Bug report sent',
        description: body.message || 'Thanks for helping us improve Pana.',
      });
      resetForm();
      setOpen(false);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Could not send report',
        description:
          error instanceof Error
            ? error.message
            : 'Please try again in a moment.',
      });
      resetTurnstile();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          className="bg-pana-indigo text-pana-cream hover:bg-pana-indigo/90 fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 rounded-full shadow-lg"
          aria-label="Report a bug"
        >
          <Bug className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Report a bug</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Report a bug</DialogTitle>
          <DialogDescription>
            Tell us what went wrong. We automatically include this page and
            basic browser details. Screenshots are optional and are attached to
            the report in our private support inbox.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="bug-report-name">Name</Label>
              <Input
                id="bug-report-name"
                autoComplete="name"
                maxLength={75}
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bug-report-email">Email</Label>
              <Input
                id="bug-report-email"
                type="email"
                autoComplete="email"
                maxLength={100}
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={submitting}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bug-report-message">What happened?</Label>
            <Textarea
              id="bug-report-message"
              rows={6}
              minLength={10}
              maxLength={3000}
              required
              placeholder="What were you trying to do, what happened, and what did you expect?"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bug-report-screenshot">
              Screenshot{' '}
              <span className="text-muted-foreground">(optional)</span>
            </Label>
            <div className="flex items-center gap-2">
              <ImagePlus className="text-muted-foreground h-5 w-5 shrink-0" />
              <Input
                ref={fileRef}
                id="bug-report-screenshot"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) =>
                  chooseScreenshot(event.target.files?.[0] ?? null)
                }
                disabled={submitting}
              />
            </div>
            <p className="text-muted-foreground text-xs">
              Choose an image from your photo library or files. PNG, JPEG, or
              WebP, up to 5 MB. Remove private information before attaching.
            </p>
          </div>

          <div className="space-y-2">
            {TurnstileWidget}
            {turnstileError && (
              <p className="text-destructive text-sm">
                Verification could not load. Check content-blocking settings and
                try again.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={submitting || !turnstileToken}>
              <Send className="h-4 w-4" aria-hidden="true" />
              {submitting ? 'Sending…' : 'Send report'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
