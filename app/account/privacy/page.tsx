'use client';

import { useEffect, useState } from 'react';
import { useSession } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Shield,
  FileText,
  Eye,
  Trash2,
  Loader2,
  Megaphone,
  Copy,
  BellOff,
  Zap,
} from 'lucide-react';

// =============================================================================
// Privacy Settings Page — Phase 3 consent infrastructure
//
// Lets users:
//   - View their active consent receipts (document + module + version + date)
//   - See whether GPC was detected at time of consent
//   - Withdraw module-level consent (hard-deletes the receipt)
//   - Link to full terms and privacy policy
//   - Future: exercise data rights (access, deletion, portability)
//
// Top-level terms consent cannot be withdrawn here — withdrawing requires
// account deletion (see Phase 5).
// =============================================================================

interface GhlContact {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  source?: string;
  dateAdded?: string;
  tags?: string[];
  dnd?: boolean;
  dndSettings?: {
    email?: { status: string };
    sms?: { status: string };
    whatsapp?: { status: string };
    calls?: { status: string };
  };
}

type CrmState =
  | { kind: 'loading' }
  | { kind: 'none' } // no GHL record linked
  | { kind: 'unavailable'; message: string } // 503 / GHL unreachable
  | { kind: 'loaded'; contact: GhlContact };

interface ConsentReceipt {
  id: string;
  document: string;
  module: string | null;
  version: string;
  majorVersion: number;
  gpcDetected: boolean;
  createdAt: string;
}

