/**
 * JSON-LD Structured Data for Legal Pages
 *
 * Embeds a slim schema.org DigitalDocument snippet in the HTML <head>
 * so search engines and automated tools can discover policy metadata
 * without parsing the full policy.json files.
 */

interface LegalJsonLdProps {
  name: string;
  description: string;
  url: string;
  version: string;
  /** Relative path to the machine-readable policy file, e.g. "/legal/privacy/policy.json" */
  policyJsonUrl?: string;
}

export function LegalJsonLd({
  name,
  description,
  url,
  version,
  policyJsonUrl,
}: LegalJsonLdProps) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'DigitalDocument',
    name,
    description,
    url,
    version,
    inLanguage: 'en',
    publisher: {
      '@type': 'Organization',
      name: 'Pana MIA Club, Corp.',
      // Live web origin — see docs/DOMAINS.md before repointing.
      url: 'https://panamia.club',
    },
    ...(policyJsonUrl && {
      encoding: {
        '@type': 'MediaObject',
        contentUrl: policyJsonUrl,
        encodingFormat: 'application/json',
      },
    }),
  };

  // Every caller passes repo-controlled literals today (policy titles and
  // versions from lib/legal/*), so no user input reaches this. That is a
  // property of the call sites rather than of this component, though: a
  // `</script>` inside any string value would close the tag early and turn the
  // rest into markup. Escaping the three characters that can start a tag or a
  // comment keeps that true no matter what a future caller passes. The result
  // is still valid JSON-LD — these escapes are only meaningful to the HTML
  // parser, and JSON.parse never sees them.
  const json = JSON.stringify(jsonLd)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');

  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
  );
}
