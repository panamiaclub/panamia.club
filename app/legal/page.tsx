import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalJsonLd } from '@/components/legal/JsonLd';

// Static legal content — cache at the edge, revalidate hourly (Workers Cache).
export const revalidate = 3600;

// Live web origin for this app — not a stale federation value to "correct".
// Never find-and-replace `pana.social`; most occurrences are federated
// identity and repointing those is permanent. See docs/DOMAINS.md.
const SITE = 'https://panamia.club';

export const metadata: Metadata = {
  title: 'Legal - Pana MIA Club',
  description: 'Legal documents, policies, and disclosures for Pana MIA Club',
  openGraph: {
    title: 'Legal - Pana MIA Club',
    description: 'Legal documents, policies, and disclosures for Pana MIA Club',
    url: `${SITE}/legal`,
    siteName: 'Pana MIA Club',
    type: 'website',
  },
};

const documents = [
  {
    href: '/legal/terms',
    title: 'Terms of Service',
    description:
      'Core terms, content licensing (CC BY / CC BY-SA), and service module terms.',
  },
  {
    href: '/legal/privacy',
    title: 'Privacy Policy',
    description:
      'How we collect, use, and protect your data. Three-tier data classification, your rights, and third-party sharing.',
  },
  {
    href: '/legal/dmca',
    title: 'DMCA Policy',
    description:
      'Designated agent information, takedown procedures, and counter-notice process.',
  },
  {
    href: '/legal/breach',
    title: 'Data Breach Disclosure Policy',
    description:
      'Incident response and notification procedures under the Florida Information Protection Act.',
  },
  {
    href: '/legal/accessibility',
    title: 'Accessibility Statement',
    description: 'WCAG 2.2 Level AA conformance target and feedback contact.',
  },
];

export default function LegalIndexPage() {
  return (
    <>
      <LegalJsonLd
        name="Pana MIA Club — Legal"
        description="Legal documents, policies, and disclosures for Pana MIA Club"
        url={`${SITE}/legal`}
        version="0.1"
      />
      <header className="mb-8 border-b pb-6">
        <h1 className="text-4xl font-bold">Legal</h1>
        <p className="text-muted-foreground mt-2">
          Pana MIA Club legal documents, policies, and disclosures.
        </p>
      </header>

      <div className="grid gap-4">
        {documents.map((doc) => (
          <Link
            key={doc.href}
            href={doc.href}
            className="group hover:bg-muted/50 rounded-lg border p-6 transition-colors"
          >
            <h2 className="text-xl font-semibold group-hover:underline">
              {doc.title}
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {doc.description}
            </p>
          </Link>
        ))}
      </div>
    </>
  );
}
