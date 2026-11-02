'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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

/**
 * Who is looking at this profile, and what they have already done to it.
 *
 * All of it lives on the client on purpose. The profile page is edge-cached
 * for five minutes and shared by every visitor (see page.tsx), so nothing
 * viewer-specific can be rendered on the server — the first visitor's identity
 * would be served to everyone until the cache expired. The server sends the
 * public counts; this provider layers the personal answer on top.
 */

/**
 * `business` is a real state, not a hypothetical: an account can exist to
 * manage a listing without there being a person behind it in the social graph.
 * Saving and recommending are personal acts, so a business-only account is
 * gated the same as a stranger — it just gets different copy, because telling
 * someone who is already signed in to "sign up" reads as broken.
 */
export type ViewerKind = 'anon' | 'directory' | 'pana';

/**
 * The actions that write something to your pana identity.
 *
 * Note what is deliberately absent: the outbound links, Share, and the event
 * cards. Those either send people to the business or cost the visitor nothing,
 * and a directory that demands an account before it will tell you a
 * restaurant's address has forgotten who it is for. The gate exists to protect
 * the integrity of counts and the social graph, not to harvest signups.
 */
export type GateAction = 'save' | 'recommend' | 'react' | 'reply' | 'boost';

interface SignalState {
  saves: number;
  recommends: number;
  saved: boolean;
  recommended: boolean;
}

interface ViewerValue {
  viewer: ViewerKind;
  isPana: boolean;
  /**
   * Whether pana-only controls should be rendered at all.
   *
   * This is not the same question as "may they act". A signed-out visitor
   * still sees Save and Recommend, because clicking one is how they find out
   * the account is worth having — the gate is the pitch. A business-only
   * account never can, no matter how many times it asks, so showing it a
   * button that always refuses is just a trap with a nice label on it.
   */
  showsPanaActions: boolean;
  /**
   * Returns `true` when the viewer may proceed. Returns `false` and opens the
   * signup dialog when they may not, so callers read as a plain guard:
   *
   *   if (!requirePana('save')) return;
   */
  requirePana: (action: GateAction) => boolean;
  signals: SignalState;
  /** Toggle a save or recommendation. No-op when the gate refuses. */
  toggleSignal: (kind: 'save' | 'recommend') => void;
  /**
   * Whether this viewer administers the listing, which unlocks the owner-only
   * affordances (currently the photo upload tile).
   *
   * Starts false and only ever turns on, so the server render and the first
   * client render agree and nobody sees an owner control flicker away.
   */
  isOwner: boolean;
}

const ViewerContext = createContext<ViewerValue | null>(null);

export function useProfileViewer(): ViewerValue {
  const value = useContext(ViewerContext);
  if (!value) {
    throw new Error('useProfileViewer must be used inside <ProfileViewer>');
  }
  return value;
}

interface ProfileViewerProps {
  profileId: string;
  businessName: string;
  businessLogo: string | null;
  /**
   * Counts as of the cached server render. Used as the starting value so the
   * numbers are correct in the first paint and never flash a zero, then
   * replaced by the live figures once the viewer's own state arrives.
   */
  initialSaves: number;
  initialRecommends: number;
  preview?: boolean;
  children: ReactNode;
}