const MODULE_LABELS: Record<string, string> = {
  profiles: 'Profiles',
  articles: 'Articles',
  social: 'Social Timeline',
  mentoring: 'Mentoring',
  events: 'Events',
  uploads: 'Uploads',
  payments: 'Payments',
  community: 'Community',
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function PrivacySettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [receipts, setReceipts] = useState<ConsentReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const [crm, setCrm] = useState<CrmState>({ kind: 'loading' });
  const [crmAction, setCrmAction] = useState<
    null | 'copy-name' | 'copy-phone' | 'unsubscribe' | 'delete' | 'enroll'
  >(null);
  const [crmMessage, setCrmMessage] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/signin?callbackUrl=/account/privacy');
    }
  }, [status, router]);

  useEffect(() => {
    if (status !== 'authenticated') return;

    const fetchReceipts = async () => {
      try {
        const res = await fetch('/api/consent/list');
        if (res.ok) {
          const data = await res.json();
          setReceipts(data.receipts);
        }
      } catch {
        // Fail silently — page still renders without receipts
      } finally {
        setLoading(false);
      }
    };

    fetchReceipts();
  }, [status]);

  // -------------------------------------------------------------------------
  // CRM privacy portal ("peaky window") — GHL contact record
  // -------------------------------------------------------------------------
  const loadCrm = async () => {
    setCrm({ kind: 'loading' });
    try {
      const res = await fetch('/api/crm/contact');
      if (!res.ok) {
        // 503 = GHL unavailable; other non-OK also gets the graceful message
        setCrm({
          kind: 'unavailable',
          message: 'Could not load marketing data — try again later.',
        });
        return;
      }
      const body = (await res.json()) as {
        success: boolean;
        data: GhlContact | null;
      };
      if (!body.success) {
        setCrm({
          kind: 'unavailable',
          message: 'Could not load marketing data — try again later.',
        });
        return;
      }
      setCrm(
        body.data ? { kind: 'loaded', contact: body.data } : { kind: 'none' }
      );
    } catch {
      setCrm({
        kind: 'unavailable',
        message: 'Could not load marketing data — try again later.',
      });
    }
  };

  useEffect(() => {
    if (status !== 'authenticated') return;
    loadCrm();
  }, [status]);

  const handleCopyField = async (field: 'name' | 'phone') => {
    setCrmAction(field === 'name' ? 'copy-name' : 'copy-phone');
    setCrmMessage(null);
    try {
      const res = await fetch('/api/crm/contact/copy-field', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field }),
      });
      const body = await res.json();
      setCrmMessage(
        res.ok && body.success
          ? `Copied ${field} to your Panamia profile.`
          : (body?.error ?? 'Could not copy field.')
      );
    } catch {
      setCrmMessage('Could not copy field — try again later.');
    } finally {
      setCrmAction(null);
    }
  };

  const handleUnsubscribe = async () => {
    setCrmAction('unsubscribe');
    setCrmMessage(null);
    try {
      const res = await fetch('/api/crm/contact/unsubscribe', {
        method: 'POST',
      });
      if (res.ok) {
        setCrmMessage('Unsubscribed from all marketing channels.');
        await loadCrm();
      } else {
        const body = await res.json().catch(() => ({}));
        setCrmMessage(
          body?.error ?? 'Could not unsubscribe — try again later.'
        );
      }
    } catch {
      setCrmMessage('Could not unsubscribe — try again later.');
    } finally {
      setCrmAction(null);
    }
  };

  const handleDeleteContact = async () => {
    // Require the user to type their own email to confirm. High-friction
    // gate for an irreversible action (GHL contact deletion) that also
    // permanently sets ghlOptedOut=true on the profile.
    const expectedEmail = session?.user?.email;
    if (!expectedEmail) return;
    const typed = window.prompt(
      `This deletes your marketing record from HighLevel. It cannot be undone, and prevents a new record from being created later.\n\nType your email (${expectedEmail}) to confirm:`
    );
    if (typed === null) return; // user cancelled
    if (typed.trim().toLowerCase() !== expectedEmail.toLowerCase()) {
      setCrmMessage('Email did not match. Deletion cancelled.');
      return;
    }
    setCrmAction('delete');
    setCrmMessage(null);
    try {
      const res = await fetch('/api/crm/contact', { method: 'DELETE' });
      if (res.ok) {
        setCrmMessage('Marketing record deleted.');
        setCrm({ kind: 'none' });
      } else {
        const body = await res.json().catch(() => ({}));
        setCrmMessage(
          body?.error ?? 'Could not delete record — try again later.'
        );
      }
    } catch {
      setCrmMessage('Could not delete record — try again later.');
    } finally {
      setCrmAction(null);
    }
  };

  const handleEnrollTestWorkflow = async () => {
    setCrmAction('enroll');
    setCrmMessage(null);
    try {
      const res = await fetch('/api/crm/contact/enroll', { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      setCrmMessage(
        res.ok && body.success
          ? 'Enrolled in test workflow.'
          : (body?.error ?? 'Could not enroll — try again later.')
      );
    } catch {
      setCrmMessage('Could not enroll — try again later.');
    } finally {
      setCrmAction(null);
    }
  };

  const handleWithdraw = async (receipt: ConsentReceipt) => {
    // Top-level terms consent cannot be withdrawn — must delete account
    if (!receipt.module) return;

    setWithdrawing(receipt.id);
    try {
      await fetch(`/api/consent/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiptId: receipt.id }),
      });
      setReceipts((prev) => prev.filter((r) => r.id !== receipt.id));
    } catch {
      // Fail silently
    } finally {
      setWithdrawing(null);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (status !== 'authenticated') return null;

  const topLevelReceipts = receipts.filter((r) => !r.module);
  const moduleReceipts = receipts.filter((r) => r.module);
  const anyGpcDetected = receipts.some((r) => r.gpcDetected);

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-3xl font-bold">Privacy Settings</h1>

      {/* GPC status */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="h-5 w-5" />
            Global Privacy Control (GPC)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {anyGpcDetected ? (
            <p className="text-sm">
              Your browser sent a <strong>Global Privacy Control</strong> signal
              when you last consented. We recorded this preference. Panamia does
              not sell or share your personal data with third parties for
              advertising.
            </p>
          ) : (
            <p className="text-muted-foreground text-sm">
              No GPC signal was detected from your browser. If you enable GPC in
              your browser settings, it will be recorded with your next consent.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Top-level terms consent */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5" />
            Terms of Service
          </CardTitle>
        </CardHeader>
        <CardContent>
          {topLevelReceipts.length > 0 ? (
            <div className="space-y-2">
              {topLevelReceipts.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between text-sm"
                >
                  <span>
                    Accepted {r.document} v{r.version} on{' '}
                    {formatDate(r.createdAt)}
                  </span>
                </div>
              ))}
              <p className="text-muted-foreground text-xs">
                To withdraw consent to the core terms, you must{' '}
                <Link href="/account/user/edit" className="underline">
                  delete your account
                </Link>
                .
              </p>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              No top-level consent recorded yet. Consent is captured when you
              complete directory enrollment.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Module consents */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Eye className="h-5 w-5" />
            Feature Consents
          </CardTitle>
        </CardHeader>
        <CardContent>
          {moduleReceipts.length > 0 ? (
            <div className="space-y-3">
              {moduleReceipts.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div>
                    <div className="text-sm font-medium">
                      {r.module
                        ? MODULE_LABELS[r.module] || r.module
                        : r.document}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      v{r.version} — {formatDate(r.createdAt)}
                      {r.gpcDetected && ' — GPC detected'}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleWithdraw(r)}
                    disabled={withdrawing === r.id}
                    className="text-destructive hover:text-destructive"
                  >
                    {withdrawing === r.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    <span className="ml-1">Withdraw</span>
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              No feature consents recorded yet. These are captured as you use
              platform features for the first time.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Marketing data (GoHighLevel) — privacy portal / "peaky window".
          See docs/CRM-ROADMAP.md — fulfills GHL ToS §1.4 data-subject rights. */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Megaphone className="h-5 w-5" />
            Marketing Data
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Panamia uses HighLevel to manage marketing communications (email,
            SMS, etc.). You can review and control your marketing record here.
          </p>

          {crm.kind === 'loading' && (
            <div className="text-muted-foreground flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading marketing data…
            </div>
          )}

          {crm.kind === 'unavailable' && (
            <div className="text-muted-foreground text-sm">
              {crm.message}{' '}
              <button
                type="button"
                onClick={loadCrm}
                className="underline hover:no-underline"
              >
                Retry
              </button>
            </div>
          )}

          {crm.kind === 'none' && (
            <p className="text-muted-foreground text-sm">
              No marketing record found for your account. If you sign up for a
              Panamia event or opt in to a mailing list, a record will be
              created then.
            </p>
          )}

          {crm.kind === 'loaded' && (
            <div className="space-y-3">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                {(crm.contact.firstName || crm.contact.lastName) && (
                  <>
                    <dt className="text-muted-foreground">Name</dt>
                    <dd>
                      {[crm.contact.firstName, crm.contact.lastName]
                        .filter(Boolean)
                        .join(' ')}
                    </dd>
                  </>
                )}
                {crm.contact.email && (
                  <>
                    <dt className="text-muted-foreground">Email</dt>
                    <dd>{crm.contact.email}</dd>
                  </>
                )}
                {crm.contact.phone && (
                  <>
                    <dt className="text-muted-foreground">Phone</dt>
                    <dd>{crm.contact.phone}</dd>
                  </>
                )}
                {crm.contact.source && (
                  <>
                    <dt className="text-muted-foreground">Source</dt>
                    <dd>{crm.contact.source}</dd>
                  </>
                )}
                {crm.contact.dateAdded && (
                  <>
                    <dt className="text-muted-foreground">Added</dt>
                    <dd>{formatDate(crm.contact.dateAdded)}</dd>
                  </>
                )}
                {crm.contact.tags && crm.contact.tags.length > 0 && (
                  <>
                    <dt className="text-muted-foreground">Tags</dt>
                    <dd className="flex flex-wrap gap-1">
                      {crm.contact.tags.map((t) => (
                        <span
                          key={t}
                          className="bg-muted rounded px-2 py-0.5 text-xs"
                        >
                          {t}
                        </span>
                      ))}
                    </dd>
                  </>
                )}
                <dt className="text-muted-foreground">Subscribed</dt>
                <dd>
                  {crm.contact.dnd
                    ? 'No (all channels unsubscribed)'
                    : 'Yes (some or all channels)'}
                </dd>
              </dl>

              {/* Copy-to-profile actions — per-field, opt-in */}
              <div className="flex flex-wrap gap-2 pt-2">
                {(crm.contact.firstName || crm.contact.lastName) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopyField('name')}
                    disabled={crmAction !== null}
                  >
                    {crmAction === 'copy-name' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                    <span className="ml-1">Copy name to profile</span>
                  </Button>
                )}
                {crm.contact.phone && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopyField('phone')}
                    disabled={crmAction !== null}
                  >
                    {crmAction === 'copy-phone' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                    <span className="ml-1">Copy phone to profile</span>
                  </Button>
                )}
              </div>

              {/* Marketing controls */}
              <div className="flex flex-wrap gap-2 border-t pt-3">
                {!crm.contact.dnd && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleUnsubscribe}
                    disabled={crmAction !== null}
                  >
                    {crmAction === 'unsubscribe' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <BellOff className="h-4 w-4" />
                    )}
                    <span className="ml-1">Unsubscribe from all</span>
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDeleteContact}
                  disabled={crmAction !== null}
                  className="text-destructive hover:text-destructive"
                >
                  {crmAction === 'delete' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  <span className="ml-1">Delete marketing record</span>
                </Button>
              </div>

              {/* Test workflow enrollment.
                  Server returns 503 unless GHL_WORKFLOW_TEST_ID is set. */}
              <div className="pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleEnrollTestWorkflow}
                  disabled={crmAction !== null}
                  className="text-muted-foreground"
                >
                  {crmAction === 'enroll' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4" />
                  )}
                  <span className="ml-1">Trigger test workflow</span>
                </Button>
              </div>
            </div>
          )}

          {crmMessage && (
            <p className="text-muted-foreground border-t pt-2 text-sm">
              {crmMessage}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Data rights — future enhancement */}
      {/* Phase 5: Add data export, deletion request, and portability buttons
          here. These should link to the account deletion flow when built. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Your Data Rights</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-muted-foreground text-sm">
            You have the right to access, correct, delete, and port your data.
            See our{' '}
            <Link href="/legal/privacy" className="underline">
              Privacy Policy
            </Link>{' '}
            for details.
          </p>
          <p className="text-muted-foreground text-sm">
            To exercise these rights, contact{' '}
            <a href="mailto:hola@panamia.club" className="underline">
              hola@panamia.club
            </a>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
