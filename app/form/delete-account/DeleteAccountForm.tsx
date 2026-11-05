'use client';

import { useState, useRef, useEffect } from 'react';
import { useSession, signOut } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  Heart,
  Loader2,
  TriangleAlert,
  Trash2,
} from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PreflightData {
  canDelete: boolean;
  blockers: string[];
  summary: {
    articles: { total: number; archived: number; preArchive: number };
    socialPosts: { total: number };
    events: {
      hosted: number;
      organized: number;
      attended: number;
      archived: number;
    };
    mentorSessions: { completed: number; pending: number };
    mediaFiles: number;
    thirdParty: {
      stripe: boolean;
      ghl: boolean;
      google: boolean;
      apple: boolean;
    };
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DeleteAccountForm() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [activePage, setActivePage] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Preflight data
  const [preflight, setPreflight] = useState<PreflightData | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(true);
  const [preflightError, setPreflightError] = useState<string | null>(null);

  // Form state
  const [attributionChoice, setAttributionChoice] = useState<
    'keep' | 'anonymize'
  >('keep');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [confirmUnderstand, setConfirmUnderstand] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Page refs
  const page1Ref = useRef<HTMLDivElement>(null);
  const page2Ref = useRef<HTMLDivElement>(null);
  const page3Ref = useRef<HTMLDivElement>(null);
  const page4Ref = useRef<HTMLDivElement>(null);
  const page5Ref = useRef<HTMLDivElement>(null);
  const page6Ref = useRef<HTMLDivElement>(null);

  // Redirect unauthenticated users
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/signin?callbackUrl=/form/delete-account');
    }
  }, [status, router]);

  // Load preflight data
  useEffect(() => {
    if (status !== 'authenticated') return;
    setPreflightLoading(true);
    axios
      .get('/api/account/delete-preflight')
      .then((res) => {
        setPreflight(res.data);
        setPreflightError(null);
      })
      .catch((err) => {
        setPreflightError(
          err.response?.data?.error ?? 'Failed to load account data'
        );
      })
      .finally(() => setPreflightLoading(false));
  }, [status]);

  if (status === 'loading') {
    return (
      <main className="surface-cream flex min-h-screen items-center justify-center">
        <p role="status" className="flex items-center gap-2 font-bold">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          Loading...
        </p>
      </main>
    );
  }

  if (status !== 'authenticated' && activePage < 6) {
    return null;
  }

  const scrollToPage = (pageNum: number) => {
    const refs = [
      null,
      page1Ref,
      page2Ref,
      page3Ref,
      page4Ref,
      page5Ref,
      page6Ref,
    ];
    refs[pageNum]?.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const hasArchivedContent =
    preflight &&
    (preflight.summary.articles.archived > 0 ||
      preflight.summary.events.archived > 0);

  // Total pages: skip page 2 (attribution) if no archived content
  const totalPages = hasArchivedContent ? 5 : 4;
  const effectivePage =
    !hasArchivedContent && activePage >= 2 ? activePage - 1 : activePage;
  const progress =
    activePage <= 5 ? Math.trunc((effectivePage / totalPages) * 100) : 100;

  const goNext = () => {
    let next = activePage + 1;
    // Skip attribution page if no archived content
    if (next === 2 && !hasArchivedContent) next = 3;
    setActivePage(next);
    scrollToPage(next);
  };

  const goPrev = () => {
    let prev = activePage - 1;
    // Skip attribution page if no archived content
    if (prev === 2 && !hasArchivedContent) prev = 1;
    setActivePage(prev);
    scrollToPage(prev);
  };

  const handleDelete = async () => {
    setIsSubmitting(true);
    setDeleteError(null);
    try {
      const res = await axios.post('/api/account/delete', {
        attributionChoice: hasArchivedContent ? attributionChoice : 'anonymize',
        confirmEmail,
      });
      if (res.data.success) {
        // TODO(GHL): Trigger GoHighLevel flow email "Account Deleted"
        await signOut({ redirect: false });
        setActivePage(6);
        scrollToPage(6);
      }
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setDeleteError(
          err.response?.data?.error ?? 'Deletion failed. Please try again.'
        );
      } else {
        setDeleteError('An unexpected error occurred.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const thirdPartyServices: string[] = [];
  if (preflight) {
    const tp = preflight.summary.thirdParty;
    if (tp.stripe) thirdPartyServices.push('Stripe (payment/subscriptions)');
    if (tp.ghl) thirdPartyServices.push('GoHighLevel (CRM)');
    if (tp.google) thirdPartyServices.push('Google (OAuth connection)');
    if (tp.apple) thirdPartyServices.push('Apple (OAuth connection)');
  }

  return (
    <main className="surface-cream min-h-screen pt-8 pb-24 md:pt-12">
      <div className="container mx-auto max-w-3xl px-4">
        <div className="space-y-6">
          <header>
            <span className="section-eyebrow">Account</span>
            <h1 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">
              Delete Your Account
            </h1>
            <p className="text-pana-ink/65 mt-3 max-w-xl text-sm leading-relaxed">
              Review your account data and choices before making a permanent
              change.
            </p>
          </header>

          <div className="profile-card overflow-hidden">
            <div className="p-5 sm:p-8">
              {/* Progress Bar */}
              {activePage <= 5 && (
                <div className="border-pana-ink/10 mb-8 space-y-3 border-b-2 pb-6">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-extrabold">
                    <span className="text-pana-indigo tracking-widest uppercase">
                      Account deletion
                    </span>
                    <span className="text-pana-ink/60">
                      Step {effectivePage} of {totalPages}
                    </span>
                  </div>
                  <div
                    role="progressbar"
                    aria-label="Account deletion progress"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={progress}
                    aria-valuetext={`Step ${effectivePage} of ${totalPages}`}
                    className="bg-pana-ink/10 h-2 overflow-hidden rounded-full"
                  >
                    <div
                      className="bg-pana-indigo h-full rounded-full transition-[width] motion-reduce:transition-none"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Page 1 — Warning + Data Summary */}
              {activePage === 1 && (
                <div ref={page1Ref} className="scroll-mt-24 space-y-6">
                  <div className="flex items-center gap-3">
                    <span className="bg-pana-red/10 text-pana-red-deep flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl">
                      <TriangleAlert className="h-6 w-6" aria-hidden="true" />
                    </span>
                    <h2 className="text-pana-red-deep text-2xl font-black">
                      This is permanent.
                    </h2>
                  </div>

                  <p className="leading-relaxed">
                    Deleting your account will permanently remove your profile,
                    posts, and personal data. This action cannot be undone.
                  </p>

                  {/* Wellness note */}
                  <div className="bg-pana-butter-2 text-pana-ink/70 flex items-start gap-3 rounded-2xl p-4 text-sm leading-relaxed">
                    <Heart
                      className="text-pana-burnt mt-0.5 h-5 w-5 shrink-0"
                      aria-hidden="true"
                    />
                    <p>
                      If you&rsquo;re going through a difficult time,
                      you&rsquo;re not alone. The{' '}
                      <strong>988 Suicide &amp; Crisis Lifeline</strong> is
                      available 24/7 &mdash; call or text <strong>988</strong>.
                    </p>
                  </div>

                  {/* Preflight loading / error */}
                  {preflightLoading && (
                    <p
                      role="status"
                      className="text-pana-ink/60 flex items-center gap-2 text-sm font-bold"
                    >
                      <Loader2
                        className="h-4 w-4 animate-spin"
                        aria-hidden="true"
                      />
                      Loading your account data...
                    </p>
                  )}
                  {preflightError && (
                    <div
                      role="alert"
                      className="border-pana-red/35 bg-pana-red/5 text-pana-red-deep rounded-2xl border-2 p-4 text-sm font-bold"
                    >
                      {preflightError}
                    </div>
                  )}

                  {/* Blockers */}
                  {preflight && !preflight.canDelete && (
                    <div className="space-y-2">
                      <h3 className="text-pana-red-deep font-extrabold">
                        You cannot delete your account yet:
                      </h3>
                      {preflight.blockers.map((b, i) => (
                        <div
                          key={i}
                          className="border-pana-red/35 bg-pana-red/5 text-pana-red-deep rounded-2xl border-2 p-4 text-sm font-bold"
                        >
                          {b}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Data summary */}
                  {preflight && (
                    <div className="space-y-3">
                      <h3 className="font-extrabold">Your account data:</h3>
                      <div className="grid gap-3 text-sm sm:grid-cols-2">
                        {preflight.summary.articles.total > 0 && (
                          <div className="border-pana-ink/10 bg-pana-cream/60 rounded-2xl border-2 p-4">
                            <div className="font-extrabold">Articles</div>
                            <div className="text-pana-ink/65 mt-1">
                              {preflight.summary.articles.total} total
                              {preflight.summary.articles.archived > 0 &&
                                ` (${preflight.summary.articles.archived} archived)`}
                            </div>
                          </div>
                        )}
                        {preflight.summary.socialPosts.total > 0 && (
                          <div className="border-pana-ink/10 bg-pana-cream/60 rounded-2xl border-2 p-4">
                            <div className="font-extrabold">Social Posts</div>
                            <div className="text-pana-ink/65 mt-1">
                              {preflight.summary.socialPosts.total} (all will be
                              deleted)
                            </div>
                          </div>
                        )}
                        {preflight.summary.events.hosted > 0 && (
                          <div className="border-pana-ink/10 bg-pana-cream/60 rounded-2xl border-2 p-4">
                            <div className="font-extrabold">Events Hosted</div>
                            <div className="text-pana-ink/65 mt-1">
                              {preflight.summary.events.hosted} total
                              {preflight.summary.events.archived > 0 &&
                                ` (${preflight.summary.events.archived} archived)`}
                            </div>
                          </div>
                        )}
                        {(preflight.summary.mentorSessions.completed > 0 ||
                          preflight.summary.mentorSessions.pending > 0) && (
                          <div className="border-pana-ink/10 bg-pana-cream/60 rounded-2xl border-2 p-4">
                            <div className="font-extrabold">
                              Mentor Sessions
                            </div>
                            <div className="text-pana-ink/65 mt-1">
                              {preflight.summary.mentorSessions.completed +
                                preflight.summary.mentorSessions.pending}{' '}
                              total
                            </div>
                          </div>
                        )}
                        {preflight.summary.mediaFiles > 0 && (
                          <div className="border-pana-ink/10 bg-pana-cream/60 rounded-2xl border-2 p-4">
                            <div className="font-extrabold">Media Files</div>
                            <div className="text-pana-ink/65 mt-1">
                              {preflight.summary.mediaFiles} file(s)
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="border-pana-ink/10 flex flex-col-reverse gap-3 border-t-2 pt-6 sm:flex-row sm:justify-between">
                    <button
                      type="button"
                      className="settings-btn min-h-11 justify-center"
                      data-variant="quiet"
                      onClick={() => router.push('/settings')}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="settings-btn min-h-11 justify-center disabled:pointer-events-none"
                      onClick={goNext}
                      disabled={
                        preflightLoading ||
                        !!preflightError ||
                        (preflight != null && !preflight.canDelete)
                      }
                    >
                      Continue
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              )}

              {/* Page 2 — Attribution Choice */}
              {activePage === 2 && (
                <div ref={page2Ref} className="scroll-mt-24 space-y-6">
                  <h2 className="text-2xl font-black">Your Archived Content</h2>

                  <p>
                    Some of your content has been part of the community record
                    for over 3 months and is preserved under its Creative
                    Commons license. You can choose how your name appears on
                    this content:
                  </p>

                  <RadioGroup
                    aria-label="Archived content attribution"
                    value={attributionChoice}
                    onValueChange={(v) =>
                      setAttributionChoice(v as 'keep' | 'anonymize')
                    }
                    className="gap-3"
                  >
                    <div
                      className={`flex items-start gap-3 rounded-2xl border-2 p-4 ${attributionChoice === 'keep' ? 'border-pana-indigo bg-pana-indigo/5' : 'border-pana-ink/15'}`}
                    >
                      <RadioGroupItem
                        value="keep"
                        id="keep"
                        className="border-pana-indigo text-pana-indigo focus-visible:ring-pana-indigo mt-1 h-5 w-5 shrink-0 border-2 ring-offset-white"
                      />
                      <div>
                        <Label
                          htmlFor="keep"
                          className="text-base font-extrabold"
                        >
                          Keep my name
                        </Label>
                        <p className="text-pana-ink/65 mt-1 text-sm leading-relaxed">
                          Your name stays on archived articles and events. Your
                          profile is cleared of personal data but kept as a
                          minimal attribution record.
                        </p>
                      </div>
                    </div>
                    <div
                      className={`flex items-start gap-3 rounded-2xl border-2 p-4 ${attributionChoice === 'anonymize' ? 'border-pana-indigo bg-pana-indigo/5' : 'border-pana-ink/15'}`}
                    >
                      <RadioGroupItem
                        value="anonymize"
                        id="anonymize"
                        className="border-pana-indigo text-pana-indigo focus-visible:ring-pana-indigo mt-1 h-5 w-5 shrink-0 border-2 ring-offset-white"
                      />
                      <div>
                        <Label
                          htmlFor="anonymize"
                          className="text-base font-extrabold"
                        >
                          Anonymize (Former Member)
                        </Label>
                        <p className="text-pana-ink/65 mt-1 text-sm leading-relaxed">
                          Your name is removed from all archived content. It
                          will show as authored by &ldquo;Former Member&rdquo;.
                        </p>
                      </div>
                    </div>
                  </RadioGroup>

                  <div className="border-pana-ink/10 flex flex-col-reverse gap-3 border-t-2 pt-6 sm:flex-row sm:justify-between">
                    <button
                      type="button"
                      className="settings-btn min-h-11 justify-center"
                      data-variant="quiet"
                      onClick={goPrev}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="settings-btn min-h-11 justify-center"
                      onClick={goNext}
                    >
                      Continue
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              )}

              {/* Page 3 — Third-Party Services */}
              {activePage === 3 && (
                <div ref={page3Ref} className="scroll-mt-24 space-y-6">
                  <h2 className="text-2xl font-black">Third-Party Services</h2>

                  <p>
                    The following connected services will be cleaned up as part
                    of your account deletion:
                  </p>

                  {thirdPartyServices.length > 0 ? (
                    <ul className="border-pana-ink/10 bg-pana-cream/60 marker:text-pana-indigo list-inside list-disc space-y-2 rounded-2xl border-2 p-4 text-sm font-bold">
                      {thirdPartyServices.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="bg-pana-butter-2 text-pana-ink/70 rounded-2xl p-4 text-sm">
                      No third-party services are connected to your account.
                    </p>
                  )}

                  <p className="text-pana-ink/65 text-sm leading-relaxed">
                    Active subscriptions will be cancelled. OAuth connections
                    will be revoked. Marketing contacts will be removed.
                  </p>

                  <div className="border-pana-ink/10 flex flex-col-reverse gap-3 border-t-2 pt-6 sm:flex-row sm:justify-between">
                    <button
                      type="button"
                      className="settings-btn min-h-11 justify-center"
                      data-variant="quiet"
                      onClick={goPrev}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="settings-btn min-h-11 justify-center"
                      onClick={goNext}
                    >
                      Continue
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              )}

              {/* Page 4 — Confirm Email */}
              {activePage === 4 && (
                <div ref={page4Ref} className="scroll-mt-24 space-y-6">
                  <h2 className="text-2xl font-black">Confirm Your Email</h2>

                  <p>
                    To proceed, please type your email address to confirm you
                    want to delete this account.
                  </p>

                  <div className="space-y-2">
                    <Label
                      htmlFor="confirm-email"
                      className="block text-sm font-extrabold break-words"
                    >
                      Email: <strong>{session?.user?.email}</strong>
                    </Label>
                    <input
                      id="confirm-email"
                      className="settings-input"
                      type="email"
                      placeholder="Type your email address"
                      value={confirmEmail}
                      onChange={(e) => setConfirmEmail(e.target.value)}
                      autoComplete="off"
                    />
                  </div>

                  <div className="border-pana-ink/10 flex flex-col-reverse gap-3 border-t-2 pt-6 sm:flex-row sm:justify-between">
                    <button
                      type="button"
                      className="settings-btn min-h-11 justify-center"
                      data-variant="quiet"
                      onClick={goPrev}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="settings-btn min-h-11 justify-center disabled:pointer-events-none"
                      onClick={goNext}
                      disabled={
                        confirmEmail.toLowerCase() !==
                        (session?.user?.email ?? '').toLowerCase()
                      }
                    >
                      Continue
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              )}

              {/* Page 5 — Final Confirmation */}
              {activePage === 5 && (
                <div ref={page5Ref} className="scroll-mt-24 space-y-6">
                  <h2 className="text-pana-red-deep text-2xl font-black">
                    Final Step
                  </h2>

                  <p>
                    You are about to permanently delete your account. All your
                    data will be removed and this cannot be reversed.
                  </p>

                  <div className="bg-pana-butter-2 flex items-start gap-3 rounded-2xl p-4">
                    <Checkbox
                      id="confirm-understand"
                      className="border-pana-indigo ring-offset-pana-butter-2 focus-visible:ring-pana-indigo data-[state=checked]:bg-pana-indigo data-[state=checked]:text-pana-cream mt-0.5 h-5 w-5 border-2"
                      checked={confirmUnderstand}
                      onCheckedChange={(checked) =>
                        setConfirmUnderstand(checked as boolean)
                      }
                      disabled={isSubmitting}
                    />
                    <Label
                      htmlFor="confirm-understand"
                      className="text-sm leading-relaxed font-bold"
                    >
                      I understand this is permanent and cannot be undone.
                    </Label>
                  </div>

                  {deleteError && (
                    <div
                      role="alert"
                      className="border-pana-red/35 bg-pana-red/5 text-pana-red-deep rounded-2xl border-2 p-4 text-sm font-bold"
                    >
                      {deleteError}
                    </div>
                  )}

                  <div className="border-pana-ink/10 flex flex-col-reverse gap-3 border-t-2 pt-6 sm:flex-row sm:justify-between">
                    <button
                      type="button"
                      className="settings-btn min-h-11 justify-center disabled:pointer-events-none"
                      data-variant="quiet"
                      onClick={goPrev}
                      disabled={isSubmitting}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={!confirmUnderstand || isSubmitting}
                      className="border-pana-red-deep bg-pana-red-deep text-pana-cream hover:border-pana-ink hover:bg-pana-ink focus-visible:outline-pana-red-deep inline-flex min-h-11 items-center justify-center gap-2 rounded-full border-2 px-5 py-2 text-sm font-extrabold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-45 motion-reduce:transition-none"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2
                            className="h-4 w-4 animate-spin"
                            aria-hidden="true"
                          />
                          Deleting...
                        </>
                      ) : (
                        <>
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                          Delete My Account
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Page 6 — Done */}
              {activePage === 6 && (
                <div
                  ref={page6Ref}
                  className="scroll-mt-24 space-y-6 py-4 text-center"
                >
                  <div className="bg-pana-indigo/10 text-pana-indigo mx-auto flex h-16 w-16 items-center justify-center rounded-full">
                    <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
                  </div>
                  <h2 className="text-2xl font-black">
                    Your account has been deleted.
                  </h2>

                  <p className="text-pana-ink/65 text-sm leading-relaxed">
                    All your personal data has been removed. Thank you for being
                    part of the Pana MIA community.
                  </p>

                  <div className="pt-4">
                    <Link
                      href="/"
                      className="settings-btn min-h-11 justify-center"
                    >
                      Go to Homepage
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>

          {activePage <= 5 && activePage !== 6 && (
            <p className="text-pana-ink/65 text-center text-sm">
              Changed your mind?{' '}
              <Link
                href="/settings"
                className="text-pana-indigo decoration-pana-indigo/40 hover:decoration-pana-indigo font-extrabold underline underline-offset-4"
              >
                Return to Settings
              </Link>
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
