/**
 * The only sanctioned way to render user-authored or federated HTML.
 *
 * Post bodies arrive as HTML from the local composer, the ActivityPub inbox
 * and the Mastodon API, and none of those are trustworthy. Routing every
 * render site through this component means a sink cannot be added that quietly
 * forgets to sanitise: the sanitiser is part of rendering rather than
 * something a caller has to remember.
 *
 * Two controls apply here, and they cover different attacks:
 *
 *  - `sanitizeStatusHtml` removes anything executable. It is what stops
 *    `<img onerror>` and `href="javascript:">`.
 *  - `annotateLinkDestinations` reveals where a link actually goes. It is what
 *    stops `<a href="https://evil.test">your bank</a>`, which the sanitiser
 *    passes through untouched because there is nothing unsafe about the
 *    markup — only about the claim it makes.
 *
 * The order matters and is not interchangeable. Sanitising first means the
 * annotation is applied to markup that has already been stripped, so an author
 * cannot forge a destination badge: `allowedClasses` denies them arbitrary
 * `class`, and the annotation's attributes are deleted and re-set on every
 * anchor regardless of what arrived.
 *
 * Reach for `dangerouslySetInnerHTML` directly only for HTML this repo builds
 * itself from non-user data, and say why at the call site.
 *
 * @see lib/sanitize-html.ts — the allowlist this applies
 * @see lib/link-safety.ts — the destination affordance this applies
 */

import { annotateLinkDestinations } from '@/lib/link-safety';
import { sanitizeStatusHtml } from '@/lib/sanitize-html';

interface SafeHtmlProps {
  /** Untrusted HTML — a status body, federated content, a remote comment. */
  html: string | null | undefined;
  className?: string;
}

export function SafeHtml({ html, className }: SafeHtmlProps) {
  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{
        __html: annotateLinkDestinations(sanitizeStatusHtml(html)),
      }}
    />
  );
}
