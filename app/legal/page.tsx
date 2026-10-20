import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalJsonLd } from '@/components/legal/JsonLd';
import PublicPageShell from '@/components/PublicPageShell';
import publicStyles from '@/components/PublicPageShell.module.css';

// Static legal content — cache at the edge, revalidate hourly (Workers Cache).
export const revalidate = 3600;

// Live web origin for this app — not a stale federation value to "correct".
// Never find-and-replace `pana.social`; most occurrences are federated
// identity and repointing those is permanent. See docs/DOMAINS.md.
const SITE = 'https://pana.social';

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
      <PublicPageShell
        eyebrow="Trust & transparency"
        title="Legal & policies"
        intro="The commitments, safeguards, and operating policies behind Pana MIA Club and the services we provide."
        narrow
      >
        <div className={publicStyles.legalGrid}>
          {documents.map((doc) => (
            <Link
              key={doc.href}
              href={doc.href}
              className={publicStyles.legalCard}
            >
              <h2>{doc.title}</h2>
              <p>{doc.description}</p>
            </Link>
          ))}
        </div>
      </PublicPageShell>
    </>
  );
}
