'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useSession } from '@/lib/auth-client';
import Link from 'next/link';
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
  Copy,
  Check,
  KeyRound,
  Printer,
  RefreshCw,
} from 'lucide-react';
// Named import — react-qr-code@2.x is CJS and only exports `QRCode` by name.
// Its .d.ts also declares a default export, but no `exports.default` exists at
// runtime, so a default import resolves to `undefined` under Vite's strict
// __esModule interop and produces React error #130 the moment <QRCode/> mounts.
import { QRCode } from 'react-qr-code';

type Phase = 'idle' | 'generated' | 'enrolling' | 'enrolled' | 'error';
type ReadinessGap = 'profile' | 'screenname';
type ReadinessState =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'already-enrolled'; npub: string }
  | { status: 'blocked'; missing: ReadinessGap[] }
  | { status: 'unauthenticated' }
  | { status: 'error' };

const GAP_COPY: Record<
  ReadinessGap,
  { label: string; href: string; cta: string }
> = {
  profile: {
    label:
      'Set up your Pana profile so we have a display name to publish with your handle.',
    href: '/welcome',
    cta: 'Set up your profile',
  },
  screenname: {
    label:
      'Pick a screenname on your account — it becomes your stable Nostr handle (alice@panamia.club) and ActivityPub identity.',
    href: '/account/user/edit',
    cta: 'Set your screenname',
  },
};

