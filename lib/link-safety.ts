/**
 * Reveal where a link actually goes.
 *
 * Sanitisation (lib/sanitize-html.ts) closes *injection*: it strips anything
 * executable out of a post body. It does nothing about *deception*, because
 * the attack needs no injection at all —
 *
 *     <a href="https://evil.test">your bank</a>
 *
 * is well-formed, allowlist-compliant HTML. The sanitiser passes it through
 * and, because it forces `rel`/`target` on every link, actively hands it back
 * better formed than it arrived. Narrowing the allowlist cannot fix this
 * without dropping links entirely, and on a feed links are the feature.
 *
 * So the control has to be a reader affordance rather than a filter: show the
 * real destination next to the link whenever the visible text does not already
 * reveal it. A reader who can see `evil.test` before clicking is no longer
 * being deceived, whatever the text claims.
 *
 * Two properties this leans on, both load-bearing:
 *
 *  1. **It runs after sanitisation.** The markup it emits is therefore not
 *     subject to the allowlist, while anything the author wrote has already
 *     been through it. Since `allowedClasses` denies arbitrary `class` on user
 *     content, an author cannot produce markup that looks like our annotation.
 *     The badge is unforgeable precisely because of the ordering.
 *
 *  2. **No decision keys off an author-controlled attribute.** It would be
 *     tempting to skip Mastodon mentions by looking for `class="mention"`, but
 *     a hostile instance can simply send `class="mention"` on a link to
 *     anywhere — the sanitiser allows that class. Mentions are instead handled
 *     by the same host comparison as everything else, which lands on the right
 *     answer without trusting the author.
 *
 * @see lib/sanitize-html.ts — the injection control this complements
 * @see components/safe-html.tsx — composes the two
 * @see docs/SECURITY_AUDIT.md — "Deceptive links"
 */

import { Parser } from 'htmlparser2';
import sanitizeHtml from 'sanitize-html';

import {
  EXTERNAL_LINK_REL,
  EXTERNAL_LINK_TARGET,
  STATUS_ALLOWED_ATTRIBUTES,
  STATUS_SANITIZE_OPTIONS,
} from './sanitize-html';

/**
 * Hosts that belong to Pana and so never need their destination spelled out.
 *
 * Deliberately a static list rather than `getRootDomain()`, which reads a
 * server-only env var. `<SafeHtml>` renders in client components too, so an
 * env-dependent answer would differ between the server render and the browser
 * render and produce a hydration mismatch. A constant is identical in both.
 *
 * Being wrong here is safe in one direction only: an unlisted Pana host gets a
 * redundant badge (noise), while a listed hostile host would get none. That
 * asymmetry is why this list stays short and why nothing is added to it
 * without owning the domain.
 */
const PANA_HOSTS = ['pana.social', 'panamia.club'] as const;

/** Local development hosts, so `yarn dev` is not a wall of badges. */
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'] as const;

/**
 * A run of dot-separated labels ending in something that looks like a TLD.
 *
 * Used only to find domains a reader would *read as* a domain, so that
 * `miamicoffee.com` in the link text counts as the destination being shown.
 * `xn--` is matched explicitly: a punycode TLD is still a TLD, and the whole
 * point of comparing is that homographs normalise to punycode on both sides.
 */
const DOMAIN_LIKE =
  /\b((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:xn--[a-z0-9-]{2,}|[a-z]{2,}))\b/gi;

/**
 * The visible text, trimmed, being *nothing but* a URL or bare domain.
 *
 * This is the signal that separates "the text happens to mention a domain"
 * from "the text is impersonating a destination". `see index.js` mentions
 * something domain-shaped; `https://panamia.club` claims to be one.
 */
