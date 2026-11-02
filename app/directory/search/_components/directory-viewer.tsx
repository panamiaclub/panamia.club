'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Check, UserPlus } from 'lucide-react';
import { useSession } from '@/lib/auth-client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { fetchDirectorySignalStates } from '@/lib/directory-signals';
import { toast } from '@/hooks/use-toast';

/**
 * Who is browsing the directory, and what they have already saved.
 *
 * The profile page asks the same questions one listing at a time. Search shows
 * the complete browsing collection, so state is keyed by profile id and read in
 * bounded batches — see app/api/listings/signals/route.ts. The search payload
 * itself is edge-cached and shared, so nothing viewer-specific can come from
 * it; this provider layers the personal answer on top.
 */

/**
 * `business` is a real state, not a hypothetical: an account can exist to
 * manage a listing without there being a person behind it in the social graph.
 * Saving is a personal act, so a business-only account is gated the same as a
 * stranger — it just gets different copy, because telling someone who is
 * already signed in to "sign up" reads as broken.
 */
export type ViewerKind = 'anon' | 'directory' | 'pana';

export type GateAction = 'save' | 'recommend';

/**
 * Who the blocked action was about.
 *
 * A profile page has one business and can name it once. The directory has a
 * screenful, so the subject travels with the call — by the time the dialog has
 * covered the page, the pitch only lands if you still remember which business
 * you were about to save.
 */
export interface GateSubject {
  name: string;
  logo: string | null;
}

interface ListingState {
  saved: boolean;
  isOwner: boolean;
}

interface DirectoryViewerValue {
  viewer: ViewerKind;
  /**
   * Whether pana-only controls should be rendered at all.
   *
   * Not the same question as "may they act". A signed-out visitor still sees
   * Save, because clicking it is how they find out the account is worth
   * having — the gate is the pitch. A business-only account never can, so
   * showing it a button that always refuses is a trap with a nice label on it.
   */
  showsPanaActions: boolean;
  /** `true` when the viewer may proceed; otherwise opens the signup dialog. */
  requirePana: (action: GateAction, subject: GateSubject) => boolean;
  isSaved: (profileId: string) => boolean;
  isOwner: (profileId: string) => boolean;
  /**
   * Live save count. Falls back to the figure from the cached search payload
   * until this viewer's own toggle moves it.
   */
  saveCount: (profileId: string, fallback: number) => number;
  toggleSave: (profileId: string, subject: GateSubject) => void;
}

const DirectoryViewerContext = createContext<DirectoryViewerValue | null>(null);

export function useDirectoryViewer(): DirectoryViewerValue {
  const value = useContext(DirectoryViewerContext);
  if (!value) {
    throw new Error(
      'useDirectoryViewer must be used inside <DirectoryViewerProvider>'
    );
  }
  return value;
}

interface ProviderProps {
  /** Complete matching collection, stable across viewport changes. */
  profileIds: string[];
  children: ReactNode;
}

