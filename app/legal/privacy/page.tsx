import type { Metadata } from 'next';
import Link from 'next/link';
import { PrivacyAtAGlance } from '@/components/legal/PrivacyAtAGlance';
import { LegalJsonLd } from '@/components/legal/JsonLd';
import {
  tiers,
  policyVersion,
  policyStatus,
  policyEffectiveDate,
  nativeAgeAssurance,
} from '@/lib/legal/privacy-policy';

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
          {policyStatus.charAt(0).toUpperCase() + policyStatus.slice(1)}{' '}
          {policyEffectiveDate}
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          The English-language version of this policy shall take precedence over
          any translations.
        </p>
      </header>

      <p className="mb-8">
        This policy applies to the Pana Mia Android and iPhone apps
        (social.pana.app) and the services at panamia.club operated by Pana MIA
        Club, Corp. The app loads our online services, so this policy covers
        those services as well as native sign-in and the device permissions used
        by features you choose.
      </p>

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
            <strong>Deletion:</strong> Most account data is eligible for
            deletion on a verified request. Content that becomes community
            record (articles after 3 months, completed events) can be anonymized
            but not fully removed, because the CC license you chose is
            irrevocable. Social posts are always deletable on our service.
            Safety and compliance records, lasting support inquiries, legally
            retained provider records, and copies on networks we do not control
            have the retention limits explained below.
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
            request a copy of eligible data. We record Global Privacy Control
            (GPC) signals with consent receipts. No data is sold.
          </p>
          <p>
            <strong>No minors:</strong> You must be 18 or older. Accounts
            belonging to minors are terminated and eligible data deleted,
            subject to safety and legal retention obligations.
          </p>
        </div>
      </section>

      <article className="prose prose-gray dark:prose-invert max-w-none leading-relaxed">
        {/* 1. What We Collect and Why */}
        <section id="what-we-collect">
          <h2>1. What We Collect and Why</h2>
          <p>
            We collect account identifiers, an email address, and session
            information to authenticate you, secure your account, and associate
            your choices with the right person. Profile details, directory
            submissions, posts, articles, uploads, RSVPs, saved items, and
            session information are collected when you use those features. The
            category listings describe their individual purposes, recipients,
            and retention rules.
          </p>
          <p>
            Optional communications use the phone number, email address, and
            preferences you provide. A support inquiry includes your name,
            email, message, and topic; a bug report can also include its page
            URL, browser and screen context, and a screenshot you choose to
            attach. We use this information to respond and maintain a support
            record. You can unsubscribe from optional communications without
            deleting your account.
          </p>
          <p>
            A safety report includes your contact details, the reason for the
            report, the relevant user or content link, and your description.
            These reports are kept in our private support queue and routed to
            our safety contact. The safety-report form does not accept
            attachments; do not submit suspected child sexual abuse material.
          </p>
          <p>
            Google, and Apple where enabled, supply identity information when
            you choose their sign-in option. Password credentials, such as a
            designated app-review account, are stored as hashes. Native sign-in
            establishes a session in the app rather than transferring your
            browser cookies.
          </p>
          <p>
            Photos, video, and other files are processed when you choose to
            upload or send them. Camera and microphone permissions support
            features you request, such as capturing media or joining a call.
            Declining a permission prevents the associated feature. A
            location-based feature uses the location or address you supply for
            nearby results or a listing.
          </p>
          <p>
            Stripe processes payments. We use associated contact details,
            payment status, and transaction history for fulfillment, receipts,
            subscriptions, and accounting; payment methods are not published in
            your profile. Infrastructure providers process connection and
            operational information, including IP addresses and browser
            information, for delivery, security, and traffic analysis.
          </p>
          <p>
            Protected forms use Cloudflare Turnstile, which receives IP
            addresses, TLS fingerprints, browser information, the site origin,
            and form-action identifiers. It processes security signals on our
            behalf to detect bots. Cloudflare also uses these signals
            independently to improve its bot-detection capabilities, as
            described in its{' '}
            <a href="https://www.cloudflare.com/turnstile-privacy-policy/">
              Turnstile privacy notice
            </a>
            .
          </p>
          <p>
            Google Fonts requests send your IP address, browser and operating
            system information, and referring-site information to Google for
            font delivery and security. These requests can occur before you sign
            in. Google states in its{' '}
            <a href="https://fonts.google.com/faq#privacy">
              Fonts privacy information
            </a>{' '}
            that this service does not set cookies or use this information to
            create end-user profiles or for targeted advertising.
          </p>
          <p>
            We do not sell personal information or use it for cross-context
            behavioral advertising. We also process limited records for safety,
            fraud prevention, legal obligations, and establishing or defending
            legal claims.
          </p>
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
            period. Published contributions use the supported Creative Commons
            license selected for the content. The CC license is irrevocable —
            once granted, downstream recipients retain their rights regardless
            of whether the licensor stops distributing.
          </p>
          <p>
            Published articles become community record three months after
            publication; event records become community record after the event
            ends. Before the applicable threshold, the content is eligible for
            removal. Afterward, you may choose to keep attribution or replace it
            with Former Member. Private account information is still eligible
            for deletion. Social timeline posts are eligible for deletion on our
            service at any age.
          </p>
          <p>
            A license already granted to another recipient cannot be recalled by
            removing the source. ActivityPub peers, Nostr relays, and people who
            have already seen information may retain their own copies. Remote
            deletion notices are advisory, not a guarantee of removal.
          </p>
          <p>
            Safety reports, consent receipts, deletion audit records,
            former-screenname continuity records, and lasting support inquiries
            may outlive account deletion for the purposes stated in the category
            listings. Providers may retain legally required financial records.
            Temporary information follows the limits listed for each category. A
            failed deletion or provider request can require follow-up; we do not
            promise that every remote copy disappears immediately.
          </p>
        </section>

        {/* 4. Who We Share Data With */}
        <section id="sharing">
          <h2>4. Who We Share Data With</h2>
          <p>
            Our service providers include Cloudflare for hosting, media delivery
            and transactional email, our database hosting provider for
            application records, Stripe for payments, and GoHighLevel for
            contact management and communications. They receive information
            needed for their service and may retain records under their own
            terms and legal obligations.
          </p>
          <p>
            Google, and Apple where enabled, receive information needed to
            complete the authentication you request and may retain their own
            sign-in and security records. We receive the identity information
            they return. Removing our account or a connection does not delete
            your separate provider account.
          </p>
          <p>
            Directory information and published content are visible according to
            the feature and selected audience. Event organizers and participants
            can see attendance information as described by that feature. Public
            or federated content may reach ActivityPub peers, Nostr relays,
            search engines, and people outside our service. Access-controlled
            groups are not a promise of end-to-end encryption or protection
            against a participant copying a message.
          </p>
          <p>
            We may disclose information when reasonably necessary to comply with
            valid legal process, protect people or the service, investigate
            abuse, or carry out a transaction you request. We do not authorize
            bulk surveillance. Service-provider processing, public publication,
            and a disclosure you direct are distinct from selling personal
            information.
          </p>
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
          <p>
            You can edit available profile fields and communication preferences
            in account settings. You can request access, correction, a copy of
            eligible information, or restriction or objection where applicable
            law provides those rights. We verify requests and respond according
            to applicable law. We do not penalize you for exercising applicable
            privacy rights. If a request cannot be fulfilled, we explain the
            reason and available follow-up.
          </p>
          <h3 id="delete-account">Delete Your Pana Mia Account</h3>
          <p>
            Visit the{' '}
            <Link href="/form/delete-account">account-deletion form</Link>, sign
            in to the account you want removed, and follow the steps.
            Reinstalling the app is not required: the same form works in a
            browser. It shows associated records, commitments that must first be
            cancelled or transferred, and attribution choices for archived
            content. Confirm the account email and submit the permanent deletion
            request.
          </p>
          <p>
            If you cannot sign in or need help, email{' '}
            <a href="mailto:hola@panamia.club?subject=Pana%20Mia%20account%20deletion">
              hola@panamia.club
            </a>{' '}
            with the subject Pana Mia account deletion. We may ask for
            information reasonably needed to verify ownership. Do not send a
            password, authentication token, or payment-card information.
          </p>
          <p>
            Deletion removes eligible account, profile, social, and associated
            records and initiates applicable provider and federation requests.
            Archived community contributions, safety and compliance records,
            lasting support inquiries, legally retained payment records, and
            copies on systems we do not control have the limits described above.
            Upcoming events or scheduled sessions may need to be cancelled or
            transferred before deletion can complete.
          </p>
        </section>

        {/* 7. How We Protect Your Data */}
        <section id="security">
          <h2>7. How We Protect Your Data</h2>
          <p>
            We use HTTPS for connections to our service, authenticated sessions,
            permission checks, and restricted administrative access. Password
            credentials, where used, are stored as hashes rather than readable
            passwords. Payment and identity providers apply their own safeguards
            to information they handle. No service or transmission method is
            completely secure. Protect your account, device, and Nostr secret
            key, and contact us about suspected unauthorized access. Do not send
            authentication secrets through an ordinary support inquiry.
          </p>
        </section>

        {/* 8. Global Privacy Control */}
        <section id="gpc">
          <h2>8. Global Privacy Control (GPC)</h2>
          <p>
            We do not sell personal information or share it for cross-context
            behavioral advertising. When a consent request includes your
            browser&apos;s <code>Sec-GPC: 1</code> signal, we record it with the
            consent receipt. The signal does not disable processing necessary to
            provide a requested feature, authenticate an account, prevent abuse,
            or comply with law. We do not claim that it disables all hosting
            logs or third-party processing.
          </p>
        </section>

        {/* 9. Children */}
        <section id="children">
          <h2>9. Children&apos;s Privacy</h2>
          <p>
            Pana MIA Club is not directed at children under 18. We do not
            knowingly collect personal information from minors. If we discover
            that a user is under 18, their account will be terminated and their
            eligible data deleted, subject to safety and legal retention
            obligations. Contact us about a suspected minor&apos;s account. Our{' '}
            <Link href="/legal/terms#child-safety">child-safety standards</Link>{' '}
            apply to everyone using the service.
          </p>
          <p>
            On supported iPhones where Apple requires age assurance, the native
            app requests an age range from Apple before opening Pana Mia. The
            check stays on the device: we do not send the range, your birth
            date, identity documents, or Apple's verification method to our
            website or analytics. A required check that cannot confirm an age of
            at least {nativeAgeAssurance.minimumAge} prevents the native app
            from opening; it does not automatically delete a Pana Mia account.
          </p>
        </section>

        {/* 10. International Users */}
        <section id="international">
          <h2>10. International Users</h2>
          <p>
            We operate from the United States and focus on South Florida.
            Infrastructure and service providers may process information in the
            United States or other locations where they operate. Those locations
            may have different privacy laws from your own. Applicable legal
            rights are not waived by using the service. Contact us with
            questions about a specific provider, processing location, or
            request. We do not represent that a particular international
            transfer certification or contractual safeguard is in place unless
            we have verified it.
          </p>
        </section>

        {/* 11. Contact */}
        <section id="contact">
          <h2>11. How to Contact Us</h2>
          <p>
            For privacy inquiries, data access requests, or to report a
            suspected data breach:
          </p>
          <p>
            Pana MIA Club, Corp. (Pana Mia)
            <br />
            Email: <a href="mailto:hola@panamia.club">hola@panamia.club</a>
          </p>
        </section>

        {/* 12. Changes */}
        <section id="changes">
          <h2>12. How We Notify You of Changes</h2>
          <p>
            This page displays the policy version and effective date. We publish
            revisions at the same URL. For a material change to how information
            is handled, we provide notice through the service or account contact
            details as appropriate and obtain renewed consent where required. We
            do not apply a new consent-based purpose to previously collected
            information without any consent required by law.
          </p>
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
