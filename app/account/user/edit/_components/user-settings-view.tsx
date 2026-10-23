'use client';

import { useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowUpRight,
  BadgeCheck,
  Check,
  Fingerprint,
  Loader2,
  Mail,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { useSession } from '@/lib/auth-client';
import { RotateKeysSection } from '@/components/relay/RotateKeysSection';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { getUserSession, saveUserSession } from '@/lib/user';
import { UserInterface } from '@/lib/interfaces';
import {
  CCLicensePicker,
  type CCLicenseValue,
} from '@/components/legal/CCLicensePicker';
import { useProfile, useMutateDefaultLicense } from '@/lib/query/profile';
import {
  AutoSaved,
  Consequence,
  OnOff,
  ScopeChip,
  SettingsCard,
  SettingsRow,
} from './settings-primitives';
import { SETTINGS_SECTIONS, SettingsNav, type SectionId } from './settings-nav';
import { AvatarEditor } from './avatar-editor';
import { SmsSubscriptionCard } from './sms-subscription-card';
import { ReferralCard } from './referral-card';

// Channels the app manages, spelled as GHL requires. Mirrors GHL_DND_CHANNELS
// in lib/ghl.ts; kept local so this client component does not pull in the
// server-only GHL client.
const DND_CHANNELS = [
  {
    key: 'Email',
    label: 'Email',
    blurb: 'Newsletters and announcements about new features.',
  },
  {
    key: 'WhatsApp',
    label: 'WhatsApp',
    blurb: 'The same reminders, for panas who prefer WhatsApp to SMS.',
  },
  {
    key: 'Call',
    label: 'Phone calls',
    blurb: 'Rare. Mostly vendor logistics for an event you are running.',
  },
] as const;

type DndChannel = (typeof DND_CHANNELS)[number]['key'];

/** Every channel set to the same state, for the all-or-nothing actions. */
function allChannels(
  suppressed: boolean
): Partial<Record<DndChannel, { status: string }>> {
  return Object.fromEntries(
    DND_CHANNELS.map(({ key }) => [
      key,
      { status: suppressed ? 'active' : 'inactive' },
    ])
  );
}

interface GhlContactData {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  source?: string;
  tags?: string[];
  dnd?: boolean;
  dndSettings?: Partial<Record<DndChannel, { status?: string }>>;
}

function sectionFor(id: SectionId) {
  const section = SETTINGS_SECTIONS.find((entry) => entry.id === id);
  if (!section) throw new Error(`No settings section named "${id}".`);
  return section;
}

/* Every section is headed the same way: what it is, where it applies, and one
   sentence about what it is for. */
function Section({ id, children }: { id: SectionId; children: ReactNode }) {
  const section = sectionFor(id);
  return (
    <section id={id} className="settings-section">
      <header className="mb-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 className="text-xl font-black tracking-tight">
            {section.heading}
          </h2>
          <ScopeChip scope={section.scope} />
        </div>
        <p className="settings-note mt-1.5 max-w-2xl">{section.lede}</p>
      </header>
      {children}
    </section>
  );
}

/**
 * Account settings.
 *
 * Replaces a page that was two shadcn cards on white: a form headed "Update
 * Your Account Settings", and a second card headed "Advanced Settings" holding
 * an accordion with four unrelated things in it — change your email, marketing
 * consent, signing keys, and your publishing licence. Three things were wrong
 * with that, and the shape below is an argument about each.
 *
 * 1. IT NEVER SAID WHERE A SETTING APPLIED. This is the one page a member
 *    reaches from both pana.social and social.pana.social, and the surface
 *    switcher already promises "Account settings — applies everywhere". So the
 *    page is organised around scope, and every group states its own.
 *
 * 2. "ADVANCED" IS NOT A CATEGORY. It describes how nervous we were about a
 *    control rather than what the control is for, which is how marketing
 *    consent ended up behind the same summary row as a key rotation. The
 *    accordion is gone; the page is six named sections a member can scan
 *    without opening anything.
 *
 * 3. CONSEQUENCES ARRIVED TOO LATE. Changing a screenname deletes every post
 *    and DM on the account, and that was only said in the dialog *after* the
 *    member had typed a new one and pressed Update. It is now beside the field
 *    the moment the value differs. The dialog still guards the write — this is
 *    what stops it being the first anyone hears of it.
 *
 * The federation domain is passed in rather than read here: getFederationDomain()
 * touches process.env and must stay on the server.
 */
export function UserSettingsView({
  federationDomain,
}: {
  federationDomain: string;
}) {
  const { data: session } = useSession();
  const { toast } = useToast();
  const { t } = useTranslation('toast');
  const [sessionEmail, setSessionEmail] = useState('');
  const [sessionName, setSessionName] = useState('');
  const [userData, setUserData] = useState({} as UserInterface);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [isMigrating, setIsMigrating] = useState(false);
  const [showMigrationDialog, setShowMigrationDialog] = useState(false);
  const [sessionScreenname, setSessionScreenname] = useState('');
  const [changingEmail, setChangingEmail] = useState(false);

  // The profile record. Backs two things here: the default publishing licence
  // below, and the avatar in the header — both live on the profile rather than
  // the account, which is why the page has to fetch it at all.
  const { data: profile, refetch: refetchProfile } = useProfile();
  const avatarUrl = profile?.images?.primaryCDN ?? null;
  const mutateDefaultLicense = useMutateDefaultLicense();
  const [defaultLicense, setDefaultLicense] =
    useState<CCLicenseValue>('cc-by-4');
  const [licenseSaved, setLicenseSaved] = useState(false);
  useEffect(() => {
    if (profile?.defaultCcLicense) setDefaultLicense(profile.defaultCcLicense);
  }, [profile?.defaultCcLicense]);
  const handleDefaultLicenseChange = (license: CCLicenseValue) => {
    setDefaultLicense(license);
    setLicenseSaved(false);
    mutateDefaultLicense.mutate(license, {
      onSuccess: () => setLicenseSaved(true),
    });
  };

  const [screennameStatus, setScreennameStatus] = useState<
    'idle' | 'checking' | 'available' | 'taken' | 'invalid'
  >('idle');
  const [screennameError, setScreennameError] = useState('');

  const setUserSession = async () => {
    try {
      const userSession = await getUserSession();
      if (userSession) {
        setSessionEmail(userSession.email == null ? '' : userSession.email);
        setSessionName(userSession.name == null ? '' : userSession.name);
        setSessionScreenname(
          userSession.screenname == null ? '' : userSession.screenname
        );
        setUserData(userSession);
      }
      setLoadFailed(false);
    } catch (error) {
      /* Every field below stays empty when this fails. Saying so matters more
         than it looks: the form is still editable, so a member who assumed the
         blanks were real could type into it and save a half-empty account over
         a perfectly good one. */
      setLoadFailed(true);
      console.error('Could not load account settings:', error);
    }
  };

  const checkScreennameAvailability = useCallback(async (name: string) => {
    if (!name || name.length < 3) {
      setScreennameStatus('idle');
      setScreennameError('');
      return;
    }

    setScreennameStatus('checking');
    setScreennameError('');

    try {
      const response = await fetch(
        `/api/user/screenname/check?name=${encodeURIComponent(name)}`
      );
      const data = await response.json();

      if (data.available) {
        setScreennameStatus('available');
        setScreennameError('');
      } else {
        setScreennameStatus(
          data.error?.includes('taken') ? 'taken' : 'invalid'
        );
        setScreennameError(data.error || 'Invalid screenname');
      }
    } catch {
      setScreennameStatus('idle');
      setScreennameError('Could not check availability');
    }
  }, []);

  // Debounce screenname check
  useEffect(() => {
    // Skip check if screenname matches the current saved value
    if (sessionScreenname === userData?.screenname) {
      setScreennameStatus('idle');
      setScreennameError('');
      return;
    }

    const timer = setTimeout(() => {
      checkScreennameAvailability(sessionScreenname);
    }, 500);

    return () => clearTimeout(timer);
  }, [sessionScreenname, userData?.screenname, checkScreennameAvailability]);

  const [showScreennameConfirmDialog, setShowScreennameConfirmDialog] =
    useState(false);

  const [ghlContact, setGhlContact] = useState<GhlContactData | null | 'empty'>(
    null
  );
  const [ghlLoading, setGhlLoading] = useState(false);
  const [ghlActionLoading, setGhlActionLoading] = useState<string | null>(null);
  const [showDeleteContactDialog, setShowDeleteContactDialog] = useState(false);
  const [showUnsubscribeDialog, setShowUnsubscribeDialog] = useState(false);

  // Check if screenname is actually changing
  const isScreennameChanging =
    sessionScreenname &&
    userData?.screenname &&
    sessionScreenname.toLowerCase() !== userData.screenname.toLowerCase();

  /* Fields the save bar is responsible for, as opposed to the ones that write
     on change. Nothing is "dirty" until the account has actually loaded, or the
     empty initial state would read as an edit. */
  const loaded = !!userData?._id;
  const isDirty =
    loaded &&
    (sessionName !== (userData.name ?? '') ||
      sessionScreenname !== (userData.screenname ?? ''));

  const revertChanges = () => {
    setSessionName(userData.name ?? '');
    setSessionScreenname(userData.screenname ?? '');
    setMessage('');
  };

  const updateUserSession = async (skipScreennameConfirm = false) => {
    // Validate screenname before saving if it changed
    if (
      sessionScreenname &&
      sessionScreenname !== userData?.screenname &&
      screennameStatus !== 'available'
    ) {
      setMessage('Please choose an available screenname before saving.');
      return;
    }

    // Show confirmation dialog if changing screenname (and user has existing one)
    if (isScreennameChanging && !skipScreennameConfirm) {
      setShowScreennameConfirmDialog(true);
      return;
    }

    setIsLoading(true);
    setMessage('');
    try {
      const response = await saveUserSession({
        name: sessionName,
        screenname: sessionScreenname || undefined,
      });
      setMessage('Settings updated successfully!');
      // The old page printed this inline, where it could sit indefinitely
      // without harm. This one is a floating bar, so it has to leave.
      setTimeout(() => setMessage(''), 4000);
      // Update userData to reflect saved screenname
      if (response) {
        setUserData(response);
      }
    } catch (error: unknown) {
      // Check if it's a rate limit error
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('You can change your screenname again on')) {
        setMessage(errorMessage);
      } else {
        setMessage('Failed to update settings. Please try again.');
      }
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmScreennameChange = () => {
    setShowScreennameConfirmDialog(false);
    updateUserSession(true);
  };

  const fetchGhlContact = useCallback(async () => {
    setGhlLoading(true);
    try {
      const res = await fetch('/api/crm/contact');
      const data = await res.json();
      setGhlContact(res.ok ? (data.data ?? 'empty') : 'empty');
      if (!res.ok) {
        /* A brand-new account reaches onboarding before it has a profile.
           ScreennameGate can briefly mount this settings page on the way
           there, so 404 is an expected empty state rather than an error worth
           carrying into the welcome screen as a destructive toast. */
        if (res.status === 404) return;

        const description =
          res.status === 401
            ? 'Your session has expired. Please sign in again.'
            : 'Could not reach HighLevel, please try again later.';
        toast({
          title: 'Error',
          description,
          variant: 'destructive',
        });
      }
    } catch {
      setGhlContact('empty');
      toast({
        title: 'Error',
        description: 'Could not load your marketing data. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setGhlLoading(false);
    }
    // `toast` is stable, but listing it keeps the dependency honest.
  }, [toast]);

  const handleGhlUnsubscribe = async () => {
    setShowUnsubscribeDialog(false);
    setGhlActionLoading('unsubscribe');
    try {
      const res = await fetch('/api/crm/contact/unsubscribe', {
        method: 'POST',
      });
      if (res.ok) {
        setGhlContact((prev) =>
          prev && prev !== 'empty'
            ? { ...prev, dnd: true, dndSettings: allChannels(true) }
            : prev
        );
        toast({
          title: 'Unsubscribed',
          description:
            'You have been removed from all HighLevel communications.',
        });
      } else {
        toast({
          title: 'Error',
          description: 'Could not reach HighLevel, please try again later.',
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: 'Error',
        description: 'Could not reach HighLevel, please try again later.',
        variant: 'destructive',
      });
    } finally {
      setGhlActionLoading(null);
    }
  };

  const handleGhlChannelToggle = async (
    channel: DndChannel,
    suppressed: boolean
  ) => {
    setGhlActionLoading(`dnd-${channel}`);
    try {
      const res = await fetch('/api/crm/contact/dnd', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, suppressed }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        // The route returns the resulting state of every channel, so adopt it
        // wholesale rather than patching one key — that keeps the UI honest if
        // another channel changed underneath us.
        setGhlContact((prev) =>
          prev && prev !== 'empty'
            ? {
                ...prev,
                dnd: DND_CHANNELS.every((c) => data.data[c.key]),
                dndSettings: Object.fromEntries(
                  DND_CHANNELS.map((c) => [
                    c.key,
                    { status: data.data[c.key] ? 'active' : 'inactive' },
                  ])
                ),
              }
            : prev
        );
        toast({
          title: suppressed ? 'Channel disabled' : 'Channel enabled',
          description: suppressed
            ? `You will no longer receive Panamia messages via ${channel}.`
            : `You will receive Panamia messages via ${channel} again.`,
        });
      } else {
        toast({
          title: 'Error',
          description:
            data.error || 'Could not reach HighLevel, please try again later.',
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: 'Error',
        description: 'Could not reach HighLevel, please try again later.',
        variant: 'destructive',
      });
    } finally {
      setGhlActionLoading(null);
    }
  };

  const handleGhlSubscribe = async () => {
    setGhlActionLoading('subscribe');
    try {
      const res = await fetch('/api/crm/contact/subscribe', {
        method: 'POST',
      });
      if (res.ok) {
        // Mirror the all-channels change into dndSettings so the per-channel
        // rows do not keep showing the pre-click state.
        setGhlContact((prev) =>
          prev && prev !== 'empty'
            ? { ...prev, dnd: false, dndSettings: allChannels(false) }
            : prev
        );
        toast({
          title: 'Subscribed',
          description: 'You will once again receive Panamia communications.',
        });
      } else {
        toast({
          title: 'Error',
          description: 'Could not reach HighLevel, please try again later.',
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: 'Error',
        description: 'Could not reach HighLevel, please try again later.',
        variant: 'destructive',
      });
    } finally {
      setGhlActionLoading(null);
    }
  };

  const handleGhlDeleteContact = async () => {
    setShowDeleteContactDialog(false);
    setGhlActionLoading('delete');
    try {
      const res = await fetch('/api/crm/contact', { method: 'DELETE' });
      if (res.ok) {
        setGhlContact('empty');
        toast({
          title: 'Marketing data deleted',
          description: 'Your marketing record has been removed.',
        });
      } else {
        toast({
          title: 'Error',
          description: 'Could not reach HighLevel, please try again later.',
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: 'Error',
        description: 'Could not reach HighLevel, please try again later.',
        variant: 'destructive',
      });
    } finally {
      setGhlActionLoading(null);
    }
  };

  const handleGhlTriggerTestWorkflow = async () => {
    setGhlActionLoading('test-workflow');
    try {
      const res = await fetch('/api/crm/contact/enroll', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        toast({
          title: 'Workflow triggered',
          description: `Enrolled in workflow ${data.workflowId}.`,
        });
      } else {
        toast({
          title: 'Error',
          description:
            data.error || 'Could not reach HighLevel, please try again later.',
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: 'Error',
        description: 'Could not reach HighLevel, please try again later.',
        variant: 'destructive',
      });
    } finally {
      setGhlActionLoading(null);
    }
  };

  const handleGhlCopyField = async (field: 'name' | 'phone') => {
    setGhlActionLoading(`copy-${field}`);
    try {
      const res = await fetch('/api/crm/contact/copy-field', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({
          title: 'Copied',
          description: `${field === 'name' ? 'Name' : 'Phone'} copied to your profile.`,
        });
      } else {
        toast({
          title: 'Error',
          description:
            data.error || 'Could not reach HighLevel, please try again later.',
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: 'Error',
        description: 'Could not reach HighLevel, please try again later.',
        variant: 'destructive',
      });
    } finally {
      setGhlActionLoading(null);
    }
  };

  const handleEmailMigration = async () => {
    if (!newEmail || newEmail === sessionEmail) {
      toast({
        title: t('invalidEmail'),
        description: t('invalidEmailDiffDesc'),
        variant: 'destructive',
      });
      return;
    }

    setIsMigrating(true);
    setShowMigrationDialog(false);

    try {
      const response = await fetch('/api/user/request-email-migration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newEmail }),
      });

      const data = await response.json();

      if (response.ok) {
        toast({
          title: t('verificationEmailSent'),
          description: t('verificationEmailSentDesc', { email: newEmail }),
        });
        setNewEmail('');
        setChangingEmail(false);
      } else {
        toast({
          title: t('migrationFailed'),
          description: data.error || t('migrationFailedDefault'),
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: t('error'),
        description: t('unexpectedError'),
        variant: 'destructive',
      });
      console.error('Email migration error:', error);
    } finally {
      setIsMigrating(false);
    }
  };

  // Depend on the user id, not the session object — even with the memoized
  // useSession() shim, narrowing to a primitive prevents accidental re-fires
  // if the shim is ever changed.
  const sessionUserId = session?.user?.id;
  useEffect(() => {
    if (sessionUserId) {
      setUserSession();
    }
  }, [sessionUserId]);

  /* Fetched on mount rather than when a disclosure opens.
     The old page only loaded this when the "Marketing Data" accordion row was
     expanded. Those rows are now a visible section, so the data has to be there
     when the member scrolls to it — a section that renders a spinner because
     nobody clicked anything would be worse than the accordion was. */
  useEffect(() => {
    if (sessionUserId) {
      fetchGhlContact();
    }
  }, [sessionUserId, fetchGhlContact]);

  if (!session) {
    return (
      <main className="surface-cream min-h-screen pb-20">
        <div className="container mx-auto max-w-5xl px-4 pt-8">
          <span className="section-eyebrow">Account</span>
          <h1 className="mt-3 text-2xl font-black tracking-tight">
            You need to be signed in
          </h1>
          <p className="settings-note mt-2 max-w-md">
            Your settings live on your account, so there is nothing to show
            until we know whose account it is.
          </p>
          <Link href="/signin" className="settings-btn mt-5 inline-flex">
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  const screennameInputState =
    screennameStatus === 'available'
      ? 'available'
      : screennameStatus === 'taken' || screennameStatus === 'invalid'
        ? 'taken'
        : undefined;

  /* Derived, not stored. Showing it under the field is the only way a member
     finds out *before* they type that renaming here renames them across the
     fediverse. */
  const projectedHandle = `@${sessionScreenname || '…'}@${federationDomain}`;

  const licenseState = mutateDefaultLicense.isPending
    ? 'saving'
    : mutateDefaultLicense.isError
      ? 'error'
      : licenseSaved
        ? 'saved'
        : 'idle';

  return (
    <main className="surface-cream min-h-screen pb-20">
      <div className="container mx-auto max-w-5xl px-4 pt-8">
        <header>
          <span className="section-eyebrow">Account</span>
          {/* The picture sits with the name because it is the same kind of
              fact, and because this is the first place a member looks to
              confirm whose account they are in. */}
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <AvatarEditor
              name={userData?.name || userData?.screenname || ''}
              avatarUrl={avatarUrl}
              onUploaded={refetchProfile}
            />
            <div className="min-w-0">
              <h1 className="text-2xl font-black tracking-tight">
                {userData?.name || userData?.screenname || 'Your account'}
              </h1>
              {userData?.screenname && (
                <p className="text-pana-ink/60 truncate text-[13px] font-extrabold">
                  @{userData.screenname}@{federationDomain}
                </p>
              )}
            </div>
          </div>
          <p className="settings-note mt-4 max-w-2xl">
            There is one of these for your whole account. Everything below
            applies on Pana Mia and Pana Social alike — each section says so
            individually, and means it.
          </p>
        </header>

        {/* The fields below render empty when the load fails, which looks
            exactly like a brand-new account. Without this, the fix is to
            reload the page and there is nothing on screen that says so. */}
        {loadFailed && (
          <div
            role="alert"
            className="border-pana-red/30 bg-pana-red/10 mt-6 rounded-xl border px-4 py-3"
          >
            <p className="text-[13px] font-extrabold">
              We couldn&apos;t load your account.
            </p>
            <p className="settings-note mt-1">
              The fields below are empty because nothing came back — not because
              your account is empty. Don&apos;t save until this loads, or you
              could overwrite what&apos;s already there.
            </p>
            <button
              type="button"
              className="settings-btn mt-3"
              onClick={() => setUserSession()}
            >
              Try again
            </button>
          </div>
        )}

        <div className="mt-8 grid gap-8 lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start">
          <SettingsNav />

          <div className="min-w-0 space-y-12">
            {/* ---- Identity ---------------------------------------------- */}
            <Section id="identity">
              <SettingsCard>
                <SettingsRow
                  label="Name"
                  htmlFor="name"
                  note="Optional. Shown next to your screenname on everything you contribute."
                >
                  <input
                    id="name"
                    type="text"
                    className="settings-input"
                    value={sessionName}
                    maxLength={60}
                    autoComplete="name"
                    onChange={(e) => setSessionName(e.target.value)}
                  />
                </SettingsRow>

                <SettingsRow
                  label="Screenname"
                  htmlFor="screenname"
                  note="Required for contributions. 3–24 characters: letters, numbers, underscores, and hyphens."
                >
                  <div className="relative">
                    <input
                      id="screenname"
                      type="text"
                      className="settings-input pr-10"
                      data-state={screennameInputState}
                      value={sessionScreenname}
                      maxLength={24}
                      autoComplete="username"
                      aria-describedby="screenname-status"
                      placeholder="Choose a unique screenname"
                      onChange={(e) => setSessionScreenname(e.target.value)}
                    />
                    <span className="absolute top-1/2 right-3 -translate-y-1/2">
                      {screennameStatus === 'checking' && (
                        <Loader2
                          className="text-pana-ink/40 h-4 w-4 animate-spin"
                          aria-hidden="true"
                        />
                      )}
                      {screennameStatus === 'available' && (
                        <Check
                          className="text-pana-indigo h-4 w-4"
                          aria-hidden="true"
                        />
                      )}
                      {(screennameStatus === 'taken' ||
                        screennameStatus === 'invalid') && (
                        <X
                          className="text-pana-red h-4 w-4"
                          aria-hidden="true"
                        />
                      )}
                    </span>
                  </div>

                  {/* A fixed slot, so the card does not grow and shrink under
                      the cursor as the availability check resolves. */}
                  <p
                    id="screenname-status"
                    className="settings-note mt-2 min-h-[1.25rem]"
                    aria-live="polite"
                  >
                    {screennameStatus === 'available' && (
                      <span className="text-pana-indigo font-extrabold">
                        @{sessionScreenname} is free.
                      </span>
                    )}
                    {screennameError && (
                      <span className="text-pana-red-deep font-extrabold">
                        {screennameError}
                      </span>
                    )}
                    {screennameStatus === 'checking' && 'Checking…'}
                  </p>

                  <div className="border-pana-ink/10 mt-3 border-t pt-3">
                    <span className="rail-heading">Your handle</span>
                    <p className="settings-readonly mt-1.5">
                      <Fingerprint
                        className="text-pana-ink/45 h-4 w-4 flex-none"
                        aria-hidden="true"
                      />
                      <span className="truncate">{projectedHandle}</span>
                    </p>
                    <p className="settings-note mt-1.5">
                      Built from your screenname. This is the address other
                      fediverse servers know you by, and it is the same on Pana
                      Mia and Pana Social.
                    </p>
                  </div>

                  {/* The moment the field differs, not after the member
                      commits. This block is why the section has this shape. */}
                  {isScreennameChanging && (
                    <div className="mt-3">
                      <Consequence
                        title="Changing your screenname is not free"
                        points={[
                          <>
                            <strong>
                              Every timeline post and direct message on the
                              account is deleted.
                            </strong>{' '}
                            They cannot be recovered.
                          </>,
                          'Articles you have contributed are re-attributed to the new screenname automatically.',
                          'Your old screenname is reserved for you and cannot be claimed by anyone else.',
                          'You can only do this once every 90 days.',
                        ]}
                      />
                    </div>
                  )}
                </SettingsRow>

                {/* The rest of the profile, named so members stop looking for
                    it here. Bio and links are the next two things people
                    arrive on this page hoping to change. */}
                <SettingsRow
                  label="Your public profile"
                  note="Your bio, links, categories, and the location shown on your listing are part of your profile, and are edited together in one place."
                  control={
                    <Link
                      href="/account/profile/edit"
                      className="settings-btn"
                      data-variant="quiet"
                    >
                      Edit profile
                      <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  }
                />
              </SettingsCard>
            </Section>

            {/* ---- Sign-in ----------------------------------------------- */}
            <Section id="signin">
              <SettingsCard>
                <SettingsRow
                  label="Email"
                  note="Private. Never shown to other members, and never printed on anything you publish."
                  control={
                    <button
                      type="button"
                      className="settings-btn"
                      data-variant="quiet"
                      onClick={() => setChangingEmail((open) => !open)}
                    >
                      {changingEmail ? 'Cancel' : 'Change email'}
                    </button>
                  }
                >
                  <p className="settings-readonly">
                    <BadgeCheck
                      className="text-pana-indigo h-4 w-4 flex-none"
                      aria-hidden="true"
                    />
                    <span className="truncate">{sessionEmail}</span>
                    <span
                      className="identity-pill ml-auto"
                      data-tone="verified"
                    >
                      Verified
                    </span>
                  </p>

                  {changingEmail && (
                    <div className="border-pana-ink/10 mt-3 border-t pt-3">
                      <label className="rail-heading" htmlFor="new-email">
                        New email address
                      </label>
                      <input
                        id="new-email"
                        type="email"
                        className="settings-input mt-1.5"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="you@example.com"
                        disabled={isMigrating}
                      />
                      <div className="mt-3">
                        <Consequence
                          title="You will need to confirm the new address"
                          points={[
                            'A verification link goes to the new address, and expires in 5 minutes.',
                            'You will be signed out of all devices once the change completes.',
                            'A confirmation is sent to your current address as well.',
                          ]}
                        />
                      </div>
                      <button
                        type="button"
                        className="settings-btn mt-3"
                        disabled={!newEmail || isMigrating}
                        onClick={() => setShowMigrationDialog(true)}
                      >
                        {isMigrating ? (
                          <Loader2
                            className="h-3.5 w-3.5 animate-spin"
                            aria-hidden="true"
                          />
                        ) : (
                          <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        {isMigrating
                          ? 'Sending verification…'
                          : 'Send verification link'}
                      </button>
                    </div>
                  )}
                </SettingsRow>

                {/* Key rotation is genuinely advanced — but "advanced" is a
                    property of this one control, so it is said here, on it,
                    rather than used as the name of a drawer holding four
                    unrelated things. */}
                <SettingsRow
                  label="Nostr keys"
                  note="Your posts are signed with these. Rotate them if you think your key has been exposed."
                >
                  <div className="border-pana-ink/10 mt-1 rounded-2xl border-2 border-dashed p-3">
                    <RotateKeysSection context="inline" />
                  </div>
                </SettingsRow>
              </SettingsCard>
            </Section>

            {/* ---- Publishing -------------------------------------------- */}
            <Section id="publishing">
              <SettingsCard>
                <SettingsRow
                  label="Default licence"
                  note="Pre-selected when you compose an article or a post. You can still override it on any individual piece."
                  control={<AutoSaved state={licenseState} />}
                >
                  <CCLicensePicker
                    value={defaultLicense}
                    onChange={handleDefaultLicenseChange}
                    disabled={mutateDefaultLicense.isPending}
                  />
                </SettingsRow>
              </SettingsCard>
            </Section>

            {/* ---- Messages ---------------------------------------------- */}
            <Section id="messages">
              <SmsSubscriptionCard onChanged={fetchGhlContact} />
              <div className="mt-3">
                {ghlLoading || ghlContact === null ? (
                  <SettingsCard>
                    <div className="settings-row settings-note flex items-center gap-2">
                      <Loader2
                        className="h-4 w-4 animate-spin"
                        aria-hidden="true"
                      />
                      Loading your preferences…
                    </div>
                  </SettingsCard>
                ) : ghlContact === 'empty' ? (
                  <SettingsCard>
                    <div className="settings-row settings-note">
                      We hold no other marketing record for you.
                    </div>
                  </SettingsCard>
                ) : (
                  <>
                    <SettingsCard>
                      {DND_CHANNELS.map(({ key, label, blurb }) => {
                        const suppressed =
                          ghlContact.dndSettings?.[key]?.status === 'active';
                        return (
                          <SettingsRow
                            key={key}
                            label={label}
                            note={blurb}
                            control={
                              <OnOff
                                label={`${label} messages`}
                                value={!suppressed}
                                disabled={!!ghlActionLoading}
                                busy={ghlActionLoading === `dnd-${key}`}
                                onChange={(next) =>
                                  handleGhlChannelToggle(key, !next)
                                }
                              />
                            }
                          />
                        );
                      })}

                      <SettingsRow
                        label={
                          ghlContact.dnd
                            ? 'Turn other channels on'
                            : 'Turn everything off'
                        }
                        note={
                          ghlContact.dnd
                            ? 'Start receiving Pana Mia email, WhatsApp messages and calls again. Text consent is managed above.'
                            : 'A complete opt-out of all Pana Mia messages, including announcements and news about projects that are not on this site. Sign-in links you ask for yourself still arrive.'
                        }
                        control={
                          ghlContact.dnd ? (
                            <button
                              type="button"
                              className="settings-btn"
                              disabled={!!ghlActionLoading}
                              onClick={handleGhlSubscribe}
                            >
                              {ghlActionLoading === 'subscribe' && (
                                <Loader2
                                  className="h-3.5 w-3.5 animate-spin"
                                  aria-hidden="true"
                                />
                              )}
                              Subscribe
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="settings-btn"
                              data-variant="danger"
                              disabled={!!ghlActionLoading}
                              onClick={() => setShowUnsubscribeDialog(true)}
                            >
                              {ghlActionLoading === 'unsubscribe' && (
                                <Loader2
                                  className="h-3.5 w-3.5 animate-spin"
                                  aria-hidden="true"
                                />
                              )}
                              Turn all off
                            </button>
                          )
                        }
                      />
                    </SettingsCard>

                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                      <AutoSaved state="idle" />
                      <p className="settings-note">
                        Changes can take up to 24 hours to take effect.{' '}
                        <Link
                          href="/legal/privacy#sharing"
                          className="text-pana-indigo font-extrabold underline"
                        >
                          How marketing data is shared
                        </Link>
                      </p>
                    </div>
                  </>
                )}
              </div>
            </Section>

            {/* ---- Referrals -------------------------------------------- */}
            <Section id="referrals">
              <ReferralCard />
            </Section>

            {/* ---- Data -------------------------------------------------- */}
            <Section id="data">
              {ghlLoading || ghlContact === null ? (
                <SettingsCard>
                  <div className="settings-row settings-note flex items-center gap-2">
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                    Loading…
                  </div>
                </SettingsCard>
              ) : ghlContact === 'empty' ? (
                <SettingsCard>
                  <div className="settings-row settings-note">
                    No marketing data on file.
                  </div>
                </SettingsCard>
              ) : (
                <>
                  <SettingsCard>
                    <SettingsRow
                      label="Marketing record"
                      note="Held in HighLevel, our mailing tool. This is everything in it."
                    >
                      <dl className="border-pana-ink/10 mt-1 divide-y-2 divide-dashed border-t-2 border-dashed">
                        {(ghlContact.firstName || ghlContact.lastName) && (
                          <RecordRow
                            label="Name"
                            value={[ghlContact.firstName, ghlContact.lastName]
                              .filter(Boolean)
                              .join(' ')}
                          />
                        )}
                        {ghlContact.email && (
                          <RecordRow label="Email" value={ghlContact.email} />
                        )}
                        {ghlContact.phone && (
                          <RecordRow label="Phone" value={ghlContact.phone} />
                        )}
                        {ghlContact.source && (
                          <RecordRow
                            label="How you got here"
                            value={ghlContact.source}
                          />
                        )}
                      </dl>
                      {/* Tags are internal marketing segmentation and not
                          meaningful to the account holder, so they stay
                          suppressed. The API still returns them. */}
                    </SettingsRow>

                    {(ghlContact.firstName ||
                      ghlContact.lastName ||
                      ghlContact.phone) && (
                      <SettingsRow
                        label="Reuse it on your profile"
                        note="Copies the value above into your public profile, where it is yours to edit."
                      >
                        <div className="flex flex-wrap gap-2">
                          {(ghlContact.firstName || ghlContact.lastName) && (
                            <button
                              type="button"
                              className="settings-btn"
                              data-variant="quiet"
                              disabled={!!ghlActionLoading}
                              onClick={() => handleGhlCopyField('name')}
                            >
                              {ghlActionLoading === 'copy-name' && (
                                <Loader2
                                  className="h-3.5 w-3.5 animate-spin"
                                  aria-hidden="true"
                                />
                              )}
                              Copy name to profile
                            </button>
                          )}
                          {ghlContact.phone && (
                            <button
                              type="button"
                              className="settings-btn"
                              data-variant="quiet"
                              disabled={!!ghlActionLoading}
                              onClick={() => handleGhlCopyField('phone')}
                            >
                              {ghlActionLoading === 'copy-phone' && (
                                <Loader2
                                  className="h-3.5 w-3.5 animate-spin"
                                  aria-hidden="true"
                                />
                              )}
                              Copy phone to profile
                            </button>
                          )}
                          <button
                            type="button"
                            className="settings-btn"
                            data-variant="quiet"
                            disabled={!!ghlActionLoading}
                            onClick={handleGhlTriggerTestWorkflow}
                          >
                            {ghlActionLoading === 'test-workflow' && (
                              <Loader2
                                className="h-3.5 w-3.5 animate-spin"
                                aria-hidden="true"
                              />
                            )}
                            Trigger test workflow
                          </button>
                        </div>
                      </SettingsRow>
                    )}
                  </SettingsCard>

                  {/* Deletion gets its own card rather than a last row above,
                      because a rule between two rows is not enough separation
                      between "reuse this" and "erase this". */}
                  <div className="mt-4">
                    <SettingsCard danger>
                      <SettingsRow
                        label="Delete your marketing record"
                        note="Permanently removes the contact above from HighLevel. Your Pana Mia account, your posts, and your listings are untouched."
                        control={
                          <button
                            type="button"
                            className="settings-btn"
                            data-variant="danger"
                            disabled={!!ghlActionLoading}
                            onClick={() => setShowDeleteContactDialog(true)}
                          >
                            {ghlActionLoading === 'delete' ? (
                              <Loader2
                                className="h-3.5 w-3.5 animate-spin"
                                aria-hidden="true"
                              />
                            ) : (
                              <Trash2
                                className="h-3.5 w-3.5"
                                aria-hidden="true"
                              />
                            )}
                            Delete record
                          </button>
                        }
                      />
                    </SettingsCard>
                  </div>
                </>
              )}

              <p className="settings-note mt-3">
                <Link
                  href="/legal/privacy"
                  className="text-pana-indigo font-extrabold underline"
                >
                  What we collect and why
                </Link>
              </p>
            </Section>

            {userData?.affiliate?.code && (
              <div className="settings-note" hidden>
                Affiliate Code: {userData.affiliate.code}
              </div>
            )}
          </div>
        </div>

        {/* The save bar. Present only when something is unsaved, which is the
            difference between it and the old page's permanently enabled
            "Update" button: a button that is always available cannot tell you
            whether you have pending changes, and on a page this long that is
            the one thing you need it to tell you. */}
        {(isDirty || message) && (
          <div className="settings-savebar" role="status">
            <span>{message || 'You have unsaved changes.'}</span>
            {isDirty && (
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="settings-btn"
                  data-variant="quiet"
                  onClick={revertChanges}
                  disabled={isLoading}
                >
                  <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Discard
                </button>
                <button
                  type="button"
                  className="settings-btn"
                  onClick={() => updateUserSession()}
                  disabled={isLoading}
                >
                  {isLoading && (
                    <Loader2
                      className="h-3.5 w-3.5 animate-spin"
                      aria-hidden="true"
                    />
                  )}
                  {isLoading ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Screenname change confirmation. The facts in it are now also beside
          the field, so this is a last check rather than a briefing. */}
      <AlertDialog
        open={showScreennameConfirmDialog}
        onOpenChange={setShowScreennameConfirmDialog}
      >
        {/* Explicit bg-white / dark:bg-zinc-900 — bg-background can appear
            transparent due to CSS layer specificity (see ConsentModal.tsx) */}
        <AlertDialogContent className="bg-white dark:bg-zinc-900">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm screenname change</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  <strong>Current:</strong> @{userData?.screenname}
                </p>
                <p>
                  <strong>New:</strong> @{sessionScreenname}
                </p>
                <div className="flex gap-2 rounded-lg bg-amber-50 p-4 dark:bg-amber-950">
                  <AlertCircle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                  <ul className="list-disc space-y-1 pl-5 text-sm text-amber-700 dark:text-amber-300">
                    <li>
                      <strong>
                        All timeline posts and direct messages will be deleted.
                      </strong>
                    </li>
                    <li>
                      Contributed articles will be updated with your new
                      screenname.
                    </li>
                    <li>
                      Your old screenname will be reserved and cannot be claimed
                      by others.
                    </li>
                    <li>
                      You can only change your screenname once every 90 days.
                    </li>
                  </ul>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmScreennameChange}
              className="bg-amber-600 text-white hover:bg-amber-700"
            >
              Confirm change
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={showMigrationDialog}
        onOpenChange={setShowMigrationDialog}
      >
        <AlertDialogContent className="bg-white dark:bg-zinc-900">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm email change</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  <strong>Current email:</strong> {sessionEmail}
                </p>
                <p>
                  <strong>New email:</strong> {newEmail}
                </p>
                <div className="rounded-lg bg-amber-50 p-4 dark:bg-amber-950">
                  <p className="mb-2 font-semibold text-amber-900 dark:text-amber-100">
                    What happens next:
                  </p>
                  <ol className="list-decimal space-y-1 pl-5 text-sm text-amber-800 dark:text-amber-200">
                    <li>
                      We&apos;ll send a verification link to{' '}
                      <strong>{newEmail}</strong>
                    </li>
                    <li>You must click it within 5 minutes</li>
                    <li>You&apos;ll be signed out of all devices</li>
                    <li>
                      A confirmation will be sent to{' '}
                      <strong>{sessionEmail}</strong>
                    </li>
                  </ol>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleEmailMigration}>
              Send verification link
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={showUnsubscribeDialog}
        onOpenChange={setShowUnsubscribeDialog}
      >
        <AlertDialogContent className="bg-white dark:bg-zinc-900">
          <AlertDialogHeader>
            <AlertDialogTitle>Turn off all marketing messages</AlertDialogTitle>
            <AlertDialogDescription>
              This is a complete opt-out of <strong>all</strong> Panamia
              messages — including announcements, newsletters, and
              communications about non-website projects — across email, SMS,
              WhatsApp, and calls. The only messages you&apos;ll still receive
              are email sign-in links you request yourself.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleGhlUnsubscribe}>
              Turn all off
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={showDeleteContactDialog}
        onOpenChange={setShowDeleteContactDialog}
      >
        <AlertDialogContent className="bg-white dark:bg-zinc-900">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete marketing data</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes your contact record from HighLevel. You
              will no longer receive marketing emails from Panamia. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleGhlDeleteContact}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function RecordRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-6 gap-y-1 py-2">
      <dt className="settings-note">{label}</dt>
      <dd className="text-[13px] font-extrabold">{value}</dd>
    </div>
  );
}
