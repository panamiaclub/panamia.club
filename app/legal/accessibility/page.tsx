import type { Metadata } from 'next';
import { LegalJsonLd } from '@/components/legal/JsonLd';

// Live web origin for this app — not a stale federation value to "correct".
// Never find-and-replace `pana.social`; most occurrences are federated
// identity and repointing those is permanent. See docs/DOMAINS.md.
const SITE = 'https://panamia.club';

export const metadata: Metadata = {
  title: 'Accessibility Statement - Pana MIA Club',
  description:
    'WCAG 2.2 AA accessibility conformance statement for Pana MIA Club',
  openGraph: {
    title: 'Accessibility Statement - Pana MIA Club',
    description:
      'WCAG 2.2 AA accessibility conformance statement for Pana MIA Club',
    url: `${SITE}/legal/accessibility`,
    siteName: 'Pana MIA Club',
    type: 'website',
  },
};

function Placeholder({ label }: { label: string }) {
  return (
    <p className="rounded border border-dashed border-blue-400/50 bg-blue-50/50 p-4 text-sm text-blue-800 dark:bg-blue-950/20 dark:text-blue-200">
      {label} — full text to be drafted.
    </p>
  );
}

export default function AccessibilityStatementPage() {
  return (
    <>
      <LegalJsonLd
        name="Pana MIA Club Accessibility Statement"
        description="WCAG 2.2 AA accessibility conformance statement for Pana MIA Club"
        url={`${SITE}/legal/accessibility`}
        version="0.1"
      />
      <header className="mb-8 border-b pb-6">
        <h1 className="text-4xl font-bold">Accessibility Statement</h1>
      </header>

      <article className="prose prose-gray dark:prose-invert max-w-none leading-relaxed">
        <section id="commitment">
          <h2>Our Commitment</h2>
          <p>
            Pana MIA Club is committed to ensuring digital accessibility for
            people with disabilities. We continually improve the user experience
            for everyone and apply the relevant accessibility standards.
          </p>
        </section>

        <section id="conformance">
          <h2>Conformance Status</h2>
          <p>
            We target conformance with the{' '}
            <strong>
              Web Content Accessibility Guidelines (WCAG) 2.2 Level AA
            </strong>
            .
          </p>
          <Placeholder label="Conformance details — current status, known limitations, third-party content disclaimer" />
        </section>

        <section id="contact" className="mt-12 border-t pt-8">
          <h2>Feedback</h2>
          <p>
            If you encounter an accessibility barrier on Pana MIA Club, please
            let us know:
          </p>
          <p>
            <a href="mailto:hola@pana.social">hola@pana.social</a>
          </p>
        </section>
      </article>
    </>
  );
}