export function EnrollSection() {
  const { data: session, status } = useSession();
  const { toast } = useToast();
  const [phase, setPhase] = useState<Phase>('idle');
  const [keys, setKeys] = useState<Keypair | null>(null);
  const [confirmedSaved, setConfirmedSaved] = useState(false);
  const [copied, setCopied] = useState<'nsec' | 'npub' | null>(null);
  const [readiness, setReadiness] = useState<ReadinessState>({
    status: 'loading',
  });
  // BYO ("I already have a Nostr key") flow.
  const [byoOpen, setByoOpen] = useState(false);
  const [byoNsec, setByoNsec] = useState('');
  const [byoBusy, setByoBusy] = useState(false);

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'unauthenticated') {
      setReadiness({ status: 'unauthenticated' });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get<{
          ready: boolean;
          missing: ReadinessGap[];
          enrolledPubkey: string | null;
        }>('/api/relay/precheck');
        if (cancelled) return;
        if (res.data.enrolledPubkey) {
          setReadiness({
            status: 'already-enrolled',
            npub: npubFromHex(res.data.enrolledPubkey),
          });
        } else if (res.data.ready) {
          setReadiness({ status: 'ready' });
        } else {
          setReadiness({
            status: 'blocked',
            missing: res.data.missing ?? [],
          });
        }
      } catch (err: unknown) {
        if (cancelled) return;
        if (axios.isAxiosError(err) && err.response?.status === 401) {
          setReadiness({ status: 'unauthenticated' });
          return;
        }
        setReadiness({ status: 'error' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status]);

  function generate() {
    setKeys(generateKeypair());
    setConfirmedSaved(false);
    setPhase('generated');
  }

  async function copy(label: 'nsec' | 'npub', value: string) {
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

  async function enroll() {
    if (!keys || !confirmedSaved) return;
    setPhase('enrolling');
    try {
      await axios.post('/api/relay/enroll', { pubkey: keys.publicKeyHex });
      // Publish the identity event set (kind 0 / group list / relay lists) under
      // the freshly generated key — shared with the rotation and BYO flows so
      // all three publish the same events the same way.
      const warnings = await publishIdentityEvents(keys.privateKeyHex);
      if (warnings.length > 0) {
        toast({
          title: 'Enrolled, with some cleanup needed',
          description: warnings.join(' '),
          variant: 'destructive',
        });
      }
      setPhase('enrolled');
    } catch (err: unknown) {
      let title = 'Could not enroll';
      let message = 'Enrollment failed. Please try again.';
      if (axios.isAxiosError(err)) {
        const code = err.response?.status;
        const data = err.response?.data as
          { error?: string; missing?: ReadinessGap[] } | undefined;
        if (code === 401) {
          message = 'Sign in to enroll.';
        } else if (code === 412) {
          title = 'Finish your profile first';
          const missing = data?.missing ?? [];
          message =
            missing.length > 0
              ? missing.map((m) => GAP_COPY[m]?.label ?? m).join(' ')
              : 'Your panamia profile is incomplete.';
          // The page's own readiness state is now stale — refresh it so the
          // CTA cards take over instead of the keypair UI.
          setReadiness({ status: 'blocked', missing });
        } else if (code === 409) {
          message =
            data?.error === 'this pubkey is already claimed by another profile'
              ? 'This pubkey is already claimed by someone else. Generate a new one.'
              : 'Your profile already has a different Nostr key. Contact support if you need to change it.';
        }
      }
      toast({ title, description: message, variant: 'destructive' });
      setPhase('error');
    }
  }

  // BYO enrollment: link an EXISTING nsec. We prove control by signing a
  // one-time proof event IN THE BROWSER and sending only the signature — the
  // nsec is never transmitted to or stored by our servers (the server verifies
  // the signature; see app/api/relay/enroll). After enrolling we publish the
  // identity events (kind 0 / relay lists / group list) under the BYO key so it
  // advertises the Pana handle/profile and lands in the groups — same as the
  // generated-key flow and rotation. This DOES overwrite any kind 0 / relay
  // lists the key already had on relay.panamia.club; true collisions with an
  // established identity are expected to be rare.
  async function enrollByo() {
    const userId = session?.user?.id;
    if (!userId) {
      toast({
        title: 'Sign in first',
        description: 'You must be signed in to link a key.',
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
        content: 'Link this Nostr key to my Pana profile',
      });
      await axios.post('/api/relay/enroll', { pubkey, source: 'byo', proof });
      // Publish identity events under the BYO key (kind 0 / relay lists / group
      // list) so it advertises the Pana handle and lands in the groups.
      const warnings = await publishIdentityEvents(skHex);
      setReadiness({ status: 'already-enrolled', npub: npubFromHex(pubkey) });
      setByoNsec('');
      if (warnings.length > 0) {
        toast({
          title: 'Key linked, with some cleanup needed',
          description: warnings.join(' '),
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Key linked',
          description:
            'Your existing Nostr key is now enrolled in panamia-test.',
        });
      }
    } catch (err: unknown) {
      let title = 'Could not link key';
      let message = 'Please try again.';
      if (axios.isAxiosError(err)) {
        const code = err.response?.status;
        const data = err.response?.data as
          | { error?: string; reason?: string; missing?: ReadinessGap[] }
          | undefined;
        if (code === 401) {
          message = 'Sign in to enroll.';
        } else if (code === 403) {
          title = 'Proof rejected';
          message = data?.reason || 'Could not verify control of that key.';
        } else if (code === 412) {
          title = 'Finish your profile first';
          const missing = data?.missing ?? [];
          message =
            missing.length > 0
              ? missing.map((m) => GAP_COPY[m]?.label ?? m).join(' ')
              : 'Your panamia profile is incomplete.';
          setReadiness({ status: 'blocked', missing });
        } else if (code === 409) {
          message =
            data?.error === 'this pubkey is already claimed by another profile'
              ? 'This pubkey is already claimed by someone else.'
              : 'Your profile already has a different Nostr key.';
        }
      }
      toast({ title, description: message, variant: 'destructive' });
    } finally {
      // Drop the secret from component state as soon as we're done with it.
      setByoNsec('');
      setByoBusy(false);
    }
  }

  return (
    <section className="mb-10">
      <h2 className="mb-4 text-xl font-semibold">Generate your keypair</h2>

      <Card>
        <CardContent className="space-y-4 pt-6">
          {readiness.status === 'loading' && (
            <p className="text-muted-foreground text-sm">
              Checking your panamia profile…
            </p>
          )}

          {readiness.status === 'unauthenticated' && (
            <div className="text-sm">
              <Link href="/signin?next=/r" className="text-primary underline">
                Sign in
              </Link>{' '}
              to use the Resilience module.
            </div>
          )}

          {readiness.status === 'error' && (
            <div className="rounded-md border border-amber-500/40 bg-amber-50 p-4 text-sm dark:bg-amber-950/30">
              <div className="flex items-start gap-2 font-medium text-amber-900 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>
                  We couldn&rsquo;t check your profile right now. Refresh the
                  page to try again.
                </span>
              </div>
            </div>
          )}

          {readiness.status === 'blocked' && (
            <div className="space-y-3">
              <div className="rounded-md border border-amber-500/40 bg-amber-50 p-4 text-sm dark:bg-amber-950/30">
                <div className="flex items-start gap-2 font-medium text-amber-900 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span>Finish your panamia profile to use Resilience.</span>
                </div>
                <p className="mt-2 text-amber-900/80 dark:text-amber-200/80">
                  Resilience uses your panamia screenname and profile to give
                  you a stable Nostr identity (
                  <code>screenname@panamia.club</code>) so other clients show
                  your name, not a hex string. We need the following before you
                  can enroll:
                </p>
              </div>
              <ul className="space-y-2">
                {readiness.missing.map((gap) => (
                  <li
                    key={gap}
                    className="flex flex-col gap-2 rounded-md border p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span>{GAP_COPY[gap].label}</span>
                    <Link
                      href={GAP_COPY[gap].href}
                      className="text-primary text-sm font-medium whitespace-nowrap underline"
                    >
                      {GAP_COPY[gap].cta} →
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {readiness.status === 'already-enrolled' && (
            <div className="space-y-3">
              <p className="text-sm">
                Keys previously generated… this is just a demo!
              </p>
              <KeyRow
                label="Public key (npub)"
                value={readiness.npub}
                copied={copied === 'npub'}
                onCopy={() => copy('npub', readiness.npub)}
                hint="Safe to share. This is how others identify you."
              />
            </div>
          )}

          {readiness.status === 'ready' && phase === 'idle' && (
            <>
              <p className="text-muted-foreground text-sm">
                The keys are generated in your browser using your device&rsquo;s
                random number generator. Nothing is sent to our servers until
                you choose to enroll the public half.
              </p>
              <Button onClick={generate}>
                <KeyRound className="mr-2 h-4 w-4" />
                Generate keypair
              </Button>

              <div className="border-t pt-4">
                {!byoOpen ? (
                  <button
                    type="button"
                    onClick={() => setByoOpen(true)}
                    className="text-primary text-sm underline"
                  >
                    I already have a Nostr key
                  </button>
                ) : (
                  <div className="space-y-3">
                    <div className="text-sm font-medium">
                      Link an existing key
                    </div>
                    <div className="rounded-md border border-amber-500/40 bg-amber-50 p-3 text-xs dark:bg-amber-950/30">
                      <div className="flex items-start gap-2 text-amber-900 dark:text-amber-200">
                        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                        <span>
                          To prove you control this key, your <code>nsec</code>{' '}
                          is used <strong>only in your browser</strong> to sign
                          a one-time proof. It is{' '}
                          <strong>
                            never sent to or stored on our servers
                          </strong>{' '}
                          — only the resulting signature is transmitted for
                          verification. We&rsquo;ll then publish your Pana
                          profile and <code>@panamia.club</code> handle under
                          this key, replacing any profile metadata it already
                          has on relay.panamia.club.
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
                        onClick={enrollByo}
                        disabled={byoBusy || !byoNsec.trim() || !session}
                      >
                        {byoBusy ? 'Linking…' : 'Verify & link key'}
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
            </>
          )}

          {readiness.status === 'ready' && phase !== 'idle' && keys && (
            <>
              <div className="rounded-md border border-amber-500/40 bg-amber-50 p-4 text-sm dark:bg-amber-950/30">
                <div className="flex items-start gap-2 font-medium text-amber-900 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span>Save this somewhere safe before continuing.</span>
                </div>
                <p className="mt-2 text-amber-900/80 dark:text-amber-200/80">
                  Your secret key (<code>nsec</code>) is shown once. We
                  don&rsquo;t store it. If you lose it you cannot recover this
                  identity, your messages, or your followers.
                </p>
              </div>

              <KeyRow
                label="Public key (npub)"
                value={keys.npub}
                copied={copied === 'npub'}
                onCopy={() => copy('npub', keys.npub)}
                hint="Safe to share. This is how others identify you."
              />
              <KeyRow
                label="Secret key (nsec)"
                value={keys.nsec}
                copied={copied === 'nsec'}
                onCopy={() => copy('nsec', keys.nsec)}
                hint="Keep private. Anyone with this can post as you."
                secret
              />

              <div className="space-y-2">
                <div className="text-sm font-medium">
                  Secret key as QR (for Amethyst sign-in)
                </div>
                <div className="inline-block rounded-md border bg-white p-3">
                  <QRCode
                    value={keys.nsec}
                    size={176}
                    aria-label="Secret key QR code"
                  />
                </div>
                <p className="text-muted-foreground text-xs">
                  Anyone who scans this can post as you. Treat it like the
                  <code className="mx-1">nsec</code> text above — don&rsquo;t
                  share your screen with it visible.
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

              {phase !== 'enrolled' && (
                <>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={confirmedSaved}
                      onChange={(e) => setConfirmedSaved(e.target.checked)}
                    />
                    <span>
                      I&rsquo;ve saved both keys somewhere I won&rsquo;t lose
                      them.
                    </span>
                  </label>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={enroll}
                      disabled={
                        !confirmedSaved ||
                        phase === 'enrolling' ||
                        status === 'loading' ||
                        !session
                      }
                    >
                      {phase === 'enrolling'
                        ? 'Enrolling…'
                        : 'Enroll into panamia-test'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={generate}
                      disabled={phase === 'enrolling'}
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Regenerate
                    </Button>
                  </div>
                </>
              )}

              {phase === 'enrolled' && (
                <div className="rounded-md border border-emerald-500/40 bg-emerald-50 p-4 text-sm dark:bg-emerald-950/30">
                  <div className="flex items-center gap-2 font-medium text-emerald-900 dark:text-emerald-200">
                    <Check className="h-4 w-4" />
                    <span>Enrolled — your pubkey is now in panamia-test.</span>
                  </div>
                  <p className="mt-2 text-emerald-900/80 dark:text-emerald-200/80">
                    Next, follow the instructions below to import your secret
                    key into Nostrord and start chatting.
                  </p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </section>
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
            'bg-muted/50 flex-1 rounded-md border px-3 py-2 font-mono text-sm break-all ' +
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
