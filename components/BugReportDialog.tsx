'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Bug, Flag, ImagePlus, Send } from 'lucide-react';
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
import { useIsNativeApp } from '@/lib/mobile/use-native-app';
import { OPEN_BUG_REPORT_EVENT } from '@/lib/mobile/native';
import {
  isSafetyReportReason,
  isSafetyReportTargetType,
  OPEN_SAFETY_REPORT_EVENT,
  openSafetyReport,
  SAFETY_REPORT_REASONS,
  SAFETY_REPORT_TARGETS,
  safetyReportUrl,
} from '@/lib/safety-report';

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
const ALLOWED_SCREENSHOT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export default function BugReportDialog() {
  const native = useIsNativeApp();
  const pathname = usePathname() || '/';
  const appPreview =
    pathname === '/mock/app' || pathname.startsWith('/mock/app/');
  const [reportReady, setReportReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [reportType, setReportType] = useState<'bug' | 'safety'>('bug');
  const [targetType, setTargetType] = useState('other');
  const [targetUrl, setTargetUrl] = useState('');
  const [reason, setReason] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: session } = useSession();
  const { toast } = useToast();
  const safety = reportType === 'safety';
  const {
    token: turnstileToken,
    error: turnstileError,
    reset: resetTurnstile,
    Widget: TurnstileWidget,
  } = useTurnstile(
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    safety ? 'safety_report_submit' : 'bug_report_submit'
  );

  const sessionEmail = session?.user?.email;
  useEffect(() => {
    const showBug = () => {
      if (reportType !== 'bug') {
        setMessage('');
        setScreenshot(null);
      }
      setReportType('bug');
      resetTurnstile();
      setOpen(true);
    };
    const showSafety = (event: Event) => {
      const target: unknown =
        event instanceof CustomEvent ? event.detail : null;
      const url =
        target &&
        typeof target === 'object' &&
        'url' in target &&
        typeof target.url === 'string'
          ? safetyReportUrl(target.url, window.location.origin)
          : null;
      if (
        !url ||
        !target ||
        typeof target !== 'object' ||
        !('type' in target) ||
        !isSafetyReportTargetType(target.type)
      ) {
        toast({
          variant: 'destructive',
          title: 'Could not open safety report',
          description: 'Open the relevant user or content and try again.',
        });
        return;
      }
      setReportType('safety');
      setTargetType(target.type);
      setTargetUrl(url);
      setReason('');
      setMessage('');
      setScreenshot(null);
      resetTurnstile();
      setOpen(true);
    };
    if (native) window.addEventListener(OPEN_BUG_REPORT_EVENT, showBug);
    window.addEventListener(OPEN_SAFETY_REPORT_EVENT, showSafety);
    setReportReady(true);
    return () => {
      window.removeEventListener(OPEN_BUG_REPORT_EVENT, showBug);
      window.removeEventListener(OPEN_SAFETY_REPORT_EVENT, showSafety);
    };
  }, [native, toast, resetTurnstile, reportType]);

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
    setReason('');
    setTargetUrl('');
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
    if (
      safety &&
      (!isSafetyReportReason(reason) ||
        !isSafetyReportTargetType(targetType) ||
        !safetyReportUrl(targetUrl))
    ) {
      toast({
        variant: 'destructive',
        title: 'Complete the safety report',
        description:
          'Choose a reason and enter the link to the user or content.',
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
      form.set(
        'pageUrl',
        safety
          ? window.location.origin + window.location.pathname
          : window.location.href
      );
      if (safety) {
        form.set('reportType', 'safety');
        form.set('targetType', targetType);
        form.set('targetUrl', targetUrl.trim());
        form.set('reason', reason);
      } else {
        form.set(
          'viewport',
          `${window.innerWidth}x${window.innerHeight} @ ${window.devicePixelRatio}x`
        );
        form.set('locale', navigator.language);
      }
      form.set('turnstileToken', turnstileToken);
      if (!safety && screenshot) form.set('screenshot', screenshot);

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
        title: safety ? 'Safety report received' : 'Bug report sent',
        description:
          body.message ||
          (safety
            ? 'Your report has been saved for our safety team to review.'
            : 'Thanks for helping us improve Pana.'),
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
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (submitting && !next) {
          toast({
            title: 'Sending your report',
            description: 'Please wait until the report has been saved.',
          });
          return;
        }
        setOpen(next);
      }}
    >
      {!native && !appPreview && (
        <div
          data-report-controls
          className="fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 flex items-center gap-2"
        >
          <Button
            type="button"
            disabled={!reportReady}
            className="bg-pana-indigo text-pana-cream hover:bg-pana-indigo/90 rounded-full shadow-lg"
            aria-label="Report a safety concern"
            onClick={() =>
              openSafetyReport({
                type: 'other',
                url: window.location.origin + window.location.pathname,
              })
            }
          >
            <Flag className="h-4 w-4" aria-hidden="true" />
            <span data-report-label className="hidden sm:inline">
              Report a safety concern
            </span>
          </Button>
          <DialogTrigger asChild>
            <Button
              type="button"
              disabled={!reportReady}
              className="bg-pana-indigo text-pana-cream hover:bg-pana-indigo/90 rounded-full shadow-lg"
              aria-label="Report a bug"
              onClick={() => {
                if (safety) {
                  setMessage('');
                  setScreenshot(null);
                }
                setReportType('bug');
                resetTurnstile();
              }}
            >
              <Bug className="h-4 w-4" aria-hidden="true" />
              <span data-report-label className="hidden sm:inline">
                Report a bug
              </span>
            </Button>
          </DialogTrigger>
        </div>
      )}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {safety ? 'Report a safety concern' : 'Report a bug'}
          </DialogTitle>
          <DialogDescription>
            {safety
              ? 'Report abusive users, harmful content, or a child-safety concern. Your contact details and report are private to the safety team, not published. Send a link and description; do not copy, download, or attach suspected child sexual abuse material. If someone is in immediate danger, contact local emergency services.'
              : 'Tell us what went wrong. We automatically include this page and basic browser details. Screenshots are optional and are attached to the report in our private support inbox.'}
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" method="post" onSubmit={submit}>
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

          {safety && (
            <>
              <div className="space-y-2">
                <Label htmlFor="safety-report-target-type">Report about</Label>
                <select
                  id="safety-report-target-type"
                  className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
                  value={targetType}
                  onChange={(event) => setTargetType(event.target.value)}
                  disabled={submitting}
                  required
                >
                  {Object.entries(SAFETY_REPORT_TARGETS).map(
                    ([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    )
                  )}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="safety-report-url">User or content URL</Label>
                <Input
                  id="safety-report-url"
                  type="url"
                  maxLength={2000}
                  value={targetUrl}
                  onChange={(event) => setTargetUrl(event.target.value)}
                  disabled={submitting}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="safety-report-reason">Safety reason</Label>
                <select
                  id="safety-report-reason"
                  className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  disabled={submitting}
                  required
                >
                  <option value="" disabled>
                    Choose a safety reason
                  </option>
                  {Object.entries(SAFETY_REPORT_REASONS).map(
                    ([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    )
                  )}
                </select>
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="bug-report-message">What happened?</Label>
            <Textarea
              id="bug-report-message"
              rows={6}
              minLength={10}
              maxLength={3000}
              required
              placeholder={
                safety
                  ? 'Describe the concern and identify the user or content. Do not copy illegal material.'
                  : 'What were you trying to do, what happened, and what did you expect?'
              }
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              disabled={submitting}
            />
          </div>

          {!safety && (
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
          )}

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
