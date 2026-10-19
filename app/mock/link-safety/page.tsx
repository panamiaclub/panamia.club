import type { Metadata } from 'next';
import { SafeHtml } from '@/components/safe-html';

/* Reference page for the link destination badges.
 *
 * This is a verification surface, not a design mock. It renders through the
 * real <SafeHtml>, which means the HTML below goes through the actual
 * sanitiser and the actual annotator — if the control regresses, this page
 * stops showing badges. A page that reimplemented the markup would keep
 * looking right after the thing it documents broke.
 *
 * The cases are kept in the same order as the tiers in lib/link-safety.ts so
 * the two can be read side by side.
 *
 * Noindex: fixture route, must not compete with real content in search.
 */
export const metadata: Metadata = {
  title: 'Link safety (mock) | Pana Social',
  robots: { index: false, follow: false },
};

interface Case {
  label: string;
  note: string;
  html: string;
}

const CASES: Case[] = [
  {
    label: 'The lure',
    note: 'Friendly text, hostile host. The whole reason this control exists.',
    html: 'Having trouble? <a href="https://evil.test/login">your bank</a> can reset it for you.',
  },
  {
    label: 'Impostor — text is itself a URL',
    note: 'The text claims one destination and the href is another. Loudest tier.',
    html: 'Read it here: <a href="https://evil.test/phish">https://panamia.club/updates</a>',
  },
  {
    label: 'Impostor — bare domain',
    note: 'Same shape without the scheme.',
    html: 'More at <a href="https://evil.test">panamia.club</a>',
  },
  {
    label: 'Revealed — text already names the host',
    note: 'No badge. The reader already knows where it goes.',
    html: 'Tickets on <a href="https://eventbrite.com/e/123">eventbrite.com</a> now.',
  },
  {
    label: 'Revealed — subdomain of the named host',
    note: 'No badge. "evil.com" adequately describes bank.evil.com.',
    html: 'Posted on <a href="https://bank.evil.com/x">evil.com</a>',
  },
  {
    label: 'Trusted host',
    note: 'No badge. Our own surfaces are not a destination surprise.',
    html: 'See the <a href="https://panamia.club/directory">directory</a> for more.',
  },
  {
    label: 'Boundary trap — suffix is not a match',
    note: 'panamia.club.evil.test must NOT read as panamia.club.',
    html: 'Login at <a href="https://panamia.club.evil.test/">panamia.club</a>',
  },
  {
    label: 'Boundary trap — substring is not a match',
    note: 'Text "evil.test" must not satisfy a link to not-evil.test.',
    html: 'Go to <a href="https://not-evil.test/">evil.test</a>',
  },
  {
    label: 'IDN homograph',
    note: 'Cyrillic a in "\u0430pple.com". The badge shows punycode, which cannot be mistaken.',
    html: 'Deal here: <a href="https://\u0430pple.com/sale">apple.com</a>',
  },
  {
    label: 'Mastodon mention',
    note: 'Author-supplied class="mention" is allowed by the sanitiser, so it is never trusted as a skip signal.',
    html: '<a href="https://evil.test/@jose" class="mention">@<span>jose</span></a> said so',
  },
  {
    label: 'Mastodon shortened URL',
    note: 'Scheme and tail are class="invisible"; the visible middle carries the domain, so no badge.',
    html: 'Source: <a href="https://panamia.club/a/very/long/path" class="mention"><span class="invisible">https://</span><span>panamia.club</span><span class="invisible">/a/very/long/path</span></a>',
  },
  {
    label: 'Hidden text does not count as revealed',
    note: 'A domain concealed in an invisible span must still earn a badge.',
    html: 'Click <a href="https://evil.test/"><span class="invisible">evil.test</span>here</a>',
  },
  {
    label: 'Forgery attempt',
    note: 'Author-supplied data-pana-host and aria-label are stripped and re-decided.',
    html: 'Trust me: <a href="https://evil.test/" data-pana-host="panamia.club" aria-label="goes to panamia.club">safe link</a>',
  },
  {
    label: 'Very long hostile host',
    note: 'Truncates rather than breaking the column. Full value stays in the accessible name.',
    html: 'Verify at <a href="https://account-security-verification-required-immediately.example-phishing-domain.test/">your account</a>',
  },
  {
    label: 'mailto',
    note: 'Address shown when the text does not already say it.',
    html: 'Reach us at <a href="mailto:hola@panamia.club">this address</a>.',
  },
  {
    label: 'Ordinary post about code',
    note: 'A quiet badge, not a warning — "index.js" is domain-shaped but this is not a phishing shape.',
    html: 'The fix is in <a href="https://github.com/unitedcolorsofg/panamia-next">index.js</a>',
  },
];

function Panel({ dark }: { dark?: boolean }) {
  return (
    <div
      className={dark ? 'dark' : undefined}
      style={{
        background: dark ? 'var(--color-pana-ink)' : 'var(--color-pana-cream)',
        color: dark ? 'var(--color-pana-cream)' : 'var(--color-pana-ink)',
        padding: '1.5rem',
        borderRadius: '0.75rem',
        flex: '1 1 26rem',
        minWidth: '20rem',
      }}
    >
      <h2 style={{ fontWeight: 700, marginBottom: '1rem' }}>
        {dark ? 'Dark' : 'Light'}
      </h2>
      <ol style={{ display: 'grid', gap: '1.1rem' }}>
        {CASES.map((c) => (
          <li key={c.label}>
            <p style={{ fontWeight: 700, fontSize: '0.85rem' }}>{c.label}</p>
            <p style={{ fontSize: '0.78rem', opacity: 0.7 }}>{c.note}</p>
            <SafeHtml
              html={c.html}
              className="mt-1 [&_a]:underline [&_a]:decoration-dotted"
            />
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function MockLinkSafetyPage() {
  return (
    <main style={{ padding: '2rem', maxWidth: '82rem', margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 800 }}>
        Link destination badges
      </h1>
      <p style={{ maxWidth: '44rem', marginTop: '0.5rem', opacity: 0.8 }}>
        Rendered through the real <code>&lt;SafeHtml&gt;</code>. Sanitisation
        strips what executes; these badges reveal where a link actually goes.
        They are different attacks and neither control covers the other.
      </p>
      <div
        style={{
          display: 'flex',
          gap: '1.5rem',
          marginTop: '1.5rem',
          flexWrap: 'wrap',
        }}
      >
        <Panel />
        <Panel dark />
      </div>
    </main>
  );
}