const TEXT_IS_URL =
  /^(?:https?:\/\/)?(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:xn--[a-z0-9-]{2,}|[a-z]{2,})(?:[/?#]\S*)?$/i;

/**
 * Suffixes that are shaped like a TLD but are not one.
 *
 * `index.js` is indistinguishable from a bare domain by shape alone, so the
 * impostor tier fired on ordinary posts linking to a file by name — a loud red
 * warning on `<a href="github.com/…">index.js</a>`. A warning that cries wolf
 * on benign links stops being read on hostile ones, which costs more than the
 * rare miss it buys.
 *
 * The rule is deliberately mechanical rather than a judgement call: a suffix
 * is listed only when it cannot be a domain at all. If `foo.js` can never be a
 * real destination, text reading `foo.js` cannot be claiming one. That leaves
 * an attacker no room to argue a case onto the list.
 *
 * Which is why these are *absent* despite being common file extensions:
 * `zip`, `mov`, `sh`, `md`, `rs`, `io`, `me`, `app`, `dev` are all live TLDs.
 * `.zip` and `.mov` especially — text reading `invoice.zip` pointing at
 * `evil.zip` is the exact confusion those gTLDs created, and is precisely when
 * the loud tier should fire.
 *
 * Being wrong here is cheap in one direction only: a suffix wrongly listed
 * downgrades a warning to a quiet badge, and the host is still shown either
 * way. A suffix wrongly omitted produces a false alarm. Nothing here can
 * suppress the destination itself.
 */
const NON_TLD_FILE_SUFFIXES = new Set([
  // source
  'js',
  'mjs',
  'cjs',
  'jsx',
  'ts',
  'tsx',
  'py',
  'rb',
  'go',
  'php',
  'java',
  'kt',
  'swift',
  'cpp',
  'hpp',
  'cs',
  'sql',
  // markup, style, config
  'css',
  'scss',
  'sass',
  'less',
  'html',
  'htm',
  'xml',
  'json',
  'yml',
  'yaml',
  'toml',
  'ini',
  'env',
  'lock',
  'mdx',
  // documents and data
  'txt',
  'log',
  'csv',
  'tsv',
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  // media and archives
  'png',
  'jpg',
  'jpeg',
  'gif',
  'svg',
  'webp',
  'ico',
  'tar',
  'gz',
  // scripts
  'bash',
  'zsh',
  'bat',
]);

/**
 * Whether the visible text is claiming to *be* a destination.
 *
 * An explicit scheme settles it — `https://anything` is a URL by construction.
 * Otherwise the text has to be domain-shaped *and* end in something that could
 * actually be a TLD.
 */
function textIsDestinationClaim(text: string): boolean {
  if (!TEXT_IS_URL.test(text)) return false;
  if (/^https?:\/\//i.test(text)) return true;

  const host = text.split(/[/?#]/, 1)[0];
  const suffix = host.slice(host.lastIndexOf('.') + 1).toLowerCase();
  return !NON_TLD_FILE_SUFFIXES.has(suffix);
}

/** How loudly to present a link's destination. */
export type LinkDestinationTier =
  /** Text already shows where it goes — nothing to add. */
  | 'revealed'
  /** Text is ordinary prose; show the host quietly. */
  | 'plain'
  /** Text claims to be a *different* destination. Say so loudly. */
  | 'impostor';

/** Strip a trailing root dot and a leading `www.`, and lowercase. */
function normaliseHost(host: string): string {
  return host
    .trim()
    .toLowerCase()
    .replace(/\.$/, '')
    .replace(/^www\./, '');
}

/**
 * Whether `host` is `base` or sits beneath it.
 *
 * The dot is what makes this safe. A bare `endsWith(base)` would treat
 * `panamia.club.evil.test` as living under `panamia.club`, which is the exact
 * trick this function exists to catch.
 */
function isAtOrUnder(host: string, base: string): boolean {
  return host === base || host.endsWith(`.${base}`);
}

function isTrustedHost(host: string): boolean {
  return (
    PANA_HOSTS.some((base) => isAtOrUnder(host, base)) ||
    LOCAL_HOSTS.some((base) => isAtOrUnder(host, base))
  );
}

/**
 * The destination a reader should be shown, or null when there is nothing
 * worth showing.
 *
 * Returns the punycode form for internationalised hosts, which `URL` produces
 * for free. That matters more than it looks: `аpple.com` with a Cyrillic а is
 * visually identical to `apple.com`, so echoing the host back verbatim would
 * reproduce the deception inside the very badge meant to expose it.
 * `xn--pple-43d.com` cannot be mistaken for anything.
 */
function destinationOf(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    // Relative, anchor-only or malformed. Relative links cannot leave the
    // site, and the sanitiser has already rejected unsafe schemes.
    return null;
  }

  if (url.protocol === 'mailto:') {
    const address = url.pathname.trim();
    return address || null;
  }

  const host = normaliseHost(url.hostname);
  if (!host || isTrustedHost(host)) return null;
  return host;
}

/** Every domain-shaped token a reader could see in the link text. */
function domainTokensIn(text: string): string[] {
  const tokens: string[] = [];
  for (const match of text.matchAll(DOMAIN_LIKE)) {
    tokens.push(normaliseHost(match[1]));
  }
  return tokens;
}

/**
 * Decide how to present one link.
 *
 * Exported for tests: this is the whole judgement, and it is pure.
 */
export function classifyDestination(
  href: string,
  visibleText: string
): { tier: LinkDestinationTier; destination: string | null } {
  const destination = destinationOf(href);
  if (!destination) return { tier: 'revealed', destination: null };

  const text = visibleText.trim();

  // mailto: is shown unless the address is already written out.
  if (destination.includes('@')) {
    const revealed = text.toLowerCase().includes(destination.toLowerCase());
    return { tier: revealed ? 'revealed' : 'plain', destination };
  }

  const tokens = domainTokensIn(text);

  // The destination counts as shown when a domain in the text *is* the host or
  // a parent of it. `bank.evil.com` is adequately described by `evil.com`;
  // `evil.com` is not described by `not-evil.com`, which plain substring
  // matching would have accepted.
  const revealed = tokens.some((token) => isAtOrUnder(destination, token));
  if (revealed) return { tier: 'revealed', destination };

  // Text that is itself a URL, pointing somewhere else, is the phishing shape.
  if (textIsDestinationClaim(text)) return { tier: 'impostor', destination };

  return { tier: 'plain', destination };
}

interface AnchorReading {
  href: string;
  visibleText: string;
}

/**
 * Read every anchor's href and the text a reader would actually see.
 *
 * Read-only: this pass never rewrites anything, so it cannot reintroduce a
 * hole. Serialisation is left to `sanitize-html`, which is already trusted to
 * do it, rather than hand-rolled here.
 *
 * Text inside `class="invisible"` is excluded because Mastodon uses that class
 * to hide the scheme and tail of a shortened URL, and Tailwind's `invisible`
 * utility genuinely hides it. Counting hidden text as "visible" would let a
 * link hide its real domain in a span nobody can read and still be treated as
 * self-describing. Excluding it errs toward showing the badge, which is the
 * safe direction.
 */
function readAnchors(html: string): AnchorReading[] {
  const anchors: AnchorReading[] = [];

  // Anchors cannot nest in parsed HTML, so a single current-anchor slot is
  // enough. `invisibleDepth` counts hidden ancestors rather than tracking a
  // boolean, so nested hidden spans close correctly.
  let current: AnchorReading | null = null;
  let invisibleDepth = 0;
  const elementStack: { invisible: boolean }[] = [];

  const parser = new Parser(
    {
      onopentag(name, attribs) {
        const invisible = /(?:^|\s)invisible(?:\s|$)/.test(attribs.class ?? '');
        elementStack.push({ invisible });
        if (invisible) invisibleDepth += 1;

        if (name === 'a') {
          current = { href: attribs.href ?? '', visibleText: '' };
          anchors.push(current);
        }
      },
      ontext(text) {
        if (current && invisibleDepth === 0) current.visibleText += text;
      },
      onclosetag(name) {
        const frame = elementStack.pop();
        if (frame?.invisible) invisibleDepth -= 1;
        if (name === 'a') current = null;
      },
    },
    { decodeEntities: true }
  );

  parser.write(html);
  parser.end();
  return anchors;
}

/**
 * Annotate links whose visible text does not reveal where they go.
 *
 * Input must already have been through {@link sanitizeStatusHtml}; this adds a
 * reader affordance and is not itself a security control.
 */
export function annotateLinkDestinations(html: string): string {
  if (!html) return '';

  const anchors = readAnchors(html);
  let index = 0;

  return sanitizeHtml(html, {
    ...STATUS_SANITIZE_OPTIONS,
    allowedAttributes: {
      ...STATUS_ALLOWED_ATTRIBUTES,
      a: [
        ...STATUS_ALLOWED_ATTRIBUTES.a,
        'aria-label',
        'data-pana-host',
        'data-pana-impostor',
      ],
    },
    transformTags: {
      ...STATUS_SANITIZE_OPTIONS.transformTags,
      a: (tagName, attribs) => {
        const next = { ...attribs };

        // Drop any author-supplied version of the attributes we own before
        // deciding whether to set our own. Without this an attacker could ship
        // `data-pana-host="panamia.club"` and have it survive on a link we
        // chose not to annotate — a forged badge, which is worse than none.
        delete next['aria-label'];
        delete next['data-pana-host'];
        delete next['data-pana-impostor'];

        next.rel = EXTERNAL_LINK_REL;
        next.target = EXTERNAL_LINK_TARGET;

        const href = attribs.href ?? '';
        const reading = anchors[index++];

        // The two passes walk the same string, so the nth anchor here is the
        // nth anchor there. If that ever stops holding, treat the text as
        // unknown rather than trusting a mismatched reading: an unnecessary
        // badge is noise, a missing one is the vulnerability.
        const visibleText =
          reading && reading.href === href ? reading.visibleText : '';

        const { tier, destination } = classifyDestination(href, visibleText);
        if (tier === 'revealed' || !destination) {
          return { tagName, attribs: next };
        }

        next['data-pana-host'] = destination;
        if (tier === 'impostor') next['data-pana-impostor'] = 'true';

        // The badge itself is CSS generated content, which screen readers
        // announce inconsistently. An explicit label is what actually
        // guarantees a non-sighted reader hears the destination — and this is
        // a control whose entire value is that the destination reaches the
        // reader before the click.
        const spoken = visibleText.trim();
        next['aria-label'] = spoken
          ? `${spoken} — link goes to ${destination}`
          : `Link goes to ${destination}`;

        return { tagName, attribs: next };
      },
    },
  });
}