export function ProfileViewer({
  profileId,
  businessName,
  businessLogo,
  initialSaves,
  initialRecommends,
  preview = false,
  children,
}: ProfileViewerProps) {
  const { data: session, status } = useSession();
  const [blockedAction, setBlockedAction] = useState<GateAction | null>(null);
  /**
   * null until the server answers. Distinct from `false`: "we have not asked
   * yet" and "this account may not signal" lead to different UI, and
   * collapsing them makes a signed-in pana's buttons vanish and reappear on
   * every page load.
   */
  const [maySignal, setMaySignal] = useState<boolean | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [signals, setSignals] = useState<SignalState>({
    saves: initialSaves,
    recommends: initialRecommends,
    saved: false,
    recommended: false,
  });

  const userId = session?.user?.id;

  // Whether this account may act is a server question — it depends on which
  // profile they are currently acting as, which lives in an httpOnly cookie
  // the browser cannot read. The signals endpoint already answers it, so the
  // viewer kind is derived from that rather than guessed here.
  useEffect(() => {
    if (preview || status === 'loading') return;

    if (!userId) {
      setMaySignal(false);
      setSignals((current) => ({
        ...current,
        saved: false,
        recommended: false,
      }));
      return;
    }

    let cancelled = false;

    fetch(`/api/listings/${profileId}/signals`)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (cancelled || !payload?.success) return;
        const data = payload.data as SignalState & {
          maySignal: boolean;
          isOwner: boolean;
        };
        setMaySignal(data.maySignal);
        setIsOwner(data.isOwner);
        setSignals({
          saves: data.saves,
          recommends: data.recommends,
          saved: data.saved,
          recommended: data.recommended,
        });
      })
      .catch(() => {
        // Leave the server-rendered counts in place. A failed lookup should
        // cost the viewer their own state, not the public numbers.
      });

    return () => {
      cancelled = true;
    };
  }, [profileId, userId, status, preview]);

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
    (action: GateAction) => {
      if (preview) return false;
      if (viewer === 'pana') return true;
      // Reached by signed-out visitors, and kept as a backstop for business
      // accounts: the UI no longer renders anything they could click, but
      // enforcement should not depend on a component remembering to hide a
      // button.
      setBlockedAction(action);
      return false;
    },
    [viewer, preview]
  );

  const toggleSignal = useCallback(
    (kind: 'save' | 'recommend') => {
      if (!requirePana(kind)) return;

      const on = kind === 'save' ? !signals.saved : !signals.recommended;

      // Optimistic: a save that takes a round trip to show up feels broken,
      // and the server is the authority either way — its counts overwrite
      // these as soon as they land.
      setSignals((current) => ({
        ...current,
        ...(kind === 'save'
          ? { saved: on, saves: current.saves + (on ? 1 : -1) }
          : {
              recommended: on,
              recommends: current.recommends + (on ? 1 : -1),
            }),
      }));

      fetch(`/api/listings/${profileId}/signals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, on }),
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((payload) => {
          if (!payload?.success) throw new Error('refused');
          setSignals((current) => ({
            ...current,
            saves: payload.data.saves,
            recommends: payload.data.recommends,
          }));
        })
        .catch(() => {
          // Roll back rather than leave a number the server never agreed to.
          setSignals((current) => ({
            ...current,
            ...(kind === 'save'
              ? { saved: !on, saves: current.saves + (on ? -1 : 1) }
              : {
                  recommended: !on,
                  recommends: current.recommends + (on ? -1 : 1),
                }),
          }));
        });
    },
    [profileId, requirePana, signals.saved, signals.recommended]
  );

  const value = useMemo(
    () => ({
      viewer,
      isPana: !preview && viewer === 'pana',
      showsPanaActions: !preview && (!resolvedViewer || viewer !== 'directory'),
      requirePana,
      signals,
      toggleSignal,
      isOwner: !preview && isOwner,
    }),
    [
      viewer,
      resolvedViewer,
      requirePana,
      signals,
      toggleSignal,
      isOwner,
      preview,
    ]
  );

  return (
    <ViewerContext.Provider value={value}>
      {children}
      {!preview && (
        <SignupDialog
          action={blockedAction}
          viewer={viewer}
          businessName={businessName}
          businessLogo={businessLogo}
          onClose={() => setBlockedAction(null)}
        />
      )}
    </ViewerContext.Provider>
  );
}

interface SignupDialogProps {
  action: GateAction | null;
  viewer: ViewerKind;
  businessName: string;
  businessLogo: string | null;
  onClose: () => void;
}

/**
 * The interruption itself.
 *
 * Three things it does on purpose:
 *
 * 1. It names the action in the eyebrow. A modal that appears with no
 *    explanation of which click caused it feels like an ad; one that says "to
 *    save this business" is answering a question the visitor just asked.
 * 2. It is dismissible, and the dismissal is worded "Keep browsing" rather
 *    than "No thanks". The directory works fine signed out and should say so —
 *    a dead-end modal on a public listing page would cost the business the
 *    visit.
 * 3. It shows the logo and name. By the time the dialog is open the page is
 *    covered, and the signup is only persuasive if you remember what you were
 *    about to do and for whom.
 */
function SignupDialog({
  action,
  viewer,
  businessName,
  businessLogo,
  onClose,
}: SignupDialogProps) {
  const { t } = useTranslation('profile');

  // Keep the last action around while the dialog animates out, otherwise the
  // copy blanks for the duration of the close transition.
  const [lastAction, setLastAction] = useState<GateAction>('save');
  if (action && action !== lastAction) {
    setLastAction(action);
  }

  const resolved = action ?? lastAction;
  // Pairs with the backstop in `requirePana`. A business account should no
  // longer be able to open this dialog at all, but if one does, it must not be
  // told to "sign up" when it is already signed in.
  const signedInAsDirectory = viewer === 'directory';

  return (
    <Dialog open={action !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="bizprofile-gate">
        <div className="bizprofile-gate-head">
          {businessLogo && (
            <span className="bizprofile-gate-logo">
              <Image
                src={businessLogo}
                alt=""
                width={44}
                height={44}
                aria-hidden="true"
              />
            </span>
          )}
          <span className="bizprofile-gate-biz">{businessName}</span>
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
