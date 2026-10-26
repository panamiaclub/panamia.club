import type { Metadata } from 'next';
import Link from 'next/link';
import { PrivacyAtAGlance } from '@/components/legal/PrivacyAtAGlance';
import { LegalJsonLd } from '@/components/legal/JsonLd';
import { tiers, policyVersion, policyStatus } from '@/lib/legal/privacy-policy';

// Live web origin for this app — not a stale federation value to "correct".
// Never find-and-replace `pana.social`; most occurrences are federated
// identity and repointing those is permanent. See docs/DOMAINS.md.
const SITE = 'https://panamia.club';

export const metadata: Metadata = {
  title: 'Privacy Policy - Pana MIA Club',
  description:
    'How Pana MIA Club collects, uses, and protects your data. Three-tier data classification, your rights, and third-party sharing.',
  openGraph: {
    title: 'Privacy Policy - Pana MIA Club',
    description:
      'How Pana MIA Club collects, uses, and protects your data. Three-tier data classification, your rights, and third-party sharing.',
    url: `${SITE}/legal/privacy`,
    siteName: 'Pana MIA Club',
    type: 'website',
  },
};

function Placeholder({ label }: { label: string }) {
  return (
    <p className="rounded border border-dashed border-blue-400/50 bg-blue-50/50 p-4 text-sm text-blue-800 dark:bg-blue-950/20 dark:text-blue-200">
      {label} — full legal text to be drafted.
    </p>
  );
}

// Tier / class / category content is derived from app/legal/privacy/policy.json.
// Add or amend categories there, not here.

const retentionClassHeadings: Record<string, string> = {
  deletable: 'Deletable on Request',
  community_record: 'Community Record',
  third_party_synced: 'Third-Party Synced',
  moderation_record: 'Moderation Record',
  compliance_record: 'Compliance Record',
  auto_purged: 'Auto-Purged',
  in_the_wind: 'In the Wind',
  participant_observed: 'Seen by Participants',
};

