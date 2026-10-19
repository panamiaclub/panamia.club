'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import axios from 'axios';
// Named import — see components/relay/EnrollSection.tsx for the CJS interop note.
import { QRCode } from 'react-qr-code';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useSession } from '@/lib/auth-client';
import {
  generateKeypair,
  npubFromHex,
  secretKeyHexFromNsec,
  publicKeyHexFromSecret,
  type Keypair,
} from '@/lib/nostr/keys';
import { signEvent } from '@/lib/nostr/sign';
import { publishIdentityEvents } from '@/lib/nostr/relay-identity-events';
import {
  AlertTriangle,
  Check,
  Copy,
  KeyRound,
  Printer,
  RefreshCw,
} from 'lucide-react';

type Eligibility =
  | { status: 'loading' }
  | { status: 'enrolled'; npub: string }
  | { status: 'not-enrolled' }
  | { status: 'error' };

type Phase = 'idle' | 'generated' | 'rotating' | 'done';

interface RotateKeysSectionProps {
  // 'page' renders a standalone Card (hidden entirely when not enrolled) — used
  // on /r. 'inline' renders bare content with a not-enrolled note — used inside
  // the account/user/edit Advanced Settings accordion.
  context?: 'page' | 'inline';
}

export function RotateKeysSection({
  context = 'page',
}: RotateKeysSectionProps) {
  const { status } = useSession();
  const { toast } = useToast();
  const [eligibility, setEligibility] = useState<Eligibility>({
    status: 'loading',
  });
  const [open, setOpen] = useState(false);

  const refreshEligibility = useCallback(async () => {
    try {
      const res = await axios.get<{ enrolledPubkey: string | null }>(
        '/api/relay/precheck'
      );
      if (res.data.enrolledPubkey) {
        setEligibility({
          status: 'enrolled',
          npub: npubFromHex(res.data.enrolledPubkey),
        });
      } else {
        setEligibility({ status: 'not-enrolled' });
      }
    } catch {
      setEligibility({ status: 'error' });
    }
  }, []);

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'unauthenticated') {
      setEligibility({ status: 'not-enrolled' });
      return;
    }
    refreshEligibility();
  }, [status, refreshEligibility]);

  // Called when a rotation completes so the displayed current npub updates.
  function handleRotated(newNpub: string) {
    setEligibility({ status: 'enrolled', npub: newNpub });
  }

  // ----- not-enrolled / loading / error rendering ------------------------
  if (eligibility.status === 'loading') {
    if (context === 'page') return null;
    return (
      <p className="text-muted-foreground py-2 text-sm">Checking enrollment…</p>
    );
  }
  if (eligibility.status === 'error') {
    if (context === 'page') return null;
    return (
      <p className="text-muted-foreground py-2 text-sm">
        Couldn&rsquo;t check your enrollment. Refresh and try again.
      </p>
    );
  }
  if (eligibility.status === 'not-enrolled') {
    if (context === 'page') return null;
    return (
      <p className="text-muted-foreground py-2 text-sm">
        You haven&rsquo;t enrolled a Nostr key yet. Visit{' '}
        <a href="/r" className="text-primary underline">
          the Resilience page
        </a>{' '}
        to create one before you can rotate.
      </p>
    );
  }

  // ----- enrolled: intro + launcher + dialog -----------------------------
  // Two lengths of the same explanation. The confirm dialog repeats the full
  // moves/stays breakdown before anything happens, so Advanced Settings only
  // needs enough to decide whether to open it — the long version there put the
  // same text on screen twice. /r keeps the long version: it is the page that
  // teaches the concept, and a member may never open the dialog at all.
  const introBrief = (
    <p className="text-muted-foreground text-sm">
      Generates a brand-new key and moves your @panamia.club handle, your Pana
      profile, and your group chat access to it. What stays behind with your old
      key is listed before you confirm.
    </p>
  );

  // The emphasis carries the two labels, not the items under them. Bolding the
  // items instead scattered the emphasis across both lists and made it hard to
  // tell which side of the split you were reading.
  const intro = (
    <div className="text-muted-foreground space-y-2 text-sm">
      <p>
        Rotating generates a brand-new key. It&rsquo;s a fresh start at the key
        level with your Pana identity carried across — not a full migration.
      </p>
      <p>
        <strong>What moves to the new key:</strong> your @panamia.club handle,
        your Pana profile, and your group chat access.
      </p>
      <p>
        <strong>What stays with your old key:</strong> existing followers
        (they&rsquo;ll need to re-follow), authorship of past posts, and old
        encrypted DMs — keep the old key if you want to read those.
      </p>
      <p>
        Your old key still works as a Nostr identity anywhere else, so you can
        load it in a client to read that history. It loses access to the Pana
        relay, though: group chat access moves with the rotation, and the relay
        admits only keys that belong to a group chat.
      </p>
    </div>
  );

  const launcher = (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <RefreshCw className="mr-2 h-4 w-4" />
        Rotate keys…
      </Button>
      <RotateDialog
        open={open}
        onOpenChange={setOpen}
        currentNpub={eligibility.npub}
        onRotated={handleRotated}
        toast={toast}
      />
    </>
  );

  if (context === 'inline') {
    return (
      <div className="space-y-4 pt-2">
        {introBrief}
        {launcher}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rotate your keys</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {intro}
        {launcher}
      </CardContent>
    </Card>
  );
}

