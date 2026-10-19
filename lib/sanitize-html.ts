/**
 * HTML sanitisation for user-authored and federated post bodies.
 *
 * Post bodies are stored and rendered as HTML, and they reach us from three
 * ingestion paths that are all outside our control:
 *
 *  1. the local composer, via `marked.parse()` in lib/federation/wrappers/status.ts
 *  2. the ActivityPub inbox, as HTML authored by a remote instance
 *  3. the Mastodon API, as HTML authored by a remote instance
 *
 * `marked` passes raw HTML through verbatim and neither remote path is
 * trustworthy, so every one of those strings must be treated as hostile. This
 * module is the single chokepoint that makes them safe to hand to
 * `dangerouslySetInnerHTML`. Render-time sanitisation is deliberate: rows
 * already in the database predate any ingest-side control, so sanitising only
 * on the way in would leave existing content exploitable.
 *
 * `sanitize-html` is a pure-JS allowlist sanitiser (htmlparser2 under the
 * hood) with no DOM dependency, so unlike DOMPurify/jsdom it runs unchanged on
 * Cloudflare Workers, during SSR and in the browser.
 *
 * @see components/safe-html.tsx — the component every render site should use
 */

import sanitizeHtml from 'sanitize-html';

/**
 * Tags a post body may contain. This covers everything `marked` emits for the
 * markdown we accept (GFM tables included) plus the inline markup Mastodon
 * sends.
 *
 * `img` is deliberately absent: images belong to a status as attachments and
 * render through AttachmentGrid, so an inline `<img>` in a body is only ever a
 * tracking pixel or an XSS probe.
 */
const ALLOWED_TAGS = [
  'p',
  'br',
  'hr',
  'a',
  'span',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'del',
  'ins',
  'sub',
  'sup',
  'ul',
  'ol',
  'li',
  'blockquote',
  'code',
  'pre',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
];

/**
 * Class names are allowlisted per tag rather than letting `class` through
 * freely. Every Tailwind utility is live on these pages, so an arbitrary
 * `class` on attacker-controlled markup is a UI-redressing primitive — a post
 * could paint `fixed inset-0 z-50` over the page and harvest clicks without a
 * line of JavaScript. These are the hooks Mastodon actually uses, and nothing
 * else.
 */
const ALLOWED_CLASSES: sanitizeHtml.IOptions['allowedClasses'] = {
  span: ['invisible', 'ellipsis', 'mention', 'hashtag'],
  a: ['mention', 'hashtag', 'u-url', 'ellipsis', 'invisible'],
  code: ['language-*'],
  pre: ['language-*'],
};

/**
 * Escape text so it is inert when interpolated into HTML markup.
 *
 * Used where we build HTML by hand and need user text to read as text.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * URL schemes permitted anywhere user content can produce a link.
 *
 * `javascript:` and `data:` are the omissions that matter: the first executes
 * on click, the second can smuggle an HTML document into a navigation.
 */
export const SAFE_URL_SCHEMES = ['http', 'https', 'mailto'] as const;

/**
 * Whether a URL from user content is safe to put in an `href`.
 *
 * Relative and anchor URLs are allowed; anything carrying a scheme must carry
 * one of {@link SAFE_URL_SCHEMES}. Leading control characters and whitespace
 * are stripped first, because `java\tscript:` and `\x01javascript:` are both
 * treated as `javascript:` by browsers.
 */
export function isSafeUrl(url: string): boolean {
  const normalised = url.replace(/[\u0000-\u0020]/g, '').toLowerCase();
  const scheme = /^([a-z][a-z0-9+.-]*):/.exec(normalised);
  if (!scheme) return true;
  return (SAFE_URL_SCHEMES as readonly string[]).includes(scheme[1]);
}

/**
 * Forced on every link in a post body. `ugc` marks the link as user-generated
 * for search engines; the other two stop the opened page reaching back through
 * `window.opener`.
 *
 * Exported because lib/link-safety.ts re-serialises the same anchors and must
 * not drift from this — two copies of a security-relevant attribute set is a
 * doc-rot bug waiting to happen.
 */
export const EXTERNAL_LINK_REL = 'noopener noreferrer ugc';
export const EXTERNAL_LINK_TARGET = '_blank';

/**
 * Attributes each tag may keep.
 *
 * Extracted and exported so lib/link-safety.ts can widen the `a` entry for the
 * attributes it owns without restating this list — a second copy would drift.
 */
export const STATUS_ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  a: ['href', 'title', 'class', 'rel', 'target'],
  span: ['class'],
  code: ['class'],
  pre: ['class'],
  ol: ['start'],
  li: ['value'],
  td: ['colspan', 'rowspan'],
  th: ['colspan', 'rowspan', 'scope'],
};

export const STATUS_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: STATUS_ALLOWED_ATTRIBUTES,
  allowedClasses: ALLOWED_CLASSES,

  // Only these schemes may appear in a URL attribute. `javascript:` and
  // `data:` are absent, which is what neutralises `<a href="javascript:...">`
  // and data-URI payloads.
  allowedSchemes: [...SAFE_URL_SCHEMES],
  allowedSchemesAppliedToAttributes: ['href', 'cite'],

  // `//evil.test` inherits the page scheme and reads as a normal link to a
  // reader, so require an explicit scheme.
  allowProtocolRelative: false,

  // Drop the *contents* of these, not just the tags — otherwise the body of a
  // <script> would survive as visible text.
  nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript'],

  transformTags: {
    // Every link in a post body points somewhere we do not control, including
    // links authored on a remote instance. Force the safe rel/target set
    // rather than trusting whatever arrived.
    a: (tagName, attribs) => ({
      tagName,
      attribs: {
        ...attribs,
        rel: EXTERNAL_LINK_REL,
        target: EXTERNAL_LINK_TARGET,
      },
    }),
  },
};

/**
 * Strip anything executable or layout-hijacking from a post body, leaving the
 * formatting markdown and Mastodon legitimately produce.
 *
 * Safe to call on any of: local status HTML, federated ActivityPub content, or
 * Mastodon comment HTML. Always call this before `dangerouslySetInnerHTML` —
 * or better, render through `<SafeHtml>` so the call cannot be forgotten.
 */
export function sanitizeStatusHtml(html: string | null | undefined): string {
  if (!html) return '';
  return sanitizeHtml(html, STATUS_SANITIZE_OPTIONS);
}