export default function PrivacyPolicyPage() {
  return (
    <>
      <LegalJsonLd
        name="Pana MIA Club Privacy Policy"
        description="How Pana MIA Club collects, uses, and protects your data. Three-tier data classification, your rights, and third-party sharing."
        url={`${SITE}/legal/privacy`}
        version={policyVersion}
        policyJsonUrl={`${SITE}/legal/privacy/policy.json`}
      />
      <header className="mb-10 border-b pb-6">
        <h1 className="text-4xl font-bold">Privacy Policy</h1>
        <p className="text-muted-foreground mt-2">
          Version {policyVersion} —{' '}
          {policyStatus.charAt(0).toUpperCase() + policyStatus.slice(1)}
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          The English-language version of this policy shall take precedence over
          any translations.
        </p>
      </header>

      {/* Privacy at a Glance — scannable grid (Layer 1) */}
      <section id="at-a-glance" className="mb-12">
        <h2 className="mb-4 text-2xl font-bold">Privacy at a Glance</h2>
        <p className="text-muted-foreground mb-6 text-sm">
          Every piece of data we handle falls into one of three tiers. Filter by
          tier to see what we collect, why, how long we keep it, and who it is
          shared with.
        </p>
        <PrivacyAtAGlance />
      </section>

      {/* Plain-language summary (Layer 2) */}
      <section id="summary" className="mb-12">
        <h2 className="mb-4 text-2xl font-bold">Plain-Language Summary</h2>
        <div className="bg-muted/30 space-y-4 rounded-lg border p-6 text-sm">
          <p>
            <strong>What we collect:</strong> Account info you provide (email,
            name, profile details), content you create (articles, posts,
            photos), and minimal automatic data (IP address, browser info) for
            90 days.
          </p>
          <p>
            <strong>Three data tiers:</strong> Your data is either{' '}
            <em>Persistent</em> (stored while your account is active),{' '}
            <em>Temporary</em> (auto-deleted after use), or{' '}
            <em>Peer Networking</em> (exchanged directly between users, outside
            our control after transmission).
          </p>
          <p>
            <strong>Deletion:</strong> Most of your data is deleted immediately
            on request. Content that becomes community record (articles after 3
            months, completed events) can be anonymized but not fully removed,
            because the CC license you chose is irrevocable. Social posts are
            always fully deletable. Two things are never deleted on request:
            abuse reports, which have to outlive the accounts they concern, and
            anything already published to a network we do not run.
          </p>
          <p>
            <strong>Nostr and federation:</strong> If you join the Resilience
            Network, your public key and group membership live in our systems
            and are deleted with your account — but posts you published to Nostr
            are signed, permanent, and hosted by relays we have no relationship
            with. We can remove them from our relay. Nobody can remove them from
            Nostr at large. ActivityPub works the same way: we send a Delete,
            and remote servers may honor it or ignore it. Your secret key (nsec)
            is never sent to us and we cannot recover it for you.
          </p>
          <p>
            <strong>Third parties:</strong> We share data with Stripe
            (payments), GoHighLevel (CRM and newsletter), Cloudflare (hosting
            and email), and OAuth providers (Google, Apple). Each provider may
            retain data per their own policies after we request deletion.
          </p>
          <p>
            <strong>Your rights:</strong> You can access, correct, delete, or
            export your data. We honor Global Privacy Control (GPC) signals. No
            data is sold.
          </p>
          <p>
            <strong>No minors:</strong> You must be 18 or older. Accounts
            belonging to minors are terminated and data deleted.
          </p>
        </div>
      </section>

      <article className="prose prose-gray dark:prose-invert max-w-none leading-relaxed">
        {/* 1. What We Collect and Why */}
        <section id="what-we-collect">
          <h2>1. What We Collect and Why</h2>
          <Placeholder label="What we collect and why — detailed per-category disclosure per GDPR Art 13/14, CPRA, ISO 29184" />
        </section>

        {/* 2. Data Tiers */}
        <section id="data-tiers">
          <h2>2. The Three Data Tiers</h2>
          <p>
            All personal and user-generated data falls into exactly one of three
            tiers. Each tier determines how your data is stored, how long it is
            retained, and what happens when you request deletion.
          </p>

          {tiers.map((tier) => (
            <div key={tier.id} className="mb-8">
              <h3>{tier.label} Data</h3>
              <p>{tier.description}</p>

              {tier.classes.map((cls) => (
                <div key={cls.id} className="mb-4">
                  {/* A single-class tier needs no sub-heading — the class and
                      the tier describe the same thing. */}
                  {tier.classes.length > 1 && (
                    <>
                      <h4>{retentionClassHeadings[cls.id] ?? cls.id}</h4>
                      <p className="text-muted-foreground text-sm">
                        {cls.description}
                      </p>
                    </>
                  )}
                  <ul>
                    {cls.categories.map((cat) => (
                      <li key={cat.name}>{cat.display.prose}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ))}
        </section>

        {/* 3. Archive Threshold */}
        <section id="archive-threshold">
          <h2>3. The Archive Threshold</h2>
          <p>
            Certain content becomes part of the community record after a defined
            period. All user-generated content is CC BY or CC BY-SA licensed.
            The CC license is irrevocable — once granted, downstream recipients
            retain their rights regardless of whether the licensor stops
            distributing.
          </p>
          <Placeholder label="Archive threshold details — when content becomes permanent, deletion vs anonymization options" />
        </section>

        {/* 4. Who We Share Data With */}
        <section id="sharing">
          <h2>4. Who We Share Data With</h2>
          <Placeholder label="Third-party sharing details — Stripe, GoHighLevel, Cloudflare (hosting, R2, email), OAuth providers, ActivityPub federation peers, Nostr relays" />
        </section>

        {/* 5. Content Licensing */}
        <section id="content-licensing">
          <h2>5. Your Content Is CC-Licensed</h2>
          <p>
            All content you publish on Pana MIA Club is licensed under Creative
            Commons (CC BY 4.0, CC BY-SA 4.0, or CC0 1.0, your choice). This
            means the grant survives even if the content is later removed from
            the platform. Under CC BY and CC BY-SA you may ask us to remove your
            name from archived content; CC0 requires no attribution in the first
            place, so we simply stop displaying it. See our{' '}
            <Link href="/legal/terms#content-licensing">Terms of Service</Link>{' '}
            for details.
          </p>
        </section>

        {/* 6. Your Choices and Rights */}
        <section id="rights">
          <h2>6. Your Choices and Rights</h2>
          <Placeholder label="User rights — access, delete, correct, port, opt out, anonymize (GDPR + CPRA + ISO 29184)" />
        </section>

        {/* 7. How We Protect Your Data */}
        <section id="security">
          <h2>7. How We Protect Your Data</h2>
          <Placeholder label="Security measures — encryption at rest/transit, password hashing, WAF, environment variable segregation" />
        </section>

        {/* 8. Global Privacy Control */}
        <section id="gpc">
          <h2>8. Global Privacy Control (GPC)</h2>
          <p>
            We honor the Global Privacy Control signal. When your browser sends
            <code>Sec-GPC: 1</code>, we treat it as a valid CPRA opt-out of
            sale/sharing and disable any non-essential analytics sharing.
          </p>
        </section>

        {/* 9. Children */}
        <section id="children">
          <h2>9. Children&apos;s Privacy</h2>
          <p>
            Pana MIA Club is not directed at children under 18. We do not
            knowingly collect personal information from minors. If we discover
            that a user is under 18, their account will be terminated and their
            data deleted.
          </p>
        </section>

        {/* 10. International Users */}
        <section id="international">
          <h2>10. International Users</h2>
          <Placeholder label="International users — jurisdiction-neutral framing per ISO 29184" />
        </section>

        {/* 11. Contact */}
        <section id="contact">
          <h2>11. How to Contact Us</h2>
          <p>
            For privacy inquiries, data access requests, or to report a
            suspected data breach:
          </p>
          <p>
            Pana MIA Club, Corp.
            <br />
            Email: <a href="mailto:hola@pana.social">hola@pana.social</a>
          </p>
        </section>

        {/* 12. Changes */}
        <section id="changes">
          <h2>12. How We Notify You of Changes</h2>
          <Placeholder label="Change notification — versioned updates, email + in-app notice, advance notice period" />
        </section>

        {/* Related Pages */}
        <section className="mt-12 border-t pt-8">
          <h2>Related</h2>
          <ul>
            <li>
              <Link href="/legal/terms">Terms of Service</Link>
            </li>
            <li>
              <Link href="/legal/dmca">DMCA Policy</Link>
            </li>
            <li>
              <Link href="/legal/breach">Data Breach Disclosure Policy</Link>
            </li>
          </ul>
        </section>
      </article>
    </>
  );
}
