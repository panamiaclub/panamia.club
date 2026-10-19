// Server component — static educational copy. No client JS needed; the
// dynamic bits (key generation + enrollment) live in EnrollSection.
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';

export function IntroSection() {
  return (
    <section className="prose prose-sm dark:prose-invert mb-12 max-w-none space-y-8 leading-relaxed">
      <div className="space-y-3">
        <h2 className="text-xl font-semibold">What is a relay?</h2>
        <p>
          Pana MIA offers a community{' '}
          <a
            href="https://en.wikipedia.org/wiki/Nostr"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            Nostr
          </a>{' '}
          relay hosted at{' '}
          <a
            href="https://relay.panamia.club"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            relay.panamia.club
          </a>
          .
        </p>
        <p>
          Each participant has a keypair — a secret, complex number — and signs
          their messages with a digital signature. Doing so makes impersonation
          almost impossible unless a participant&rsquo;s secret key is
          compromised. The relay&rsquo;s job is to hold those signed messages
          and pass them along to others. There are additional levels of
          protection depending on how a participant uses the relay.
        </p>
      </div>

      <div className="space-y-3">
        <h2 className="text-xl font-semibold">What is resilience?</h2>
        <p>
          Resilience means resilience against the degradation of communications
          infrastructure resulting from &ldquo;Big Tech&rdquo; policy decisions
          — sudden account suspensions, algorithmic suppression, data
          harvesting, and never-ending ads. Your community&rsquo;s conversation,
          identity, and archive should belong to you. To everyone.
        </p>
        <p>
          The technical backstop: if Pana MIA ever went offline, your messages
          and identity on Nostr wouldn&rsquo;t go with it. The same key works in
          any compatible app, and other relays can hold copies of your messages.
          That portability is what makes the system resilient.
        </p>
      </div>

      <div className="space-y-3">
        <h2 className="text-xl font-semibold">
          What makes the relay authoritative?
        </h2>
        <p>
          The relay is a mirror of user-uploaded data, but with identity
          enforcement and moderated enrollment into neighborhood and
          shared-interest chat groups. It&rsquo;s a &ldquo;smart&rdquo; relay
          with defined user-conduct standards of expectation. Participants who
          do not abide by these standards will be kicked off our relay, along
          with their messages and content.
        </p>
        <p>
          Those standards, key custody, and what we can and cannot delete are
          spelled out in the{' '}
          <Link href="/legal/terms/modules/resilience" className="underline">
            Resilience Network terms
          </Link>{' '}
          and the{' '}
          <Link href="/legal/privacy" className="underline">
            privacy policy
          </Link>
          .
        </p>
      </div>

      <div className="space-y-3">
        <h2 className="text-xl font-semibold">Suggested apps</h2>
        <p>
          Nostr is a protocol, not an app — different clients are built for
          different purposes. Here is what we recommend for each:
        </p>
        <div className="not-prose grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="space-y-2 pt-6">
              <h3 className="text-base font-semibold">General Group Chat</h3>
              <p className="text-muted-foreground text-sm">
                The panamia community group and any other neighborhood-level
                conversation. Not end-to-end encrypted.
              </p>
              <p className="text-sm">
                <a
                  href="https://nostrord.com"
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  Nostrord
                </a>{' '}
                — web, Android, Windows, macOS, Linux
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2 pt-6">
              <h3 className="text-base font-semibold">General-Purpose Nostr</h3>
              <p className="text-muted-foreground text-sm">
                Your wider Nostr life — public feed, profile, direct messages,
                zaps. Pick one to be your everyday app.
              </p>
              <p className="text-sm">
                <a
                  href="https://amethyst.social"
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  Amethyst
                </a>{' '}
                — Android
                <br />
                <a
                  href="https://0xchat.com"
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  0xchat
                </a>{' '}
                — Android, iOS
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2 pt-6">
              <h3 className="text-base font-semibold">
                Encrypted Private Groups
              </h3>
              <p className="text-muted-foreground text-sm">
                Trusted circles with end-to-end encryption. Install alongside —
                not in place of — a general-purpose client.
              </p>
              <p className="text-sm">
                <a
                  href="https://www.whitenoise.chat"
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  White Noise
                </a>{' '}
                — Android, iOS (early access)
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
