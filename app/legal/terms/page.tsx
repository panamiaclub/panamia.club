import type { Metadata } from 'next';
import Link from 'next/link';
import { moduleDefinitions, ModuleContent } from './module-content';
import { LegalJsonLd } from '@/components/legal/JsonLd';
import policy from './policy.json';

// Live web origin for this app — not a stale federation value to "correct".
// Never find-and-replace `pana.social`; most occurrences are federated
// identity and repointing those is permanent. See docs/DOMAINS.md.
const SITE = 'https://panamia.club';

export const metadata: Metadata = {
  title: 'Terms of Service - Pana MIA Club',
  description:
    'Terms of Service for Pana MIA Club. CC-licensed content, community-drafted terms, Florida jurisdiction, no mandatory arbitration.',
  openGraph: {
    title: 'Terms of Service - Pana MIA Club',
    description:
      'Terms of Service for Pana MIA Club. CC-licensed content, community-drafted terms, Florida jurisdiction, no mandatory arbitration.',
    url: `${SITE}/legal/terms`,
    siteName: 'Pana MIA Club',
    type: 'website',
  },
};

export default function TermsPage() {
  return (
    <>
      <LegalJsonLd
        name="Pana MIA Club Terms of Service"
        description="Terms of Service for Pana MIA Club. CC-licensed content, community-drafted terms, Florida jurisdiction, no mandatory arbitration."
        url={`${SITE}/legal/terms`}
        version={policy.version}
        policyJsonUrl={`${SITE}/legal/terms/policy.json`}
      />
      <header className="mb-10 border-b pb-6">
        <h1 className="text-4xl font-bold">Terms of Service</h1>
        <p className="text-muted-foreground mt-2">
          Version {policy.version} — Effective {policy.effectiveDate}
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          The English-language version of these terms shall take precedence over
          any translations.
        </p>
      </header>

      {/* Mini table of contents */}
      <nav className="mb-12">
        <h2 className="mb-3 text-lg font-semibold">Contents</h2>
        <ul className="text-muted-foreground space-y-1 text-sm">
          <li>
            <a href="#commitments" className="hover:underline">
              Our Commitments
            </a>
          </li>
          <li>
            <a href="#summary" className="hover:underline">
              Plain-Language Summary
            </a>
          </li>
          <li>
            <a href="#mutual-preparation" className="hover:underline">
              1. Mutual Preparation
            </a>
          </li>
          <li>
            <a href="#acceptance" className="hover:underline">
              2. Acceptance
            </a>
          </li>
          <li>
            <a href="#eligibility" className="hover:underline">
              3. Eligibility
            </a>
          </li>
          <li>
            <a href="#account" className="hover:underline">
              4. Account
            </a>
          </li>
          <li>
            <a href="#content-licensing" className="hover:underline">
              5. Content Licensing
            </a>
          </li>
          <li>
            <a href="#ai-content" className="hover:underline">
              6. AI-Generated Content Policy
            </a>
          </li>
          <li>
            <a href="#acceptable-use" className="hover:underline">
              7. Acceptable Use
            </a>
          </li>
          <li>
            <a href="#law-enforcement" className="hover:underline">
              8. Law Enforcement and Data Mining
            </a>
          </li>
          <li>
            <a href="#intellectual-property" className="hover:underline">
              9. Intellectual Property
            </a>
          </li>
          <li>
            <a href="#data-tiers" className="hover:underline">
              10. Data Tiers
            </a>
          </li>
          <li>
            <a href="#liability" className="hover:underline">
              11. Limitation of Liability
            </a>
          </li>
          <li>
            <a href="#dispute-resolution" className="hover:underline">
              12. Dispute Resolution
            </a>
          </li>
          <li>
            <a href="#recording-consent" className="hover:underline">
              13. Electronic Recording Consent
            </a>
          </li>
          <li>
            <a href="#language" className="hover:underline">
              14. Language
            </a>
          </li>
          <li>
            <a href="#modifications" className="hover:underline">
              15. Modifications
            </a>
          </li>
          <li>
            <a href="#termination" className="hover:underline">
              16. Termination
            </a>
          </li>
          <li>
            <a href="#modules" className="hover:underline">
              Service Modules
            </a>
          </li>
          <li>
            <a href="#contact" className="hover:underline">
              Contact
            </a>
          </li>
        </ul>
      </nav>

      <section id="commitments" className="mb-16">
        <h2 className="mb-4 text-2xl font-bold">Our Commitments</h2>
        <div className="space-y-4 rounded-lg border-2 border-pink-200 bg-pink-50/30 p-6 dark:border-pink-900/50 dark:bg-pink-950/10">
          <p>
            Before the legal language, here is what we commit to as a platform
            and as a community:
          </p>
          <ul className="list-none space-y-3 pl-0">
            <li>
              We put local artists, independent businesses, and the communities
              around them at the center of the service.
            </li>
            <li>
              We publish our policies, identify their versions, and welcome
              community proposals for changes.
            </li>
            <li>
              Online tools help local relationships and in-person collaboration,
              rather than replacing them. The Future is Local.
            </li>
          </ul>
          <p className="text-muted-foreground text-sm">
            The terms below are how we hold ourselves to these commitments.
          </p>
        </div>
      </section>

      {/* Plain-language summary */}
      <section id="summary" className="mb-16">
        <h2 className="mb-4 text-2xl font-bold">Plain-Language Summary</h2>
        <div className="bg-muted/30 space-y-4 rounded-lg border p-6 text-sm">
          <p>
            <strong>Who can use Pana MIA Club:</strong> You must be 18 or older
            and reside in or have documented ties to South Florida communities.
            One account per person.
          </p>
          <p>
            <strong>Your content is CC-licensed:</strong> Everything you publish
            (articles, posts, photos) must be licensed under Creative Commons
            (CC BY 4.0, CC BY-SA 4.0, or CC0 1.0). This is irrevocable — once
            you publish, others retain the right to share and adapt your work
            even if you later remove it.
          </p>
          <p>
            <strong>No AI-generated content:</strong> Wholly AI-generated
            content is prohibited. AI-assisted tools (grammar, translation, code
            completion) are allowed with disclosure.
          </p>
          <p>
            <strong>Your data, three tiers:</strong> Your data is classified as
            Persistent, Temporary, or Peer Networking. See our{' '}
            <Link href="/legal/privacy">Privacy Policy</Link> for details.
          </p>
          <p>
            <strong>No surveillance:</strong> We do not consent to law
            enforcement data mining without valid legal process.
          </p>
          <p>
            <strong>Recording consent:</strong> Florida requires all-party
            consent for electronic recordings. Recording sessions or events
            without consent is prohibited.
          </p>
          <p>
            <strong>Disputes:</strong> Florida law, Broward County courts. No
            mandatory arbitration. No class-action waiver.
          </p>
          <p>
            <strong>Community-drafted:</strong> These terms were mutually
            prepared with the community. You may propose changes by emailing{' '}
            <a href="mailto:hola@panamia.club">hola@panamia.club</a>.
          </p>
        </div>
      </section>

      <article className="prose prose-gray dark:prose-invert max-w-none leading-relaxed">
        {/* 1. Mutual Preparation */}
        <section id="mutual-preparation" className="mb-12">
          <h2>1. Mutual Preparation</h2>
          <p>
            These terms have been mutually prepared by Pana MIA Club and its
            community. They shall not be construed against either party as the
            drafter. Community members may request revisions or propose
            alterations to these terms by contacting{' '}
            <a href="mailto:hola@panamia.club">hola@panamia.club</a>. Proposals
            are reviewed and, where adopted, incorporated into the next
            versioned release with changelog attribution.
          </p>
        </section>

        {/* 2. Acceptance */}
        <section id="acceptance" className="mb-12">
          <h2>2. Acceptance</h2>
          <p>
            By creating an account or using any Pana MIA Club service, you agree
            to these terms. If you do not agree, you are not permitted to use
            Pana MIA Club services. Continued use after a versioned update
            constitutes acceptance of the revised terms.
          </p>
        </section>

        {/* 3. Eligibility */}
        <section id="eligibility" className="mb-12">
          <h2>3. Eligibility</h2>
          <p>
            Users must be 18 years of age or older. Pana MIA Club does not
            knowingly permit use by minors. Accounts discovered to belong to
            minors will be terminated and data deleted.
          </p>
          <p>
            Users must reside in or have documented ties to South Florida
            communities (Miami-Dade, Broward, or Palm Beach County). Eligibility
            is verified through billing zip code data obtained from our CRM
            provider. Users who do not meet this requirement are not eligible
            for platform membership.
          </p>
        </section>

        {/* 4. Account */}
        <section id="account" className="mb-12">
          <h2>4. Account</h2>
          <p>
            Use one personal account, provide accurate information, and choose a
            screenname that does not impersonate someone, infringe their rights,
            or evade moderation. Protect your sign-in methods and device. You
            are responsible for activity you authorize. Do not share, sell, or
            transfer an account without our permission, and notify us of
            suspected unauthorized use.
          </p>
          <p>
            An authorized person may manage a business or organizational listing
            through the permissions the service provides. This does not confer
            ownership of other members&apos; accounts. The operator may issue
            dedicated demonstration or app-review accounts for testing. They are
            not administrator accounts and may not impersonate an actual
            resident or customer.
          </p>
          <p>
            We may limit or suspend an account when reasonably necessary to
            investigate abuse, protect people, address an eligibility problem,
            or comply with law. Section 16 and the Privacy Policy explain
            account deletion and retained information.
          </p>
        </section>

        {/* 5. Content Licensing */}
        <section id="content-licensing" className="mb-12">
          <h2>5. Content Licensing</h2>
          <p>
            All user-generated content uploaded to or created on Pana MIA Club
            must be licensed under one of the following Creative Commons
            licenses, selected by the user at the time of creation:
          </p>
          <ul>
            <li>
              <strong>CC BY 4.0</strong> — Anyone may share and adapt the work,
              with attribution.
            </li>
            <li>
              <strong>CC BY-SA 4.0</strong> — Same as CC BY, plus adaptations
              must use the same license.
            </li>
            <li>
              <strong>CC0 1.0</strong> — A public-domain dedication with the
              fallback permissions provided by the CC0 instrument.
            </li>
          </ul>
          <p>
            No traditionally copyrighted (&quot;all rights reserved&quot;) media
            may be uploaded. License selection is required at the point of
            publication. The default is CC BY 4.0. You must hold the rights
            needed for the license you select. A license does not authorize
            disclosure of private information, misuse of a person&apos;s
            likeness, or infringement of third-party rights. Existing grants
            remain governed by their terms after source removal.
          </p>
        </section>

        {/* 6. AI-Generated Content */}
        <section id="ai-content" className="mb-12">
          <h2>6. AI-Generated Content Policy</h2>
          <p>
            <strong>Prohibited:</strong> Content that is wholly AI-generated
            (text, images, audio, video) may not be published on the platform.
            This includes content from generative AI models presented as if it
            were human-created.
          </p>
          <p>
            <strong>Permitted with disclosure:</strong> AI-assisted tools used
            as part of a human-directed creative process (e.g., grammar
            checking, translation assistance, code completion, accessibility
            descriptions) are permitted provided the user discloses AI
            assistance at the point of publication.
          </p>
          <p>
            <strong>Rationale:</strong> The CC licensing model depends on human
            authorship. Copyright law in most jurisdictions does not protect
            purely AI-generated works, which would undermine the CC license
            grant.
          </p>
        </section>

        {/* 7. Acceptable Use */}
        <section id="acceptable-use" className="mb-12">
          <h2>7. Acceptable Use</h2>
          <p>
            Treat people with respect and use the service lawfully. Do not
            threaten, harass, stalk, discriminate against, exploit, or defraud
            someone; publish private information without authority; impersonate
            another person; or use the service for spam, scams, malware,
            unauthorized access, or evading restrictions. Do not publish
            pornography, sexually explicit content, content intended to be
            sexually gratifying, non-consensual intimate imagery, gratuitous
            graphic real-world violence, or content that promotes or facilitates
            exploitation or violence.
          </p>
          <p>
            Lawful nonsexual nudity may be permitted only in a clearly justified
            educational, documentary, scientific, or artistic context and must
            not be gratuitous. This exception never permits child sexual abuse
            or exploitation, non-consensual intimate imagery, or other illegal
            content. Graphic real-world violence is permitted only in
            non-gratuitous newsworthy coverage.
          </p>
          <p>
            Only publish material you have the right to share and license.
            Content warnings and licenses do not excuse unlawful content or
            violations. Do not republish another member&apos;s restricted
            messages or bypass access controls.
          </p>
          <p>
            Use the in-app Report a safety concern, Report post, Report message,
            or user-report controls. You can also use{' '}
            <Link href="/form/contact-us">Contact Us inside the app</Link> or{' '}
            <a href="mailto:hola@panamia.club">hola@panamia.club</a>. Include
            the relevant profile, post, or event link and a description, but do
            not attach or redistribute illegal material. Profile blocking and
            muting can limit unwanted interaction but do not replace reporting.
            We may remove content, restrict interaction, suspend accounts, or
            terminate access; serious risks can require immediate action without
            a warning.
          </p>
          <h3 id="child-safety">Pana Mia Child Safety Standards</h3>
          <p>
            Pana Mia and Pana MIA Club, Corp. prohibit child sexual abuse and
            exploitation (CSAE), including grooming, sexual solicitation of a
            minor, sextortion, trafficking, and the production, possession,
            promotion, or distribution of child sexual abuse material (CSAM).
            This includes synthetic or computer-generated material that
            unlawfully depicts or facilitates sexual exploitation of a child.
            These rules apply even though membership is limited to adults.
          </p>
          <p>
            Use Report a safety concern in the app, the Contact Us form, or
            hola@panamia.club to report a concern. Include identifying context
            or a link, but do not download, forward, or attach suspected CSAM.
            If a child is in immediate danger, contact local emergency services.
          </p>
          <p>
            We review safety reports, remove or disable access to identified
            prohibited material, and restrict or terminate offending accounts as
            appropriate. Relevant evidence is handled with restricted access
            consistent with applicable law. We report apparent violations to the
            National Center for Missing &amp; Exploited Children&apos;s
            CyberTipline or the appropriate authority when legally required and
            cooperate with lawful child-safety requests. The operator designates
            a responsible child-safety contact for Google Play; public reports
            should use the channels above.
          </p>
        </section>

        {/* 8. Law Enforcement */}
        <section id="law-enforcement" className="mb-12">
          <h2>8. Law Enforcement and Data Mining</h2>
          <p>
            Pana MIA Club does not consent to law enforcement or government
            agencies mining, scraping, bulk-collecting, or conducting
            surveillance of user data on the platform without valid legal
            process (warrant, subpoena, or court order). Automated bulk access
            to user data by any party — law enforcement, commercial, or
            otherwise — is prohibited. Law enforcement requests must be directed
            to the designated contact and accompanied by valid legal process.
          </p>
        </section>

        {/* 9. Intellectual Property */}
        <section id="intellectual-property" className="mb-12">
          <h2>9. Intellectual Property</h2>
          <p>
            You retain your rights in your original work. Submitting content
            gives Pana MIA Club the permissions reasonably needed to store,
            display, format, transmit, moderate, and, where supported, federate
            it according to your selected license and audience. The chosen
            Creative Commons instrument governs permissions granted to other
            recipients. It does not transfer account ownership, automatically
            publish a private draft, or grant rights you do not own.
          </p>
          <p>
            Our name, logos, and other protected platform materials are not
            licensed for misleading endorsement or impersonation merely because
            member contributions use Creative Commons. Use the published
            copyright-reporting process for alleged infringement. These terms do
            not remove another person&apos;s rights or a defense available under
            law.
          </p>
        </section>

        {/* 10. Data Tiers */}
        <section id="data-tiers" className="mb-12">
          <h2>10. Data Tiers</h2>
          <p>
            All personal and user-generated data is classified into one of three
            tiers. See our <Link href="/legal/privacy">Privacy Policy</Link> for
            full details.
          </p>
          <ul>
            <li>
              <strong>Persistent Data</strong> — Stored for the lifetime of your
              account or longer.
            </li>
            <li>
              <strong>Temporary Data</strong> — Retained only as long as
              necessary, then automatically purged.
            </li>
            <li>
              <strong>Peer Networking Data</strong> — Exchanged directly between
              participants; Pana MIA Club facilitates but does not control after
              transmission.
            </li>
          </ul>
        </section>

        {/* 11. Limitation of Liability */}
        <section id="liability" className="mb-12">
          <h2>11. Limitation of Liability</h2>
          <p>
            The service is provided on an as-available basis. We work to operate
            it responsibly but cannot guarantee uninterrupted access, another
            member&apos;s accuracy, an independent business&apos;s performance,
            the safety of a third-party event, or preservation of information on
            systems we do not control. Check relevant details before relying on
            a listing, attending an event, entering a transaction, or acting on
            advice.
          </p>
          <p>
            To the extent permitted by applicable law, we are not liable for
            indirect or consequential loss arising from use of the service or
            another user&apos;s conduct. This does not exclude liability that
            cannot lawfully be excluded, including non-waivable consumer rights,
            fraud, or other protected claims, or excuse obligations imposed on
            us by law.
          </p>
        </section>

        {/* 12. Dispute Resolution */}
        <section id="dispute-resolution" className="mb-12">
          <h2>12. Dispute Resolution</h2>
          <p>
            These terms are governed by the laws of the State of Florida.
            Exclusive venue: state and federal courts located in Broward County,
            Florida. There is no mandatory arbitration and no class-action
            waiver.
          </p>
        </section>

        {/* 13. Electronic Recording Consent */}
        <section id="recording-consent" className="mb-12">
          <h2>13. Electronic Recording Consent</h2>
          <p>
            Florida is an all-party consent state (Fla. Stat. &sect; 934.03).
            Recording any electronic communication (video calls, audio, screen
            capture) or in-person conversation without the knowledge and
            explicit consent of all parties is prohibited and may constitute a
            criminal offense. This applies to mentoring sessions, event
            livestreams, and any other Pana MIA Club interactions. See
            module-specific terms for consent mechanisms.
          </p>
        </section>

        {/* 14. Language */}
        <section id="language" className="mb-12">
          <h2>14. Language</h2>
          <p>
            These terms are published in English and may be translated into
            other languages for convenience. In the event of any conflict or
            inconsistency between the English-language version and any
            translation, the English-language version shall prevail.
          </p>
        </section>

        {/* 15. Modifications */}
        <section id="modifications" className="mb-12">
          <h2>15. Modifications</h2>
          <p>
            We publish a version and effective date for these terms and their
            modules. Material changes are announced through the service or
            account contact details as appropriate, with advance notice when
            required by law or the nature of the change. We request renewed
            agreement where required. If you do not accept a material revision,
            stop using the affected service and contact us about account closure
            or applicable rights. Changes do not revoke an existing Creative
            Commons grant or remove a non-waivable right.
          </p>
        </section>

        {/* 16. Termination */}
        <section id="termination" className="mb-12">
          <h2>16. Termination</h2>
          <p>
            You may stop participating and request account deletion through the{' '}
            <Link href="/form/delete-account">account-deletion form</Link> or
            the assistance channel in our Privacy Policy. Cancel or transfer
            upcoming commitments when required by the deletion workflow. Account
            deletion does not erase another person&apos;s independent record or
            a remote copy that we cannot control.
          </p>
          <p>
            We may suspend or terminate access for serious or repeated
            violations, ineligibility, security risks, or legal requirements.
            Where appropriate and lawful, we explain the reason and allow an
            appeal by email. Immediate restrictions may be necessary to protect
            people or an investigation. Eligible private data is removed
            according to the Privacy Policy; archived contributions, safety and
            compliance records, provider records, and remote copies have the
            stated limits. Existing licenses, payment obligations, and
            provisions needed to resolve a dispute survive as applicable.
          </p>
        </section>

        {/* Service Modules — expanded inline */}
        <section id="modules" className="mt-16 border-t pt-8">
          <h2>Service Modules</h2>
          <p>
            Additional terms apply to specific features. Each module is
            independently versioned.
          </p>
        </section>

        {moduleDefinitions.map((mod, i) => (
          <section key={mod.id} id={`module-${mod.id}`} className="mt-10">
            <h3>
              Module {i + 1}: {mod.title}
            </h3>
            <ModuleContent module={mod} />
          </section>
        ))}

        {/* Contact */}
        <section id="contact" className="mt-16 border-t pt-8">
          <h2>Contact</h2>
          <p>
            Pana MIA Club, Corp. (d/b/a Pana MIA)
            <br />
            Email: <a href="mailto:hola@panamia.club">hola@panamia.club</a>
          </p>
        </section>
      </article>
    </>
  );
}