interface RotateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentNpub: string;
  onRotated: (newNpub: string) => void;
  toast: ReturnType<typeof useToast>['toast'];
}

function RotateDialog({
  open,
  onOpenChange,
  currentNpub,
  onRotated,
  toast,
}: RotateDialogProps) {
  const { data: session } = useSession();
  const [phase, setPhase] = useState<Phase>('idle');
  const [keys, setKeys] = useState<Keypair | null>(null);
  const [confirmedSaved, setConfirmedSaved] = useState(false);
  const [copied, setCopied] = useState<'npub' | 'nsec' | null>(null);
  // BYO ("rotate to a key I already have") sub-flow.
  const [byoOpen, setByoOpen] = useState(false);
  const [byoNsec, setByoNsec] = useState('');
  const [byoBusy, setByoBusy] = useState(false);

  // Reset the flow whenever the dialog is opened so a prior run doesn't leak in.
  useEffect(() => {
    if (open) {
      setPhase('idle');
      setKeys(null);
      setConfirmedSaved(false);
      setCopied(null);
      setByoOpen(false);
      setByoNsec('');
      setByoBusy(false);
    }
  }, [open]);

  function generate() {
    setKeys(generateKeypair());
    setConfirmedSaved(false);
    setPhase('generated');
  }

  async function copy(label: 'npub' | 'nsec', value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast({
        title: 'Copy failed',
        description: 'Select the text and copy manually.',
        variant: 'destructive',
      });
    }
  }

  async function rotate() {
    if (!keys || !confirmedSaved) return;
    setPhase('rotating');
    try {
      await axios.post('/api/relay/rotate', { pubkey: keys.publicKeyHex });
      // Server side is now repointed. Republish the identity events under the
      // new key while its nsec is still in browser memory.
      const warnings = await publishIdentityEvents(keys.privateKeyHex);
      if (warnings.length > 0) {
        toast({
          title: 'Rotated, with some cleanup needed',
          description: warnings.join(' '),
          variant: 'destructive',
        });
      }
      onRotated(keys.npub);
      setPhase('done');
    } catch (err: unknown) {
      let title = 'Rotation failed';
      let message = 'Your keys were not changed. Please try again.';
      if (axios.isAxiosError(err)) {
        const code = err.response?.status;
        if (code === 401) message = 'Sign in to rotate your keys.';
        else if (code === 409) {
          const data = err.response?.data as { error?: string } | undefined;
          message =
            data?.error === 'not_enrolled'
              ? 'You are not enrolled yet — visit /r to create your first key.'
              : 'That key is already claimed by another profile. Generate a new one.';
        }
      }
      toast({ title, description: message, variant: 'destructive' });
      // Back to the generated step so the user can retry or regenerate.
      setPhase('generated');
    }
  }

  // Rotate to a key the user ALREADY controls. The nsec is decoded and used to
  // sign a one-time proof in the browser; only the signature is sent — the nsec
  // is never transmitted. On success we still republish identity events under
  // the new key (that's the point of rotation — moving the pana handle/profile/
  // group access onto it).
  async function rotateByo() {
    const userId = session?.user?.id;
    if (!userId) {
      toast({
        title: 'Sign in first',
        description: 'You must be signed in to rotate.',
        variant: 'destructive',
      });
      return;
    }
    let skHex: string;
    try {
      skHex = secretKeyHexFromNsec(byoNsec);
    } catch {
      toast({
        title: 'Invalid nsec',
        description: 'That doesn’t look like a valid nsec key.',
        variant: 'destructive',
      });
      return;
    }
    setByoBusy(true);
    try {
      const pubkey = publicKeyHexFromSecret(skHex);
      const proof = signEvent(skHex, {
        kind: 27235,
        tags: [
          ['t', 'pana-key-enrollment'],
          ['pana_user', userId],
        ],
        content: 'Rotate my Pana identity to this Nostr key',
      });
      await axios.post('/api/relay/rotate', { pubkey, source: 'byo', proof });
      const warnings = await publishIdentityEvents(skHex);
      if (warnings.length > 0) {
        toast({
          title: 'Rotated, with some cleanup needed',
          description: warnings.join(' '),
          variant: 'destructive',
        });
      }
      onRotated(npubFromHex(pubkey));
      setByoNsec('');
      setPhase('done');
    } catch (err: unknown) {
      let title = 'Rotation failed';
      let message = 'Your keys were not changed. Please try again.';
      if (axios.isAxiosError(err)) {
        const code = err.response?.status;
        const data = err.response?.data as
          { error?: string; reason?: string } | undefined;
        if (code === 401) message = 'Sign in to rotate your keys.';
        else if (code === 403) {
          title = 'Proof rejected';
          message = data?.reason || 'Could not verify control of that key.';
        } else if (code === 409) {
          message =
            data?.error === 'not_enrolled'
              ? 'You are not enrolled yet — visit /r to create your first key.'
              : 'That key is already claimed by another profile.';
        }
      }
      toast({ title, description: message, variant: 'destructive' });
      setByoNsec('');
      // phase stays 'idle' — the BYO panel remains open for a retry.
    } finally {
      setByoBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Rotate your Nostr keys</DialogTitle>
          <DialogDescription>
            Current identity:{' '}
            <code className="text-xs break-all">{currentNpub}</code>
          </DialogDescription>
        </DialogHeader>

        {phase === 'done' ? (
          <div className="space-y-4">
            <div className="rounded-md border border-emerald-500/40 bg-emerald-50 p-4 text-sm dark:bg-emerald-950/30">
              <div className="flex items-center gap-2 font-medium text-emerald-900 dark:text-emerald-200">
                <Check className="h-4 w-4" />
                <span>Keys rotated.</span>
              </div>
              <p className="mt-2 text-emerald-900/80 dark:text-emerald-200/80">
                Your <code>@panamia.club</code> handle and group chat access now
                point at the new key. Import the new <code>nsec</code> into your
                clients (Nostrord, Amethyst, …) to keep posting as you.
              </p>
            </div>
            <div className="rounded-md border border-amber-500/40 bg-amber-50 p-4 text-sm dark:bg-amber-950/30">
              <div className="flex items-start gap-2 text-amber-900 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>
                  Keep your <strong>old key</strong> somewhere safe — it&rsquo;s
                  the only way to read DMs you received before rotating, and
                  your past posts stay attributed to it. Existing followers will
                  need to follow your new key.
                </span>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-md border border-amber-500/40 bg-amber-50 p-4 text-sm dark:bg-amber-950/30">
              <div className="flex items-start gap-2 font-medium text-amber-900 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>This cannot be undone. Read before continuing.</span>
              </div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-900/80 dark:text-amber-200/80">
                <li>
                  <strong>Moves to the new key:</strong> your{' '}
                  <code>@panamia.club</code> handle, Pana profile, and group chat
                  access.
                </li>
                <li>
                  <strong>Stays with the old key:</strong> existing followers,
                  authorship of past posts, and old encrypted DMs.
                </li>
                <li>Keep your old key to read DMs you already received.</li>
                <li>
                  The old key keeps working elsewhere on Nostr, but loses access
                  to the Pana relay once rotated.
                </li>
              </ul>
            </div>

            {phase === 'idle' && (
              <div className="space-y-4">
                <Button onClick={generate}>
                  <KeyRound className="mr-2 h-4 w-4" />
                  Generate new keypair
                </Button>

                <div className="border-t pt-4">
                  {!byoOpen ? (
                    <button
                      type="button"
                      onClick={() => setByoOpen(true)}
                      className="text-primary text-sm underline"
                    >
                      Rotate to a key I already have
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <div className="text-sm font-medium">
                        Rotate to an existing key
                      </div>
                      <div className="rounded-md border border-amber-500/40 bg-amber-50 p-3 text-xs dark:bg-amber-950/30">
                        <div className="flex items-start gap-2 text-amber-900 dark:text-amber-200">
                          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                          <span>
                            To prove you control this key, your{' '}
                            <code>nsec</code> is used{' '}
                            <strong>only in your browser</strong> to sign a
                            one-time proof. It is{' '}
                            <strong>
                              never sent to or stored on our servers
                            </strong>{' '}
                            — only the signature is. Your{' '}
                            <code>@panamia.club</code> handle, profile, and group
                            chat access move to this key.
                          </span>
                        </div>
                      </div>
                      <textarea
                        value={byoNsec}
                        onChange={(e) => setByoNsec(e.target.value)}
                        placeholder="nsec1…"
                        rows={2}
                        autoComplete="off"
                        spellCheck={false}
                        className="bg-muted/50 w-full rounded-md border px-3 py-2 font-mono text-sm break-all"
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          onClick={rotateByo}
                          disabled={byoBusy || !byoNsec.trim() || !session}
                        >
                          {byoBusy
                            ? 'Rotating…'
                            : 'Verify & rotate to this key'}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setByoOpen(false);
                            setByoNsec('');
                          }}
                          disabled={byoBusy}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {phase !== 'idle' && keys && (
              <>
                <KeyRow
                  label="New public key (npub)"
                  value={keys.npub}
                  copied={copied === 'npub'}
                  onCopy={() => copy('npub', keys.npub)}
                  hint="Safe to share. This becomes your new identity."
                />
                <KeyRow
                  label="New secret key (nsec)"
                  value={keys.nsec}
                  copied={copied === 'nsec'}
                  onCopy={() => copy('nsec', keys.nsec)}
                  hint="Keep private. Anyone with this can post as you."
                  secret
                />

                <div className="rounded-md border border-rose-500/40 bg-rose-50 p-3 text-sm text-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <span>
                      <strong>Never share your nsec with anyone.</strong> No
                      Pana MIA admin will ever ask for it, and sharing it is
                      against our{' '}
                      <Link
                        href="/legal/terms/modules/resilience"
                        className="underline"
                      >
                        Terms of Service
                      </Link>
                      . It&rsquo;s your password and your identity in one —
                      anyone who has it can post as you and read your messages.
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">
                    New secret key as QR (for Amethyst sign-in)
                  </div>
                  <div className="inline-block rounded-md border bg-white p-3">
                    <QRCode
                      value={keys.nsec}
                      size={160}
                      aria-label="New secret key QR code"
                    />
                  </div>
                  <p className="text-muted-foreground text-xs">
                    Anyone who scans this can post as you — don&rsquo;t show it
                    on a shared screen.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => window.print()}
                  >
                    <Printer className="mr-2 h-4 w-4" />
                    Print backup
                  </Button>
                </div>

                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={confirmedSaved}
                    onChange={(e) => setConfirmedSaved(e.target.checked)}
                  />
                  <span>
                    I&rsquo;ve saved the new keys, and I understand my old
                    followers and DMs stay with my old key.
                  </span>
                </label>

                <DialogFooter className="gap-2 sm:gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={generate}
                    disabled={phase === 'rotating'}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Regenerate
                  </Button>
                  <Button
                    onClick={rotate}
                    disabled={!confirmedSaved || phase === 'rotating'}
                  >
                    {phase === 'rotating' ? 'Rotating…' : 'Rotate to this key'}
                  </Button>
                </DialogFooter>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface KeyRowProps {
  label: string;
  value: string;
  hint: string;
  copied: boolean;
  onCopy: () => void;
  secret?: boolean;
}

function KeyRow({ label, value, hint, copied, onCopy, secret }: KeyRowProps) {
  return (
    <div className="space-y-1">
      <div className="text-sm font-medium">{label}</div>
      <div className="flex items-stretch gap-2">
        <code
          className={
            'bg-muted/50 min-w-0 flex-1 rounded-md border px-3 py-2 font-mono text-sm break-all ' +
            (secret ? 'text-rose-700 dark:text-rose-300' : '')
          }
        >
          {value}
        </code>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCopy}
          aria-label={'Copy ' + label}
        >
          {copied ? (
            <Check className="h-4 w-4" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>
      </div>
      <div className="text-muted-foreground text-xs">{hint}</div>
    </div>
  );
}
