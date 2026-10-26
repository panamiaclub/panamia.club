import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalJsonLd } from '@/components/legal/JsonLd';

// Live web origin for this app — not a stale federation value to "correct".
// Never find-and-replace `pana.social`; most occurrences are federated
// identity and repointing those is permanent. See docs/DOMAINS.md.
const SITE = 'https://panamia.club';

export const metadata: Metadata = {
  title: 'DMCA Policy - Pana MIA Club',
  description:
    'DMCA designated agent information and takedown policy for Pana MIA Club',
  openGraph: {
    title: 'DMCA Policy - Pana MIA Club',
    description:
      'DMCA designated agent information and takedown policy for Pana MIA Club',
    url: `${SITE}/legal/dmca`,
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

function DmcaAgentInfo() {
  const name = process.env.DMCA_AGENT_NAME;
  const email = process.env.DMCA_AGENT_EMAIL;
  const address = process.env.DMCA_AGENT_ADDRESS;
  const phone = process.env.DMCA_AGENT_PHONE;
  const registrationDate = process.env.DMCA_REGISTRATION_DATE;
  const renewalDate = process.env.DMCA_RENEWAL_DATE;

  const isRegistered = name && email;

  if (!isRegistered) {
    const today = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    return (
      <div className="rounded border border-dashed border-amber-500/50 bg-amber-50/50 p-6 dark:bg-amber-950/20">
        <p className="text-amber-800 dark:text-amber-200">
          No DMCA agent is registered as of {today}. Pana MIA Club is in the
          process of registering a designated agent with the U.S. Copyright
          Office. In the meantime, DMCA takedown notices may be sent to{' '}
          <a href="mailto:hola@pana.social" className="underline">
            hola@pana.social
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="bg-muted/50 rounded border p-6">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        <dt className="font-semibold">Name:</dt>
        <dd>{name}</dd>

        <dt className="font-semibold">Email:</dt>
        <dd>
          <a href={`mailto:${email}`} className="underline">
            {email}
          </a>
        </dd>

        {address && (
          <>
            <dt className="font-semibold">Address:</dt>
            <dd>{address}</dd>
          </>
        )}

        {phone && (
          <>
            <dt className="font-semibold">Phone:</dt>
            <dd>{phone}</dd>
          </>
        )}

        {registrationDate && (
          <>
            <dt className="font-semibold">Registered:</dt>
            <dd>{registrationDate}</dd>
          </>
        )}

        {renewalDate && (
          <>
            <dt className="font-semibold">Renewal due:</dt>
            <dd>{renewalDate}</dd>
          </>
        )}
      </dl>
    </div>
  );
}

export default function DmcaPolicyPage() {
  return (
    <>
      <LegalJsonLd
        name="Pana MIA Club DMCA Policy"
        description="DMCA designated agent information and takedown policy for Pana MIA Club"
        url={`${SITE}/legal/dmca`}
        version="0.1"
      />
      <header className="mb-8 border-b pb-6">
        <h1 className="text-4xl font-bold">DMCA Policy</h1>
        <p className="text-muted-foreground mt-2">
          Digital Millennium Copyright Act — Designated Agent &amp; Takedown
          Procedures
        </p>
      </header>

      <article className="prose prose-gray dark:prose-invert max-w-none leading-relaxed">
        {/* Overview */}
        <section id="overview">
          <h2>Overview</h2>
          <p>
            Pana MIA Club respects the intellectual property rights of others
            and expects its users to do the same. In accordance with the Digital
            Millennium Copyright Act of 1998 (DMCA), specifically 17 U.S.C.
            &sect; 512(c), we will respond expeditiously to claims of copyright
            infringement committed using our service.
          </p>
          <p>
            All user-generated content on Pana MIA Club must be licensed under{' '}
            <Link href="/legal/terms#content-licensing">
              CC BY 4.0, CC BY-SA 4.0, or CC0 1.0
            </Link>
            . Content that cannot be CC-licensed (e.g., third-party copyrighted
            material the user does not own) must not be uploaded.
          </p>
        </section>

        {/* Designated Agent */}
        <section id="designated-agent">
          <h2>Designated Agent</h2>
          <p>
            Our designated agent for receiving notifications of claimed
            infringement under DMCA &sect; 512(c)(2):
          </p>
          <DmcaAgentInfo />
        </section>

        {/* Filing a Takedown Notice */}
        <section id="takedown-notice">
          <h2>Filing a Takedown Notice</h2>
          <Placeholder label="Takedown notice requirements per 17 U.S.C. § 512(c)(3) — required elements, submission instructions" />
        </section>

        {/* Counter-Notice */}
        <section id="counter-notice">
          <h2>Counter-Notice</h2>
          <Placeholder label="Counter-notice procedure per 17 U.S.C. § 512(g) — required elements, timeline, restoration" />
        </section>

        {/* Repeat Infringers */}
        <section id="repeat-infringers">
          <h2>Repeat Infringer Policy</h2>
          <p>
            In accordance with DMCA &sect; 512(i), Pana MIA Club maintains a
            policy for the termination of users who are repeat infringers.
            Accounts that receive multiple valid takedown notices may be
            suspended or permanently terminated.
          </p>
        </section>

        {/* Response Timeline */}
        <section id="response-timeline">
          <h2>Response Timeline</h2>
          <Placeholder label="Takedown response procedure — receipt, review, action within 24 hours, counter-notice process" />
        </section>

        {/* Contact */}
        <section id="contact" className="mt-12 border-t pt-8">
          <h2>Contact</h2>
          <p>
            For general inquiries about this policy, contact{' '}
            <a href="mailto:hola@pana.social">hola@pana.social</a>.
          </p>
        </section>
      </article>
    </>
  );
}