export function DirectoryViewerProvider({
  profileIds,
  children,
}: ProviderProps) {
  const { data: session, status } = useSession();
  const [blocked, setBlocked] = useState<{
    action: GateAction;
    subject: GateSubject;
  } | null>(null);
  /**
   * null until the server answers. Distinct from `false`: "we have not asked
   * yet" and "this account may not signal" lead to different UI, and
   * collapsing them makes a signed-in pana's Save buttons vanish and reappear
   * on every search.
   */
  const [maySignal, setMaySignal] = useState<boolean | null>(null);
  const [listings, setListings] = useState<Record<string, ListingState>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});

  const userId = session?.user?.id;

  // Sorted and joined so re-running a search that returns the same listings in
  // a different order does not refetch. The identity of the set is what
  // matters, not its arrangement.
  const idKey = useMemo(() => [...profileIds].sort().join(','), [profileIds]);

  useEffect(() => {
    if (status === 'loading') return;

    if (!userId) {
      setMaySignal(false);
      setListings({});
      return;
    }

    if (!idKey) {
      // Still worth asking: maySignal is viewer-global, and an empty result
      // page should not leave the provider unable to say whether the next one
      // will show Save buttons.
      setMaySignal(null);
    }

    let cancelled = false;
    const controller = new AbortController();

    fetchDirectorySignalStates(idKey ? idKey.split(',') : [], controller.signal)
      .then((data) => {
        if (cancelled) return;
        setMaySignal(data.maySignal);
        setListings(data.listings);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error('Could not load directory saved listings:', error);
        toast({
          title: 'Could not load your saved listings',
          description:
            'Refresh the page to retry. Public listings are still available.',
          variant: 'destructive',
        });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [idKey, userId, status]);

  const viewer: ViewerKind =
    status !== 'loading' && !userId
      ? 'anon'
      : maySignal === true
        ? 'pana'
        : maySignal === false && userId
          ? 'directory'
          : 'anon';

  // True only once we know which of the three states applies. Until then the
  // pana controls stay rendered: hiding them on arrival and putting them back
  // a moment later is a worse first impression than a button that opens the
  // signup dialog once in the first few hundred milliseconds.
  const resolvedViewer = status !== 'loading' && maySignal !== null;

  const requirePana = useCallback(
    (action: GateAction, subject: GateSubject) => {
      if (viewer === 'pana') return true;
      if (userId && maySignal === null) {
        toast({
          title: 'Your saved listings are not ready yet',
          description:
            'Please try again shortly, or refresh the page to retry.',
        });
        return false;
      }
      // Reached by signed-out visitors, and kept as a backstop for business
      // accounts: the UI no longer renders anything they could click, but
      // enforcement should not depend on a component remembering to hide a
      // button.
      setBlocked({ action, subject });
      return false;
    },
    [viewer, userId, maySignal]
  );

  // Read inside the toggle without making it a dependency — otherwise every
  // save would rebuild the callback and re-render every card.
  const listingsRef = useRef(listings);
  listingsRef.current = listings;

  const toggleSave = useCallback(
    (profileId: string, subject: GateSubject) => {
      if (!requirePana('save', subject)) return;

      const on = !listingsRef.current[profileId]?.saved;

      // Optimistic: a save that takes a round trip to show up feels broken,
      // and the server is the authority either way — its count overwrites
      // this as soon as it lands.
      setListings((current) => ({
        ...current,
        [profileId]: {
          isOwner: current[profileId]?.isOwner ?? false,
          saved: on,
        },
      }));

      fetch(`/api/listings/${profileId}/signals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'save', on }),
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((payload) => {
          if (!payload?.success) throw new Error('refused');
          setCounts((current) => ({
            ...current,
            [profileId]: payload.data.saves,
          }));
        })
        .catch(() => {
          // Roll back rather than leave a state the server never agreed to.
          setListings((current) => ({
            ...current,
            [profileId]: {
              isOwner: current[profileId]?.isOwner ?? false,
              saved: !on,
            },
          }));
        });
    },
    [requirePana]
  );

  const value = useMemo<DirectoryViewerValue>(
    () => ({
      viewer,
      showsPanaActions: !resolvedViewer || viewer !== 'directory',
      requirePana,
      isSaved: (profileId) => listings[profileId]?.saved ?? false,
      isOwner: (profileId) => listings[profileId]?.isOwner ?? false,
      saveCount: (profileId, fallback) => counts[profileId] ?? fallback,
      toggleSave,
    }),
    [viewer, resolvedViewer, requirePana, listings, counts, toggleSave]
  );

  return (
    <DirectoryViewerContext.Provider value={value}>
      {children}
      <SignupDialog
        action={blocked?.action ?? null}
        subject={blocked?.subject ?? null}
        viewer={viewer}
        onClose={() => setBlocked(null)}
      />
    </DirectoryViewerContext.Provider>
  );
}

interface SignupDialogProps {
  action: GateAction | null;
  subject: GateSubject | null;
  viewer: ViewerKind;
  onClose: () => void;
}

/**
 * The interruption itself. Shares its copy with the profile page's gate so the
 * two never drift into saying different things about the same account.
 *
 * It names the action, it names the business, and it is dismissible with "Keep
 * browsing" rather than "No thanks" — the directory works fine signed out and
 * should say so. A dead-end modal on a public listing would cost the business
 * the visit.
 */
function SignupDialog({ action, subject, viewer, onClose }: SignupDialogProps) {
  const { t } = useTranslation('profile');

  // Keep the last action *and* subject while the dialog animates out.
  // Otherwise the copy blanks for the duration of the close transition, and
  // here — where the subject changes per card — the logo would flip to a
  // different business on the way out.
  const [last, setLast] = useState<{
    action: GateAction;
    subject: GateSubject;
  }>({ action: 'save', subject: { name: '', logo: null } });

  if (action && subject) {
    if (action !== last.action || subject.name !== last.subject.name) {
      setLast({ action, subject });
    }
  }

  const resolved = action ?? last.action;
  const shown = (action && subject) || last.subject;
  // Pairs with the backstop in `requirePana`. A business account should no
  // longer be able to open this dialog at all, but if one does, it must not be
  // told to "sign up" when it is already signed in.
  const signedInAsDirectory = viewer === 'directory';

  return (
    <Dialog open={action !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="bizprofile-gate">
        <div className="bizprofile-gate-head">
          {shown.logo && (
            <span className="bizprofile-gate-logo">
              <Image
                src={shown.logo}
                alt=""
                width={44}
                height={44}
                aria-hidden="true"
              />
            </span>
          )}
          <span className="bizprofile-gate-biz">{shown.name}</span>
        </div>

        <span className="section-eyebrow mt-6">
          {t(`gate.eyebrow.${resolved}`)}
        </span>

        <DialogTitle className="bizprofile-gate-title">
          {signedInAsDirectory ? t('gate.titleDirectory') : t('gate.title')}
        </DialogTitle>

        <DialogDescription className="bizprofile-gate-reason">
          {signedInAsDirectory
            ? `${t('gate.reasonDirectoryPrefix')} ${t(`gate.reason.${resolved}`)}`
            : t(`gate.reason.${resolved}`)}
        </DialogDescription>

        {!signedInAsDirectory && (
          <ul className="bizprofile-gate-list">
            {(['save', 'recommend', 'follow'] as const).map((perk) => (
              <li key={perk}>
                <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                {t(`gate.perks.${perk}`)}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <Button
            size="lg"
            asChild
            className="bg-pana-flame text-pana-ink hover:bg-pana-burnt flex-1 rounded-full font-extrabold"
          >
            <Link href="/welcome">
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              {signedInAsDirectory
                ? t('gate.addPanaAccount')
                : t('gate.becomeAPana')}
            </Link>
          </Button>

          {!signedInAsDirectory && (
            <Button
              size="lg"
              variant="outline"
              asChild
              className="border-pana-ink/25 text-pana-ink hover:bg-pana-butter-2 flex-1 rounded-full border-2 bg-white font-extrabold"
            >
              <Link href="/signin">{t('gate.haveOne')}</Link>
            </Button>
          )}
        </div>

        <button
          type="button"
          className="bizprofile-gate-dismiss"
          onClick={onClose}
        >
          {t('gate.dismiss')}
        </button>
      </DialogContent>
    </Dialog>
  );
}
